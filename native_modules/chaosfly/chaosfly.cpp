// soemdsp-native-module: chaosfly
// soemdsp-native-label: Chaosfly
// soemdsp-native-target: chaosfly
// soemdsp-native-kind: chaos
// Dual sine FM chaos (JSFX Elan's Chaos Generator). Wavetable sine + passive 1-poles.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxLpStages = 64;

struct Pole {
  double inputBuffer;
  double outputBuffer;
};

struct ChaosflyState {
  bool active;
  double pos1; // turns [0,1)
  double pos2;
  double out1;
  double out2;
  double prefilter;
  Pole lp[kMaxLpStages];
  Pole hp;
  Pole dcL;
  Pole dcR;
  double left;
  double right;
  double displayX; // scope X — always stereo-image pair (not mono-collapsed)
  double displayY; // scope Y
  double z;
};

static ChaosflyState gPool[kMaxInstances];

// Direct pole count 1…64 (not a power-of-two index).
static int tapCount(double taps) {
  int n = (int)(taps + (taps >= 0.0 ? 0.5 : -0.5));
  if (n < 1) n = 1;
  if (n > kMaxLpStages) n = kMaxLpStages;
  return n;
}

// Octave offset in pitch space: f' = f * 2^octaves (add `octaves` then to Hz).
// Same law as old Chaosfly: octaveOffset = v*12 semitones, then pitchToFreq.
// No ±oct clamp — Pitch / Lowpass / Highpass ranges come from metaparams.
static double apply_octave_offset(double baseHz, double octaves) {
  if (!(baseHz == baseHz) || baseHz == 0.0) return 0.0;
  double o = octaves;
  if (!(o == o)) o = 0.0;
  if (o == 0.0) return baseHz;
  // 2^o = exp(o * ln2)
  return baseHz * dsp_exp(o * 0.6931471805599453);
}

static double onePoleLp(Pole& pole, double input, double frequencyHz, double sampleRate) {
  const double freq = frequencyHz < 0.0 ? 0.0 : frequencyHz;
  double w = kTwoPi * freq / sampleRate;
  const double maxW = kTwoPi * 0.45;
  if (w > maxW) w = maxW;
  const double a1 = dsp_exp_squaring(-w);
  const double b0 = 1.0 - a1;
  const double x = safe(input);
  pole.outputBuffer = safe(b0 * x + a1 * pole.outputBuffer);
  return pole.outputBuffer;
}

static double onePoleHp(Pole& pole, double input, double frequencyHz, double sampleRate) {
  const double freq = frequencyHz < 0.0 ? 0.0 : frequencyHz;
  double w = kTwoPi * freq / sampleRate;
  const double maxW = kTwoPi * 0.45;
  if (w > maxW) w = maxW;
  const double a1 = dsp_exp_squaring(-w);
  const double b0 = 0.5 * (1.0 + a1);
  const double x = safe(input);
  const double y = safe(b0 * x - b0 * pole.inputBuffer + a1 * pole.outputBuffer);
  pole.inputBuffer = x;
  pole.outputBuffer = y;
  return y;
}

static void resetState(ChaosflyState& s) {
  s.pos1 = 0.0;
  s.pos2 = 0.0;
  s.out1 = 0.0;
  s.out2 = 0.0;
  s.prefilter = 0.0;
  s.left = 0.0;
  s.right = 0.0;
  s.displayX = 0.0;
  s.displayY = 0.0;
  s.z = 0.0;
  s.hp.inputBuffer = s.hp.outputBuffer = 0.0;
  s.dcL.inputBuffer = s.dcL.outputBuffer = 0.0;
  s.dcR.inputBuffer = s.dcR.outputBuffer = 0.0;
  for (int i = 0; i < kMaxLpStages; i++) {
    s.lp[i].inputBuffer = 0.0;
    s.lp[i].outputBuffer = 0.0;
  }
}

}  // namespace

