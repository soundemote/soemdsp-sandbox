// soemdsp-native-module: delayed_trigger
// soemdsp-native-label: Delayed Trigger
// soemdsp-native-target: delayedTrigger
// soemdsp-native-kind: utility
//
// On a trigger rising edge, waits `delay` seconds, then fires a
// pulseTime-length pulse. A new trigger while already waiting/pulsing
// restarts the wait from scratch. Reset cancels any pending wait/pulse.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct DelayedTriggerState {
  bool active;
  bool hasTriggered;
  double lastReset;
  double lastTrigger;
  double remainingSamples;
  bool running;
  double waitSamples;
};

static DelayedTriggerState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_delayed_trigger_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      DelayedTriggerState& s = gPool[i];
      s.hasTriggered = true;
      s.lastReset = 0.0;
      s.lastTrigger = 0.0;
      s.remainingSamples = 0.0;
      s.running = false;
      s.waitSamples = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_delayed_trigger_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_delayed_trigger_sample(
  int    handle,
  double trigger,
  double reset,
  double threshold,
  double delay,
  double pulseTime,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  DelayedTriggerState& s = gPool[handle - 1];

  const double safeTrigger = safe(trigger);
  const double safeReset = safe(reset);
  const double safeThreshold = safe(threshold);
  const double safeDelay = maxd(0.0, safe(delay));
  const double safePulseTime = maxd(0.0, safe(pulseTime));
  const double safeLevel = safe(level);
  const double rate = maxd(1.0, safe(sampleRate));

  if (s.lastReset <= safeThreshold && safeReset > safeThreshold) {
    s.hasTriggered = true;
    s.remainingSamples = 0.0;
    s.running = false;
    s.waitSamples = 0.0;
  }

  if (s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
    s.hasTriggered = false;
    s.remainingSamples = 0.0;
    s.running = true;
    s.waitSamples = maxd(0.0, dsp_floor(safeDelay * rate + 0.5));
  }

  if (s.running && !s.hasTriggered) {
    if (s.waitSamples <= 0.0) {
      s.hasTriggered = true;
      s.running = false;
      s.remainingSamples = maxd(1.0, dsp_floor(safePulseTime * rate + 0.5));
    } else {
      s.waitSamples -= 1.0;
    }
  }

  s.lastTrigger = safeTrigger;
  s.lastReset = safeReset;

  const double output = s.remainingSamples > 0.0 ? safeLevel : 0.0;
  s.remainingSamples = maxd(0.0, s.remainingSamples - 1.0);
  return safe(output);
}

extern "C" int soemdsp_delayed_trigger_version() {
  return 1;
}
