// soemdsp-native-module: human_filter
// soemdsp-native-label: Human Filter
// soemdsp-native-target: humanFilter
// soemdsp-native-kind: filter
//
// A dual-phasor feedback network (two sine oscillators, self- and
// cross-modulating) shaped by a bell/peak filter in the feedback path and
// a 6dB DC-blocking highpass on the output. Three modes ported from the
// original Human_BP6, Human_LP6, Human_LP12 -- they share the same
// feedback network and differ only in which combination of the two
// oscillators is sent to the output.
//
// Approximation note: the original's feedback-shaping filter was driven
// through a custom wrapper (setMode(BELL), setGain(...)) around RAPT's
// rsStateVariableFilter that wasn't present in the accessible codebase --
// only the raw ZDF state-variable filter (setupBell(omega, Q, A)) was
// found. The gain parameter A is exact (dbToAmp of the chaos-derived dB
// value), but the wrapper's default Q and center frequency for that bell
// aren't recoverable, so a fixed, reasonable Q=1.0 and a 1kHz center
// (a typical presence-shaping bell default) are used here, documented
// rather than silently guessed as exact.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
static inline double dsp_tan_0_halfpi(double x) {
  double s = dsp_sin_0_pi(x);
  double c = dsp_cos_0_pi(x);
  return (c == 0.0) ? 1e15 : s / c;
}

static double dsp_ln(double x) {
  if (x <= 0.0) return -700.0;
  DoubleBits bits;
  bits.d = x;
  long long expBits = (long long)((bits.u >> 52) & 0x7FF);
  int e = (int)(expBits - 1023);
  bits.u = (bits.u & ~(0x7FFULL << 52)) | (1023ULL << 52);
  double m = bits.d;
  double t = (m - 1.0) / (m + 1.0);
  double t2 = t * t;
  double series = t * (1.0 + t2 * (1.0 / 3.0 + t2 * (1.0 / 5.0 + t2 * (1.0 / 7.0 + t2 * (1.0 / 9.0)))));
  return (double)e * 0.6931471805599453 + 2.0 * series;
}

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

static inline double jmap01(double v, double outMin, double outMax) {
  return outMin + (outMax - outMin) * v;
}

static inline double pitchToFreq(double pitch) {
  return 440.0 * dsp_exp2((pitch - 69.0) / 12.0);
}

static inline double dbToAmp(double db) {
  return dsp_exp2(db / 6.0205999132796239);  // 10^(db/20) = 2^(db/(20/log2(10)))
}

// Rev/mode shaping curves are literal soemdsp::utility::Graph node lists
// (shape 1=RATIONAL, 2=EXPONENTIAL, else LINEAR, matching Graph::Shape's
// enum ordinals) -- built directly as a Graph instead of a bespoke walker.
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

// rsStateVariableFilter, BELL mode -- see file header for the Q/center
// documented-approximation note. gainDb -> A is exact.
struct SvfState {
  double z1, z2;
};

static double svfBellStep(SvfState* st, double input, double gainDb, double sampleRate) {
  const double centerHz = 1000.0;  // documented approximation, see file header
  const double Q = 1.0;            // documented approximation, see file header
  const double A = dbToAmp(gainDb);
  const double w = clampd(kTwoPi * centerHz / sampleRate, 1e-9, kPi * 0.98);
  const double r = 1.0 / (Q * A);
  const double g = dsp_tan_0_halfpi(0.5 * w);
  const double c = g + r;
  const double sCoef = 1.0 / (1.0 + g * c);
  const double aB = A * A * r;

  const double yH = (input - c * st->z1 - st->z2) * sCoef;
  const double yB = st->z1 + g * yH;
  const double yL = st->z2 + g * yB;
  st->z1 = 2.0 * yB - st->z1;
  st->z2 = 2.0 * yL - st->z2;

  return yH + aB * yB + yL;
}

struct HumanState {
  bool active;
  double phase1, phase2;
  double osc1Value, osc2Value;
  double lastOutValue;
  double osc1ModSelf, osc2ModSelf;
  SvfState fbFilter;
  double dcY[5];
};