extern "C" int soemdsp_chaosfly_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ChaosflyState& s = gPool[i];
      s.active = true;
      resetState(s);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_chaosfly_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_chaosfly_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  if (!gPool[handle - 1].active) return;
  resetState(gPool[handle - 1]);
}

extern "C" void soemdsp_chaosfly_sample(
  int handle,
  double outputMode,
  double frequencyHz,
  double masterFm,
  double lowpassOct,
  double highpassOct,
  double tapsIndex,
  double hpPosition,
  double osc1Detune,
  double osc2Detune,
  double fm1Offset,
  double fm2Offset,
  double panBi,
  double amplitude,
  double pitchOctaves,
  double phaseOffsetTurns,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  ChaosflyState& s = gPool[handle - 1];
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double invRate = 1.0 / rate;
  const double fRef = 55.0; // when Frequency≈0 (Phase PM), filters still have a base

  // Frequency = base Hz (after ƒ / 0.1V). Pitch = overall octave transpose.
  // LP/HP = octave offsets from the pitched master:
  //   master = Frequency × 2^Pitch
  //   osc    = master (signed)
  //   lp/hp  = |base| × 2^(Pitch + offset)   [= |master| × 2^offset]
  // Octave offsets: NaN → 0 only. Slider/domain range is metaparam-owned.
  double pitchOct = pitchOctaves;
  if (!(pitchOct == pitchOct)) pitchOct = 0.0;
  double lpOct = lowpassOct;
  if (!(lpOct == lpOct)) lpOct = 0.0;
  double hpOct = highpassOct;
  if (!(hpOct == hpOct)) hpOct = 0.0;

  const double oscHz = apply_octave_offset(frequencyHz, pitchOct); // 0 stays 0
  const double baseAbs = (frequencyHz < 0.0 ? -frequencyHz : frequencyHz) > 1e-9
    ? (frequencyHz < 0.0 ? -frequencyHz : frequencyHz)
    : fRef;
  const double ny = rate * 0.45;
  double lpHz = apply_octave_offset(baseAbs, pitchOct + lpOct);
  double hpHz = apply_octave_offset(baseAbs, pitchOct + hpOct);
  if (!(lpHz == lpHz) || lpHz < 0.0) lpHz = 0.0;
  if (!(hpHz == hpHz) || hpHz < 0.0) hpHz = 0.0;
  if (lpHz > ny) lpHz = ny;
  if (hpHz > ny) hpHz = ny;

  double pitchScale = apply_octave_offset(1.0, pitchOct);
  if (!(pitchScale == pitchScale) || pitchScale < 1e-12) pitchScale = 1.0;

  int mixMode = (int)(outputMode + (outputMode >= 0.0 ? 0.5 : -0.5));
  if (mixMode < 0) mixMode = 0;
  if (mixMode > 6) mixMode = 6;
  int hpPos = (int)(hpPosition + (hpPosition >= 0.0 ? 0.5 : -0.5));
  if (hpPos < 0) hpPos = 0;
  if (hpPos > 2) hpPos = 2;

  const int taps = tapCount(tapsIndex);
  // FM/detune track Pitch so relative depth stays constant vs osc.
  const double fm1 = safe_bounded(fm1Offset + masterFm) * pitchScale;
  const double fm2 = safe_bounded(fm2Offset + masterFm) * pitchScale;
  const double det1 = osc1Detune * pitchScale;
  const double det2 = osc2Detune * pitchScale;
  double pan = (panBi + 1.0) * 0.5;
  if (pan < 0.0) pan = 0.0;
  if (pan > 1.0) pan = 1.0;
  // Master Volume (0…10) — same role as old Chaosfly `gain` on both outs.
  double volume = amplitude;
  if (!(volume == volume) || volume < 0.0) volume = 0.0;
  // Phase offset (cycles) — applied at lookup so 0 Hz still modulates.
  const double phaseOff = wrap01(safe(phaseOffsetTurns));

  double out1 = s.out1;
  double out2 = s.out2;

  // Osc 1 — all Hz terms already pitch-scaled; advance at host rate.
  const double adj1Turns = (out2 * fm1 + oscHz + det1) * invRate;
  s.pos1 = wrap01(s.pos1 + adj1Turns);
  out1 = dsp_sin_turns_lut(wrap01(s.pos1 + phaseOff));

  // HP Position is relative to the LP in the chaos chain (feeds Osc2 FM):
  //   0 Before Osc2 = HP → LP → Osc2
  //   1 After Osc2  = LP → HP → Osc2   (was post-Osc2 output-only; inaudible on Pre outs)
  //   2 Both        = HP → LP → HP → Osc2
  if ((hpPos == 0 || hpPos == 2) && hpHz > 0.0) {
    out1 = onePoleHp(s.hp, out1, hpHz, rate);
  }

  const double prefilter = out1;

  if (lpHz > 0.0) {
    double v = out1;
    for (int i = 0; i < taps; i++) {
      v = onePoleLp(s.lp[i], v, lpHz, rate);
    }
    out1 = v;
  }

  if ((hpPos == 1 || hpPos == 2) && hpHz > 0.0) {
    out1 = onePoleHp(s.hp, out1, hpHz, rate);
  }

  // Osc 2 — cosine = +0.25 turns; FM from the filtered chaos-chain signal.
  const double adj2Turns = (out1 * fm2 + oscHz + det2) * invRate;
  s.pos2 = wrap01(s.pos2 + adj2Turns);
  out2 = dsp_sin_turns_lut(wrap01(s.pos2 + 0.25 + phaseOff));

  s.out1 = out1;
  s.out2 = out2;
  s.prefilter = prefilter;

  double left = 0.0;
  double right = 0.0;
  if (mixMode == 0) {
    left = prefilter;
    right = out2;
  } else if (mixMode == 1) {
    left = out1;
    right = out2;
  } else if (mixMode == 2) {
    left = right = prefilter;
  } else if (mixMode == 3) {
    left = right = out1;
  } else if (mixMode == 4) {
    left = right = out2;
  } else if (mixMode == 5) {
    left = right = (prefilter + out2) * 0.5;
  } else {
    left = right = (out1 + out2) * 0.5;
  }

  // Volume first (master gain), then pan as stereo balance (equal-power).
  left *= volume;
  right *= volume;
  {
    const double angle = pan * (kPi * 0.5);
    left *= dsp_cos(angle);
    right *= dsp_sin(angle);
  }

  // Face X/Y/Z track Volume too — Chaosfly is a visual module; silent face
  // while audio scaled felt like Volume was broken.
  const bool usePre = (mixMode == 0 || mixMode == 2 || mixMode == 5);
  s.displayX = clamp(safe((usePre ? prefilter : out1) * volume), -4.0, 4.0);
  s.displayY = clamp(safe(out2 * volume), -4.0, 4.0);
  s.z = clamp(safe(out1 * volume), -4.0, 4.0);

  // DC blockers stay on host rate (output hygiene, not part of chaos shape).
  const double dcHz = rate * 0.0000159155;
  left = onePoleHp(s.dcL, left, dcHz, rate);
  right = onePoleHp(s.dcR, right, dcHz, rate);

  s.left = clamp(safe(left), -4.0, 4.0);
  s.right = clamp(safe(right), -4.0, 4.0);
}

extern "C" double soemdsp_chaosfly_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].left;
}

extern "C" double soemdsp_chaosfly_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].right;
}

extern "C" double soemdsp_chaosfly_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return 0.5 * (gPool[handle - 1].left + gPool[handle - 1].right);
}

extern "C" double soemdsp_chaosfly_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return clamp(safe(gPool[handle - 1].z), -4.0, 4.0);
}

extern "C" double soemdsp_chaosfly_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].displayX;
}

extern "C" double soemdsp_chaosfly_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].displayY;
}

extern "C" int soemdsp_chaosfly_version() {
  return 3; // phaseOffsetTurns + displayX/Y stereo image
}
