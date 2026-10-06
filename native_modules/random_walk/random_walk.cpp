// soemdsp-native-module: random_walk
// soemdsp-native-label: Random Walk
// soemdsp-native-target: randomWalk
// soemdsp-native-kind: noise
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/random/FlexibleRandomWalk.hpp

// Seeding: the graph engine derives each lane's LCG state from the module's
// Seed param only -- seed_mix(Seed, kSeedLeft / kSeedRight) -- and hands it
// to soemdsp_random_walk_reset_seed whenever Seed changes (and once after
// create). Any 32-bit state is valid for this LCG (0 included), so Seed 0
// works like every other seed. This module owns everything that runs every
// sample: the LCG noise source, random-walk integration, rational-curve
// step shaping, and the one-pole lowpass smoothing stage.

#include <soemdsp/soemdsp.hpp>

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


// Numerical Recipes LCG, matching the JS Math.imul(1664525, seed)+1013904223
// (mod 2^32) exactly -- unsigned 32-bit multiply/add wraps the same way.
static double next_unipolar(RandomWalkState& s) {
  s.seed = (unsigned int)(1664525u * s.seed + 1013904223u);
  return (double)s.seed / 4294967295.0;
}

static double next_bipolar(RandomWalkState& s) {
  return next_unipolar(s) * 2.0 - 1.0;
}

static double one_pole_lowpass(double& outputBuffer, double input, double frequency, double rate) {
  double safeRate = maxd(1.0, rate);
  double w = mind(kTwoPi / safeRate, kTauOver44100) * maxd(0.0, frequency);
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
      s.seed = seed_mix(0u, 1u);  // Seed 0 / Left until the host's Seed arrives
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

// Called by the graph when the lane's Seed changes. `seed` is the already
// mixed 32-bit LCG state (0..4294967295, exact in a double); every value,
// including 0, is a valid LCG state.
extern "C" void soemdsp_random_walk_reset_seed(int handle, double seed) {
  if (handle < 1 || handle > kMaxInstances) return;
  RandomWalkState& s = gPool[handle - 1];
  const double clamped = !(seed > 0.0) ? 0.0 : (seed > 4294967295.0 ? 4294967295.0 : seed);
  s.seed = (unsigned int)clamped;
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
  const double stepSize = clamp(increment + rational_curve01(jitterInc, 0.99), 0.0, 1.0);
  const double averageIncrement = (jitterInc + increment) * 0.5;
  const double whiteNoiseMix = averageIncrement >= 0.9
    ? rational_curve01((averageIncrement - 0.9) / 0.1, -0.7)
    : 0.0;
  const double randomMix = 1.0 - whiteNoiseMix;

  if (safeMethod == 0) {
    return safe(noise * safeLevel);
  }
  if (safeMethod == 1) {
    return one_pole_lowpass(s.lowpassOutput, noise, safeFrequency, rate) * safeLevel;
  }
  const double step = safeMethod == 3 ? (noise > 0.0 ? stepSize : -stepSize) : noise * stepSize;
  s.out = clamp11(s.out + step);
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
