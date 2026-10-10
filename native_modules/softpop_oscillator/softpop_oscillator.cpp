// soemdsp-native-module: softpop_oscillator
// soemdsp-native-label: Softpop Oscillator
// soemdsp-native-target: softpopOscillator
// soemdsp-native-kind: oscillator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp-sandbox/blob/master/docs/SOFTPOP_PLAN.md
//
// Softpop Oscillator: variable pure tone <-> noise (docs/SOFTPOP_PLAN.md).
//
// Model Sine:   phi += fInst/fs, x = sin(2 pi phi) (phi runs in both models).
// Model Filter: x = TPT SVF constant-peak bandpass (centre |fInst|, Q(Width))
//               of N_audio, level-trimmed by sqrt(Q) and the Color tilt.
// Both models, per channel, per sample:
//   n_pitch, n_amp = clamp(onePole_LP(N_x * cal_color, Bmod) * norm, +-4)  (unit RMS)
//   fInst = fEff * 2^(n_pitch * PitchMod / 1200)
//   y     = x * (sqrt(1 - AmpMod) + sqrt(AmpMod) * n_amp) * Amplitude
// Width W (0..1): Q = 2000 * (0.5/2000)^W, Bmod = 0.1 * (2000/0.1)^W Hz.
// fEff (Hz, from the Frequency knob or the f cable) is resolved by graph_engine
// exactly as for polyBlep (resolve_osc_hz).
//
// Noise: one NoiseColorChannel (soemdsp/math/noise_colors.h) per target
// (pitch / amp / audio) and channel, seeded seed_to_rng_state(seed_mix(Seed,
// target, ch)). Stereo: six generators. Mono: the three L generators, R = L.
// All active generators advance every sample in both models.
// Color: White = Gaussian (CLT-12, mode 1), Pink = Kellet (mode 3), Brown =
// clamped walk (mode 2, step 0.05).
//
// Level (Filter): constant-peak BP band power on a source of PSD S(f) is
// S(fc) * sin(w)/(2Q), w = 2 pi fc / fs (the bilinear-warped noise bandwidth;
// = pi fc/(Q fs) at low fc). sqrt(Q) cancels Width; T_color(fc) =
// (1000/fc)^(alpha/2) * sqrt(w1k/sin w1k) / sqrt(w/sin w) flattens the keyboard
// (alpha = +1 white, 0 pink, -0.95 brown (measured); fc clamped to 20 Hz .. 0.45 fs);
// k_color sets the 1 kHz Filter RMS to the Sine RMS (1/sqrt 2).

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

// seed_mix component ids (fixed, never reordered).
static const unsigned int kSoftpopPitch = 0x5F01u;
static const unsigned int kSoftpopAmp = 0x5F02u;
static const unsigned int kSoftpopAudio = 0x5F03u;

enum { kModelFilter = 0, kModelSine = 1 };
enum { kColorWhite = 0, kColorPink = 1, kColorBrown = 2 };
enum { kStereo = 0, kMono = 1 };

static const double kLn2 = 0.6931471805599453;
static const double kQMax = 2000.0;    // Width 0
static const double kQMin = 0.5;       // Width 1
static const double kBmodMin = 0.1;    // Hz, Width 0
static const double kBmodMax = 2000.0; // Hz, Width 1
static const double kModClamp = 4.0;   // n_pitch / n_amp clamp (sigma)
static const double kRefSampleRate = 48000.0;

// Kellet pink filter (noise_color_sample mode 3) poles and input gains.
static const double kPinkPole[6] = {0.99886, 0.99332, 0.969, 0.8665, 0.55, -0.7616};
static const double kPinkGain[6] = {0.0555179, 0.0750759, 0.153852, 0.3104856, 0.5329522, -0.016898};

// Clamped brown walk (mode 2, step 0.05 * U(-1,1), clamped to +-1) as a
// diffusion on [-1, 1]: D = (0.05^2 / 3) / 2 per sample, slowest mode
// lambda1 = D (pi/2)^2 carries ~98.6% of the variance, so it is modelled
// as AR(1) with pole exp(-lambda1).
static const double kBrownPole = 0.9989724445053012;

