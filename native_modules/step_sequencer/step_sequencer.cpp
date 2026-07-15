// soemdsp-native-module: step_sequencer
// soemdsp-native-label: Step Sequencer
// soemdsp-native-target: stepSequencer
// soemdsp-native-kind: utility
//
// An 8-step value sequencer: each Trigger rising edge (crossing above
// threshold) advances to the next step (wrapping at stepCount) and
// outputs that step's stored value; Reset jumps back to step 0 and
// immediately outputs its value too. Gate mirrors the raw trigger level
// comparison (not edge-detected).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct StepSequencerState {
  bool active;
  double gate;
  int index;
  double lastReset;
  double lastTrigger;
  double out;
};

static StepSequencerState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_step_sequencer_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      StepSequencerState& s = gPool[i];
      s.gate = 0.0;
      s.index = 0;
      s.lastReset = 0.0;
      s.lastTrigger = 0.0;
      s.out = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_step_sequencer_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_step_sequencer_sample(
  int    handle,
  double trigger,
  double reset,
  double threshold,
  double steps,
  double level,
  double v0, double v1, double v2, double v3,
  double v4, double v5, double v6, double v7
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  StepSequencerState& s = gPool[handle - 1];

  const double values[8] = {
    safe(v0), safe(v1), safe(v2), safe(v3),
    safe(v4), safe(v5), safe(v6), safe(v7),
  };

  const double safeTrigger = safe(trigger);
  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  long long stepCount = (long long)(safe(steps) + 0.5);
  if (stepCount < 1) stepCount = 1;
  if (stepCount > 8) stepCount = 8;
  const double safeLevel = safe(level);

  if (s.index >= stepCount) {
    s.index = s.index % (int)stepCount;
  }

  if (s.lastReset <= safeThreshold && safeReset > safeThreshold) {
    s.index = 0;
    s.out = values[0];
  }

  if (s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
    s.out = values[s.index];
    s.index = (s.index + 1) % (int)stepCount;
  }

  s.gate = safeTrigger > safeThreshold ? 1.0 : 0.0;
  s.lastTrigger = safeTrigger;
  s.lastReset = safeReset;

  return safe(s.out * safeLevel);
}

extern "C" double soemdsp_step_sequencer_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].gate;
}

extern "C" int soemdsp_step_sequencer_version() {
  return 1;
}
