// soemdsp-native-module: robin_sinepulse_allpass
// soemdsp-native-label: Robin Sinepulse Allpass
// soemdsp-native-target: robinSinepulseAllpass
// soemdsp-native-kind: drum
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h
//
// Robin Sinepulse Allpass: port of rosic::rsFlatZapper (Robin Schmidt, RS-MET),
// used with Robin's permission (2026-10-06, see docs/KICK_PLAN.md).
// Original: originalcode/ (rsFlatZapper, rsBiquadCascade, BiquadDesigner,
// ToolChain FlatZapperModule).
//
// A chain of N (0..256) allpass stages. Stage i of N, p = i / (N - 1):
//   f_i = fLo * exp(shape(p, freqShape) * ln(fHi / fLo))     (rsLinToExp)
//   q_i = qLo * exp(shape(p, qShape)    * ln(qHi / qLo))
//   shape(x, s) = rsRationalMap_01(x, (2^s - 1) / (2^s + 1))  (= rational_curve01)
// N == 1 uses fLo / qLo only; N == 0 is a wire. The lowest-tuned stage is first.
//   biquad:  RBJ cookbook allpass (BiquadDesigner::calculateCookbookAllpassCoeffs)
//            run as Robin's DF1 cascade y = b0 x + (b1 x1 + b2 x2) - (a1 y1 + a2 y2);
//            for this design a1 == b1 and a2 == b0 bit for bit, so only b0..b2
//            are stored.
//   onePole: first-order allpass (calculateFirstOrderAllpassCoeffs),
//            c = (tan(pi f / fs) - 1) / (tan(pi f / fs) + 1), y = c x + x1 - c y1
//            (Robin runs it through the biquad cascade with b2 = a2 = 0; this is
//            the dedicated first-order path from his ToDo, same arithmetic).
//            tan comes from the joint sin/cos helper: c = (sin - cos) / (sin + cos);
//            the biquad's sin / cos(omega) come from the same half angle
//            (sin = 2 s c, cos = 1 - 2 s^2) to keep low tunings accurate.
// Fed an impulse the chain rings out as a falling, flat-spectrum "zap".
//
// Sandbox wrapper (docs/KICK_PLAN.md "Flat Zapper module (seed)", Argi 2026-10-06):
//   - Trigger (gate_hit, height v = velocity): adds one impulse sample of
//     height |v| * impulse to the chain input (ToolChain: Exciter %).
//   - In * input is added to the chain input (ToolChain: Input %).
//   - Out = amplitude * (mix * chain + (1 - mix) * dry), dry = In*input + impulse.
//   - No Reset port; stages are never reset by a Trigger (as in ToolChain).
//   - No brown post-filter (Robin's getBrownZap), no stereo.
//   - Coefficients are recomputed only when a param (or the sample rate)
//     changes: set_params() compares against the last values. The graph
//     calls it once per 32-sample sub-block.
//   - Changing Stages keeps the states of the stages that remain and zeroes
//     new ones (Robin's setNumStages zeroes all of them). Mode changes keep
//     the states (as Robin does).
//   - Stage tunings are clamped below Nyquist (0.4999 fs); Q to [1e-3, 1e3].
//   - Idle: after 4096 samples of silent input and output the states are
//     zeroed and processing stops until input or a Trigger arrives.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxStages = 256;          // rsFlatZapper::maxNumStages
static const int kIdleSamples = 4096;
static const double kLn2 = 0.6931471805599453;
static const double kMinFreq = 1.0e-2;
static const double kMaxFreqRatio = 0.4999;  // of the sample rate
static const double kMinQ = 1.0e-3;
static const double kMaxQ = 1.0e3;

enum { kModeOnePole = 0, kModeBiquad = 1 };   // choiceKeys onePole, biquad

