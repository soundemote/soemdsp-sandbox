// soemdsp-native-module: superlove_rev2
// soemdsp-native-label: Superlove Rev2
// soemdsp-native-target: superloveRev2
// soemdsp-native-kind: filter
//
// Superlove Rev2 — LP18/LP24 from the Softwave-triangle breadboards
// (patches/superlove lp18|lp24 breadboard.json). HP6/BP6 are identical
// copies of superlove_filter (original SuperLove_HP6 / SuperLove_BP6).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
// Trisaw (HP/BP) zero on the falling edge at Morph 0.5 sits at phase 0.75.
// Add this so Phase 0 is a zero-crossing on both LP (Softwave Tri) and HP/BP.
static const double kTrisawZeroCrossing = 0.75;
// Attenuverter.amplitude domain (resonance knob 0…1 → this range):
//   LP18: -0.1 … -6.0    LP24: -0.1 … -3.0
static const double kLp18ModMin = -0.1; // least resonance
static const double kLp18ModMax = -6.0; // most resonance
static const double kLp24ModMin = -0.1;
static const double kLp24ModMax = -3.0;
// User 1.0 saw → circuit sees 0.25 (breadboard drive sweet spot).
static const double kLpInputScale = 0.25 / 1.0; // 0.25
// Loudness only (after DC) — does not enter the feedback loop.
static const double kLpOutputScale = 8.0;
// HP/BP drive: breadboard sweet spot was ~0.08 saw into the loop; UI wants ~0.5.
static const double kHpBpInputScale = 0.08 / 0.5;          // 0.16
static const double kHpBpOutputScale = (0.5 / 0.08) * 0.5; // 3.125
// Shared trim after all mode gains (keeps LP/HP/BP relative, lowers overall).
static const double kMasterOutScale = 0.5;
// Extra BP-only trim on top of HP/BP + master.
static const double kBpExtraOutScale = 0.5;
// Final per-mode output trims (on top of the above).
static const double kLp18FinalBoost = 3.0;
static const double kLp24FinalBoost = 2.0;
static const double kHpFinalBoost = 2.0;

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

static inline double jmap01(double v, double outMin, double outMax) {
  return outMin + (outMax - outMin) * v;
}

static inline double pitchToFreq(double pitch) {
  return 440.0 * dsp_exp2((pitch - 69.0) / 12.0);
}

struct GraphNode {
  double x, y, skew;
  int shape;
};

static double evalGraph(const GraphNode* nodes, int count, double x) {
  Graph g;
  for (int i = 0; i < count; i++) {
    g.addNode(nodes[i].x, nodes[i].y, nodes[i].skew, (Graph::Shape)nodes[i].shape);
  }
  return g.getValue(x);
}

// Softwave helpers (from softwave.cpp) — Tri shape only for Rev2 LP.
static double soft_acos(double x) {
  double a = clampd(x, -1.0, 1.0);
  double x2 = a * a;
  double series = a * (1.0 + x2 * (0.16666666666666666
    + x2 * (0.075
    + x2 * (0.044642857142857144
    + x2 * 0.030381944444444444))));
  return kHalfPi - series;
}

// Softwave waveform 5 = Tri, frequency held at 0 (phasor stopped → waveshaper).
// Morph is 0…1 linear — same number as the Softwave Oscillator Morph knob
// (no m^4, no 0.37…0.61 chaos remap).
static double softwaveTri(double phaseCycles, double morph, double frequencyHz) {
  const double p = wrap01(phaseCycles);
  const double t = clampd(morph, 0.0, 1.0);
  const double s = dsp_sin(p * kTwoPi);
  if (t <= 1.0e-12) return -s;
  const double raw = soft_acos(clampd(s * t, -1.0, 1.0)) / kPi * 2.0 - 1.0;
  const double peak = soft_acos(clampd(-t, -1.0, 1.0)) / kPi * 2.0 - 1.0;
  return peak > 1.0e-12 ? raw / peak : -s;
}

