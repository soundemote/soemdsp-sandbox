// soemdsp-native-module: filter_morph_oscillator
// soemdsp-native-label: FilterMorph Oscillator
// soemdsp-native-target: filterMorphOscillator
// soemdsp-native-kind: oscillator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/oscillator/PolyBLEP.hpp
//
// PolyBLEP source (Saw / Ramp / Trisaw / Triangle / Center Square / Pulse /
// Asym Sine) into a pitch-tracking Passive-style one-pole cascade (Poles 1…4).
// Morph 0 = dark (fc ≈ 0.5×f0). Morph 1 = open (fc ≈ 100×f0, Nyquist clamp).
// Makeup keeps fundamental magnitude constant. Asym Sine is 2× per wrap so
// the phasor runs at ƒ/2; filter/makeup still use user ƒ.

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
  double triangleIntegrator;
  double lastReset;
};

static FilterMorphState gPool[kMaxInstances];

static double wrap01_phase(double x) {
  return wrap01(x);
}

static double polyblep_saw(double phaseCycle, double increment) {
  const double ph = wrap01_phase(phaseCycle);
  double dt = increment < 0.0 ? -increment : increment;
  if (dt < 1.0e-12) {
    return 1.0 - ph * 2.0;
  }
  if (dt > 0.5) dt = 0.5;
  return 1.0 - ph * 2.0 + poly_blep(ph, increment);
}

static double polyblep_ramp(double phaseCycle, double increment) {
  const double ph = wrap01_phase(phaseCycle);
  double dt = increment < 0.0 ? -increment : increment;
  if (dt < 1.0e-12) {
    return -1.0 + ph * 2.0;
  }
  if (dt > 0.5) dt = 0.5;
  return -1.0 + ph * 2.0 - poly_blep(ph, increment);
}

static double polyblep_square(double phaseCycle, double increment) {
  double value = phaseCycle < 0.5 ? 1.0 : -1.0;
  value += poly_blep(phaseCycle, increment);
  value -= poly_blep(wrap01_phase(phaseCycle + 0.5), increment);
  return value;
}

static double polyblep_pulse(double t, double incrementAbs, double morph) {
  const double pw = morph_width01(morph);
  const double t1 = wrap01_phase(t + 1.0 - pw);
  double y = -2.0 * pw;
  if (t < pw) y += 2.0;
  y += poly_blep(t, incrementAbs) - poly_blep(t1, incrementAbs);
  return y;
}

static double polyblep_center_square(double t, double incrementAbs, double morph) {
  double w = morph;
  if (!(w == w)) w = 0.5;
  if (w < 0.0) w = 0.0;
  if (w > 1.0) w = 1.0;
  if (w <= 0.0) return -1.0;
  if (w >= 1.0) return 1.0;
  const double shift = 0.5 * (1.0 - w);
  const double t0 = wrap01_phase(t - shift);
  const double t1 = wrap01_phase(t0 + 1.0 - w);
  double y = (t0 < w) ? 1.0 : -1.0;
  y += poly_blep(t0, incrementAbs) - poly_blep(t1, incrementAbs);
  return y;
}

static double polyblep_trisaw(double t, double incrementAbs, double morph) {
  const double pw = morph_width01(morph);
  const double t1 = wrap01_phase(t + 0.5 * pw);
  const double t2 = wrap01_phase(t + 1.0 - 0.5 * pw);
  double y = t * 2.0;
  if (y >= 2.0 - pw) {
    y = (y - 2.0) / pw;
  } else if (y >= pw) {
    y = 1.0 - (y - pw) / (1.0 - pw);
  } else {
    y /= pw;
  }
  y += incrementAbs / (pw - pw * pw) * (poly_blamp(t1, incrementAbs) - poly_blamp(t2, incrementAbs));
  return y;
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

static double source_wave(
  FilterMorphState& s,
  double ph,
  double increment,
  int wave
) {
  const double absInc = increment < 0.0 ? -increment : increment;
  const double dt = absInc < 1.0e-12 ? 1.0e-6 : absInc;
  switch (wave) {
    case 1:
      return polyblep_ramp(ph, increment);
    case 2:
      return polyblep_trisaw(ph, dt, 0.5);
    case 3: {
      if (absInc <= 1.0e-12) {
        const double t = ph < 0.5 ? (0.5 - ph) : (ph - 0.5);
        const double y = 1.0 - 4.0 * t;
        s.triangleIntegrator = y;
        return y;
      }
      double next = (s.triangleIntegrator + polyblep_square(ph, increment) * increment * 4.0) * 0.995;
      if (next > 1.0) next = 1.0;
      if (next < -1.0) next = -1.0;
      s.triangleIntegrator = next;
      return next;
    }
    case 4:
      return polyblep_center_square(ph, dt, 0.5);
    case 5:
      return polyblep_pulse(ph, dt, 0.5);
    case 6: {
      double sabs = dsp_sin_turns_lut(ph);
      if (sabs < 0.0) sabs = -sabs;
      return sabs * 2.0 - 1.0;
    }
    default:
      return polyblep_saw(ph, increment);
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
    s.triangleIntegrator = 0.0;
    clear_lp(s);
  }

  s.phase = wrap01_phase(s.phase + increment);
  const double ph = wrap01_phase(s.phase + po);
  double y = source_wave(s, ph, increment, wave);

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
      s.triangleIntegrator = 0.0;
      clear_lp(s);
      s.lastReset = 0.0;
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
  s.triangleIntegrator = 0.0;
  clear_lp(s);
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
  return 3;
}