// Unit-RMS calibration per Color. White: CLT-12 Gaussian, already unit.
// Pink: 1 / sqrt(sum of squares of the Kellet impulse response * 1/3)
// (analytic, var 0.0375777). Brown: clamped walk measured variance 0.343276
// (4000 chains x 1.2 M steps; uniform would be 1/3).
static const double kCalColor[3] = {1.0, 5.15863561638852, 1.7067830316927417};
// k_color: 1 kHz Filter RMS = 1/sqrt 2 (the Sine RMS) at 48 kHz, W = 0.3.
// White and pink: exact digital band power of the BP on the source PSD (flat;
// Kellet taps), confirmed by simulation to 0.013 / 0.004 dB. Brown: measured
// (node scripts/test_softpop_oscillator.mjs --calibrate, 3000 s); the clamped
// walk sits 0.2 dB under the pure-integrator estimate 7.3484.
static const double kFilterGain[3] = {2.7684485757734305, 1.721692744960082, 7.51834};
// Tilt exponent alpha (T = (1000/fc)^(alpha/2)). Brown is measured: the
// clamped walk's spectrum sits under 1/f^2 at low fc (its higher diffusion
// modes) and the digital integrator over it at high fc; the least-squares
// residual slope over 50 Hz..10 kHz (W 0 and 0.3) was +0.143 dB/oct, i.e.
// alpha -1 + 0.048 (plan §6: a small measured per-Color alpha).
static const double kTiltAlpha[3] = {1.0, 0.0, -0.95};

struct Chan {
  NoiseColorChannel nPitch;
  NoiseColorChannel nAmp;
  NoiseColorChannel nAudio;
  double lpPitch;
  double lpAmp;
  TptSvfState svf;
  double phase;
  double outPitch;  // last n_pitch (probe)
  double outAmp;    // last n_amp (probe)
  double outAudio;  // last N_audio * cal (probe)
  double instHz;    // last fInst (probe)
  double out;
};

