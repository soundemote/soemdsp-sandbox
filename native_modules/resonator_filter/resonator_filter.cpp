// soemdsp-native-module: resonator_filter
// soemdsp-native-label: Resonator Filter
// soemdsp-native-target: resonatorFilter
// soemdsp-native-kind: filter
//
// A dual-phasor FM feedback resonator through a one-pole lowpass tap and
// a DC-blocking highpass tap. Three modes ported from the original
// SinusoidResonator_LP, TriangleResonator_LP, and SawtoothResonator_LP --
// each produces chaotic variations on its namesake waveform, growling and
// grinding at extremes or soft and bubbly/fuzzy/howling depending on mode.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
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

static inline double curveShape(double v, double tension) {
  double denom = 2.0 * tension * v - tension - 1.0;
  if (denom == 0.0) return v;
  return (tension * v - v) / denom;
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
static double waveEllipse(double phaseCycles, double ellipseC) {
  double sinX = dsp_sin(phaseCycles * kTwoPi);
  double cosX = dsp_cos(phaseCycles * kTwoPi);
  double sqrtVal = dsp_sqrt(cosX * cosX + (ellipseC * sinX) * (ellipseC * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return cosX / sqrtVal;
}

static double waveSine(double phaseCycles) {
  return dsp_sin(phaseCycles * kTwoPi);
}

// rsScaledAndShiftedSigmoid, center=0: getValue(x) = (width/2) * tanh((2/width) * x)
// Deliberately kept on dsp_exp_narrow (not the general dsp_exp): with
// width=0.00873698 and x a full-range waveSine output (+-1), the exponent
// argument reaches +-458, past dsp_exp_narrow's +-40 clamp -- but that
// clamp (and the resulting hard saturation) was already present in the
// originally-ported source, not a refactor artifact, and this module's
// documented character is "chaotic... grinding at extremes" -- so this
// stays as shipped rather than being silently "corrected".
static inline double scaledShiftedSigmoid(double x, double width) {
  const double scaleX = 2.0 / width;
  const double scaleY = width / 2.0;
  return scaleY * (1.0 - 2.0 / (dsp_exp_narrow(2.0 * scaleX * x) + 1.0));
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

struct ResonatorState {
  bool active;
  double phase1, phase2;
  double filterY[5];
  double dcY[5];
  double osc1Value, osc2Value;
  double osc1SelfMod, osc2SelfMod;
  double sawFeedback;  // Sawtooth mode only: its own feedbackSignal state
};

static ResonatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_resonator_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ResonatorState& s = gPool[i];
      s.phase1 = 0.0; s.phase2 = 0.0;
      for (int j = 0; j < 5; j++) { s.filterY[j] = 0.0; s.dcY[j] = 0.0; }
      s.osc1Value = 0.0; s.osc2Value = 0.0;
      s.osc1SelfMod = 0.0; s.osc2SelfMod = 0.0;
      s.sawFeedback = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_resonator_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_resonator_filter_sample(
  int handle,
  double input,
  double frequency,  // 0..1 normalized
  double resonance,  // 0..1
  double chaosAmount,  // 0..1
  int mode,          // 0=Sinusoid, 1=Triangle, 2=Sawtooth
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ResonatorState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);
  const int safeMode = mode < 0 ? 0 : (mode > 2 ? 2 : mode);

  if (safeMode == 0 || safeMode == 1) {
    // Sinusoid / Triangle resonator
    const bool triangle = safeMode == 1;
    const double inputAmplitude = triangle ? 3.0 : 2.0;

    double maxFreqNorm, resDropPoint;
    if (safeRate <= 44100.0) { maxFreqNorm = 0.855; resDropPoint = 0.74; }
    else if (safeRate <= 88200.0) { maxFreqNorm = 0.9; resDropPoint = 0.75; }
    else if (safeRate <= 132300.0) { maxFreqNorm = 0.9; resDropPoint = 0.82; }
    else if (safeRate <= 176400.0) { maxFreqNorm = 0.9; resDropPoint = 0.88; }
    else if (safeRate <= 220500.0) { maxFreqNorm = 0.9; resDropPoint = 0.92; }
    else { maxFreqNorm = 0.955; resDropPoint = 0.92; }

    const double freqNormInUse = freqNorm < maxFreqNorm ? freqNorm : maxFreqNorm;
    const double frequencyHz = pitchToFreq(jmap01(freqNormInUse, -72.96, 69.76));
    const double cutoffHz = frequencyHz * jmap01(curveShape(freqNormInUse, -0.36), 0.248387, 0.0927813);
    const double osc2Ratio = jmap01(freqNormInUse, 0.015625, 1.58);
    const double osc1Ratio = osc2Ratio - 0.015625;

    const GraphNode resVfreqGraph[3] = {
      {0, reso, 0, 0}, {resDropPoint, reso, 0, 0}, {1, 0.15, 0.557, 1},
    };
    const double newResNorm = evalGraph(resVfreqGraph, 3, freqNorm);
    const double freqModAmt = jmap01(newResNorm, 10.0, 484.43);
    const double phaseModAmt = jmap01(chaos, 0.256, 0.166);

    double inputSignal = inputAmplitude * input;
    inputSignal = s.osc2Value + s.osc1SelfMod + inputSignal;

    const double freq1 = frequencyHz * osc1Ratio * freqModAmt * 0.1 * inputSignal;
    const double clampedFreq1 = clampd(freq1, -safeRate * 0.5, safeRate * 0.5);
    s.phase1 = s.phase1 + clampedFreq1 / safeRate;
    s.phase1 = s.phase1 - dsp_floor(s.phase1);
    const double phaseOffset1 = inputSignal * phaseModAmt;
    double unipolar1 = s.phase1 + phaseOffset1;
    unipolar1 = unipolar1 - dsp_floor(unipolar1);
    s.osc1Value = waveEllipse(unipolar1, 0.00749) * 0.5;

    const double a = ladderCoefficient(cutoffHz, safeRate);
    inputSignal = ladderTapStep(s.filterY, s.osc1Value, a, 1, 1);

    s.osc1SelfMod = inputSignal;
    s.osc2SelfMod = s.osc2Value;

    const double fm2 = freqModAmt * 4.53126 * inputSignal + s.osc2SelfMod * 3.0;
    const double freq2 = frequencyHz * osc2Ratio * fm2;
    const double clampedFreq2 = clampd(freq2, -safeRate * 0.5, safeRate * 0.5);
    s.phase2 = s.phase2 + clampedFreq2 / safeRate;
    s.phase2 = s.phase2 - dsp_floor(s.phase2);

    double out;
    if (!triangle) {
      out = waveSine(s.phase2);
      s.osc2Value = out * 10.0;
    } else {
      const GraphNode ellipseCGraph[2] = { {0, 0.3, 0, 0}, {1, 1.0, -0.99, 2} };
      const double ellipseC = evalGraph(ellipseCGraph, 2, freqNormInUse);
      out = waveEllipse(s.phase2, ellipseC);
      s.osc2Value = out * 10.0;
    }

    const double dcA = ladderCoefficient(5.0, safeRate);
    const double dcOut = ladderTapStep(s.dcY, -out, dcA, 2, 1);
    return dcOut * (triangle ? 10.0 : 4.6);
  } else {
    // Sawtooth resonator
    const double inputAmplitude = 2.0;
    const double frequencyHz = pitchToFreq(jmap01(freqNorm, -50.0, 108.0));
    const double cutoffHz = frequencyHz * 8.87718;

    const GraphNode mod21Graph[2] = { {0, -0.00105655, 0, 0}, {1, -2.52898, -0.99, 2} };
    const GraphNode fmpm12Graph[2] = { {0, 0.0, 0, 0}, {1, 0.012216, 0.54, 2} };

    double breakpoint2, cap3;
    if (safeRate <= 44100.0) { breakpoint2 = 0.578595; cap3 = 0.432749; }
    else if (safeRate <= 88200.0) { breakpoint2 = 0.692308; cap3 = 0.502924; }
    else if (safeRate <= 132300.0) { breakpoint2 = 0.749164; cap3 = 0.561404; }
    else { breakpoint2 = 0.776273; cap3 = 0.54386; }
    const double cappedTarget = reso < cap3 ? reso : cap3;
    const GraphNode resVsFreqGraph[4] = {
      {0, 0, 0, 0}, {0.0434783, reso, 0, 0}, {breakpoint2, reso, 0, 0}, {1, cappedTarget, 0.195211, 1},
    };
    const double resSample = evalGraph(resVsFreqGraph, 4, freqNorm);
    double mod21 = evalGraph(mod21Graph, 2, resSample);
    if (mod21 < -1.53) mod21 = -1.53;
    const double fmpm12 = evalGraph(fmpm12Graph, 2, chaos);

    double inputSignal = (-input) * inputAmplitude + s.sawFeedback * -8.07896613446314289533 + s.osc2Value + s.osc1SelfMod * 20.0;

    const double freq1 = frequencyHz * mod21 * inputSignal;
    s.phase1 = s.phase1 + freq1 / safeRate;
    s.phase1 = s.phase1 - dsp_floor(s.phase1);
    s.osc1Value = waveSine(s.phase1);
    s.osc1Value = scaledShiftedSigmoid(s.osc1Value, 0.00873698);

    const double a = ladderCoefficient(cutoffHz, safeRate);
    inputSignal = ladderTapStep(s.filterY, s.osc1Value, a, 1, 1);

    s.osc1SelfMod = inputSignal;
    s.osc2SelfMod = s.osc2Value;

    const double mod = inputSignal * -140.010789331 + s.osc2SelfMod * -1.05208;
    const double fm = dsp_cos(kHalfPi * fmpm12) * mod;
    const double pm = dsp_sin(kHalfPi * fmpm12) * mod;
    s.phase2 = s.phase2 + (frequencyHz * (-0.425 + fm)) / safeRate;
    s.phase2 = s.phase2 - dsp_floor(s.phase2);
    double unipolar2 = s.phase2 + pm;
    unipolar2 = unipolar2 - dsp_floor(unipolar2);
    s.osc2Value = waveSine(unipolar2);

    s.sawFeedback = inputSignal + s.osc2Value;

    const double dcA = ladderCoefficient(5.0, safeRate);
    const double dcOut = ladderTapStep(s.dcY, -s.osc2Value * 0.1, dcA, 2, 1);
    return dcOut * 80.0;
  }
}

extern "C" int soemdsp_resonator_filter_version() {
  return 1;
}
