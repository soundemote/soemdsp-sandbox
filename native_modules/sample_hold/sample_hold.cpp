// soemdsp-native-module: sample_hold
// soemdsp-native-label: Sample & Hold
// soemdsp-native-target: sampleHold
// soemdsp-native-kind: utility
//
// Latches its input whenever the Clock input crosses above threshold
// (rising edge), or on every internal-clock tick if sampleFrequency > 0.
// When nothing is patched into a channel In, the "input" fed to the latch is
// instead a seeded LCG bipolar noise source -- same LCG as native_modules/
// noise_generator (1664525*seed + 1013904223 mod 2^32), reseeded whenever
// the caller passes a different `seed` integer (JS computes that integer
// once via its own stableSeed(nodeId+salt) hash and only changes it if the
// node identity changes -- same "precomputed seed, passed as a plain int"
// split as delay_effect's variation seed).
//
// JS bundles independent left/right instances (no Mono jack). Interpolate
// Linear/Smoothstep is JS-only; native path is classic hold (Off).
// This native module itself is single-channel, one handle per channel.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 96;

struct SampleHoldState {
  bool active;
  double clockPhase;
  double held;
  double lastTrigger;  // starts at 0, matching the JS reference exactly --
                       // NOT guarded against firing on the very first
                       // sample (0 <= threshold && trigger > threshold can
                       // be true immediately, and that's intentional/matched).
  unsigned int noiseSeed;
  int currentSeed;
};

static SampleHoldState gPool[kMaxInstances];

static unsigned int lcg_next(unsigned int& seed) {
  seed = 1664525U * seed + 1013904223U;
  return seed;
}

static double next_bipolar(unsigned int& seed) {
  return (double)lcg_next(seed) / (double)0xffffffffU * 2.0 - 1.0;
}

}  // namespace

extern "C" int soemdsp_sample_hold_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SampleHoldState& s = gPool[i];
      s.clockPhase = 0.0;
      s.held = 0.0;
      s.lastTrigger = 0.0;
      s.noiseSeed = 1U;
      s.currentSeed = 0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sample_hold_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_sample_hold_sample(
  int    handle,
  double input,
  double trigger,
  double threshold,
  double sampleFrequency,
  double sampleRate,
  int    hasInConnected,
  int    seed
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SampleHoldState& s = gPool[handle - 1];

  if (seed != s.currentSeed) {
    s.currentSeed = seed;
    s.noiseSeed = (unsigned int)seed;
    if (s.noiseSeed == 0U) s.noiseSeed = 1U;
  }

  const double safeInput = hasInConnected != 0 ? safe(input) : next_bipolar(s.noiseSeed);
  const double safeTrigger = safe(trigger);
  const double safeThreshold = safe(threshold);
  const double safeFreq = maxd(0.0, safe(sampleFrequency));
  const double safeRate = maxd(1.0, safe(sampleRate));

  bool internalFire = false;
  if (safeFreq > 0.0) {
    s.clockPhase += safeFreq / safeRate;
    if (s.clockPhase >= 1.0) {
      s.clockPhase -= dsp_floor(s.clockPhase);
      internalFire = true;
    }
  }

  const bool risingEdge = s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold;
  if (risingEdge || internalFire) {
    s.held = safeInput;
  }
  s.lastTrigger = safeTrigger;
  return safe(s.held);
}

extern "C" int soemdsp_sample_hold_version() {
  return 1;
}
