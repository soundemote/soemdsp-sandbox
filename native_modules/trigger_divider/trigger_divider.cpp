// soemdsp-native-module: trigger_divider
// soemdsp-native-label: Trigger Divider
// soemdsp-native-target: triggerDivider
// soemdsp-native-kind: utility
//
// Counts trigger rising edges (crossing above threshold), firing a
// pulseTime-length output pulse every `division`-th edge. Reset zeroes the
// count. Shared by triggerDivider (fixed pulseTime) and clockDivider
// (pulseTime = duty × division × measured Clock period).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct TriggerDividerState {
  bool active;
  int count;
  double lastReset;
  double lastTrigger;
  double remainingSamples;
  double samplesSinceEdge;
  double measuredPeriodSamples;
};

static TriggerDividerState gPool[kMaxInstances];

static long long clamp_division_steps(double division) {
  long long divisionSteps = (long long)(safe(division) + 0.5);
  if (divisionSteps < 1) divisionSteps = 1;
  if (divisionSteps > 64) divisionSteps = 64;
  return divisionSteps;
}

}  // namespace

extern "C" int soemdsp_trigger_divider_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TriggerDividerState& s = gPool[i];
      s.count = 0;
      s.lastReset = 0.0;
      s.lastTrigger = 0.0;
      s.remainingSamples = 0.0;
      s.samplesSinceEdge = 0.0;
      s.measuredPeriodSamples = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_trigger_divider_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_trigger_divider_sample(
  int    handle,
  double trigger,
  double reset,
  double threshold,
  double division,
  double pulseTime,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TriggerDividerState& s = gPool[handle - 1];

  const double safeTrigger = safe(trigger);
  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  const long long divisionSteps = clamp_division_steps(division);
  const double safePulseTime = maxd(0.0, safe(pulseTime));
  const double safeLevel = safe(level);
  const double rate = maxd(1.0, safe(sampleRate));

  if (s.lastReset <= safeThreshold && safeReset > safeThreshold) {
    s.count = 0;
    s.remainingSamples = 0.0;
  }

  if (s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
    s.count = (s.count + 1) % (int)divisionSteps;
    if (s.count == 0) {
      s.remainingSamples = maxd(1.0, dsp_floor(safePulseTime * rate + 0.5));
    }
  }

  s.lastTrigger = safeTrigger;
  s.lastReset = safeReset;

  const double output = s.remainingSamples > 0.0 ? safeLevel : 0.0;
  s.remainingSamples = maxd(0.0, s.remainingSamples - 1.0);
  return safe(output);
}

// clockDivider: measure Clock rising-edge period; pulse = duty×division×period.
extern "C" double soemdsp_trigger_divider_sample_clock(
  int    handle,
  double clock,
  double reset,
  double threshold,
  double division,
  double duty,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TriggerDividerState& s = gPool[handle - 1];

  const double safeClock = safe(clock);
  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  const long long divisionSteps = clamp_division_steps(division);
  double safeDuty = safe(duty);
  if (safeDuty < 0.01) safeDuty = 0.01;
  if (safeDuty > 1.0) safeDuty = 1.0;
  const double safeLevel = safe(level);
  const double rate = maxd(1.0, safe(sampleRate));

  if (s.lastReset <= safeThreshold && safeReset > safeThreshold) {
    s.count = 0;
    s.remainingSamples = 0.0;
    s.samplesSinceEdge = 0.0;
    s.measuredPeriodSamples = 0.0;
  }

  const bool rising = s.lastTrigger <= safeThreshold && safeClock > safeThreshold;
  if (rising) {
    if (s.samplesSinceEdge > 0.0) {
      s.measuredPeriodSamples = s.samplesSinceEdge;
    }
    s.samplesSinceEdge = 0.0;
    s.count = (s.count + 1) % (int)divisionSteps;
    if (s.count == 0) {
      const double periodSec = s.measuredPeriodSamples > 0.0
        ? s.measuredPeriodSamples / rate
        : 0.0;
      // Match JS: duty * division / sourceRate (= duty * division * period).
      const double pulseTime = periodSec > 0.0
        ? safeDuty * (double)divisionSteps * periodSec
        : 0.01;
      s.remainingSamples = maxd(1.0, dsp_floor(pulseTime * rate + 0.5));
    }
  } else {
    s.samplesSinceEdge += 1.0;
  }

  s.lastTrigger = safeClock;
  s.lastReset = safeReset;

  const double output = s.remainingSamples > 0.0 ? safeLevel : 0.0;
  s.remainingSamples = maxd(0.0, s.remainingSamples - 1.0);
  return safe(output);
}

extern "C" int soemdsp_trigger_divider_version() {
  return 2;
}
