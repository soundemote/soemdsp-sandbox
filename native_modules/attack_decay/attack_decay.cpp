// soemdsp-native-module: attack_decay
// soemdsp-native-label: Attack Decay
// soemdsp-native-target: attackDecay
// soemdsp-native-kind: envelope
//
// Port of public/modules/attackDecay/attack-decay-math.js (exact).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kPeak = 0.97;
static const double kFloor = 0.02;

enum Phase { PHASE_IDLE = 0, PHASE_ATTACK = 1, PHASE_DECAY = 2 };

struct State {
  double raw;
  double lastGate;
  int phase;
  bool active;
};

static State gPool[kMaxInstances];

static double coefficient(double seconds, double sampleRate) {
  if (!(seconds * 0.0 == 0.0) || seconds <= 0.0) return 1.0;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double samples = maxd(1.0, seconds * rate);
  return 1.0 - dsp_exp(-1.0 / samples);
}

static double dsp_pow_pos(double base, double exp) {
  if (!(base * 0.0 == 0.0) || base <= 0.0) return 0.0;
  if (!(exp * 0.0 == 0.0)) return 0.0;
  if (exp == 1.0) return base;
  return dsp_exp(exp * dsp_ln(base));
}

}  // namespace

extern "C" int soemdsp_attack_decay_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.raw = 0.0;
      s.lastGate = 0.0;
      s.phase = PHASE_IDLE;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_attack_decay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_attack_decay_sample(
  int handle,
  double gate,
  double attack,
  double decay,
  double curve,
  double amplitude,
  double inputMode,
  double cycle,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double safeAttack = maxd(0.0, safe(attack));
  const double safeDecay = maxd(0.0, safe(decay));
  double safeCurve = safe(curve);
  if (!(safeCurve * 0.0 == 0.0) || safeCurve < 0.001) safeCurve = 1.0;
  if (safeCurve < 0.001) safeCurve = 0.001;
  const double level = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;

  int mode = (int)(safe(inputMode) + (safe(inputMode) >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 1) mode = 1;
  int cyc = (int)(safe(cycle) + (safe(cycle) >= 0.0 ? 0.5 : -0.5));
  if (cyc < 0) cyc = 0;
  if (cyc > 2) cyc = 2;

  const bool gateOn = safe(gate) > 0.5;
  const bool rising = gateOn && !(s.lastGate > 0.5);
  const bool falling = !gateOn && (s.lastGate > 0.5);
  s.lastGate = gateOn ? 1.0 : 0.0;

  const bool pureFollower = (mode == 0 && cyc == 0);
  double target = 0.0;

  if (pureFollower) {
    target = gateOn ? 1.0 : 0.0;
  } else {
    if (cyc == 2) {
      if (s.phase == PHASE_IDLE) s.phase = PHASE_ATTACK;
      if (rising) {
        s.phase = PHASE_ATTACK;
        s.raw = 0.0;
      }
    } else if (mode == 1) {
      if (rising) s.phase = PHASE_ATTACK;
    } else if (mode == 0 && cyc == 1) {
      if (rising) s.phase = PHASE_ATTACK;
      if (falling) s.phase = PHASE_DECAY;
      if (!gateOn && s.phase == PHASE_IDLE) {
        // stay idle
      } else if (gateOn && s.phase == PHASE_IDLE) {
        s.phase = PHASE_ATTACK;
      }
    }

    if (s.phase == PHASE_ATTACK) {
      target = 1.0;
      if (s.raw >= kPeak || safeAttack <= 0.0) {
        if (safeAttack <= 0.0) s.raw = 1.0;
        s.phase = PHASE_DECAY;
        target = 0.0;
      }
    } else if (s.phase == PHASE_DECAY) {
      target = 0.0;
      if (s.raw <= kFloor || safeDecay <= 0.0) {
        if (safeDecay <= 0.0) s.raw = 0.0;
        if (cyc == 2) {
          s.phase = PHASE_ATTACK;
          target = 1.0;
        } else if (cyc == 1) {
          if (mode == 1 || gateOn) {
            s.phase = PHASE_ATTACK;
            target = 1.0;
          } else {
            s.phase = PHASE_IDLE;
            s.raw = 0.0;
          }
        } else {
          s.phase = PHASE_IDLE;
          s.raw = 0.0;
        }
      }
    } else {
      target = 0.0;
      s.raw = 0.0;
    }
  }

  const double coef = target > s.raw
    ? coefficient(safeAttack, rate)
    : coefficient(safeDecay, rate);
  s.raw += (target - s.raw) * coef;
  if (!(s.raw * 0.0 == 0.0)) s.raw = 0.0;
  if (s.raw < 1.0e-9) s.raw = 0.0;
  if (s.raw > 1.0 - 1.0e-12 && target >= 1.0) s.raw = 1.0;

  const double clamped = s.raw < 0.0 ? 0.0 : (s.raw > 1.0 ? 1.0 : s.raw);
  const double shaped = safeCurve == 1.0 ? clamped : dsp_pow_pos(clamped, safeCurve);
  const double y = shaped * level;
  return (y * 0.0 == 0.0) ? y : 0.0;
}

extern "C" int soemdsp_attack_decay_version() {
  return 1;
}
