// TPT state variable filter (Zavalishin topology-preserving transform, Simper
// tick form), shared by EQ Filter and Softpop Oscillator.
// Moved verbatim from native_modules/eq_filter/eq_filter.cpp (APP_POLICY §19,
// docs/SOFTPOP_PLAN.md §2). EQ Filter output is byte-identical to before the
// move: scripts/test_tpt_svf_noise_colors_regression.mjs.
//
// Per sample (one stage):
//   yH = (x - c·z1 - z2)·s,  yB = z1 + g·yH,  yL = z2 + g·yB
//   z1 = 2·yB - z1,          z2 = 2·yL - z2
//   y  = aH·yH + aB·yB + aL·yL
// with g = tan(ω/2)·gScale, c = g + r, s = 1 / (1 + g·c), r = 1/Q (damping 2R).
// Recomputing g every sample is safe (the state carries no coefficient).
#pragma once

#include <soemdsp/constant/constant.h>
#include <soemdsp/debug/debug.h>
#include <soemdsp/math/scalar_helpers.h>
#include <soemdsp/math/analog_filter_trig.h>

namespace soemdsp_maths {

struct TptSvfCoeffs {
  double g, c, s, aL, aB, aH;
};

struct TptSvfState {
  double z1, z2;
};

static inline void tpt_svf_reset(TptSvfState& st) {
  st.z1 = 0.0;
  st.z2 = 0.0;
}

// tan(ω/2) from one joint sin/cos; 1e15 at the pole.
static inline double tpt_svf_tan_half(double omega) {
  double s = 0.0, c = 0.0;
  dsp_sin_cos(0.5 * omega, &s, &c);
  if (dsp_fabs(c) < 1.0e-15) return 1e15;
  return s / c;
}

// omega = 2π·f/fs (clamped to [0, 0.999π]), r = damping (1/Q, floored at 1e-9),
// aL / aB / aH = output mix of the LP / BP / HP taps, gScale scales g (shelves).
static inline void tpt_svf_setup(TptSvfCoeffs& k, double omega, double r, double aL, double aB, double aH, double gScale) {
  const double rawW = safe(omega);
  const double w = rawW < 0.0 ? 0.0 : (rawW > kPi * 0.999 ? kPi * 0.999 : rawW);
  const double safeR = r > 1e-9 ? r : 1e-9;
  const double g = tpt_svf_tan_half(w) * (gScale == 0.0 && gScale * 0.0 != 0.0 ? 1.0 : (gScale * 0.0 == 0.0 ? gScale : 1.0));
  const double c = g + safeR;
  const double denom = 1.0 + g * c;
  k.g = g;
  k.c = c;
  k.s = denom != 0.0 ? 1.0 / denom : 0.0;
  k.aL = aL;
  k.aB = aB;
  k.aH = aH;
}

// Constant-peak bandpass (EQ Filter mode 4): r = 1/Q, BP tap scaled by r, so
// the gain at the centre is 1 for every Q.
static inline void tpt_svf_setup_bandpass_const_peak(TptSvfCoeffs& k, double omega, double q) {
  const double r = 1.0 / q;
  tpt_svf_setup(k, omega, r, 0, r, 0, 1);
}

static inline double tpt_svf_tick(TptSvfState& st, const TptSvfCoeffs& k, double x) {
  const double z1 = st.z1;
  const double z2 = st.z2;
  const double yH = (x - k.c * z1 - z2) * k.s;
  const double yB = z1 + k.g * yH;
  const double yL = z2 + k.g * yB;
  st.z1 = 2.0 * yB - z1;
  st.z2 = 2.0 * yL - z2;
  return k.aH * yH + k.aB * yB + k.aL * yL;
}

}  // namespace soemdsp_maths
