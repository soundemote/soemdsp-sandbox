// soemdsp-native-module: flower_child_filter
// soemdsp-native-label: Flower Child Filter
// soemdsp-native-target: flowerChildFilter
// soemdsp-native-kind: filter
//
// A resonant self-oscillating filter built from a phase/frequency-modulated
// sine-derived oscillator whose output is fed through two cascaded one-pole
// (6dB/octave) lowpass stages, then fed back into the oscillator's own
// modulation input. Resonance controls how much of the filtered output
// re-enters the oscillator's feedback path.
//
// Two revisions, selected by the "mode" parameter:
//   mode 0 (Clean): the feedback oscillator is a plain sine. Gentler,
//     rounds off edges at low resonance, only a slight howl at full
//     resonance.
//   mode 1 (Dirty): the feedback oscillator is reshaped through an
//     ellipse-family waveshaper whose shape tracks resonance, the input
//     clamp is wider, the feedback amount is fixed rather than
//     resonance-scaled, and the output makeup gain is pushed much harder --
//     producing an aggressive, growling character at high resonance.
//
// Exact-reproduction note: the original design's two shaping curves used a
// node-based spline library (soemdsp::utility::Graph / soemdsp::curve::
// Rational). With that source now available, both are reproduced exactly:
//
//   - The FM/PM crossfade-vs-frequency curve is queried at a value (the
//     pitch-mapped cutoff, 3..161) that always exceeds the curve's node
//     domain (nodes only at x=0 and x=1) -- Graph::getValue clamps to the
//     last node's y for any x past the final node, and that node's y is 0
//     for both Rev1 and Rev2. So the crossfade is provably always 0 (pure
//     FM feedback, no PM component), not an approximation -- it's simplified
//     out below rather than computed.
//   - The resonance-vs-frequency soft-limit curve is reproduced with the
//     exact 3-node Graph structure and the exact Rational curve formula
//     (out = ((1+skew)*p) / (1-skew+2*skew*p)), including the detail that
//     Rev2 (unlike Rev1) samples this curve at the *frequency* slider
//     position, not at resonance.
//
// mode 2 (Rev3): a different oscillator scheme entirely -- an "ellipsoid"
//   waveshaper on a bipolar phasor value, driven by 5 independent 4-node
//   resonance-shaping curves (phase-mod amount, sine amplitude, sine-to-
//   square morph, clip level, noise reduction), through two cascaded
//   impulse-invariant-transform one-pole lowpass stages (a different,
//   gentler filter response than the ladder-style stages modes 0/1 use).
//   One curve (clipLevelGraph) had a genuinely ambiguous node list in the
//   original 2021 source (nodes added twice, with a shape/skew set-call
//   that only lines up with the intended values under the reading that the
//   later three-node redefinition (7 -> 7 -> 2) supersedes an earlier,
//   apparently-superseded four-value block) -- reproduced here using that
//   later, clearly-intentional definition.
// mode 3 (Downsampled): Rev1's architecture with only one lowpass stage
//   and its oscillator's phase resampled through a sample-and-hold before
//   waveshaping, aliasing it deliberately for a fuzzy/grungy character.

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

static inline double jmapGeneral(double v, double srcMin, double srcMax, double dstMin, double dstMax) {
  return dstMin + (dstMax - dstMin) * (v - srcMin) / (srcMax - srcMin);
}

// rsOnePoleFilter LOWPASS_IIT (matched-Z-transform one-pole): a1=exp(-w),
// b0=1-a1, y[n]=b0*x[n]+a1*y[n-1]. Exact, per soemdsp/filter/OnePoleFilter.hpp.
static inline double onePoleIitCoefficient(double cutoffHz, double sampleRate) {
  double w = clampd(kTwoPi * cutoffHz / sampleRate, 1e-9, kPi * 0.98);
  return dsp_exp_narrow(-w);
}

static inline double onePoleIitStep(double* y1, double input, double a1) {
  double b0 = 1.0 - a1;
  *y1 = b0 * input + a1 * (*y1);
  return *y1;
}

// Standard sample-and-hold: latches a fresh value each time its own
// internal phase (running at samplingFreq) wraps, otherwise repeats the
// last latched value -- the only sensible reading of "SampleAndHold" as
// used here (no source for this specific utility class was available).
static inline double sampleAndHoldStep(double* dsPhase, double* held, double incoming, double samplingFreq, double sampleRate) {
  *dsPhase += samplingFreq / sampleRate;
  if (*dsPhase >= 1.0) {
    *dsPhase -= dsp_floor(*dsPhase);
    *held = incoming;
  }
  return *held;
}