struct State {
  // Per stage: biquad b0, b1, b2 (a1 = b1, a2 = b0) or one-pole c in b0.
  double b0[kMaxStages];
  double b1[kMaxStages];
  double b2[kMaxStages];
  double x1[kMaxStages];
  double x2[kMaxStages];
  double y1[kMaxStages];
  double y2[kMaxStages];
  int numStages;
  int mode;
  // Params the coefficients were made with.
  double pLo, pHi, pFShape, pQLo, pQHi, pQShape, pSr;
  bool valid;
  int updateCount;
  // Wrapper state.
  double lastTrigger;
  int quiet;
  bool idle;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"robin_sinepulse_allpass\","
    "\"label\":\"Robin Sinepulse Allpass\","
    "\"targetType\":\"robinSinepulseAllpass\","
    "\"kind\":\"drum\""
  "}";

static void clear_stages(State& s, int from, int to) {
  for (int i = from; i < to; i++) {
    s.x1[i] = s.x2[i] = s.y1[i] = s.y2[i] = 0.0;
  }
}

static void init_state(State& s) {
  for (int i = 0; i < kMaxStages; i++) {
    s.b0[i] = 1.0;  // identity until the first set_params
    s.b1[i] = 0.0;
    s.b2[i] = 0.0;
  }
  clear_stages(s, 0, kMaxStages);
  s.numStages = 0;
  s.mode = kModeBiquad;
  s.pLo = s.pHi = s.pFShape = s.pQLo = s.pQHi = s.pQShape = s.pSr = 0.0;
  s.valid = false;
  s.updateCount = 0;
  s.lastTrigger = 0.0;
  s.quiet = 0;
  s.idle = true;
}

// rsFlatZapper::updateCoeffs: the stage-index shape map.
static double shape_map(double x, double shapeParam) {
  const double sl = dsp_exp(kLn2 * shapeParam);   // rsPow(2, shapeParam)
  const double a = (sl - 1.0) / (sl + 1.0);
  return rational_curve01(x, a);                  // rsRationalMap_01(x, a)
}

static double clamp_freq(double f, double sr) {
  return clamp(f, kMinFreq, kMaxFreqRatio * sr);
}

// BiquadDesigner::calculateCookbookAllpassCoeffs, a-signs flipped for the cascade.
static void setup_biquad_stage(State& s, int i, double f, double q, double fsR) {
  // sin / cos of omega = 2 pi f / fs from the half angle: the polynomial cos
  // has ~7e-10 absolute error near 0, which is ~6 % of 1 - cos(omega) at 1 Hz
  // (pole angle error); sin of a small angle is exact to rounding.
  double sh, ch;
  dsp_sin_cos_turns(0.5 * f * fsR, &sh, &ch);
  const double sine = 2.0 * sh * ch;
  const double cosine = 1.0 - 2.0 * sh * sh;
  const double alpha = sine / (2.0 * q);
  const double a0Rec = 1.0 / (1.0 + alpha);
  s.b0[i] = (1.0 - alpha) * a0Rec;
  s.b1[i] = (-2.0 * cosine) * a0Rec;
  s.b2[i] = (1.0 + alpha) * a0Rec;
}

// BiquadDesigner::calculateFirstOrderAllpassCoeffs: x = (t - 1) / (t + 1).
static void setup_one_pole_stage(State& s, int i, double f, double fsR) {
  double sine, cosine;
  dsp_sin_cos_turns(0.5 * f * fsR, &sine, &cosine);  // pi f / fs
  s.b0[i] = (sine - cosine) / (sine + cosine);
  s.b1[i] = 1.0;
  s.b2[i] = 0.0;
}

static void update_coeffs(State& s) {
  const double sr = s.pSr;
  const double fsR = 1.0 / sr;
  const int n = s.numStages;
  s.updateCount += 1;
  if (n == 0) return;
  if (n == 1) {
    const double f = clamp_freq(s.pLo, sr);
    if (s.mode == kModeOnePole) setup_one_pole_stage(s, 0, f, fsR);
    else setup_biquad_stage(s, 0, f, clamp(s.pQLo, kMinQ, kMaxQ), fsR);
    return;
  }
  const double fLo = maxd(s.pLo, kMinFreq);
  const double fHi = maxd(s.pHi, kMinFreq);
  const double lnF = dsp_ln(fHi / fLo);
  const double scaler = 1.0 / (double)(n - 1);
  if (s.mode == kModeOnePole) {
    for (int i = 0; i < n; i++) {
      const double p = scaler * (double)i;
      const double f = clamp_freq(fLo * dsp_exp(shape_map(p, s.pFShape) * lnF), sr);
      setup_one_pole_stage(s, i, f, fsR);
    }
    return;
  }
  const double qLo = clamp(s.pQLo, kMinQ, kMaxQ);
  const double qHi = clamp(s.pQHi, kMinQ, kMaxQ);
  const double lnQ = dsp_ln(qHi / qLo);
  for (int i = 0; i < n; i++) {
    const double p = scaler * (double)i;
    const double f = clamp_freq(fLo * dsp_exp(shape_map(p, s.pFShape) * lnF), sr);
    const double q = clamp(qLo * dsp_exp(shape_map(p, s.pQShape) * lnQ), kMinQ, kMaxQ);
    setup_biquad_stage(s, i, f, q, fsR);
  }
}

// Stage-major in-place chain (rsBiquadCascade::getSampleDirect1 per stage).
static void run_chain(State& s, double* io, int frames) {
  const int n = s.numStages;
  if (s.mode == kModeOnePole) {
    for (int i = 0; i < n; i++) {
      const double c = s.b0[i];
      double x1 = s.x1[i];
      double y1 = s.y1[i];
      for (int k = 0; k < frames; k++) {
        const double x = io[k];
        const double y = c * x + x1 - c * y1;
        x1 = x;
        y1 = y;
        io[k] = y;
      }
      s.x1[i] = x1;
      s.y1[i] = y1;
      s.x2[i] = 0.0;
      s.y2[i] = 0.0;
    }
    return;
  }
  for (int i = 0; i < n; i++) {
    const double b0 = s.b0[i];
    const double b1 = s.b1[i];
    const double b2 = s.b2[i];
    double x1 = s.x1[i], x2 = s.x2[i], y1 = s.y1[i], y2 = s.y2[i];
    for (int k = 0; k < frames; k++) {
      const double x = io[k];
      const double y = b0 * x + (b1 * x1 + b2 * x2) - (b1 * y1 + b0 * y2);
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      io[k] = y;
    }
    s.x1[i] = x1;
    s.x2[i] = x2;
    s.y1[i] = y1;
    s.y2[i] = y2;
  }
}

// Chain with idle handling: io holds the chain input (dry) and gets the chain output.
static void process_chain(State& s, double* io, int frames) {
  double inPeak = 0.0;
  for (int k = 0; k < frames; k++) {
    const double a = dsp_fabs(io[k]);
    if (a > inPeak) inPeak = a;
  }
  const bool inSilent = inPeak < kPlanck;
  if (s.idle && inSilent) {
    for (int k = 0; k < frames; k++) io[k] = 0.0;
    return;
  }
  s.idle = false;
  run_chain(s, io, frames);
  double outPeak = 0.0;
  for (int k = 0; k < frames; k++) {
    const double a = dsp_fabs(io[k]);
    if (!(a * 0.0 == 0.0)) {           // non-finite: clear and go idle
      clear_stages(s, 0, kMaxStages);
      for (int j = 0; j < frames; j++) io[j] = 0.0;
      s.idle = true;
      s.quiet = 0;
      return;
    }
    if (a > outPeak) outPeak = a;
  }
  if (inSilent && outPeak < kPlanck) {
    s.quiet += frames;
    if (s.quiet >= kIdleSamples) {
      clear_stages(s, 0, kMaxStages);
      s.idle = true;
      s.quiet = 0;
    }
  } else {
    s.quiet = 0;
  }
}

static bool valid_handle(int handle) {
  return handle >= 1 && handle <= kMaxInstances && gPool[handle - 1].active;
}

}  // namespace

