// soemdsp-native-module: soem_reverb
// soemdsp-native-label: SoEmReverb
// soemdsp-native-target: soemReverb
// soemdsp-native-kind: effect
//
// Faithful freestanding port of soemdsp::delay::Reverb::runWithIdleDetection
// and ModulatedDelay::{runLfo,runDelay,runDiffuse} from SoEmReverb /
// include/soemdsp/delay/Reverb.{hpp,cpp} + ModulatedDelay.{hpp,cpp}.
//
// Sample order matches the original switch(EchoMode) bodies exactly.
// Plugin wrapper (oversampling, ear protector) is not reproduced; ducking
// is a simplified peak follower so wet gain still tracks input.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

// Memory: float buffers live in a flat pool (not inside the state struct) so
// scalar IO fields stay at stable low offsets and we never stack-copy state.
constexpr int kMaxInstances = 1;
constexpr int kMaxDelays = 12;
constexpr int kMaxDelaySamples = 48000; // 1 s @ 48 kHz
constexpr double kMaxDelaySeconds = 1.0;
// Per instance: L delays + R delays + echo L + echo R
constexpr int kLinesPerInstance = kMaxDelays * 2 + 2;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"soem_reverb\","
    "\"label\":\"SoEmReverb\","
    "\"targetType\":\"soemReverb\","
    "\"kind\":\"effect\","
    "\"inputs\":[\"Left\",\"Right\",\"Mono\"],"
    "\"outputs\":[\"Dry L\",\"Dry R\",\"Wet L\",\"Wet R\"],"
    "\"parameters\":["
      "{\"key\":\"mix\",\"label\":\"Mix\",\"defaultValue\":0.43,\"min\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"volume\",\"label\":\"Volume\",\"defaultValue\":1,\"min\":0,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"echoTime\",\"label\":\"Echo Time\",\"defaultValue\":0.35,\"min\":0.0001,\"max\":1,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"recycle\",\"label\":\"Recycle\",\"defaultValue\":0.5,\"min\":0,\"max\":2,\"step\":\"any\"},"
      "{\"key\":\"numDelays\",\"label\":\"Num Delays\",\"defaultValue\":10,\"min\":0,\"max\":12,\"step\":1},"
      "{\"key\":\"diffusionSize\",\"label\":\"Diffuse Size\",\"defaultValue\":0.35,\"min\":0.0001,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"diffusionAmount\",\"label\":\"Diffuse Amt\",\"defaultValue\":0.7,\"min\":0,\"max\":0.98,\"step\":\"any\"},"
      "{\"key\":\"seed\",\"label\":\"Seed\",\"defaultValue\":500,\"min\":0,\"max\":999,\"step\":1},"
      "{\"key\":\"lfoAmp\",\"label\":\"LFO Amp\",\"defaultValue\":0.002,\"min\":0,\"max\":0.5,\"step\":\"any\"},"
      "{\"key\":\"lfoFrequency\",\"label\":\"LFO Speed\",\"defaultValue\":0.5,\"min\":0.1,\"max\":90,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"lfoVariation\",\"label\":\"LFO Vary\",\"defaultValue\":1,\"min\":0,\"max\":10,\"step\":\"any\"},"
      "{\"key\":\"lfoStyle\",\"label\":\"LFO Style\",\"defaultValue\":0,\"min\":0,\"max\":2,\"step\":1},"
      "{\"key\":\"echoMode\",\"label\":\"Delay Mode\",\"defaultValue\":0,\"min\":0,\"max\":2,\"step\":1},"
      "{\"key\":\"pingPong\",\"label\":\"Ping Pong\",\"defaultValue\":0,\"min\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"doModulateEcho\",\"label\":\"Mod Echo\",\"defaultValue\":1,\"min\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"saturate\",\"label\":\"Saturate\",\"defaultValue\":1,\"min\":0.01,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"lpfFrequency\",\"label\":\"LPF Freq\",\"defaultValue\":8000,\"min\":20,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"hpfFrequency\",\"label\":\"HPF Freq\",\"defaultValue\":20,\"min\":1,\"max\":2000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"bandFrequency\",\"label\":\"Band Freq\",\"defaultValue\":1000,\"min\":20,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"bandDecibels\",\"label\":\"Band dB\",\"defaultValue\":0,\"min\":-24,\"max\":24,\"step\":\"any\"},"
      "{\"key\":\"bandQ\",\"label\":\"Band Q\",\"defaultValue\":1,\"min\":0.1,\"max\":10,\"step\":\"any\"},"
      "{\"key\":\"lpfStages\",\"label\":\"LPF Stages\",\"defaultValue\":2,\"min\":0,\"max\":5,\"step\":1},"
      "{\"key\":\"bandStages\",\"label\":\"Band Stages\",\"defaultValue\":2,\"min\":0,\"max\":5,\"step\":1},"
      "{\"key\":\"duckLimit\",\"label\":\"Ducking\",\"defaultValue\":1,\"min\":0.01,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"duckRelease\",\"label\":\"Duck Rel\",\"defaultValue\":0.04,\"min\":0.001,\"max\":2,\"step\":\"any\",\"unit\":\"s\"}"
    "]"
  "}";

// Stickiness: clip / HP / multi-biquad latches are plain POD on the instance
// + free functions (APP_POLICY). No method-bearing nested DSP objects — those
// lost written coeffs across set_params (same class of bug as ping_pong LPF).

struct BiquadPod {
  double b0{1}, b1{0}, b2{0}, a1{0}, a2{0};
  double z1{0}, z2{0};
};

static void soft_clip_set(
  double saturate, double& scaleX, double& scaleY, double& shiftX, double& shiftY
) {
  double thr = maxd(0.01, saturate);
  double width = maxd(1e-6, thr * 2.0);
  scaleX = 2.0 / width;
  shiftX = -1.0 - (scaleX * (0.0 - 0.5 * width));
  scaleY = 1.0 / scaleX;
  shiftY = -shiftX * scaleY;
}

