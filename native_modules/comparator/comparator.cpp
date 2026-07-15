// soemdsp-native-module: comparator
// soemdsp-native-label: Comparator
// soemdsp-native-target: comparator
// soemdsp-native-kind: utility
//
// One question, answered six ways: "what does the signal do, and what is it
// doing right now?" Every basic digital-logic primitive (level gate,
// inverted gate, steady/hold detector, rising trigger, falling trigger) is
// really the same comparison against the same threshold -- it's silly to
// split that into separate modules when one shared state machine produces
// all of them for free.
//
// The threshold itself is a parameter (changeAmount), not hardcoded: default
// 0.5, this codebase's standard "is the double above 0" boolean convention,
// chosen with enough margin that ordinary float noise near a true 0/1
// boundary never flips the result -- but any 0..1 crossing point is valid
// (e.g. 0 to fire on any positive signal, 1 to require full-scale).
//
// Outputs:
//   Gate      -- high for as long as the input is above changeAmount (continuous level).
//   Inv Gate  -- high for as long as the input is at or below changeAmount (its complement).
//   Hold      -- high whenever the input is unchanged from the previous
//                sample (steady-state detector; false on any moving signal).
//   Up        -- fires on every rising edge (changeAmount crossed upward): a
//                1-sample spike at triggerLevel, then a pulseTime-length
//                plateau at pulseLevel. The two overlap on the first sample
//                (spike + plateau both active), which is the intentional
//                "stepped waveform" shape -- a taller onset settling to a
//                sustained level.
//   Down      -- the same shape on every falling edge.
//   Up/Dn     -- Up and Down summed onto one wire: fires on either
//                direction's transition.
//
// Main _sample() call returns Gate; the other five are read via accessor
// functions after the call, following this codebase's established pattern
// for native modules with more than one output (compare
// soemdsp_pulse_explosion_curve, soemdsp_pll_vco_out, etc.).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct ComparatorState {
  bool active;
  bool wasHigh;
  bool hasPrev;
  double prevRaw;
  double upPulseRemaining;    // seconds left in the current Up pulse plateau
  double downPulseRemaining;  // seconds left in the current Down pulse plateau
  double lastInvGate;
  double lastHold;
  double lastUp;
  double lastDown;
  double lastUpDn;
};

static ComparatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_comparator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ComparatorState& s = gPool[i];
      s.wasHigh = false;
      s.hasPrev = false;
      s.prevRaw = 0.0;
      s.upPulseRemaining = 0.0;
      s.downPulseRemaining = 0.0;
      s.lastInvGate = 0.0;
      s.lastHold = 0.0;
      s.lastUp = 0.0;
      s.lastDown = 0.0;
      s.lastUpDn = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_comparator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_comparator_sample(
  int    handle,
  double signalIn,
  double changeAmount,
  double pulseTime,
  double triggerLevel,
  double pulseLevel,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ComparatorState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double safePulseTime = safe(pulseTime) < 0.0 ? 0.0 : safe(pulseTime);
  const double sampleDuration = 1.0 / safeRate;
  const double raw = safe(signalIn);
  const double threshold = safe(changeAmount);

  const bool high = raw > threshold;
  const bool risingEdge = high && !s.wasHigh;
  const bool fallingEdge = !high && s.wasHigh;
  s.wasHigh = high;

  const bool unchanged = s.hasPrev && raw == s.prevRaw;
  s.prevRaw = raw;
  s.hasPrev = true;

  double upSpike = 0.0;
  if (risingEdge) {
    upSpike = safe(triggerLevel);
    s.upPulseRemaining = safePulseTime;
  }
  double downSpike = 0.0;
  if (fallingEdge) {
    downSpike = safe(triggerLevel);
    s.downPulseRemaining = safePulseTime;
  }

  const double upPlateau = s.upPulseRemaining > 0.0 ? safe(pulseLevel) : 0.0;
  const double downPlateau = s.downPulseRemaining > 0.0 ? safe(pulseLevel) : 0.0;
  if (s.upPulseRemaining > 0.0) s.upPulseRemaining -= sampleDuration;
  if (s.downPulseRemaining > 0.0) s.downPulseRemaining -= sampleDuration;

  const double gate = high ? safe(triggerLevel) : 0.0;
  const double invGate = high ? 0.0 : safe(triggerLevel);
  const double hold = unchanged ? safe(triggerLevel) : 0.0;
  const double up = upSpike + upPlateau;
  const double down = downSpike + downPlateau;
  const double upDn = up + down;

  s.lastInvGate = invGate;
  s.lastHold = hold;
  s.lastUp = up;
  s.lastDown = down;
  s.lastUpDn = upDn;

  return gate;
}

extern "C" double soemdsp_comparator_inv_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastInvGate;
}

extern "C" double soemdsp_comparator_hold(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastHold;
}

extern "C" double soemdsp_comparator_up(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastUp;
}

extern "C" double soemdsp_comparator_down(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastDown;
}

extern "C" double soemdsp_comparator_up_dn(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastUpDn;
}

extern "C" int soemdsp_comparator_version() {
  return 2;
}