extern "C" int soemdsp_robin_sinepulse_allpass_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      init_state(gPool[i]);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_robin_sinepulse_allpass_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Sets the chain params. Recomputes the coefficients only when something
// changed; returns 1 if it did, else 0. stages is rounded to an integer and
// clamped to 0..256; mode: 0 = onePole, 1 = biquad (choiceId).
extern "C" int soemdsp_robin_sinepulse_allpass_set_params(
  int handle,
  double stages,
  double mode,
  double lowFreq,
  double highFreq,
  double freqShape,
  double lowQ,
  double highQ,
  double qShape,
  double sampleRate
) {
  if (!valid_handle(handle)) return 0;
  State& s = gPool[handle - 1];
  const double st = clamp(safe(stages), 0.0, (double)kMaxStages);
  const int n = (int)(st + 0.5);
  const int m = safe(mode) < 0.5 ? kModeOnePole : kModeBiquad;
  const double lo = safe(lowFreq);
  const double hi = safe(highFreq);
  const double fs = safe(freqShape);
  const double ql = safe(lowQ);
  const double qh = safe(highQ);
  const double qs = safe(qShape);
  const double sr = safe(sampleRate) > 1.0 ? sampleRate : 44100.0;
  if (s.valid && n == s.numStages && m == s.mode && lo == s.pLo && hi == s.pHi
      && fs == s.pFShape && ql == s.pQLo && qh == s.pQHi && qs == s.pQShape && sr == s.pSr) {
    return 0;
  }
  if (n > s.numStages) clear_stages(s, s.numStages, n);
  s.numStages = n;
  s.mode = m;
  s.pLo = lo;
  s.pHi = hi;
  s.pFShape = fs;
  s.pQLo = ql;
  s.pQHi = qh;
  s.pQShape = qs;
  s.pSr = sr;
  s.valid = true;
  update_coeffs(s);
  return 1;
}

