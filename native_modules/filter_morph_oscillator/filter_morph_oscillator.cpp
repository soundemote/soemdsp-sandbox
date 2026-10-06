// soemdsp-native-module: filter_morph_oscillator
// soemdsp-native-label: FilterMorph Oscillator
// soemdsp-native-target: filterMorphOscillator
// soemdsp-native-kind: oscillator
//
// Naive source waves + Robin Schmidt ±1-sample cycle dither (same short/mid/long
// pick as Ellipsoid / Supersaw Square AA). Then pitch-tracking Passive-style
// one-pole cascade (Poles 1…4) + fundamental makeup.
// Morph 0 = dark (fc ≈ 0.5×f0). Morph 1 = open (fc ≈ 100×f0, Nyquist clamp).
// Asym Sine is 2× per wrap so the phasor runs at ƒ/2; filter/makeup use user ƒ.

#include <stdint.h>

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 64;
constexpr int kMaxPoles = 4;
constexpr double kROpen = 100.0;
constexpr double kRDark = 0.5;

struct FilterMorphState {
  bool active;
  double phase;
  double lpY[kMaxPoles];
  double lastReset;
  double ditherOffset;
  int ditherWasOn;
  unsigned int rng;
  unsigned int seed;  // module Seed (seed_param_u32)
};

static FilterMorphState gPool[kMaxInstances];

// Fixed seed components (never reorder; append new parts at the end).
enum : unsigned int {
  kSeedDither = 1u,  // Robin cycle dither stream
};

// Dither stream from the module Seed only (create, Reset, Seed change).
static unsigned int dither_rng_from_seed(unsigned int seed) {
  return seed_to_rng_state(seed_mix(seed, kSeedDither));
}

static double wrap01_phase(double x) {
  return wrap01(x);
}

// Same short/mid/long ±1-sample pick as soemdsp_ellipsoid_robin_dither_cycles.
static double robin_dither_cycles(unsigned int* rng, double cycleSamples) {
  if (!rng) return 0.0;
  double c = cycleSamples;
  if (!(c == c) || c < 2.0) c = 2.0;
  if (c > 1.0e9) c = 1.0e9;
  const double ci = dsp_floor(c);
  const double cf = c - ci;
  double c2 = ci;
  if (cf >= 0.5) c2 += 1.0;
  const double c1 = c2 - 1.0;
  const double c3 = c2 + 1.0;
  const double e1 = c1 - c;
  const double e2 = c2 - c;
  const double e3 = c3 - c;
  const double v1 = e1 * e1;
  const double v2 = e2 * e2;
  const double v3 = e3 * e3;
  const double v = 0.25;
  const double d1 = v - v1;
  const double d2 = v - v2;
  const double d3 = v - v3;
  const double denom = e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3);
  if (!(denom == denom) || denom == 0.0) return 0.0;
  const double s = 1.0 / denom;
  const double probShort = (d2 * e3 - d3 * e2) * s;
  const double probMid = (d3 * e1 - d1 * e3) * s;

  unsigned int state = *rng;
  if (state == 0u) state = 1u;
  state = xorshift32(state);
  *rng = state;
  const double r = (double)(state >> 8) * (1.0 / 16777216.0);
  double lenNow = c2;
  if (r < probShort) lenNow = c2 - 1.0;
  else if (r >= probShort + probMid) lenNow = c2 + 1.0;
  double maxCount = lenNow - 1.0;
  if (!(maxCount >= 1.0)) maxCount = 1.0;
  const double phaseSlope = 1.0 / maxCount;
  if (lenNow < c2) return -phaseSlope;
  if (lenNow > c2) return phaseSlope;
  return 0.0;
}

static double naive_saw(double t) {
  return 1.0 - wrap01_phase(t) * 2.0;
}

static double naive_ramp(double t) {
  return -1.0 + wrap01_phase(t) * 2.0;
}

static double naive_triangle(double t) {
  const double p = wrap01_phase(t);
  const double d = p < 0.5 ? (0.5 - p) : (p - 0.5);
  return 1.0 - 4.0 * d;
}

