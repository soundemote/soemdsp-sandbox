// soemdsp-native-module: chaotic_phase_locking_filter
// soemdsp-native-label: Chaotic Phaselocking Filter
// soemdsp-native-target: chaoticPhaseLockingFilter
// soemdsp-native-kind: filter
//
// A feedback ellipse-waveshaper resonator through a 12dB lowpass tap and
// a 6dB DC-blocking highpass tap. Ported from the original
// ChaoticPhaseLocking -- a simple, direct feedback loop (no oscillator
// phasor) whose ellipse waveshape parameter is driven by the chaos
// control, producing phase-locked chaotic textures.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;

static inline double dsp_sqrt(double x) {
  if (x <= 0.0) return 0.0;
  double guess = x;
  for (int i = 0; i < 24; i++) guess = 0.5 * (guess + x / guess);
  return guess;
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

// 2-node EXPONENTIAL curve, built directly as a Graph (graph.h) instead of
// hand-rolling the exponential segment formula.
static double evalExponentialGraph2(double x, double y0, double y1, double skew) {
  Graph g;
  g.addNode(0.0, y0, 0.0, Graph::Shape::LINEAR);
  g.addNode(1.0, y1, skew, Graph::Shape::EXPONENTIAL);
  return g.getValue(x);
}

// waveshape::ellipse with A=0, B_sin=0, B_cos=1 (the common case).
static double waveEllipse(double phaseCycles, double ellipseC) {
  double sinX = dsp_sin(phaseCycles * kTwoPi);
  double cosX = dsp_cos(phaseCycles * kTwoPi);
  double sqrtVal = dsp_sqrt(cosX * cosX + (ellipseC * sinX) * (ellipseC * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return cosX / sqrtVal;
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

struct ChaoticState {
  bool active;
  double feedbackSignal;
  double filterY[5];
  double dcY[5];
};

static ChaoticState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_chaotic_phase_locking_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ChaoticState& s = gPool[i];
      s.feedbackSignal = 0.0;
      for (int j = 0; j < 5; j++) { s.filterY[j] = 0.0; s.dcY[j] = 0.0; }
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_chaotic_phase_locking_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_chaotic_phase_locking_filter_sample(
  int handle,
  double input,
  double frequency,  // 0..1 normalized
  double resonance,  // 0..1
  double chaosAmount,  // 0..1
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ChaoticState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);

  const double cutoffHz = clampd(pitchToFreq(jmap01(freqNorm, -12.0, 135.0)), 0.0, 0.5 * safeRate);
  const double mod = evalExponentialGraph2(reso, 0.1, 20.0, -0.85);
  const double shape = 1.0 - chaos;

  s.feedbackSignal = mod * s.feedbackSignal + (-input);
  const double oscValue = waveEllipse(s.feedbackSignal, shape);

  const double a = ladderCoefficient(cutoffHz, safeRate);
  s.feedbackSignal = ladderTapStep(s.filterY, oscValue, a, 1, 2);

  const double dcA = ladderCoefficient(5.0, safeRate);
  const double dcOut = ladderTapStep(s.dcY, s.feedbackSignal, dcA, 2, 1);

  return -dcOut;
}

extern "C" int soemdsp_chaotic_phase_locking_filter_version() {
  return 1;
}
