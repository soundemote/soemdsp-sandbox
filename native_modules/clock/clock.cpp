// soemdsp-native-module: clock
// soemdsp-native-label: Clock
// soemdsp-native-target: clock
// soemdsp-native-kind: utility
//
// Free-running phasor. Rising Reset (edge only): emit Pulse as if a cycle just
// finished, then restart phase and keep advancing (do not freeze while Reset
// stays high — that stretched the first Digital gate).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const double kPiLocal = 3.141592653589793238;

struct ClockState {
  bool active;
  bool hasStarted;
  bool resetWasHigh;
  double phase;
  double lastAnalog;
  double lastDigital;
  double lastPulse;
};

static ClockState gPool[kMaxInstances];

static double pow_nonneg(double base, double exponent) {
  if (base <= 0.0) return 0.0;
  return dsp_exp(exponent * dsp_ln(base));
}

static double clock_analog_whip_sample(double phase, double level) {
  const double p = clamp(phase, 0.0, 1.0);
  const double attack = 1.0 - pow_nonneg(1.0 - mind(1.0, p / 0.035), 4.0);
  const double release = pow_nonneg(maxd(0.0, 1.0 - p), 1.85);
  const double snapEnvelope = attack * release;
  const double sweepTurns = (3.15 * (1.0 - dsp_exp(-4.2 * p)) / (1.0 - dsp_exp(-4.2))) + (0.18 * dsp_sin(kPiLocal * p));
  const double liquidBend = 0.075 * dsp_sin(kPiLocal * 2.0 * p) * pow_nonneg(maxd(0.0, 1.0 - p), 1.2);
  const double body = dsp_sin((sweepTurns + liquidBend) * kPiLocal * 2.0);
  const double sheen = dsp_sin((sweepTurns * 2.02 + 0.17) * kPiLocal * 2.0) * 0.16 * pow_nonneg(maxd(0.0, 1.0 - p), 2.8);
  return (body + sheen) * snapEnvelope * level;
}

}  // namespace

extern "C" int soemdsp_clock_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ClockState& s = gPool[i];
      s.hasStarted = false;
      s.resetWasHigh = false;
      s.phase = 0.0;
      s.lastAnalog = 0.0;
      s.lastDigital = 0.0;
      s.lastPulse = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_clock_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_clock_sample(
  int    handle,
  double reset,
  double phaseOffset,
  double rate,
  double duty,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ClockState& s = gPool[handle - 1];

  const double safeReset = safe(reset);
  const double safePhaseOffset = wrap01(safe(phaseOffset));
  const double safeRate = maxd(0.0, safe(rate));
  const double safeDuty = clamp(safe(duty), 0.0, 1.0);
  const double safeLevel = safe(level);
  const double rateHz = maxd(1.0, safe(sampleRate));

  const bool resetHigh = safeReset > 0.0;
  const bool resetRise = resetHigh && !s.resetWasHigh;
  s.resetWasHigh = resetHigh;

  // Rising Reset only (edge): treat as end-of-cycle Pulse, then restart.
  // Do NOT hold phase at 0 while Reset stays high — that freezes Digital in the
  // duty-high region and makes the first gate longer than subsequent ones
  // (Keyboard Trigger can stay high for many samples).
  if (resetRise) {
    s.phase = 0.0;
    s.hasStarted = true;
  }

  const double rawPhase = wrap01(s.phase);
  const double phase = wrap01(rawPhase + safePhaseOffset);
  const double periodSamples = safeRate > 0.0 ? rateHz / safeRate : 0.0;
  double digital = 0.0;
  if (periodSamples > 0.0) {
    const double dutySamples = dsp_floor(safeDuty * periodSamples + 0.5);
    const double phaseSamples = phase * periodSamples;
    digital = phaseSamples < dutySamples ? safeLevel : 0.0;
  }
  const double analog = clock_analog_whip_sample(phase, safeLevel);

  const double nextRawPhase = wrap01(rawPhase + safeRate / rateHz);
  const bool wrapped = safeRate > 0.0 && s.hasStarted && nextRawPhase < rawPhase;
  const double pulse = (resetRise || wrapped) ? safeLevel : 0.0;

  s.phase = nextRawPhase;
  s.hasStarted = true;

  s.lastAnalog = analog;
  s.lastDigital = digital;
  s.lastPulse = pulse;
  return digital;
}

extern "C" double soemdsp_clock_analog_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastAnalog;
}

extern "C" double soemdsp_clock_pulse(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastPulse;
}

extern "C" int soemdsp_clock_version() {
  return 3;
}