// Original SuperLove trisaw (HP/BP only).
static double waveTrisaw(double phaseCycles, double morph) {
  double phaseRad = phaseCycles * kTwoPi;
  phaseRad = phaseRad - kTwoPi * dsp_floor(phaseRad / kTwoPi);
  double morphRad = morph * kTwoPi;
  double sourceMin, sourceMax, targetMin, targetRange;
  if (phaseRad > morphRad) {
    sourceMin = morphRad; sourceMax = kTwoPi; targetMin = 1.0; targetRange = -1.0;
  } else {
    sourceMin = 0.0; sourceMax = morphRad; targetMin = 0.0; targetRange = 1.0;
  }
  double sourceRange = sourceMax - sourceMin;
  double uni;
  if (sourceMin == sourceMax) uni = sourceMin;
  else uni = targetMin + (targetRange * (phaseRad - sourceMin)) / sourceRange;
  return 2.0 * uni - 1.0;
}

static double ladderTapStep(double y[5], double input, double a, int mode, int stages) {
  double c[5] = {0, 0, 0, 0, 0};
  if (mode == 1) {
    c[stages] = 1.0;
  } else if (mode == 2) {
    static const double hp[4][5] = {
      {1.0, -1.0, 0.0, 0.0, 0.0},
      {1.0, -2.0, 1.0, 0.0, 0.0},
      {1.0, -3.0, 3.0, -1.0, 0.0},
      {1.0, -4.0, 6.0, -4.0, 1.0},
    };
    for (int i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
  } else if (mode == 3) {
    static const double bp[4][5] = {
      {0.0, 2.0, -2.0, 0.0, 0.0},
      {0.0, 2.0, -2.0, 0.0, 0.0},
      {0.0, 0.0, 3.0, -3.0, 0.0},
      {0.0, 0.0, 4.0, -8.0, 4.0},
    };
    for (int i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
  }
  double y0 = input;
  y0 = y0 / (1.0 + y0 * y0);
  y[1] = y0 + a * (y0 - y[1]);
  y[2] = y[1] + a * (y[1] - y[2]);
  y[3] = y[2] + a * (y[2] - y[3]);
  y[4] = y[3] + a * (y[3] - y[4]);
  y[0] = y0;
  return c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3] + c[4] * y[4];
}

static inline double ladderCoefficient(double cutoffHz, double sampleRate) {
  double rawWc = kTwoPi * cutoffHz / sampleRate;
  double wc = clampd(rawWc, 1e-9, kPi * 0.98);
  double s = dsp_sin_0_pi(wc);
  double c = dsp_cos_0_pi(wc);
  double t = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
  double denom = s - c * t;
  if (denom > -1e-12 && denom < 1e-12) denom = (denom >= 0.0) ? 1e-12 : -1e-12;
  return t / denom;
}

static inline double nextNoiseBipolar(unsigned int* state) {
  unsigned int x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x;
  return ((double)x / 4294967295.0) * 2.0 - 1.0;
}

struct SuperLoveRev2State {
  bool active;
  double feedbackSignal;
  double filterY[5];
  double dcY[5];
  unsigned int rngState;
};

static SuperLoveRev2State gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_superlove_rev2_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SuperLoveRev2State& s = gPool[i];
      s.feedbackSignal = 0.0;
      for (int j = 0; j < 5; j++) { s.filterY[j] = 0.0; s.dcY[j] = 0.0; }
      s.rngState = 0xA5F152F9u + (unsigned int)(i + 1) * 0x9E3779B9u;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_superlove_rev2_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_superlove_rev2_sample(
  int handle,
  double input,
  double frequency,   // 0..1 pitch-norm
  double resonance,   // 0..1
  double morphAmount, // 0..1 Softwave Tri (LP) / trisaw (HP/BP)
  double noiseAmount, // 0..1 bipolar white, true amplitude
  double phaseBias,   // cycles added into Softwave Phase / trisaw input
  int mode,           // 0=LP18, 1=LP24, 2=HP6, 3=BP6
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SuperLoveRev2State& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double morph = clampd(morphAmount, 0.0, 1.0);
  const double noiseAmp = (noiseAmount == noiseAmount) ? noiseAmount : 0.0;
  const double phase = (phaseBias == phaseBias) ? phaseBias : 0.0;
  const int safeMode = mode < 0 ? 0 : (mode > 3 ? 3 : mode);
  const double cutoffHz = clampd(
    pitchToFreq(jmap01(freqNorm, -12.0, 135.0)), 0.0, 0.5 * safeRate
  );
  const double noiseSample = (noiseAmp > 1.0e-12 || noiseAmp < -1.0e-12)
    ? nextNoiseBipolar(&s.rngState) * noiseAmp
    : 0.0;

  if (safeMode <= 1) {
    // LP18 / LP24 — Softwave Tri; noise at true 0…1 into phase (not padded).
    const double driven = input * kLpInputScale + noiseSample;
    const double modMin = (safeMode == 0) ? kLp18ModMin : kLp24ModMin;
    const double modMax = (safeMode == 0) ? kLp18ModMax : kLp24ModMax;
    const double mod = modMin + (modMax - modMin) * reso;
    const double phaseArg = driven + (mod * s.feedbackSignal + phase);
    const double oscValue = softwaveTri(phaseArg, morph, 0.0);

    const double a = ladderCoefficient(cutoffHz, safeRate);
    const int stages = safeMode == 0 ? 3 : 4;
    s.feedbackSignal = ladderTapStep(s.filterY, oscValue, a, 1, stages);

    const double dcA = ladderCoefficient(5.0, safeRate);
    const double dcOut = ladderTapStep(s.dcY, s.feedbackSignal, dcA, 2, 3);
    const double lpBoost = (safeMode == 0) ? kLp18FinalBoost : kLp24FinalBoost;
    return dcOut * kLpOutputScale * kMasterOutScale * lpBoost;
  }

  const double driven = input * kHpBpInputScale;
  const double noiseFb = noiseSample;

  if (safeMode == 2) {
    // HP6 — noise at true 0…1 into feedback; trisaw morph 0…1
    const GraphNode resonanceGraph[2] = { {0, -0.2, 0, 0}, {1, 1.3, -0.85, 2} };
    const double mod = evalGraph(resonanceGraph, 2, reso);

    s.feedbackSignal = mod * s.feedbackSignal + driven + noiseFb;
    // +0.75: trisaw falling-edge zero at Morph 0.5, so Phase 0 matches LP.
    double oscValue = -waveTrisaw(s.feedbackSignal + phase + kTrisawZeroCrossing, morph);

    const double lpCutoff = safeRate * 0.5;
    const double lpA = ladderCoefficient(lpCutoff, safeRate);
    double fb = ladderTapStep(s.filterY, oscValue * 0.1, lpA, 1, 1);

    const double hpA = ladderCoefficient(cutoffHz, safeRate);
    fb = ladderTapStep(s.dcY, fb, hpA, 2, 1);
    fb *= 10.0;

    s.feedbackSignal = fb;
    return (-fb * 0.31) * kHpBpOutputScale * kMasterOutScale * kHpFinalBoost;
  }

  // BP6 — noise at true 0…1 into feedback; trisaw morph 0…1
  const GraphNode resonanceGraph[2] = { {0, -0.2, 0, 0}, {1, 1.3, -0.85, 2} };
  const double mod = evalGraph(resonanceGraph, 2, reso);

  s.feedbackSignal = mod * s.feedbackSignal + driven + noiseFb;
  // +0.75: trisaw falling-edge zero at Morph 0.5, so Phase 0 matches LP.
  double oscValue = -waveTrisaw(s.feedbackSignal + phase + kTrisawZeroCrossing, morph);

  const double a = ladderCoefficient(cutoffHz, safeRate);
  double fb = ladderTapStep(s.filterY, oscValue * 0.1, a, 3, 1);
  fb *= 10.0;

  s.feedbackSignal = fb;
  return fb * kHpBpOutputScale * kMasterOutScale * kBpExtraOutScale;
}

extern "C" int soemdsp_superlove_rev2_version() {
  return 18;
}
