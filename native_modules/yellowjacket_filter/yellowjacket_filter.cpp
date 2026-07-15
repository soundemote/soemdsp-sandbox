// soemdsp-native-module: yellowjacket_filter
// soemdsp-native-label: Yellowjacket Filter
// soemdsp-native-target: yellowjacketFilter
// soemdsp-native-kind: filter
//
// A feedback-modulated ellipse-oscillator filter, one-pole (6dB/octave)
// output stage, with a resonance-vs-frequency shaping curve controlling
// both the oscillator's waveshape and its feedback gain. Ported from the
// original Yellowjacket_BP -- grindy, heavily overdriven, easily produces
// square-wave-like output at most resonance settings.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
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

// 3-node Graph, RATIONAL shape at node2, matching Yellowjacket's
// resVfreqGraph: node0/node1 track resonance (flat segment between them),
// node2 is a FIXED constant (never moved after construction).
static double evalResVFreqGraph(double x, double n0y, double breakpoint, double n2yFixed, double skew) {
  Graph g;
  g.addNode(0.0, n0y, 0.0, Graph::Shape::LINEAR);
  g.addNode(breakpoint, n0y, 0.0, Graph::Shape::LINEAR);
  g.addNode(1.0, n2yFixed, skew, Graph::Shape::RATIONAL);
  return g.getValue(x);
}

// waveshape::ellipse, full signature (A, B_sin, B_cos, C).
static double waveEllipseFull(double phase, double A, double bSin, double bCos, double C) {
  double sinX = dsp_sin(phase * kTwoPi);
  double cosX = dsp_cos(phase * kTwoPi);
  double apc = A + cosX;
  double sqrtVal = dsp_sqrt(apc * apc + (C * sinX) * (C * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return (apc * bCos + (C * sinX) * bSin) / sqrtVal;
}

static inline double onePoleCoefficient(double cutoffHz, double sampleRate) {
  double rawWc = kTwoPi * cutoffHz / sampleRate;
  double wc = clampd(rawWc, 1e-9, kPi * 0.98);
  double s = dsp_sin_0_pi(wc);
  double c = dsp_cos_0_pi(wc);
  double t = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
  double denom = s - c * t;
  if (denom > -1e-12 && denom < 1e-12) denom = (denom >= 0.0) ? 1e-12 : -1e-12;
  return t / denom;
}

static inline double onePoleStep(double* y1, double input, double a) {
  double y0 = input;
  y0 = y0 / (1.0 + y0 * y0);
  *y1 = y0 + a * (y0 - *y1);
  return *y1;
}

struct YellowjacketState {
  bool active;
  double phase;
  double filterY1;
  double oscSelfMod;
  double lastOutValue;
};

static YellowjacketState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_yellowjacket_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      YellowjacketState& s = gPool[i];
      s.phase = 0.0;
      s.filterY1 = 0.0;
      s.oscSelfMod = 0.0;
      s.lastOutValue = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_yellowjacket_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_yellowjacket_filter_sample(
  int handle,
  double input,
  double frequency,  // 0..1 normalized
  double resonance,  // 0..1
  double chaosAmount,  // 0..1 (drives filter cutoff scaling, matching original)
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  YellowjacketState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);

  double maxPitch, resDropPoint;
  if (safeRate <= 44100.0) { maxPitch = 87.7; resDropPoint = 0.77; }
  else if (safeRate <= 88200.0) { maxPitch = 96.0; resDropPoint = 0.82; }
  else if (safeRate <= 132300.0) { maxPitch = 96.0; resDropPoint = 0.83; }
  else if (safeRate <= 176400.0) { maxPitch = 96.0; resDropPoint = 0.86; }
  else if (safeRate <= 220500.0) { maxPitch = 96.0; resDropPoint = 0.89; }
  else if (safeRate <= 264600.0) { maxPitch = 96.0; resDropPoint = 0.90; }
  else { maxPitch = 96.0; resDropPoint = 0.95; }

  const double pitch = jmap01(freqNorm, -156.0, 96.0);
  const double frequencyHz = pitchToFreq(pitch < maxPitch ? pitch : maxPitch);
  const double cutoffHz = frequencyHz * jmap01(chaos, 4.56415, 0.972007);

  const double newResNormalized = evalResVFreqGraph(freqNorm, reso, resDropPoint, 0.2, 0.57);
  const double ellipseC = evalExponentialGraph2(newResNormalized, 7.6024, 0.00001, 0.99);
  const double feedbackGain = evalExponentialGraph2(newResNormalized, 20.0, -0.0429102, 0.99);

  const double a = onePoleCoefficient(cutoffHz, safeRate);

  double inputSignal = clampd(input * 4.0, -7.0, 7.0);
  inputSignal = s.oscSelfMod + 1.04025 * inputSignal + s.lastOutValue;

  const double incAmt = (frequencyHz * 1.9400625 * inputSignal) / safeRate;
  s.phase = s.phase + incAmt;
  s.phase = s.phase - dsp_floor(s.phase);

  double oscValue = waveEllipseFull(s.phase, 0.0, -0.71286768918541499, 0.70129855105756955, ellipseC);
  oscValue *= 0.635417;

  inputSignal = onePoleStep(&s.filterY1, oscValue, a);

  s.oscSelfMod = inputSignal * 20.0;

  const double out = 1.3892758936011171 * oscValue;
  s.lastOutValue = out * 0.5 * feedbackGain;

  return out;
}

extern "C" int soemdsp_yellowjacket_filter_version() {
  return 1;
}