// Standalone tension/ease curve (soemdsp's free-standing curve() function,
// distinct from curve::Rational below). 0->0, 1->1, tension=0 is linear.
static inline double curveShape(double v, double tension) {
  double t = tension;
  double denom = 2.0 * t * v - t - 1.0;
  if (denom == 0.0) return v;
  return (t * v - v) / denom;
}

// soemdsp::utility::Graph::getValue for the 3-node shape this filter uses:
// node0=(0, n0y, LINEAR), node1=(breakpoint, n0y, LINEAR -- same y as node0
// makes this segment flat regardless of shape), node2=(1, n2y, RATIONAL
// with the given skew). Delegates to the shared Graph struct (graph.h)
// instead of hand-rolling the node walk/curve math.
static inline double evalResonanceGraph(double x, double n0y, double breakpoint, double n2y, double skew) {
  Graph g;
  g.addNode(0.0, n0y, 0.0, Graph::Shape::LINEAR);
  g.addNode(breakpoint, n0y, 0.0, Graph::Shape::LINEAR);
  g.addNode(1.0, n2y, skew, Graph::Shape::RATIONAL);
  return g.getValue(x);
}

// Rev3's shaping curves are literal soemdsp::utility::Graph node lists
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

static inline double pitchToFreq(double pitch) {
  return 440.0 * dsp_exp2((pitch - 69.0) / 12.0);
}

// waveshape::sine -- phase is unipolar [0,1)
static inline double waveSine(double phase) {
  return dsp_sin(phase * kTwoPi);
}