static double soft_clip_run(
  double v, double scaleX, double scaleY, double shiftX, double shiftY
) {
  double x = scaleX * v + shiftX;
  if (x > 20.0) x = 20.0;
  if (x < -20.0) x = -20.0;
  double e2 = dsp_exp(2.0 * x);
  double th = (e2 - 1.0) / (e2 + 1.0);
  return shiftY + scaleY * th;
}

// OnePoleFilter.hpp IIT high-pass (preserve original tau mapping).
static void one_pole_hp_set(
  double freqHz, double sr, double& a1, double& b0, double& b1
) {
  const double rate = maxd(1.0, sr);
  double f = maxd(0.0, safe(freqHz));
  const double nyquist = 0.5 * rate;
  if (f > nyquist) f = nyquist;
  const double tauZ = 6.283185307179586 / rate;
  double w = mind(tauZ, 0.000142475857) * f;
  a1 = dsp_exp(-w);
  b0 = 0.5 * (1.0 + a1);
  b1 = -b0;
}

static double one_pole_hp_run(
  double& x0, double& y0, double a1, double b0, double b1, double input
) {
  double y = b0 * input + b1 * x0 + a1 * y0;
  x0 = input;
  y0 = y;
  return y;
}

static void biquad_reset(BiquadPod& b) { b.z1 = b.z2 = 0.0; }

static double biquad_run(BiquadPod& b, double x) {
  double y = b.b0 * x + b.z1;
  b.z1 = b.b1 * x - b.a1 * y + b.z2;
  b.z2 = b.b2 * x - b.a2 * y;
  return y;
}

// DSP floor 0 / cap Nyquist only (no product 20…20k clamps).
static double biquad_safe_freq(double freq, double sr) {
  const double rate = maxd(1.0, sr);
  double f = maxd(0.0, safe(freq));
  const double nyquist = 0.5 * rate;
  if (f > nyquist) f = nyquist;
  // RBJ needs a tiny positive ω; 0 Hz → near-DC (closed for LPF).
  if (f < 1e-9) f = 1e-9;
  return f;
}

static void biquad_set_lowpass(BiquadPod& b, double freq, double q, double sr) {
  double w0 = kTwoPi * biquad_safe_freq(freq, sr) / maxd(1.0, sr);
  double cosw = dsp_cos(w0);
  double sinw = dsp_sin(w0);
  double alpha = sinw / (2.0 * maxd(0.05, q));
  double a0 = 1.0 + alpha;
  b.b0 = ((1.0 - cosw) * 0.5) / a0;
  b.b1 = (1.0 - cosw) / a0;
  b.b2 = b.b0;
  b.a1 = (-2.0 * cosw) / a0;
  b.a2 = (1.0 - alpha) / a0;
}

static void biquad_set_peak(
  BiquadPod& b, double freq, double gainDb, double q, double sr
) {
  double A = dsp_exp(gainDb * (0.11512925464970229)); // ln(10)/20
  double w0 = kTwoPi * biquad_safe_freq(freq, sr) / maxd(1.0, sr);
  double cosw = dsp_cos(w0);
  double sinw = dsp_sin(w0);
  double alpha = sinw / (2.0 * maxd(0.05, q));
  double a0 = 1.0 + alpha / A;
  b.b0 = (1.0 + alpha * A) / a0;
  b.b1 = (-2.0 * cosw) / a0;
  b.b2 = (1.0 - alpha * A) / a0;
  b.a1 = b.b1;
  b.a2 = (1.0 - alpha / A) / a0;
}

static void multi_biquad_reset(BiquadPod stages[5]) {
  for (int i = 0; i < 5; i++) biquad_reset(stages[i]);
}

static void multi_lpf_update(BiquadPod stages[5], double freq, double sr) {
  for (int i = 0; i < 5; i++) biquad_set_lowpass(stages[i], freq, 1.0, sr);
}

static void multi_peak_update(
  BiquadPod stages[5], double freq, double gainDb, double q, double sr
) {
  for (int i = 0; i < 5; i++) biquad_set_peak(stages[i], freq, gainDb, q, sr);
}

static double multi_biquad_run(BiquadPod stages[5], int nStages, double x) {
  if (nStages <= 0) return x;
  double y = x;
  int n = nStages > 5 ? 5 : nStages;
  for (int i = 0; i < n; i++) y = biquad_run(stages[i], y);
  return y;
}

// --- SilenceDetector ---
struct SilenceDetector {
  double counter{0};
  double increment{0};
  bool isSilent{true};
  void sampleRateChanged(double sr) {
    increment = 1.0 / maxd(1.0, sr); // 1 second
  }
  bool run(double in) {
    counter += increment;
    if (dsp_fabs(in) >= kPlanck) {
      isSilent = false;
      counter = 0.0;
    } else if (counter > 1.0) {
      isSilent = true;
    }
    return isSilent;
  }
};

// Flat sample storage — one row per delay line, not nested in state structs.
static float gDelayPool[kMaxInstances][kLinesPerInstance][kMaxDelaySamples];

// LFO styles from original ModulatedDelay::runLfo (Parabol active; Random/FBM
// were commented alternatives). 0=Parabol, 1=Random Walk, 2=FBM.
enum LfoStyle { LfoParabol = 0, LfoRandomWalk = 1, LfoFbm = 2 };