static double naive_pulse(double t, double morph) {
  const double pw = morph_width01(morph);
  return (wrap01_phase(t) < pw) ? (2.0 - 2.0 * pw) : (-2.0 * pw);
}

static double naive_center_square(double t, double morph) {
  double w = morph;
  if (!(w == w)) w = 0.5;
  if (w < 0.0) w = 0.0;
  if (w > 1.0) w = 1.0;
  if (w <= 0.0) return -1.0;
  if (w >= 1.0) return 1.0;
  const double shift = 0.5 * (1.0 - w);
  const double t0 = wrap01_phase(t - shift);
  return (t0 < w) ? 1.0 : -1.0;
}

static double naive_asym_sine(double t) {
  double sabs = dsp_sin_turns_lut(wrap01_phase(t));
  if (sabs < 0.0) sabs = -sabs;
  return sabs * 2.0 - 1.0;
}

static double one_pole_lp(double& y, double x, double freqHz, double rate) {
  const double maxW = kTAU * 0.45;
  double f = freqHz;
  if (!(f == f) || f < 0.0) f = 0.0;
  if (f > 20000.0) f = 20000.0;
  double w = f * kTAU / rate;
  if (w > maxW) w = maxW;
  const double a1 = dsp_exp_squaring(-w);
  const double b0 = 1.0 - a1;
  y = b0 * x + a1 * y;
  return y;
}

static double one_pole_mag_at_f0(double fcHz, double f0Hz, double rate) {
  const double maxW = kTAU * 0.45;
  double fc = fcHz;
  if (!(fc == fc) || fc < 0.0) fc = 0.0;
  if (fc > 20000.0) fc = 20000.0;
  double w = fc * kTAU / rate;
  if (w > maxW) w = maxW;
  const double a1 = dsp_exp_squaring(-w);
  const double b0 = 1.0 - a1;
  double f0 = f0Hz < 0.0 ? -f0Hz : f0Hz;
  if (!(f0 > 1.0e-12)) f0 = 1.0e-12;
  double w0 = f0 * kTAU / rate;
  if (w0 > maxW) w0 = maxW;
  const double c = dsp_cos(w0);
  const double den2 = 1.0 - 2.0 * a1 * c + a1 * a1;
  const double den = den2 > 0.0 ? (double)__builtin_sqrt((float)den2) : 0.0;
  if (!(den > 1.0e-18)) return 1.0;
  return b0 / den;
}

