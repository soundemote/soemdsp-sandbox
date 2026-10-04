// soemdsp-native-module: exponential_delay
// soemdsp-native-label: Early Reflections
// soemdsp-native-target: earlyReflections
// soemdsp-native-kind: delay
//
// Parallel delay taps on one ring. Tap times follow supersaw Exponential
// spacing (k=3): denser at the short end, stretched toward Time.
// N taps use i=1…N so the first tap is not 0 ms; the last tap is Time.
// Random Offset: each tap gets a seeded random in [0,1] × Random Offset
// seconds added (static, no modulation). Drift is per-tap FBM (±Amount
// on that tap's delay, walk 0.25 Hz). Wet mix 1/N. Write = In + Feedback
// × wet (read first). Out = dry×(1−Mix) + wet×Mix. Min read 1 sample.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 8;
static const int kMaxTaps = 16;
static const double kMaxDelaySeconds = 4.0;
static const int kMaxDelaySamples = 768000;
static const double kExpK = 3.0;
static const double kFbmSpeedHz = 0.25;

struct ExponentialDelayState {
  bool active;
  float buffer[kMaxDelaySamples];
  int writeIndex;
  double fbmTime[kMaxTaps];
  unsigned int fbmSeed[kMaxTaps];
};

static ExponentialDelayState gPool[kMaxInstances];

static void clear_buffer(ExponentialDelayState& s) {
  for (int i = 0; i < kMaxDelaySamples; i++) {
    s.buffer[i] = 0.0f;
  }
  s.writeIndex = 0;
  for (int t = 0; t < kMaxTaps; t++) {
    s.fbmTime[t] = 0.0;
    s.fbmSeed[t] = 0x9E3779B9u + (unsigned int)(t + 1) * 2654435761u;
    if (!s.fbmSeed[t]) s.fbmSeed[t] = 1u;
  }
}

static double read_tap(ExponentialDelayState& s, int write, double delaySamples) {
  if (!(delaySamples >= 1.0)) delaySamples = 1.0;
  if (delaySamples > (double)(kMaxDelaySamples - 2)) {
    delaySamples = (double)(kMaxDelaySamples - 2);
  }
  const double readPos = (double)write - delaySamples;
  int i0 = (int)dsp_floor(readPos);
  const double frac = readPos - (double)i0;
  i0 %= kMaxDelaySamples;
  if (i0 < 0) i0 += kMaxDelaySamples;
  int i1 = i0 + 1;
  if (i1 >= kMaxDelaySamples) i1 = 0;
  const double a = (double)s.buffer[i0];
  const double b = (double)s.buffer[i1];
  return a + (b - a) * frac;
}

}  // namespace

extern "C" int soemdsp_exponential_delay_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ExponentialDelayState& s = gPool[i];
      clear_buffer(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_exponential_delay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_exponential_delay_sample(
  int handle,
  double input,
  double timeSeconds,
  double delayCount,
  double feedback,
  double mix,
  double drift,
  double seed,
  double randomOffset,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ExponentialDelayState& s = gPool[handle - 1];

  const double rate = maxd(1.0, safe(sampleRate));
  const double raw = safe(input);
  double timeSec = safe(timeSeconds);
  if (!(timeSec >= 0.0)) timeSec = 0.0;
  if (timeSec > kMaxDelaySeconds) timeSec = kMaxDelaySeconds;

  int n = (int)(delayCount + (delayCount >= 0.0 ? 0.5 : -0.5));
  if (n < 1) n = 1;
  if (n > kMaxTaps) n = kMaxTaps;

  double fb = safe(feedback);
  if (!(fb >= 0.0)) fb = 0.0;
  if (fb > 2.0) fb = 2.0;
  double mx = safe(mix);
  if (!(mx >= 0.0)) mx = 0.0;
  if (mx > 1.0) mx = 1.0;
  double amount = safe(drift);
  if (!(amount >= 0.0)) amount = 0.0;
  if (amount > 1.0) amount = 1.0;
  double offsetSec = safe(randomOffset);
  if (!(offsetSec >= 0.0)) offsetSec = 0.0;
  if (offsetSec > kMaxDelaySeconds) offsetSec = kMaxDelaySeconds;
  unsigned int seedU = (unsigned int)safe(seed);

  const int write = s.writeIndex;
  const double maxDelaySamples = timeSec * rate;
  const double offsetSamples = offsetSec * rate;
  const double denom = dsp_exp(kExpK) - 1.0;
  const double fbmInc = kFbmSpeedHz / rate;
  double sum = 0.0;
  for (int i = 1; i <= n; i++) {
    const int t = i - 1;
    s.fbmTime[t] += fbmInc;
    const double u = (double)i / (double)n;
    const double shape = (dsp_exp(kExpK * u) - 1.0) / denom;
    double delaySamples = maxDelaySamples * shape;
    if (offsetSamples > 0.0) {
      const double rand01 = hash_bipolar((unsigned int)(t + 1), seedU) * 0.5 + 0.5;
      delaySamples += rand01 * offsetSamples;
    }
    if (amount > 0.0) {
      const double y = fbm1d(
        s.fbmTime[t] + (double)t * 8.0, 4, 0.5, 1.0, s.fbmSeed[t]
      ) * 2.0 - 1.0;
      delaySamples *= (1.0 + amount * y);
    }
    sum += read_tap(s, write, delaySamples);
  }
  const double wet = sum / (double)n;
  s.buffer[write] = (float)(raw + fb * wet);
  s.writeIndex = write + 1;
  if (s.writeIndex >= kMaxDelaySamples) {
    s.writeIndex = 0;
  }
  return safe(raw * (1.0 - mx) + wet * mx);
}

extern "C" int soemdsp_exponential_delay_max_samples() {
  return kMaxDelaySamples;
}

extern "C" double soemdsp_exponential_delay_max_seconds() {
  return kMaxDelaySeconds;
}

extern "C" int soemdsp_exponential_delay_version() {
  return 3;
}
