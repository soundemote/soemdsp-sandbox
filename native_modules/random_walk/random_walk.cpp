// soemdsp-native-module: random_walk
// soemdsp-native-label: Random Walk
// soemdsp-native-target: randomWalk
// soemdsp-native-kind: noise

// Seed-key derivation (hashing the "{nodeId}.{salt}.{seed}" string into an
// initial RNG state) stays on the JS side -- see randomWalkSample in
// node-live-audio-worklet.js -- since it's a one-time string hash, not
// per-sample DSP math. This module owns everything that runs every sample:
// the LCG noise source, random-walk integration, rational-curve step
// shaping, and the one-pole lowpass smoothing stage.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"random_walk\","
    "\"label\":\"Random Walk\","
    "\"targetType\":\"randomWalk\","
    "\"kind\":\"noise\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"method\",\"label\":\"Method\",\"defaultValue\":3,\"min\":0,\"mid\":1.5,\"max\":3,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":2,\"min\":0,\"mid\":50,\"max\":1000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"jitter\",\"label\":\"Jitter\",\"defaultValue\":0.25,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"seed\",\"label\":\"Seed\",\"defaultValue\":1,\"min\":0,\"mid\":50,\"max\":100,\"step\":1},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;

struct RandomWalkState {
  unsigned int seed;
  double out;
  double lowpassOutput;
  bool   active;
};

static RandomWalkState gPool[kMaxInstances];

const double PI = 3.14159265358979323846;

// Numerical Recipes LCG, matching the JS Math.imul(1664525, seed)+1013904223
// (mod 2^32) exactly -- unsigned 32-bit multiply/add wraps the same way.
static double next_unipolar(RandomWalkState& s) {
  s.seed = (unsigned int)(1664525u * s.seed + 1013904223u);
  return (double)s.seed / 4294967295.0;
}

static double next_bipolar(RandomWalkState& s) {
  return next_unipolar(s) * 2.0 - 1.0;
}

static double rational_curve(double value, double skew) {
  double t = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.999, 0.999);
  return ((1.0 + safeSkew) * t) / (1.0 - safeSkew + 2.0 * safeSkew * t);
}

static double one_pole_lowpass(double& outputBuffer, double input, double frequency, double rate) {
  double safeRate = maxd(1.0, rate);
  double w = mind((PI * 2.0) / safeRate, 0.000142475857) * maxd(0.0, frequency);
  double a1 = dsp_exp(-w);
  double b0 = 1.0 - a1;
  outputBuffer = safe(b0 * input + a1 * outputBuffer);
  return outputBuffer;
}

}  // namespace

extern "C" int soemdsp_random_walk_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      RandomWalkState& s = gPool[i];
      s.seed = 0x12345678u;
      s.out = 0.0;
      s.lowpassOutput = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_random_walk_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Called by the JS wrapper only when the derived seed key actually changes,
// mirroring resetSeededState's reset semantics for this module's fields.
extern "C" void soemdsp_random_walk_reset_seed(int handle, double seed) {
  if (handle < 1 || handle > kMaxInstances) return;
  RandomWalkState& s = gPool[handle - 1];
  unsigned int seedValue = (unsigned int)seed;
  s.seed = seedValue != 0u ? seedValue : 0x12345678u;
  s.out = 0.0;
  s.lowpassOutput = 0.0;
}

extern "C" double soemdsp_random_walk_sample(
  int    handle,
  double method,
  double frequency,
  double jitter,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  RandomWalkState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const int safeMethod = (int)clamp((double)(long long)(method + 0.5), 0.0, 3.0);
  const double safeFrequency = maxd(0.0, safe(frequency));
  const double safeJitter = maxd(0.0, safe(jitter));
  const double safeLevel = safe(level);

  const double noise = next_bipolar(s);
  const double increment = clamp(safeFrequency / rate, 0.0, 1.0);
  const double jitterInc = clamp(safeJitter / rate, 0.0, 1.0);
  const double stepSize = clamp(increment + rational_curve(jitterInc, 0.99), 0.0, 1.0);
  const double averageIncrement = (jitterInc + increment) * 0.5;
  const double whiteNoiseMix = averageIncrement >= 0.9
    ? rational_curve((averageIncrement - 0.9) / 0.1, -0.7)
    : 0.0;
  const double randomMix = 1.0 - whiteNoiseMix;

  if (safeMethod == 0) {
    return safe(noise * safeLevel);
  }
  if (safeMethod == 1) {
    return one_pole_lowpass(s.lowpassOutput, noise, safeFrequency, rate) * safeLevel;
  }
  const double step = safeMethod == 3 ? (noise > 0.0 ? stepSize : -stepSize) : noise * stepSize;
  s.out = clamp(s.out + step, -1.0, 1.0);
  const double mixed = s.out * randomMix + noise * whiteNoiseMix;
  return safe(one_pole_lowpass(s.lowpassOutput, mixed, safeFrequency, rate) * safeLevel);
}

extern "C" int soemdsp_random_walk_version() {
  return 1;
}

extern "C" const char* soemdsp_random_walk_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_random_walk_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