static HumanState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_human_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      HumanState& s = gPool[i];
      s.phase1 = 0.0; s.phase2 = 0.0;
      s.osc1Value = 0.0; s.osc2Value = 0.0;
      s.lastOutValue = 0.0;
      s.osc1ModSelf = 0.0; s.osc2ModSelf = 0.0;
      s.fbFilter.z1 = 0.0; s.fbFilter.z2 = 0.0;
      for (int j = 0; j < 5; j++) s.dcY[j] = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_human_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_human_filter_sample(
  int handle,
  double input,
  double frequency,  // 0..1 normalized
  double resonance,  // 0..1
  double chaosAmount,  // 0..1
  int mode,          // 0=BP6, 1=LP6, 2=LP12
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  HumanState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);
  const int safeMode = mode < 0 ? 0 : (mode > 2 ? 2 : mode);

  double maxPitch, resDropPoint, chaosMax;
  if (safeRate <= 44100.0) { maxPitch = 115.57; resDropPoint = 0.78; chaosMax = 0.64; }
  else if (safeRate <= 88200.0) { maxPitch = 128.7; resDropPoint = 0.78; chaosMax = 1.0; }
  else if (safeRate <= 132300.0) { maxPitch = 137.0; resDropPoint = 0.83; chaosMax = 0.856; }
  else if (safeRate <= 176400.0) { maxPitch = 137.0; resDropPoint = 0.91; chaosMax = 1.0; }
  else if (safeRate <= 220500.0) { maxPitch = 137.0; resDropPoint = 1.0; chaosMax = 1.0; }
  else { maxPitch = 137.0; resDropPoint = 0.78; chaosMax = 1.0; }

  const double pitch = jmap01(freqNorm, -0.38, 137.0);
  const double frequencyHz = pitchToFreq(pitch < maxPitch ? pitch : maxPitch);

  const GraphNode mod11Graph[2] = { {0.0, 2.92396, 0, 0}, {1.0, -1.7544, 0.785442, 1} };
  double mod11;
  if (resDropPoint != 1.0) {
    const GraphNode resVfreqGraph[3] = {
      {0.0, reso, 0, 0}, {resDropPoint, reso, 0, 0}, {1.0, 0.2, 0.57, 1},
    };
    const double newResNormalized = evalGraph(resVfreqGraph, 3, freqNorm);
    mod11 = evalGraph(mod11Graph, 2, newResNormalized);
  } else {
    mod11 = evalGraph(mod11Graph, 2, reso);
  }

  const double gainDb = (chaos < chaosMax ? chaos : chaosMax) * 14.9;

  double inputSignal = clampd(input, -2.0, 2.0);
  inputSignal = svfBellStep(&s.fbFilter, s.osc2Value + s.osc1ModSelf + inputSignal + s.lastOutValue, gainDb, safeRate);

  const double fm1 = -2.2784975504539248 * inputSignal;
  s.phase1 = s.phase1 + (frequencyHz * fm1) / safeRate;
  s.phase1 = s.phase1 - dsp_floor(s.phase1);
  s.osc1Value = dsp_sin(s.phase1 * kTwoPi) * 0.177898;

  s.osc1ModSelf = s.osc1Value * mod11;
  s.osc2ModSelf = s.osc2Value * -0.395833;

  const double fm2 = 0.0333333 + 2.7429968062 * s.osc1Value + s.osc2ModSelf;
  s.phase2 = s.phase2 + (frequencyHz * fm2) / safeRate;
  s.phase2 = s.phase2 - dsp_floor(s.phase2);
  s.osc2Value = dsp_sin(s.phase2 * kTwoPi) * 0.71597;

  s.lastOutValue = (s.osc1Value + s.osc2Value) * 0.1443178;

  const double dcA = ladderCoefficient(5.0, safeRate);
  if (safeMode == 0) {
    return ladderTapStep(s.dcY, s.osc1Value, dcA, 2, 1) * 2.0;
  } else if (safeMode == 1) {
    return ladderTapStep(s.dcY, s.osc1Value + s.osc2Value, dcA, 2, 1);
  } else {
    return ladderTapStep(s.dcY, s.osc2Value, dcA, 2, 1);
  }
}

extern "C" int soemdsp_human_filter_version() {
  return 1;
}