// 1D value-noise FBM (same idea as sandbox fractal_brownian_noise / original
// FractalBrownianMotion with stb_perlin — freestanding hash instead of stb).
static double smoothNoise1d(double x, unsigned int seed) {
  int left = (int)x;
  if (x < 0.0 && x != (double)left) left -= 1;
  const double frac = x - (double)left;
  const double smooth = frac * frac * (3.0 - 2.0 * frac);
  const double a = hash_bipolar((unsigned int)left, seed);
  const double b = hash_bipolar((unsigned int)(left + 1), seed);
  return a + (b - a) * smooth;
}

static double fbmUnipolar(double time, int octaves, double persistence, double scale, unsigned int seed) {
  double total = 0.0;
  double amplitude = 1.0;
  double freq = 1.0;
  double maxValue = 0.0;
  int n = octaves < 1 ? 1 : (octaves > 8 ? 8 : octaves);
  double pers = clamp(persistence, 0.0, 0.999);
  double sc = maxd(0.01, scale);
  for (int i = 0; i < n; i++) {
    total += smoothNoise1d(time * sc * freq, seed + (unsigned int)(i * 1013)) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2.0;
  }
  if (maxValue <= 0.0) return 0.5;
  // bipolar total/max → unipolar
  return (total / maxValue) * 0.5 + 0.5;
}

static double rationalCurve01(double value, double skew) {
  double t = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.999, 0.999);
  return ((1.0 + safeSkew) * t) / (1.0 - safeSkew + 2.0 * safeSkew * t);
}

// --- ModulatedDelay (formulas from ModulatedDelay.cpp + LFO style switch) ---
struct ModulatedDelay {
  float* buffer{nullptr};
  int bufferPos{0};
  int bufferSize{kMaxDelaySamples};
  double delaySamples{1.0};
  double diffusionSizeRnd{1.0}; // per-line random 0..1
  double lfoPhase{0.0};
  double lfoInc{0.0};
  double lfoAmp{0.0};
  double feedback{0.0};
  int lfoStyle{LfoParabol};
  double sampleRate{44100.0};
  // Random-walk (FlexibleRandomWalk fixed_steps path)
  unsigned int walkRng{1};
  double walkOut{0.0};
  double walkLpf{0.0};
  double walkFreqHz{0.5};
  double walkJitterHz{0.0};
  // FBM seed (per-line), phase driven by lfoPhase/lfoInc
  unsigned int fbmSeed{1};
  double fbmPersistence{0.5};

  void bind(float* storage) { buffer = storage; }
  void clear() {
    if (!buffer) return;
    for (int i = 0; i < kMaxDelaySamples; i++) buffer[i] = 0.0f;
    bufferPos = 0;
  }
  void reset(double seedBipolar) {
    clear();
    bufferPos = 0;
    lfoPhase = seedBipolar;
    walkOut = 0.0;
    walkLpf = 0.0;
    // Derive walk RNG from phase seed so lines decorrelate.
    unsigned int h = (unsigned int)((seedBipolar + 1.0) * 2147483647.0);
    walkRng = h ? h : 1u;
    fbmSeed = walkRng * 2654435761u;
    if (!fbmSeed) fbmSeed = 1u;
  }

  double nextWalkNoise() {
    walkRng = walkRng * 1664525u + 1013904223u;
    return (double)walkRng / 4294967295.0 * 2.0 - 1.0;
  }

  // FlexibleRandomWalk::fixed_steps + one-pole (sandbox random_walk method 3).
  double runRandomWalk() {
    const double rate = maxd(1.0, sampleRate);
    const double noise = nextWalkNoise();
    const double increment = clamp(walkFreqHz / rate, 0.0, 1.0);
    const double jitterInc = clamp(walkJitterHz / rate, 0.0, 1.0);
    // random_walk.cpp: stepSize = clamp(increment + rational_curve(jitterInc, 0.99), 0, 1)
    const double stepSize = clamp(increment + rationalCurve01(jitterInc, 0.99), 0.0, 1.0);
    const double averageIncrement = (jitterInc + increment) * 0.5;
    const double whiteNoiseMix = averageIncrement >= 0.9
      ? rationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
      : 0.0;
    const double randomMix = 1.0 - whiteNoiseMix;
    const double step = noise > 0.0 ? stepSize : -stepSize;
    walkOut = clamp(walkOut + step, -1.0, 1.0);
    const double mixed = walkOut * randomMix + noise * whiteNoiseMix;
    const double w = mind(6.283185307179586 / rate, 0.000142475857) * maxd(0.0, walkFreqHz);
    const double a1 = dsp_exp(-w);
    walkLpf = (1.0 - a1) * mixed + a1 * walkLpf;
    return walkLpf; // bipolar
  }