struct State {
  bool active;
  Chan ch[2];
  unsigned int seed;
  bool seeded;
  // Width-derived (recomputed when Width / Color / fs change).
  double lastWidth, lastSr;
  int lastColor;
  double q, sqrtQ, modCoeff, modNorm;
  double widthGain;  // Pink broad-Q correction (1 for white / brown)
  double warpRef;    // sin(w1k) / w1k at lastSr
  double tiltSr;     // lastSr / 48 kHz
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"softpop_oscillator\","
    "\"label\":\"Softpop Oscillator\","
    "\"targetType\":\"softpopOscillator\","
    "\"kind\":\"oscillator\""
  "}";

static double sqrt_pos(double x) { return x > 0.0 ? __builtin_sqrt(x) : 0.0; }

static double pow_pos_d(double base, double e) { return dsp_exp(e * dsp_ln(base)); }

// atan(t) for t >= 0: three half-angle reductions (t <= tan(pi/16)), then the
// odd series to t^15 (error < 1e-13). Only used on Width changes.
static double atan_pos(double t) {
  for (int i = 0; i < 3; i += 1) t = t / (1.0 + __builtin_sqrt(1.0 + t * t));
  const double t2 = t * t;
  double sum = 0.0;
  for (int k = 15; k >= 1; k -= 2) sum = sum * t2 + ((((k - 1) / 2) & 1) ? -1.0 : 1.0) / (double)k;
  return 8.0 * t * sum;
}

// Pink Width correction. Constant-peak BP band power on a 1/f source is
// I(Q) = 2 x acos(x) / sqrt(1 - x^2) (x = 1/(2Q), per unit S(fc) fc), not the
// narrowband pi x the sqrt(Q) trim assumes (-2 dB at Q = 0.5). White and brown
// (1/f^2) are exact for every Q, so only pink gets sqrt(pi x / I(Q)).
static double pink_width_gain(double q) {
  double x = 0.5 / q;
  if (x > 1.0) x = 1.0;
  const double acosx = 2.0 * atan_pos(sqrt_pos((1.0 - x) / (1.0 + x)));
  if (acosx < 1.0e-9) return __builtin_sqrt(0.5 * kPI);
  return sqrt_pos(kPI * sqrt_pos(1.0 - x * x) / (2.0 * acosx));
}

// Impulse response of (Color source -> one-pole LP y += a (x - y)) written as
// h[n] = sum_i c_i r_i^n (n >= 0; r = 0 gives a delta). Returns sum h^2 times
// the source innovation variance, i.e. the LP output variance.
struct Geo { double c, r; };

static double geo_energy(const Geo* t, int n) {
  double e = 0.0;
  for (int i = 0; i < n; i += 1) {
    for (int j = 0; j < n; j += 1) {
      e += t[i].c * t[j].c / (1.0 - t[i].r * t[j].r);
    }
  }
  return e;
}

// AR(1) b p^n convolved with a q^n: a b (p^(n+1) - q^(n+1)) / (p - q).
static int conv_ar1_lp(Geo* t, double b, double p, double a, double q) {
  double pp = p;
  if (dsp_fabs(pp - q) < 1.0e-6) pp = q - 1.0e-6;
  const double k = a * b / (pp - q);
  t[0].c = k * pp; t[0].r = pp;
  t[1].c = -k * q; t[1].r = q;
  return 2;
}

// Variance of onePole_LP(cal_color * N_color) for LP coefficient a.
static double mod_lp_variance(int color, double a) {
  const double q = 1.0 - a;
  Geo t[16];
  int n = 0;
  if (color == kColorPink) {
    // Kellet: x = 0.11 (sum_k b_k p_k^n + 0.5362 d[n] + 0.115926 d[n-1]) on U(-1,1).
    const double g = 0.11 * kCalColor[kColorPink];
    for (int k = 0; k < 6; k += 1) n += conv_ar1_lp(t + n, g * kPinkGain[k], kPinkPole[k], a, q);
    // d[n] -> a q^n ; d[n-1] -> a q^(n-1) u[n-1] = (a/q) q^n - (a/q) d[n].
    const double dly = g * 0.115926;
    t[n].c = g * 0.5362 * a + dly * a / q; t[n].r = q; n += 1;
    t[n].c = -dly * a / q; t[n].r = 0.0; n += 1;
    return geo_energy(t, n) * (1.0 / 3.0);
  }
  if (color == kColorBrown) {
    // Unit-variance AR(1): sqrt(1 - p^2) p^n on unit white.
    n += conv_ar1_lp(t, sqrt_pos(1.0 - kBrownPole * kBrownPole), kBrownPole, a, q);
    return geo_energy(t, n);
  }
  // White Gaussian (unit variance): a q^n -> a / (2 - a).
  t[0].c = a; t[0].r = q;
  return geo_energy(t, 1);
}

static void update_width(State& s, double width, int color, double sr) {
  if (width == s.lastWidth && color == s.lastColor && sr == s.lastSr) return;
  s.lastWidth = width;
  s.lastColor = color;
  s.lastSr = sr;
  const double w = clamp(width, 0.0, 1.0);
  s.q = kQMax * pow_pos_d(kQMin / kQMax, w);
  s.sqrtQ = sqrt_pos(s.q);
  const double bmod = kBmodMin * pow_pos_d(kBmodMax / kBmodMin, w);
  s.modCoeff = one_pole_coeff_hz(bmod, sr);
  const double v = mod_lp_variance(color, s.modCoeff);
  s.modNorm = v > 0.0 ? 1.0 / sqrt_pos(v) : 0.0;
  s.widthGain = color == kColorPink ? pink_width_gain(s.q) : 1.0;
  const double w1k = kTwoPi * 1000.0 / sr;
  s.warpRef = dsp_sin(w1k) / w1k;
  s.tiltSr = sr / kRefSampleRate;
}

static void reseed(State& s) {
  for (int c = 0; c < 2; c += 1) {
    Chan& ch = s.ch[c];
    noise_color_reset(ch.nPitch, seed_to_rng_state(seed_mix(s.seed, kSoftpopPitch, (unsigned int)c)));
    noise_color_reset(ch.nAmp, seed_to_rng_state(seed_mix(s.seed, kSoftpopAmp, (unsigned int)c)));
    noise_color_reset(ch.nAudio, seed_to_rng_state(seed_mix(s.seed, kSoftpopAudio, (unsigned int)c)));
    ch.lpPitch = 0.0;
    ch.lpAmp = 0.0;
    tpt_svf_reset(ch.svf);
    ch.phase = 0.0;
    ch.outPitch = 0.0;
    ch.outAmp = 0.0;
    ch.outAudio = 0.0;
    ch.instHz = 0.0;
    ch.out = 0.0;
  }
  s.seeded = true;
}

static double color_sample(NoiseColorChannel& n, int color) {
  if (color == kColorPink) return noise_color_sample(n, 3, 0.0, 1.0, 0.0) * kCalColor[kColorPink];
  if (color == kColorBrown) return noise_color_sample(n, 2, 0.0, 1.0, 0.0) * kCalColor[kColorBrown];
  return noise_color_sample(n, 1, 0.0, 1.0, 0.0);
}

// Identity up to |y| = 4 (> 5.6 sigma of the 1/sqrt 2 RMS output), then a
// smooth rational knee to 8. Safety only; never shapes normal output.
static double safety_limit(double y) {
  const double ay = y < 0.0 ? -y : y;
  if (ay <= 4.0) return y;
  const double u = (ay - 4.0) * 0.25;
  const double lim = 4.0 + 4.0 * u / (1.0 + u);
  return y < 0.0 ? -lim : lim;
}

// T_color(fc) times the bilinear-warp term, normalised at 1 kHz.
static double tilt_warp(const State& s, double fc, int color, double sr) {
  const double lo = 20.0;
  const double hi = 0.45 * sr;
  const double f = fc < lo ? lo : (fc > hi ? hi : fc);
  const double w = kTwoPi * f / sr;
  // sqrt((w / sin w) / (w1k / sin w1k)): exact bilinear noise bandwidth.
  const double warp = sqrt_pos((w / dsp_sin(w)) * s.warpRef);
  const double alpha = kTiltAlpha[color];
  if (alpha == 0.0) return warp;
  // (1000 / f)^(alpha/2) * (fs / 48k)^(alpha/2): flat across the keyboard and fs.
  return warp * pow_pos_d((1000.0 / f) * s.tiltSr, 0.5 * alpha);
}

static double render_chan(State& s, Chan& ch, int model, int color, double fEff,
                          double pitchCents, double ampMod, double amp, double sr) {
  // Generators advance every sample in both models (Model switch never shifts streams).
  const double xp = color_sample(ch.nPitch, color);
  const double xa = color_sample(ch.nAmp, color);
  const double xn = color_sample(ch.nAudio, color);
  ch.lpPitch = ch.lpPitch + s.modCoeff * (xp - ch.lpPitch);
  ch.lpAmp = ch.lpAmp + s.modCoeff * (xa - ch.lpAmp);
  const double np = clamp(ch.lpPitch * s.modNorm, -kModClamp, kModClamp);
  const double na = clamp(ch.lpAmp * s.modNorm, -kModClamp, kModClamp);
  ch.outPitch = np;
  ch.outAmp = na;
  ch.outAudio = xn;

  double fInst = fEff;
  if (pitchCents != 0.0) fInst = fEff * dsp_exp(np * pitchCents * (kLn2 / 1200.0));
  // Sine Hz: clamped to +-Nyquist exactly like polyBlep (phaseInc = f/fs in
  // [-0.5, 0.5]). The phase runs in both models, so a Model switch lands on
  // the same phase as if Sine had been playing all along.
  const double nyq = 0.5 * sr;
  double fSine = fInst;
  if (fSine > nyq) fSine = nyq;
  if (fSine < -nyq) fSine = -nyq;
  const double sinePhase = ch.phase;
  ch.phase += fSine / sr;
  ch.phase -= dsp_floor(ch.phase);
  double x = 0.0;
  if (model == kModelSine) {
    x = dsp_sin_turns(sinePhase);
    ch.instHz = fSine;
  } else {
    // Filter centre |fInst|, clamped to 0.49 fs (the SVF needs w < pi).
    double fc = fInst < 0.0 ? -fInst : fInst;
    const double fcMax = 0.49 * sr;
    if (fc > fcMax) fc = fcMax;
    TptSvfCoeffs k;
    tpt_svf_setup_bandpass_const_peak(k, kTwoPi * fc / sr, s.q);
    x = tpt_svf_tick(ch.svf, k, xn) * kFilterGain[color] * s.sqrtQ * s.widthGain * tilt_warp(s, fc, color, sr);
    ch.instHz = fInst < 0.0 ? -fc : fc;
  }
  const double am = sqrt_pos(1.0 - ampMod) + sqrt_pos(ampMod) * na;
  ch.out = safety_limit(x * am * amp);
  return ch.out;
}

}  // namespace

