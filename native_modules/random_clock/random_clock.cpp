// soemdsp-native-module: random_clock
// soemdsp-native-label: Random Clock
// soemdsp-native-target: randomClock
// soemdsp-native-kind: utility
//
// Fires a Trigger + Gate pair at a randomized interval (uniform between
// minSeconds and maxSeconds), redrawing a new interval every time the
// current one elapses (or on Reset). Same LCG as native_modules/
// noise_generator/sample_hold (1664525*seed + 1013904223 mod 2^32), seeded
// once via a JS-precomputed stableSeed(nodeId:seed) integer, reseeded only
// when that integer changes -- same "precomputed key, passed as a plain
// int" split as sample_hold's noise fallback.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct RandomClockState {
  bool active;
  double intervalSamples;
  double intervalUnit;
  double lastMinSeconds;
  double lastMaxSeconds;
  double lastReset;
  double phaseSamples;
  unsigned int rngState;
  double remainingTriggerSamples;
  int currentSeedKey;
  double lastGate;
};

static RandomClockState gPool[kMaxInstances];

static unsigned int lcg_next(unsigned int& seed) {
  seed = 1664525U * (seed ? seed : 1U) + 1013904223U;
  return seed;
}

static double next_unit(unsigned int& seed) {
  return (double)lcg_next(seed) / 4294967296.0;
}

static double interval_from_unit(double unit, double minSeconds, double maxSeconds, double rate) {
  const double low = mind(minSeconds, maxSeconds);
  const double high = maxd(minSeconds, maxSeconds);
  const double t = clamp(unit, 0.0, 1.0);
  return maxd(1.0, dsp_floor((low + (high - low) * t) * rate + 0.5));
}

static double choose_interval_samples(RandomClockState& s, double minSeconds, double maxSeconds, double rate) {
  s.intervalUnit = next_unit(s.rngState);
  return interval_from_unit(s.intervalUnit, minSeconds, maxSeconds, rate);
}

}  // namespace

extern "C" int soemdsp_random_clock_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      RandomClockState& s = gPool[i];
      s.intervalSamples = 0.0;
      s.intervalUnit = 0.0;
      s.lastMinSeconds = -1.0;
      s.lastMaxSeconds = -1.0;
      s.lastReset = 0.0;
      s.phaseSamples = 0.0;
      s.rngState = 1U;
      s.remainingTriggerSamples = 0.0;
      s.currentSeedKey = 0;
      s.lastGate = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_random_clock_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_random_clock_sample(
  int    handle,
  double reset,
  double threshold,
  double minSeconds,
  double maxSeconds,
  double duty,
  double triggerTime,
  double level,
  double sampleRate,
  int    seedKey
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  RandomClockState& s = gPool[handle - 1];

  if (seedKey != s.currentSeedKey) {
    s.currentSeedKey = seedKey;
    s.rngState = (unsigned int)seedKey;
    if (s.rngState == 0U) s.rngState = 1U;
    s.intervalSamples = 0.0;
    s.intervalUnit = 0.0;
    s.lastMinSeconds = -1.0;
    s.lastMaxSeconds = -1.0;
    s.phaseSamples = 0.0;
    s.remainingTriggerSamples = 0.0;
  }

  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  const double rate = maxd(1.0, safe(sampleRate));
  const double safeMin = maxd(0.0, safe(minSeconds));
  const double safeMax = maxd(0.0, safe(maxSeconds));
  const double safeDuty = clamp(safe(duty), 0.0, 1.0);
  const double safeTriggerTime = maxd(0.0, safe(triggerTime));
  const double safeLevel = safe(level);

  const bool resetEdge = s.lastReset <= safeThreshold && safeReset > safeThreshold;
  const bool rangeChanged = s.lastMinSeconds != safeMin || s.lastMaxSeconds != safeMax;
  s.lastMinSeconds = safeMin;
  s.lastMaxSeconds = safeMax;

  if (resetEdge || s.intervalSamples <= 0.0) {
    s.intervalSamples = choose_interval_samples(s, safeMin, safeMax, rate);
    s.phaseSamples = 0.0;
    s.remainingTriggerSamples = maxd(1.0, dsp_floor(safeTriggerTime * rate + 0.5));
  } else if (rangeChanged) {
    // Remap this cycle's random draw onto the new Min/Max immediately.
    s.intervalSamples = interval_from_unit(s.intervalUnit, safeMin, safeMax, rate);
    if (s.phaseSamples >= s.intervalSamples) {
      s.intervalSamples = choose_interval_samples(s, safeMin, safeMax, rate);
      s.phaseSamples = 0.0;
      s.remainingTriggerSamples = maxd(1.0, dsp_floor(safeTriggerTime * rate + 0.5));
    }
  } else if (s.phaseSamples >= s.intervalSamples) {
    s.intervalSamples = choose_interval_samples(s, safeMin, safeMax, rate);
    s.phaseSamples = 0.0;
    s.remainingTriggerSamples = maxd(1.0, dsp_floor(safeTriggerTime * rate + 0.5));
  }

  const double gateSamples = dsp_floor(s.intervalSamples * safeDuty + 0.5);
  const double trigger = s.remainingTriggerSamples > 0.0 ? safeLevel : 0.0;
  const double gate = s.phaseSamples < gateSamples ? safeLevel : 0.0;
  s.remainingTriggerSamples = maxd(0.0, s.remainingTriggerSamples - 1.0);
  s.phaseSamples += 1.0;
  s.lastReset = safeReset;

  s.lastGate = safe(gate);
  return safe(trigger);
}

extern "C" double soemdsp_random_clock_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" int soemdsp_random_clock_version() {
  return 1;
}