  // Returns unipolar-ish depth already scaled like original runLfo paths.
  double runLfo() {
    // map(lfoAmp, 0..0.5 → 0..1) used by Random/FBM commented paths
    const double ampMap = clamp(lfoAmp * 2.0, 0.0, 1.0);

    if (lfoStyle == LfoRandomWalk) {
      // map * biToUni(randomWalk.run()) — phase unused
      double bi = runRandomWalk();
      return ampMap * (bi * 0.5 + 0.5);
    }
    if (lfoStyle == LfoFbm) {
      // Free-running time (original: lfoPhase_ += lfoInc_ then FBM(time,...))
      lfoPhase += lfoInc;
      double uni = fbmUnipolar(lfoPhase, 4, fbmPersistence, 1.0, fbmSeed);
      return ampMap * uni;
    }
    // Parabol::sample then to_unipolar, * lfoAmp
    lfoPhase = wrap01(lfoPhase + lfoInc);
    double fit = (2.0 * lfoPhase);
    fit = fit - 2.0 * dsp_floor(fit * 0.5); // fmod(2x,2)
    fit = fit - 1.0;
    double par = 4.0 * fit * (1.0 - dsp_fabs(fit));
    double uni = par * 0.5 + 0.5; // to_unipolar
    return lfoAmp * uni;
  }
  // 4-point Hermite (Catmull-Rom): cheapest solid upgrade from linear under
  // continuous delay-time modulation (musical pitch bend).
  static double interp(const float* buf, int size, double where) {
    while (where < 0.0) where += (double)size;
    double whole = dsp_floor(where);
    double t = where - whole;
    int i0 = (int)whole % size;
    if (i0 < 0) i0 += size;
    int im1 = i0 - 1;
    if (im1 < 0) im1 += size;
    int i1 = i0 + 1;
    if (i1 >= size) i1 -= size;
    int i2 = i1 + 1;
    if (i2 >= size) i2 -= size;
    double ym1 = (double)buf[im1];
    double y0 = (double)buf[i0];
    double y1 = (double)buf[i1];
    double y2 = (double)buf[i2];
    double c0 = y0;
    double c1 = 0.5 * (y1 - ym1);
    double c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    double c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * t + c2) * t + c1) * t + c0;
  }
  // LIVE feedback/lfoAmp: pass from parent each sample (Wire-style; no connect()).
  double runDelay(double in, double liveLfoAmp) {
    lfoAmp = liveLfoAmp;
    double lfo = runLfo();
    double bufferOffset = (delaySamples - (delaySamples * (lfo * lfoAmp))) + 1.0;
    bufferPos = (bufferPos + 1) % bufferSize;
    double where = (double)bufferPos + (double)bufferSize - bufferOffset;
    double out = interp(buffer, bufferSize, where);
    buffer[bufferPos] = (float)in;
    return out;
  }
  double runDiffuse(double in, double liveFeedback, double liveLfoAmp) {
    feedback = liveFeedback;
    lfoAmp = liveLfoAmp;
    double lfo = runLfo();
    double bufferOffset = (delaySamples - (delaySamples * (lfo * lfoAmp))) + 1.0;
    bufferPos = (bufferPos + 1) % bufferSize;
    double where = (double)bufferPos + (double)bufferSize - bufferOffset;
    double out = interp(buffer, bufferSize, where);
    buffer[bufferPos] = (float)((0.0 - in) - out * feedback);
    out = in * feedback - out * (1.0 - feedback * feedback);
    return out;
  }
};

// Simple peak ducking: out approaches min(1, limit/|in|) with release slew
struct DuckFollow {
  double env{1.0};
  double releaseSlew{0.01};
  double releaseSeconds{0.04};
  double limit{1.0};
  void setRelease(double seconds, double sr) {
    releaseSeconds = seconds;
    releaseSlew = 1.0 / (maxd(1.0, seconds * sr) + 1.0);
  }
  double run(double in) {
    double absv = dsp_fabs(in);
    double maxGain = 1.0;
    if (absv > limit && absv > 1e-12) maxGain = limit / absv;
    // Move toward maxGain; clamp down immediately for attack-ish behavior
    if (maxGain < env) env = maxGain;
    else env += (maxGain - env) * releaseSlew;
    return env;
  }
};

enum EchoMode { PostDelay = 0, PreDelay = 1, Slapback = 2 };

struct SoEmReverbState {
  // Scalars first (stable offsets for IO getters).
  bool active{false};
  double sampleRate{44100};
  int numDelays{10};
  double fbL{0}, fbR{0};
  double dryL{0}, dryR{0};
  double wetL{0}, wetR{0};
  double outL{0}, outR{0};
  double feedbackCompensation{1.0};
  double mix{0.43};
  double volume{1.0};
  double echoTime{0.35};
  double recycle{0.5};
  double diffusionSize{0.35};
  double diffusionAmount{0.7};
  int seed{500};
  double lfoAmp{0.002};
  double lfoFrequency{0.5};
  double lfoVariation{1.0};
  int lfoStyle{LfoParabol};
  int echoMode{0};
  int pingPong{0};
  int doModulateEcho{1};
  double saturate{1.0};
  unsigned int rng{1};
  // Soft-clip latches (shared L/R — same saturate).
  double clipScaleX{1.0}, clipScaleY{1.0}, clipShiftX{0.0}, clipShiftY{0.0};
  // One-pole HP latches + history.
  double hpfFrequency{20.0};
  double hpfL_a1{0.0}, hpfL_b0{1.0}, hpfL_b1{0.0}, hpfL_x0{0.0}, hpfL_y0{0.0};
  double hpfR_a1{0.0}, hpfR_b0{1.0}, hpfR_b1{0.0}, hpfR_x0{0.0}, hpfR_y0{0.0};
  // Multi-stage LPF / peak (plain POD stages).
  double lpfFrequency{8000.0};
  int lpfStages{2};
  BiquadPod lpfL[5], lpfR[5];
  double bandFrequency{1000.0}, bandDecibels{0.0}, bandQ{1.0};
  int bandStages{2};
  BiquadPod peakL[5], peakR[5];
  SilenceDetector silence;
  DuckFollow duck;
  // Delay line control only (sample storage in gDelayPool).
  ModulatedDelay delaysL[kMaxDelays];
  ModulatedDelay delaysR[kMaxDelays];
  ModulatedDelay echoL, echoR;
};

static SoEmReverbState gPool[kMaxInstances];

static double rndU(SoEmReverbState& s) {
  s.rng = s.rng * 1664525u + 1013904223u;
  return (double)(s.rng >> 8) * (1.0 / 16777216.0);
}
static double rndB(SoEmReverbState& s) {
  return rndU(s) * 2.0 - 1.0;
}