// waveshape::ellipse -- phase is unipolar [0,1). A/B_sin/B_cos/C per the
// original signature; Flower Child always calls it with A=0, B_sin=0,
// B_cos=1, C=ellipseC.
static inline double waveEllipse(double phase, double ellipseC) {
  double sinX = dsp_sin(phase * kTwoPi);
  double cosX = dsp_cos(phase * kTwoPi);
  double sqrtVal = dsp_sqrt(cosX * cosX + (ellipseC * sinX) * (ellipseC * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return cosX / sqrtVal;
}

// Simple xorshift32 PRNG for the (nearly-unfiltered in the original --
// its bandpass corners sit at ~0.125Hz and ~20.6kHz) noise contribution.
static inline double nextNoiseBipolar(unsigned int* state) {
  unsigned int x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x;
  return ((double)x / 4294967295.0) * 2.0 - 1.0;
}

// One-pole (6dB/octave) lowpass stage matching rsLadderFilter's LP_6 tap
// with resonance fixed at 0 (Flower Child never sets resonance on its two
// internal lowpass stages) -- includes the same soft input nonlinearity
// the ladder architecture always applies at its input node.
struct OnePoleStage {
  double y1;
};

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

static inline double onePoleStep(OnePoleStage* stage, double input, double a) {
  double y0 = input;
  y0 = y0 / (1.0 + y0 * y0);
  stage->y1 = y0 + a * (y0 - stage->y1);
  return stage->y1;
}

struct FlowerChildState {
  bool active;
  double phase;
  double phaseOffset;
  OnePoleStage stage1;
  OnePoleStage stage2;
  double selfMod;
  unsigned int rngState;
  // Rev3 (mode 2) only:
  double rev3Feedback;
  double rev3Lpf1Y1, rev3Lpf2Y1;  // one-pole IIT stages
  // Downsampled (mode 3) only:
  double dsPhase, dsHeld;
};

static FlowerChildState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_flower_child_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FlowerChildState& s = gPool[i];
      s.phase = 0.0;
      s.phaseOffset = 0.0;
      s.stage1.y1 = 0.0;
      s.stage2.y1 = 0.0;
      s.selfMod = 0.0;
      s.rngState = 0x9E3779B9u + (unsigned int)(i + 1) * 2654435761u;
      s.rev3Feedback = 0.0;
      s.rev3Lpf1Y1 = 0.0;
      s.rev3Lpf2Y1 = 0.0;
      s.dsPhase = 0.0;
      s.dsHeld = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_flower_child_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_flower_child_filter_sample(
  int handle,
  double input,
  double frequency,   // 0..1 normalized slider, matches original
  double resonance,   // 0..1
  double chaosAmount,  // 0..1
  int mode,            // 0=Clean(Rev1), 1=Dirty(Rev2), 2=Rev3, 3=Downsampled
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  FlowerChildState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double freqNorm = clampd(frequency, 0.0, 1.0);
  const double reso = clampd(resonance, 0.0, 1.0);
  const double chaos = clampd(chaosAmount, 0.0, 1.0);

  if (mode == 2) {
    // Rev3
    const double masterPitch = jmap01(freqNorm, -120.0, 105.0);
    const double masterFrequency = pitchToFreq(masterPitch);
    const double fmAmount = pitchToFreq(-48.377);
    const double lpf1Cutoff = pitchToFreq(jmapGeneral(masterPitch, -120.0, 120.0, 90.0, 180.0));
    const double lpf2Cutoff = pitchToFreq(jmapGeneral(masterPitch, -120.0, 120.0, 80.0, 130.0));
    const double lpf1A = onePoleIitCoefficient(lpf1Cutoff, safeRate);
    const double lpf2A = onePoleIitCoefficient(lpf2Cutoff, safeRate);

    const GraphNode phaseModGraph[4] = {
      {0, 0.0, 0, 0}, {0.5, -0.017446, 0.9, 1}, {0.6, -0.017575, 0.0, 1}, {1.0, -0.0147, 0.6, 1},
    };
    const GraphNode sineAmpGraph[4] = {
      {0, 4.44777, 0, 0}, {0.5, 8.6687, 0.9, 1}, {0.6, 8.6687, 0.0, 1}, {1.0, 2.0, 0.6, 1},
    };
    const GraphNode sineToSquareGraph[4] = {
      {0, 0.6792, 0, 0}, {0.5, 0.9552, 0.9, 1}, {0.6, 0.9552, 0.0, 1}, {1.0, 0.001, 0.6, 1},
    };
    const GraphNode clipLevelGraph[3] = { {0.0, 7.0, 0, 0}, {0.7, 7.0, 0.0, 1}, {1.0, 2.0, 0.6, 1} };
    const GraphNode noiseGraph[3] = { {0.0, 0.0, 0, 0}, {0.8, 0.1, 0, 0}, {1.0, 1.0, 0.0, 1} };

    const double pmAmount = evalGraph(phaseModGraph, 4, reso);
    const double sineAmp = evalGraph(sineAmpGraph, 4, reso);
    const double sineToSquare = evalGraph(sineToSquareGraph, 4, reso);
    const double clipLevelRaw = evalGraph(clipLevelGraph, 3, reso);
    const double clipLevel = sineAmp < clipLevelRaw ? sineAmp : clipLevelRaw;
    const double noiseReduction = evalGraph(noiseGraph, 3, reso);
    const double chaosAmount4x = chaos * 4.0;

    double in = s.rev3Feedback + clampd(-1.0 * input, -clipLevel, clipLevel);
    const double f = masterFrequency * in * fmAmount;
    const double noiseTerm = masterFrequency * nextNoiseBipolar(&s.rngState) * chaosAmount4x * noiseReduction;

    const double incAmt = (f + noiseTerm) / safeRate;
    s.phase = s.phase + incAmt;
    s.phase = s.phase - dsp_floor(s.phase);
    const double bipolarPhasor = 2.0 * s.phase - 1.0;
    const double phasorOut = bipolarPhasor + pmAmount * s.rev3Feedback;

    const double ellipseOut = sineAmp * waveEllipse(phasorOut, sineToSquare);

    double feedback = onePoleIitStep(&s.rev3Lpf1Y1, ellipseOut, lpf1A);
    feedback = onePoleIitStep(&s.rev3Lpf2Y1, feedback, lpf2A);
    s.rev3Feedback = feedback;

    return feedback * 0.15;
  }

  if (mode == 3) {
    // Downsampled (Rev1Downsampled)
    const double maxNormFreq3 = safeRate <= 44100.0 ? 0.928 : 1.0;
    const double normalizedFreqInUse3 = jmap01(freqNorm < maxNormFreq3 ? freqNorm : maxNormFreq3, 3.0, 161.0);
    const double frequencyHz3 = pitchToFreq(normalizedFreqInUse3);
    // FM/PM crossfade provably 0 here too (same node-domain-clamp argument
    // as modes 0/1 -- see the file header's exact-reproduction note).

    const double cutoff1 = frequencyHz3 * 0.4;
    const double a1 = onePoleCoefficient(cutoff1, safeRate);

    double breakpoint, cap;
    if (safeRate <= 44100.0) { breakpoint = 0.732441; cap = 0.649123; }
    else if (safeRate <= 88200.0) { breakpoint = 0.816054; cap = 0.818713; }
    else { breakpoint = 0.879599; cap = 0.807018; }
    const double cappedTarget = reso < cap ? reso : cap;
    const double graphValue = evalResonanceGraph(reso, reso, breakpoint, cappedTarget, -0.38);
    const double selfModAmp = jmap01(curveShape(graphValue, 0.4), 0.0368, 0.6333);

    double inputSignal = clampd(-input, -1.0, 1.0) * 0.036;
    inputSignal += s.selfMod;

    const double mod = 1.4 * inputSignal;
    const double fm = mod;  // crossfade=0

    const double incAmt = (frequencyHz3 * fm * 6.0) / safeRate;  // live5=6.0
    s.phase = s.phase + incAmt;
    s.phase = s.phase - dsp_floor(s.phase);

    const double dsf0y = 0.0;
    const double dsf1y = 0.025 * safeRate;
    const GraphNode dsf[2] = { {0, dsf0y, 0, 0}, {1, dsf1y, -0.09, 2} };
    const double samplingFreq = frequencyHz3 * 2.0 + evalGraph(dsf, 2, 10.0 * (mod < 0 ? -mod : mod));

    const double downsampledPhase = sampleAndHoldStep(&s.dsPhase, &s.dsHeld, s.phase, samplingFreq, safeRate);
    const double current_osc_value = waveSine(downsampledPhase) * 1.3;

    const double filtered = onePoleStep(&s.stage1, current_osc_value, a1);
    s.selfMod = filtered * selfModAmp;

    return filtered * 1.4;
  }

  const bool dirty = mode != 0;

  const double maxNormFreq = safeRate <= 44100.0 ? 0.928 : 1.0;
  const double normalizedFreqInUse = jmap01(freqNorm < maxNormFreq ? freqNorm : maxNormFreq, 3.0, 161.0);
  const double frequencyHz = pitchToFreq(normalizedFreqInUse);

  // FM/PM crossfade is provably always 0 here -- see the exact-reproduction
  // note above. cos(0)=1, sin(0)=0, so this collapses to pure FM feedback:
  // fm = mod, pm = 0.

  const double cutoff1 = frequencyHz * 0.164312;
  const double cutoff2 = frequencyHz * 0.366131;
  const double a1 = onePoleCoefficient(cutoff1, safeRate);
  const double a2 = onePoleCoefficient(cutoff2, safeRate);

  // Resonance-vs-frequency soft-limit curve, exact Graph/Rational
  // reproduction. Rev1 samples it at the resonance value itself; Rev2
  // samples it at the frequency slider position instead (matching the
  // original's updateResonance override exactly).
  double breakpoint, cap;
  if (dirty) {
    if (safeRate <= 44100.0) { breakpoint = 0.816054; cap = 0.602339; }
    else if (safeRate <= 88200.0) { breakpoint = 0.902657; cap = 0.654971; }
    else { breakpoint = 0.977649; cap = 0.760234; }
  } else {
    if (safeRate <= 44100.0) { breakpoint = 0.732441; cap = 0.649123; }
    else if (safeRate <= 88200.0) { breakpoint = 0.816054; cap = 0.818713; }
    else { breakpoint = 0.879599; cap = 0.807018; }
  }
  const double cappedTarget = reso < cap ? reso : cap;

  double selfModAmp = 1.0;
  double ellipseC = -1.0;
  if (!dirty) {
    const double graphValue = evalResonanceGraph(reso, reso, breakpoint, cappedTarget, -0.38);
    selfModAmp = jmap01(curveShape(graphValue, 0.4), 0.0368, 0.6333);
  } else {
    const double graphValue = evalResonanceGraph(freqNorm, reso, breakpoint, cappedTarget, -0.38);
    ellipseC = jmap01(curveShape(graphValue, -0.6), -1.0, 0.00001);
  }

  const double clampLimit = dirty ? 1.198 : 1.0;
  double inputSignal = clampd(-input, -clampLimit, clampLimit);

  if (chaos > 0.0) {
    inputSignal += nextNoiseBipolar(&s.rngState) * chaos;
  }

  inputSignal = s.selfMod + 0.035848699999999845 * inputSignal;

  const double mod = 1.4 * inputSignal;
  const double fm = mod;

  s.phaseOffset = 0.0;
  const double incAmt = (frequencyHz * fm) / safeRate;
  s.phase = s.phase + incAmt;
  s.phase = s.phase - dsp_floor(s.phase);
  double unipolarPhase = s.phase + s.phaseOffset;
  unipolarPhase = unipolarPhase - dsp_floor(unipolarPhase);

  double oscValue = dirty
    ? waveEllipse(unipolarPhase, ellipseC) * 0.1
    : waveSine(unipolarPhase) * 1.3;

  double out = onePoleStep(&s.stage1, oscValue, a1);
  out = onePoleStep(&s.stage2, out, a2);

  s.selfMod = dirty ? out * 0.465 : out * selfModAmp;

  return dirty ? out * 5.22 : out * 1.31;
}

extern "C" int soemdsp_flower_child_filter_version() {
  return 1;
}