extern "C" int soemdsp_softpop_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s = State{};
      s.seed = 0u;
      s.seeded = false;
      s.lastWidth = 0.0 / 0.0;
      s.lastSr = 0.0 / 0.0;
      s.lastColor = -1;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_softpop_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Reset edge: reseed every generator from Seed, clear phase, smoothers and SVF.
extern "C" void soemdsp_softpop_oscillator_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return;
  reseed(gPool[handle - 1]);
}

// One frame. freqHz = fEff (graph_engine resolve_osc_hz: knob + MOD, or the
// f cable; already clamped to +-Nyquist). Choice values are choiceIds:
// model 0 filter / 1 sine, color 0 white / 1 pink / 2 brown, stereoMode
// 0 stereo / 1 mono. Returns Mono = (L + R) / 2.
extern "C" double soemdsp_softpop_oscillator_sample(
  int handle,
  double freqHz,
  double model,
  double width,
  double pitchModCents,
  double ampMod,
  double amplitude,
  double color,
  double stereoMode,
  double seedValue,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];
  const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
  const unsigned int seed = seed_param_u32(seedValue);
  if (!s.seeded || seed != s.seed) {
    s.seed = seed;
    reseed(s);
  }
  const int m = (int)(safe(model) + 0.5) == kModelSine ? kModelSine : kModelFilter;
  int c = (int)(safe(color) + 0.5);
  if (c < kColorWhite) c = kColorWhite;
  if (c > kColorBrown) c = kColorBrown;
  const bool mono = (int)(safe(stereoMode) + 0.5) == kMono;
  update_width(s, safe(width), c, sr);
  const double fEff = safe(freqHz);
  double cents = safe(pitchModCents);
  if (cents < 0.0) cents = 0.0;
  const double am = clamp(safe(ampMod), 0.0, 1.0);
  const double amp = safe(amplitude);
  const double l = render_chan(s, s.ch[0], m, c, fEff, cents, am, amp, sr);
  if (mono) {
    Chan& r = s.ch[1];
    r.out = l;
    r.outPitch = s.ch[0].outPitch;
    r.outAmp = s.ch[0].outAmp;
    r.outAudio = s.ch[0].outAudio;
    r.instHz = s.ch[0].instHz;
    return l;
  }
  const double r = render_chan(s, s.ch[1], m, c, fEff, cents, am, amp, sr);
  return 0.5 * (l + r);
}

extern "C" double soemdsp_softpop_oscillator_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].ch[0].out;
}

extern "C" double soemdsp_softpop_oscillator_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].ch[1].out;
}

// Test probe (scripts/test_softpop_oscillator.*): last-frame internals.
// which: 0/1 n_pitch L/R, 2/3 n_amp L/R, 4/5 N_audio L/R (unit RMS),
// 6/7 fInst L/R (Hz), 8 Q, 9 Bmod coefficient a, 10 mod-noise norm.
extern "C" double soemdsp_softpop_oscillator_probe(int handle, int which) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const State& s = gPool[handle - 1];
  const int c = which & 1;
  switch (which) {
    case 0: case 1: return s.ch[c].outPitch;
    case 2: case 3: return s.ch[c].outAmp;
    case 4: case 5: return s.ch[c].outAudio;
    case 6: case 7: return s.ch[c].instHz;
    case 8: return s.q;
    case 9: return s.modCoeff;
    case 10: return s.modNorm;
    default: return 0.0;
  }
}

extern "C" int soemdsp_softpop_oscillator_version() { return 1; }
extern "C" const char* soemdsp_softpop_oscillator_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_softpop_oscillator_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
