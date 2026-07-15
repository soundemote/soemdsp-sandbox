// soemdsp-native-module: rsmet_filter
// soemdsp-native-label: RSMET Filter
// soemdsp-native-target: rsmetFilter
// soemdsp-native-kind: filter
//
// A general-purpose ladder filter (the same design as this repo's
// ladder_filter module) preceded by a tanh soft clipper and noise
// injection stage, matching the original RsmetFilter family (10 modes:
// LP6/12/18/24, HP6/12/18/24, BP6, BP12). Frequency and resonance are
// mapped through exact exponential easing curves
// (soemdsp::utility::Graph 2-node EXPONENTIAL shape) rather than being
// linear, matching the original design.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

// Deliberately kept on dsp_exp_narrow (see resonator_filter's
// scaledShiftedSigmoid for the same reasoning) -- the +-40 clamp was
// already present in the originally-ported source, not a refactor
// artifact, so this stays as shipped rather than being silently
// "corrected".
static inline double dsp_tanh(double x) {
  return 1.0 - 2.0 / (dsp_exp_narrow(2.0 * x) + 1.0);
}

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// 2-node EXPONENTIAL curve, built directly as a Graph (graph.h) instead of
// hand-rolling the exponential segment formula.
static double evalExponentialGraph2(double x, double y0, double y1, double skew) {
  Graph g;
  g.addNode(0.0, y0, 0.0, Graph::Shape::LINEAR);
  g.addNode(1.0, y1, skew, Graph::Shape::EXPONENTIAL);
  return g.getValue(x);
}

static void compute_mix(int mode, int stages, double c[5], double* s_out) {
  for (int i = 0; i < 5; i++) c[i] = 0.0;
  if (mode == 0) {
    c[0] = 1.0;
    *s_out = 0.125;
  } else if (mode == 1) {
    c[stages] = 1.0;
    *s_out = stages * 0.25;
  } else if (mode == 2) {
    static const double hp[4][5] = {
      {1.0, -1.0,  0.0,  0.0, 0.0},
      {1.0, -2.0,  1.0,  0.0, 0.0},
      {1.0, -3.0,  3.0, -1.0, 0.0},
      {1.0, -4.0,  6.0, -4.0, 1.0},
    };
    for (int i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
    *s_out = stages * 0.25;
  } else {
    static const double bp[4][5] = {
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 0.0,  3.0, -3.0, 0.0},
      {0.0, 0.0,  4.0, -8.0, 4.0},
    };
    for (int i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
    *s_out = 0.125;
  }
}

static inline double nextNoiseBipolar(unsigned int* state) {
  unsigned int x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x;
  return ((double)x / 4294967295.0) * 2.0 - 1.0;
}

// rsmet_filter's 10 modes, each mapping to a (ladderMode, stages) pair on
// the shared ladder core -- matches the original Rsmet_LP6..Rsmet_BP12
// subclasses exactly (each was just a thin wrapper picking one ladder tap).
static void modeToLadder(int rsmetMode, int* ladderMode, int* stages) {
  static const int table[10][2] = {
    {1, 1}, {1, 2}, {1, 3}, {1, 4},  // LP6, LP12, LP18, LP24
    {2, 1}, {2, 2}, {2, 3}, {2, 4},  // HP6, HP12, HP18, HP24
    {3, 1}, {3, 4},                  // BP6 (BP_6_6), BP12 (BP_12_12)
  };
  int idx = rsmetMode < 0 ? 0 : (rsmetMode > 9 ? 9 : rsmetMode);
  *ladderMode = table[idx][0];
  *stages = table[idx][1];
}

struct RsmetState {
  double y[5];
  bool active;
  unsigned int rngState;
};

static RsmetState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_rsmet_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      RsmetState& s = gPool[i];
      for (int j = 0; j < 5; j++) s.y[j] = 0.0;
      s.rngState = 0x2545F491u + (unsigned int)(i + 1) * 2246822519u;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_rsmet_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_rsmet_filter_sample(
  int handle,
  double input,
  double frequency,  // 0..1 normalized
  double resonance,  // 0..1 normalized
  double chaosAmount,  // 0..1
  int mode,          // 0..9, see modeToLadder
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  RsmetState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double resoNorm = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);

  const double cutoffHz = clampd(evalExponentialGraph2(freqNorm, 3.0, 20000.0, -0.95), 0.000001, safeRate * 0.49);
  const double feedback = clampd(evalExponentialGraph2(resoNorm, 0.0, 1.0, 0.5), 0.0, 0.999);

  int ladderMode, stages;
  modeToLadder(mode, &ladderMode, &stages);

  const double wc = clampd((2.0 * kPi * cutoffHz) / safeRate, 1e-9, kPi * 0.98);
  const double sine = dsp_sin_0_pi(wc);
  const double cosine = dsp_cos_0_pi(wc);
  const double tangent = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
  double a = sine - cosine * tangent;
  a = (a > -1e-12 && a < 1e-12) ? (a >= 0.0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;

  double c[5];
  double mixS;
  compute_mix(ladderMode, stages, c, &mixS);

  const double b = 1.0 + a;
  const double denom = 1.0 + a * a + 2.0 * a * cosine;
  const double safeDenom = denom < 1e-12 ? 1e-12 : denom;
  const double g2 = (b * b) / safeDenom;
  const double g2sq = g2 * g2 < 1e-12 ? 1e-12 : g2 * g2;
  const double k = feedback / g2sq;
  const double g = 1.0 + mixS * k;

  double inputSignal = dsp_tanh(input * 2.0);
  if (chaos > 0.0) {
    inputSignal += nextNoiseBipolar(&s.rngState) * chaos;
  }

  const double safeIn = safe(g * inputSignal - k * s.y[4]);
  double y0 = safeIn / (1.0 + safeIn * safeIn);
  const double ny1 = safe(y0 + a * (y0 - s.y[1]));
  const double ny2 = safe(ny1 + a * (ny1 - s.y[2]));
  const double ny3 = safe(ny2 + a * (ny2 - s.y[3]));
  const double ny4 = safe(ny3 + a * (ny3 - s.y[4]));
  s.y[0] = safe(y0);
  s.y[1] = ny1;
  s.y[2] = ny2;
  s.y[3] = ny3;
  s.y[4] = ny4;

  const double out = c[0] * s.y[0] + c[1] * s.y[1] + c[2] * s.y[2] + c[3] * s.y[3] + c[4] * s.y[4];
  return safe(out) * 0.41;
}

extern "C" int soemdsp_rsmet_filter_version() {
  return 1;
}