// Per-delay LFO: frequency/style from ModulatedDelay::lfoChanged + style switch.
static void configureLineLfo(ModulatedDelay& d, SoEmReverbState& s, double lfoAmp, double freqHz) {
  d.lfoAmp = lfoAmp;
  d.lfoStyle = s.lfoStyle;
  d.sampleRate = s.sampleRate;
  // FlexibleRandomWalk::lfoChanged maps
  //   frequency: 0.1..90 → 0.1..100
  //   jitter:    0..1 (of lfoVariation scale) → 0..500 Hz-ish
  double fNorm = (freqHz - 0.1) / (90.0 - 0.1);
  fNorm = clamp(fNorm, 0.0, 1.0);
  d.walkFreqHz = 0.1 + fNorm * (100.0 - 0.1);
  // lfoVariation is 0..10; original map used 0..1 domain — allow extrapolate then clamp
  double vary01 = clamp(s.lfoVariation / 10.0, 0.0, 1.0);
  d.walkJitterHz = vary01 * 500.0;
  // FBM persistence from map(lfoVariation, 0..10 → 0..1)
  d.fbmPersistence = vary01;
  if (d.lfoInc <= 0.0) {
    d.lfoInc = freqHz / maxd(1.0, s.sampleRate);
  }
}

static void applyLfoIncs(SoEmReverbState& s) {
  double f = clamp(s.lfoFrequency, 0.1, 90.0);
  double baseInc = f / maxd(1.0, s.sampleRate);
  for (int i = 0; i < s.numDelays; i++) {
    s.delaysL[i].feedback = s.diffusionAmount;
    s.delaysR[i].feedback = s.diffusionAmount;
    // Keep per-line lfoInc from reseed when set; configure still fills walk/fbm.
    double fL = s.delaysL[i].lfoInc > 0.0 ? s.delaysL[i].lfoInc * s.sampleRate : f;
    double fR = s.delaysR[i].lfoInc > 0.0 ? s.delaysR[i].lfoInc * s.sampleRate : f;
    configureLineLfo(s.delaysL[i], s, s.lfoAmp, fL);
    configureLineLfo(s.delaysR[i], s, s.lfoAmp, fR);
  }
  s.echoL.lfoInc = baseInc;
  s.echoR.lfoInc = baseInc;
  double echoAmp = s.doModulateEcho ? s.lfoAmp : 0.0;
  configureLineLfo(s.echoL, s, echoAmp, f);
  configureLineLfo(s.echoR, s, echoAmp, f);
  s.echoL.lfoInc = baseInc;
  s.echoR.lfoInc = baseInc;
}

static void applyDiffusionTimes(SoEmReverbState& s) {
  // delaySamples_ = clamp(timeToSamples(delayTime_ * diffusionSize_), 1, bufferSize-1)
  // delayTime_ points to diffusionSize param; diffusionSize_ is random
  double maxS = (double)(s.echoL.bufferSize - 1);
  for (int i = 0; i < s.numDelays; i++) {
    double samples = s.sampleRate * (s.diffusionSize * s.delaysL[i].diffusionSizeRnd);
    samples = clamp(samples, 1.0, maxS);
    s.delaysL[i].delaySamples = samples;
    s.delaysR[i].delaySamples = samples;
  }
}

static void applyEchoTime(SoEmReverbState& s) {
  double samples = s.sampleRate * s.echoTime;
  samples = clamp(samples, 1.0, (double)(s.echoL.bufferSize - 1));
  s.echoL.delaySamples = samples;
  s.echoR.delaySamples = samples;
}

static void reseedDiffusion(SoEmReverbState& s) {
  s.rng = (unsigned int)(s.seed + 1) * 2654435761u;
  double f = clamp(s.lfoFrequency, 0.1, 90.0);
  for (int i = 0; i < kMaxDelays; i++) {
    s.delaysL[i].diffusionSizeRnd = rndU(s);
    s.delaysR[i].diffusionSizeRnd = s.delaysL[i].diffusionSizeRnd;
    s.delaysL[i].reset(rndB(s));
    s.delaysR[i].reset(rndB(s));
    // ModulatedDelay::lfoChanged: frequency ± variation draw once per reseed
    double rfL = f + (rndU(s) * 2.0 - 1.0) * f * mind(1.0, s.lfoVariation / 10.0);
    double rfR = f + (rndU(s) * 2.0 - 1.0) * f * mind(1.0, s.lfoVariation / 10.0);
    if (rfL < 0.01) rfL = 0.01;
    if (rfR < 0.01) rfR = 0.01;
    s.delaysL[i].lfoInc = rfL / s.sampleRate;
    s.delaysR[i].lfoInc = rfR / s.sampleRate;
  }
  s.echoL.reset(rndB(s));
  s.echoR.reset(rndB(s));
  applyDiffusionTimes(s);
  applyLfoIncs(s);
}

static void updateClip(SoEmReverbState& s) {
  soft_clip_set(s.saturate, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY);
  // When thr>=1, compensation=1; when thr<1, thr itself.
  double thr = maxd(1e-9, s.saturate);
  s.feedbackCompensation = thr >= 1.0 ? 1.0 : thr;
}

static void configureFilters(SoEmReverbState& s) {
  one_pole_hp_set(
    s.hpfFrequency, s.sampleRate, s.hpfL_a1, s.hpfL_b0, s.hpfL_b1
  );
  s.hpfR_a1 = s.hpfL_a1;
  s.hpfR_b0 = s.hpfL_b0;
  s.hpfR_b1 = s.hpfL_b1;
  multi_lpf_update(s.lpfL, s.lpfFrequency, s.sampleRate);
  multi_lpf_update(s.lpfR, s.lpfFrequency, s.sampleRate);
  multi_peak_update(
    s.peakL, s.bandFrequency, s.bandDecibels, s.bandQ, s.sampleRate
  );
  multi_peak_update(
    s.peakR, s.bandFrequency, s.bandDecibels, s.bandQ, s.sampleRate
  );
}