static double morph_to_ratio(double morph) {
  double m = morph;
  if (!(m == m) || m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  const double logDark = dsp_ln(kRDark);
  const double logOpen = dsp_ln(kROpen);
  return dsp_exp(logDark + m * (logOpen - logDark));
}

static int clamp_poles(double poles) {
  int n = (int)(poles + (poles >= 0.0 ? 0.5 : -0.5));
  if (n < 1) n = 1;
  if (n > kMaxPoles) n = kMaxPoles;
  return n;
}

static int clamp_wave(double waveform) {
  int w = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  if (w < 0) w = 0;
  if (w > 6) w = 6;
  return w;
}

static void clear_lp(FilterMorphState& s) {
  for (int i = 0; i < kMaxPoles; i++) s.lpY[i] = 0.0;
}

static double source_wave(double ph, int wave) {
  switch (wave) {
    case 1: return naive_ramp(ph);
    case 2: return naive_trisaw(ph, 0.5);
    case 3: return naive_triangle(ph);
    case 4: return naive_center_square(ph, 0.5);
    case 5: return naive_pulse(ph, 0.5);
    case 6: return naive_asym_sine(ph);
    default: return naive_saw(ph);
  }
}

static double process_one(
  FilterMorphState& s,
  double frequencyHz,
  double sampleRate,
  double morph,
  double poles,
  double waveform,
  double phaseOffset,
  double amplitude,
  bool doReset
) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = (frequencyHz * 0.0 == 0.0) ? frequencyHz : 0.0;
  const int wave = clamp_wave(waveform);
  double increment = f / rate;
  if (wave == 6) increment *= 0.5;
  const double po = wrap01_phase(phaseOffset);
  const int nPoles = clamp_poles(poles);

  if (doReset) {
    s.phase = 0.0;
    s.ditherOffset = 0.0;
    s.ditherWasOn = 0;
    clear_lp(s);
  }

  const double old = s.phase;
  const double next = old + increment;
  const bool wrap = dsp_floor(next) != dsp_floor(old);
  s.phase = wrap01_phase(next);

  const double absInc = increment < 0.0 ? -increment : increment;
  if (!(absInc > 1.0e-15)) {
    s.ditherOffset = 0.0;
    s.ditherWasOn = 0;
  } else if (doReset || s.ditherWasOn == 0 || wrap) {
    s.ditherOffset = robin_dither_cycles(&s.rng, 1.0 / absInc);
    s.ditherWasOn = 1;
  }

  const double ph = wrap01_phase(s.phase + po + s.ditherOffset);
  double y = source_wave(ph, wave);

  double m = morph;
  if (!(m == m) || m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;

  double f0 = f < 0.0 ? -f : f;
  if (!(f0 > 1.0e-9)) f0 = 1.0e-9;
  double fc = morph_to_ratio(m) * f0;
  const double ny = rate * 0.45;
  if (fc < 1.0) fc = 1.0;
  if (fc > ny) fc = ny;
  for (int i = 0; i < nPoles; i++) {
    y = one_pole_lp(s.lpY[i], y, fc, rate);
  }
  for (int i = nPoles; i < kMaxPoles; i++) {
    s.lpY[i] = y;
  }
  const double mag1 = one_pole_mag_at_f0(fc, f0, rate);
  double magN = 1.0;
  for (int i = 0; i < nPoles; i++) magN *= mag1;
  if (magN > 1.0e-12) {
    double makeup = 1.0 / magN;
    if (makeup > 8.0) makeup = 8.0;
    y *= makeup;
  }

  double gain = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  if (gain < 0.0) gain = 0.0;
  return y * gain;
}

}  // namespace

extern "C" int soemdsp_filter_morph_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FilterMorphState& s = gPool[i];
      s.phase = 0.0;
      clear_lp(s);
      s.lastReset = 0.0;
      s.ditherOffset = 0.0;
      s.ditherWasOn = 0;
      // Seed 0 until the host's Seed arrives via soemdsp_filter_morph_oscillator_set_seed.
      s.seed = 0u;
      s.rng = dither_rng_from_seed(0u);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_filter_morph_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_filter_morph_oscillator_reset(int handle, double phaseOffset) {
  if (handle < 1 || handle > kMaxInstances) return;
  FilterMorphState& s = gPool[handle - 1];
  if (!s.active) return;
  (void)phaseOffset;
  s.phase = 0.0;
  s.ditherOffset = 0.0;
  s.ditherWasOn = 0;
  s.rng = dither_rng_from_seed(s.seed);
  clear_lp(s);
}

// Seed change (or first Seed after create): restart the dither stream from it.
extern "C" void soemdsp_filter_morph_oscillator_set_seed(int handle, double seed) {
  if (handle < 1 || handle > kMaxInstances) return;
  FilterMorphState& s = gPool[handle - 1];
  if (!s.active) return;
  s.seed = seed_param_u32(seed);
  s.rng = dither_rng_from_seed(s.seed);
}

extern "C" double soemdsp_filter_morph_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double morph,
  double poles,
  double waveform,
  double phaseOffset,
  double amplitude,
  double reset
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  FilterMorphState& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  const double rv = (reset * 0.0 == 0.0) ? reset : 0.0;
  const bool hit = rv > 0.0 && s.lastReset <= 0.0;
  s.lastReset = rv;
  return process_one(
    s, frequencyHz, sampleRate, morph, poles, waveform, phaseOffset, amplitude, hit
  );
}

extern "C" int soemdsp_filter_morph_oscillator_version() {
  return 4;
}