// In-place: io holds the chain input (dry) on entry and the chain output on
// return. Used by the graph engine per sub-block.
extern "C" void soemdsp_robin_sinepulse_allpass_process_chain(int handle, double* io, int frames) {
  if (!io || frames <= 0) return;
  if (!valid_handle(handle)) {
    for (int k = 0; k < frames; k++) io[k] = 0.0;
    return;
  }
  process_chain(gPool[handle - 1], io, frames);
}

// Returns the dry signal for one sample (In * input + Trigger impulse) and
// updates the Trigger memory.
extern "C" double soemdsp_robin_sinepulse_allpass_dry(
  int handle, double trigger, double in, double impulse, double input
) {
  if (!valid_handle(handle)) return 0.0;
  State& s = gPool[handle - 1];
  const double trig = safe(trigger);
  double dry = safe(in) * safe(input);
  if (gate_hit(trig, &s.lastTrigger)) dry += dsp_fabs(trig) * safe(impulse);
  return dry;
}

// Output mix: amplitude * (mix * chain + (1 - mix) * dry), mix clamped to 0..1.
extern "C" double soemdsp_robin_sinepulse_allpass_out(
  double dry, double wet, double mix, double amplitude
) {
  const double mx = clamp(safe(mix), 0.0, 1.0);
  const double out = safe(amplitude) * (mx * wet + (1.0 - mx) * dry);
  return (out * 0.0 == 0.0) ? out : 0.0;
}

// One full sample: dry, chain and output mix. Same maths as the graph path.
extern "C" double soemdsp_robin_sinepulse_allpass_sample(
  int handle,
  double trigger,
  double in,
  double impulse,
  double input,
  double mix,
  double amplitude
) {
  if (!valid_handle(handle)) return 0.0;
  const double dry = soemdsp_robin_sinepulse_allpass_dry(handle, trigger, in, impulse, input);
  double wet = dry;
  process_chain(gPool[handle - 1], &wet, 1);
  return soemdsp_robin_sinepulse_allpass_out(dry, wet, mix, amplitude);
}

extern "C" int soemdsp_robin_sinepulse_allpass_is_idle(int handle) {
  if (!valid_handle(handle)) return 1;
  return gPool[handle - 1].idle ? 1 : 0;
}

extern "C" int soemdsp_robin_sinepulse_allpass_num_stages(int handle) {
  return valid_handle(handle) ? gPool[handle - 1].numStages : 0;
}

extern "C" int soemdsp_robin_sinepulse_allpass_update_count(int handle) {
  return valid_handle(handle) ? gPool[handle - 1].updateCount : 0;
}

extern "C" int soemdsp_robin_sinepulse_allpass_version() { return 1; }
extern "C" const char* soemdsp_robin_sinepulse_allpass_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_robin_sinepulse_allpass_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
