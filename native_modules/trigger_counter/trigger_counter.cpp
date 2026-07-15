// soemdsp-native-module: trigger_counter
// soemdsp-native-label: Trigger Counter
// soemdsp-native-target: triggerCounter
// soemdsp-native-kind: utility
//
// Accumulates `increment` (not necessarily an integer) on every trigger
// rising edge; once the running total reaches countMax, wraps it back
// down (floating-point modulo, matching JS's `%` on non-negative operands)
// and fires a pulseTime-length Pulse output. Count reports the running
// total normalized to [0,1] of countMax. Reset zeroes everything.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TriggerCounterState {
  bool active;
  double count;
  double lastReset;
  double lastTrigger;
  double remainingSamples;
  double lastCountOut;
};

static TriggerCounterState gPool[kMaxInstances];

// Floating-point modulo matching JS's `%` for non-negative a, non-negative
// b > 0 (the only case this module ever sees, since count/countMax are
// both accumulated from non-negative increments/params).
static double fmod_nonneg(double a, double b) {
  if (b <= 0.0) return 0.0;
  return a - b * dsp_floor(a / b);
}

}  // namespace

extern "C" int soemdsp_trigger_counter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TriggerCounterState& s = gPool[i];
      s.count = 0.0;
      s.lastReset = 0.0;
      s.lastTrigger = 0.0;
      s.remainingSamples = 0.0;
      s.lastCountOut = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_trigger_counter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_trigger_counter_sample(
  int    handle,
  double trigger,
  double reset,
  double threshold,
  double countMax,
  double increment,
  double pulseTime,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TriggerCounterState& s = gPool[handle - 1];

  const double safeTrigger = safe(trigger);
  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  const double safeCountMax = maxd(1.0, safe(countMax));
  const double safeIncrement = maxd(0.0, safe(increment));
  const double safePulseTime = maxd(0.0, safe(pulseTime));
  const double safeLevel = safe(level);
  const double rate = maxd(1.0, safe(sampleRate));

  if (s.lastReset <= safeThreshold && safeReset > safeThreshold) {
    s.count = 0.0;
    s.remainingSamples = 0.0;
  }

  if (s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
    s.count += safeIncrement;
    if (s.count >= safeCountMax) {
      s.count = safeCountMax > 0.0 ? fmod_nonneg(s.count, safeCountMax) : 0.0;
      s.remainingSamples = maxd(1.0, dsp_floor(safePulseTime * rate + 0.5));
    }
  }

  s.lastTrigger = safeTrigger;
  s.lastReset = safeReset;

  const double pulse = s.remainingSamples > 0.0 ? safeLevel : 0.0;
  s.remainingSamples = maxd(0.0, s.remainingSamples - 1.0);

  s.lastCountOut = safe(clamp(s.count / safeCountMax, 0.0, 1.0) * safeLevel);
  return safe(pulse);
}

extern "C" double soemdsp_trigger_counter_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastCountOut;
}

extern "C" int soemdsp_trigger_counter_version() {
  return 1;
}