static void feedbackFilter(SoEmReverbState& s, bool reverseStereo) {
  s.fbL = one_pole_hp_run(
    s.hpfL_x0, s.hpfL_y0, s.hpfL_a1, s.hpfL_b0, s.hpfL_b1, s.fbL
  );
  s.fbR = one_pole_hp_run(
    s.hpfR_x0, s.hpfR_y0, s.hpfR_a1, s.hpfR_b0, s.hpfR_b1, s.fbR
  );
  if (reverseStereo) {
    double ol = multi_biquad_run(s.lpfL, s.lpfStages, s.fbL);
    double orr = multi_biquad_run(s.lpfR, s.lpfStages, s.fbR);
    s.fbR = ol;
    s.fbL = orr;
  } else {
    s.fbL = multi_biquad_run(s.lpfL, s.lpfStages, s.fbL);
    s.fbR = multi_biquad_run(s.lpfR, s.lpfStages, s.fbR);
  }
}

static void dryWet(SoEmReverbState& s, double inL, double inR) {
  const double dryGain = (1.0 - s.mix) * s.volume;
  const double wetGain = s.mix * s.volume;
  s.dryL = inL * dryGain;
  s.dryR = inR * dryGain;
  s.wetL = multi_biquad_run(s.peakL, s.bandStages, s.fbL * wetGain);
  s.wetR = multi_biquad_run(s.peakR, s.bandStages, s.fbR * wetGain);
  s.outL = s.dryL + s.wetL;
  s.outR = s.dryR + s.wetR;
}

// === Reverb::runWithIdleDetection exact order ===
static void runWithIdleDetection(SoEmReverbState& s, double inL, double inR) {
  const double energy = inL + inR + s.fbL + s.fbR + s.wetL + s.wetR + s.dryL + s.dryR;
  if (s.silence.run(energy) && silent_planck(energy)) {
    return;
  }

  int mode = s.echoMode;
  if (mode < 0) mode = 0;
  if (mode > 2) mode = 2;

  // LIVE (matches soemdsp::delay::Reverb): diffusionAmount / lfoAmp every sample.
  const double liveFeedback = s.diffusionAmount;
  const double liveLfoAmp = s.lfoAmp;
  const double echoLfoAmp = s.doModulateEcho ? liveLfoAmp : 0.0;

  auto runEchoPair = [&](double inToL, double inToR, double& outL, double& outR) {
    double dL = s.echoL.runDelay(inToL, echoLfoAmp);
    double dR = s.echoR.runDelay(inToR, echoLfoAmp);
    if (s.pingPong) {
      outL = dR;
      outR = dL;
    } else {
      outL = dL;
      outR = dR;
    }
  };

  switch (mode) {
  case PostDelay: {
    double dL = 0.0, dR = 0.0;
    runEchoPair(s.fbL, s.fbR, dL, dR);
    s.fbL = inL + dL;
    s.fbR = inR + dR;
    for (int i = 0; i < s.numDelays; ++i) {
      s.fbL = s.delaysL[i].runDiffuse(s.fbL, liveFeedback, liveLfoAmp);
      s.fbR = s.delaysR[i].runDiffuse(s.fbR, liveFeedback, liveLfoAmp);
    }
    dryWet(s, inL, inR);
    feedbackFilter(s, false);
    s.fbL = soft_clip_run(
      s.fbL, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    s.fbR = soft_clip_run(
      s.fbR, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    break;
  }
  case PreDelay: {
    feedbackFilter(s, false);
    s.fbL = soft_clip_run(
      inL + s.fbL, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    s.fbR = soft_clip_run(
      inR + s.fbR, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    for (int i = 0; i < s.numDelays; ++i) {
      s.fbL = s.delaysL[i].runDiffuse(s.fbL, liveFeedback, liveLfoAmp);
      s.fbR = s.delaysR[i].runDiffuse(s.fbR, liveFeedback, liveLfoAmp);
    }
    double dL = 0.0, dR = 0.0;
    runEchoPair(s.fbL, s.fbR, dL, dR);
    s.fbL = dL;
    s.fbR = dR;
    dryWet(s, inL, inR);
    break;
  }
  case Slapback: {
    double dL = 0.0, dR = 0.0;
    runEchoPair(s.fbL, s.fbR, dL, dR);
    s.fbL = dL;
    s.fbR = dR;
    double invN = s.numDelays > 0 ? 1.0 / (double)s.numDelays : 1.0;
    double L = inL * invN;
    double R = inR * invN;
    for (int i = 0; i < s.numDelays; ++i) {
      s.fbL = s.delaysL[i].runDiffuse(L + s.fbL, liveFeedback, liveLfoAmp);
      s.fbR = s.delaysR[i].runDiffuse(R + s.fbR, liveFeedback, liveLfoAmp);
    }
    dryWet(s, inL, inR);
    feedbackFilter(s, true);
    s.fbL = soft_clip_run(
      s.fbL, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    s.fbR = soft_clip_run(
      s.fbR, s.clipScaleX, s.clipScaleY, s.clipShiftX, s.clipShiftY
    ) * s.feedbackCompensation;
    break;
  }
  }

  // feedback amplifier
  s.fbL *= s.recycle;
  s.fbR *= s.recycle;
}

static void fullReset(SoEmReverbState& s) {
  s.fbL = s.fbR = 0;
  s.wetL = s.wetR = s.dryL = s.dryR = s.outL = s.outR = 0;
  s.echoL.clear();
  s.echoR.clear();
  s.echoL.bufferSize = kMaxDelaySamples;
  s.echoR.bufferSize = kMaxDelaySamples;
  for (int i = 0; i < kMaxDelays; i++) {
    s.delaysL[i].bufferSize = kMaxDelaySamples;
    s.delaysR[i].bufferSize = kMaxDelaySamples;
    s.delaysL[i].clear();
    s.delaysR[i].clear();
  }
  s.hpfL_x0 = s.hpfL_y0 = 0.0;
  s.hpfR_x0 = s.hpfR_y0 = 0.0;
  multi_biquad_reset(s.lpfL);
  multi_biquad_reset(s.lpfR);
  multi_biquad_reset(s.peakL);
  multi_biquad_reset(s.peakR);
  s.silence.counter = 0;
  s.silence.isSilent = true;
  s.duck.env = 1.0;
  reseedDiffusion(s);
  applyEchoTime(s);
  updateClip(s);
  configureFilters(s);
}

}  // namespace

static void bindDelayStorage(SoEmReverbState& s, int instanceIndex) {
  int line = 0;
  for (int i = 0; i < kMaxDelays; i++) {
    s.delaysL[i].bind(gDelayPool[instanceIndex][line++]);
    s.delaysR[i].bind(gDelayPool[instanceIndex][line++]);
  }
  s.echoL.bind(gDelayPool[instanceIndex][line++]);
  s.echoR.bind(gDelayPool[instanceIndex][line++]);
}

extern "C" int soemdsp_soem_reverb_create(double sampleRate) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SoEmReverbState& s = gPool[i];
      // Clear scalars only — delay sample pool cleared via clear().
      s = SoEmReverbState{};
      s.active = true;
      s.sampleRate = sampleRate > 1.0 ? sampleRate : 44100.0;
      s.mix = 0.43;
      s.volume = 1.0;
      s.echoTime = 0.35;
      s.recycle = 0.5;
      s.diffusionSize = 0.35;
      s.diffusionAmount = 0.7;
      s.seed = 500;
      s.lfoAmp = 0.002;
      s.lfoFrequency = 0.5;
      s.lfoVariation = 1.0;
      s.lfoStyle = LfoParabol;
      s.echoMode = 0;
      s.pingPong = 0;
      s.doModulateEcho = 1;
      s.saturate = 1.0;
      s.numDelays = 10;
      s.hpfFrequency = 20.0;
      s.lpfFrequency = 8000.0;
      s.lpfStages = 2;
      s.bandFrequency = 1000.0;
      s.bandDecibels = 0.0;
      s.bandQ = 1.0;
      s.bandStages = 2;
      bindDelayStorage(s, i);
      s.silence.sampleRateChanged(s.sampleRate);
      s.duck.setRelease(0.04, s.sampleRate);
      s.duck.env = 1.0;
      s.duck.limit = 1.0;
      fullReset(s);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_soem_reverb_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_soem_reverb_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  fullReset(gPool[handle - 1]);
}

// Mirrors soemdsp::delay::Reverb::syncControlParams — only run the *Changed
// work owned by each field. Live reads (mix/volume/recycle/echoMode/pingPong)
// never rebuild delay geometry or filter coeffs.
extern "C" void soemdsp_soem_reverb_set_params(
  int handle,
  double mix,
  double volume,
  double echoTime,
  double recycle,
  double numDelays,
  double diffusionSize,
  double diffusionAmount,
  double seed,
  double lfoAmp,
  double lfoFrequency,
  double lfoVariation,
  double lfoStyle,
  double echoMode,
  double pingPong,
  double doModulateEcho,
  double saturate,
  double lpfFrequency,
  double hpfFrequency,
  double bandFrequency,
  double bandDecibels,
  double bandQ,
  double lpfStages,
  double bandStages,
  double duckLimit,
  double duckRelease
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SoEmReverbState& s = gPool[handle - 1];

  auto near = [](double a, double b) {
    const double d = a - b;
    return d < 1e-12 && d > -1e-12;
  };

  // Live Wire-style params: assign only.
  s.mix = clamp(mix, 0.0, 1.0);
  s.volume = maxd(0.0, volume);
  s.recycle = clamp(recycle, 0.0, 2.0);
  s.echoMode = (int)dsp_floor(echoMode + 0.5);
  s.pingPong = (int)dsp_floor(pingPong + 0.5) != 0 ? 1 : 0;

  const double nextEchoTime = clamp(echoTime, 0.0001, kMaxDelaySeconds);
  int nd = (int)dsp_floor(numDelays + 0.5);
  if (nd < 0) nd = 0;
  if (nd > kMaxDelays) nd = kMaxDelays;
  const double nextDiffusionSize = clamp(diffusionSize, 0.0001, kMaxDelaySeconds);
  const double nextDiffusionAmount = clamp(diffusionAmount, 0.0, 0.98);
  const int nextSeed = (int)dsp_floor(seed + 0.5);
  const double nextLfoAmp = clamp(lfoAmp, 0.0, 0.5);
  const double nextLfoFrequency = clamp(lfoFrequency, 0.1, 90.0);
  const double nextLfoVariation = clamp(lfoVariation, 0.0, 10.0);
  int nextStyle = (int)dsp_floor(lfoStyle + 0.5);
  if (nextStyle < 0) nextStyle = 0;
  if (nextStyle > 2) nextStyle = 2;
  const int nextDoModulateEcho = (int)dsp_floor(doModulateEcho + 0.5) != 0 ? 1 : 0;
  const double nextSaturate = maxd(0.01, saturate);
  // Freq params: no product clamps — DSP floors 0 / caps Nyquist in coeff setters.
  const double nextLpfFrequency = maxd(0.0, safe(lpfFrequency));
  const double nextHpfFrequency = maxd(0.0, safe(hpfFrequency));
  const double nextBandFrequency = maxd(0.0, safe(bandFrequency));
  const double nextBandDecibels = clamp(bandDecibels, -24.0, 24.0);
  const double nextBandQ = maxd(0.05, safe(bandQ));
  const int nextLpfStages = (int)clamp(dsp_floor(lpfStages + 0.5), 0.0, 5.0);
  const int nextBandStages = (int)clamp(dsp_floor(bandStages + 0.5), 0.0, 5.0);
  const double nextDuckLimit = clamp(duckLimit, 0.01, 1.0);
  const double nextDuckRelease = maxd(0.001, duckRelease);

  // Match soemdsp::delay::Reverb *Changed split (SoEmReverbModule wiring):
  // Live Wire (no *Changed): mix, volume, recycle, diffusionAmount, lfoAmp, echoMode, pingPong
  // *Changed: echoTime, diffusionSize, seed, numDelays, lfoFrequency, lfoVariation,
  //           doModulateEcho, saturate, filters
  const bool seedChanged = nextSeed != s.seed;
  const bool numDelaysChanged = nd != s.numDelays;
  const bool diffusionSizeChanged = !near(nextDiffusionSize, s.diffusionSize);
  const bool echoTimeChanged = !near(nextEchoTime, s.echoTime);
  const bool lfoFrequencyChanged = !near(nextLfoFrequency, s.lfoFrequency) || nextStyle != s.lfoStyle;
  const bool lfoVariationChanged = !near(nextLfoVariation, s.lfoVariation);
  const bool doModulateEchoChanged = nextDoModulateEcho != s.doModulateEcho;
  const bool saturateChanged = !near(nextSaturate, s.saturate);
  const bool filterChanged =
    !near(nextLpfFrequency, s.lpfFrequency)
    || !near(nextHpfFrequency, s.hpfFrequency)
    || !near(nextBandFrequency, s.bandFrequency)
    || !near(nextBandDecibels, s.bandDecibels)
    || !near(nextBandQ, s.bandQ)
    || nextLpfStages != s.lpfStages
    || nextBandStages != s.bandStages;
  const bool duckChanged =
    !near(nextDuckLimit, s.duck.limit)
    || !near(nextDuckRelease, s.duck.releaseSeconds);

  s.echoTime = nextEchoTime;
  s.numDelays = nd;
  s.diffusionSize = nextDiffusionSize;
  s.diffusionAmount = nextDiffusionAmount;
  s.seed = nextSeed;
  s.lfoAmp = nextLfoAmp;
  s.lfoFrequency = nextLfoFrequency;
  s.lfoVariation = nextLfoVariation;
  s.lfoStyle = nextStyle;
  s.doModulateEcho = nextDoModulateEcho;
  s.saturate = nextSaturate;
  s.lpfFrequency = nextLpfFrequency;
  s.hpfFrequency = nextHpfFrequency;
  s.bandFrequency = nextBandFrequency;
  s.bandDecibels = nextBandDecibels;
  s.bandQ = nextBandQ;
  s.lpfStages = nextLpfStages;
  s.bandStages = nextBandStages;
  s.duck.limit = nextDuckLimit;

  // diffusionAmount / lfoAmp: live Wire — assign into lines every set (cheap), no rebuild.
  for (int i = 0; i < s.numDelays; i++) {
    s.delaysL[i].feedback = s.diffusionAmount;
    s.delaysR[i].feedback = s.diffusionAmount;
    s.delaysL[i].lfoAmp = s.lfoAmp;
    s.delaysR[i].lfoAmp = s.lfoAmp;
  }

  if (seedChanged) {
    reseedDiffusion(s); // diffusionSeedChanged only
  }
  if (numDelaysChanged && !seedChanged) {
    // Original delayedCallback: seed notify then numDelaysChanged.
    // Pool is fixed-size; re-apply times/LFO for the new active count.
    applyDiffusionTimes(s);
    applyLfoIncs(s);
  }
  if (!seedChanged && diffusionSizeChanged) {
    applyDiffusionTimes(s); // diffusionSizeChanged
  }
  if (lfoFrequencyChanged || lfoVariationChanged) {
    applyLfoIncs(s); // lfoFrequencyChanged / lfoVariationChanged
  }
  // doModulateEchoChanged + live lfoAmp Wire on echo (pointTo / disconnect).
  {
    const double echoAmp = s.doModulateEcho ? s.lfoAmp : 0.0;
    s.echoL.lfoAmp = echoAmp;
    s.echoR.lfoAmp = echoAmp;
    (void)doModulateEchoChanged;
  }
  if (echoTimeChanged) applyEchoTime(s);  // echoTimeChanged
  if (saturateChanged) updateClip(s);     // clippingThresholdChanged
  if (filterChanged) configureFilters(s);
  if (duckChanged) s.duck.setRelease(nextDuckRelease, s.sampleRate);
}

// Process one sample pair. Applies input ducking like SoEmReverbModule::process:
//   duck on mono input, then wet*duck + dry after reverb.
extern "C" void soemdsp_soem_reverb_process(
  int handle,
  double inL,
  double inR
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SoEmReverbState& s = gPool[handle - 1];
  if (!s.active) return;
  double mono = (inL + inR) * 0.5;
  double duckG = s.duck.run(mono);
  runWithIdleDetection(s, inL, inR);
  s.wetL *= duckG;
  s.wetR *= duckG;
  s.outL = s.wetL + s.dryL;
  s.outR = s.wetR + s.dryR;
}

extern "C" double soemdsp_soem_reverb_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outL;
}
extern "C" double soemdsp_soem_reverb_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outR;
}
extern "C" double soemdsp_soem_reverb_wet_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].wetL;
}
extern "C" double soemdsp_soem_reverb_wet_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].wetR;
}
extern "C" double soemdsp_soem_reverb_dry_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].dryL;
}
extern "C" double soemdsp_soem_reverb_dry_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].dryR;
}

extern "C" int soemdsp_soem_reverb_version() { return 2; }
extern "C" const char* soemdsp_soem_reverb_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_soem_reverb_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
