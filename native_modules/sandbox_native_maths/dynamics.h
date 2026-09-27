// Sandbox Native Module Maths -- one-pole / slew building blocks shared by
// envelopes, smoothers, and filters. Freestanding (no libm).
// Nested soemdsp::math; soemdsp_maths mirror.
#pragma once

#include "scalar_helpers.h"
#include "exp_log.h"
#include "constant.h"

namespace soemdsp::math {

// One-pole coefficient from time constant (seconds) and sample rate.
// coeff in (0, 1]; larger → faster chase. time<=0 → 1 (snap).
static inline double one_pole_coeff(double timeSeconds, double sampleRate) {
  const double sr = soemdsp::debug::safe(sampleRate);
  if (!(sr > 0.0)) return 1.0;
  const double t = soemdsp::debug::safe(timeSeconds);
  if (!(t > 0.0)) return 1.0;
  // 1 - exp(-1 / (t * sr))
  const double x = -1.0 / (t * sr);
  return clamp(1.0 - soemdsp_maths::dsp_exp(x), 0.0, 1.0);
}

// One-pole coefficient from cutoff Hz: 1 - exp(-2π f / sr).
// f<=0 → 0; bad sampleRate → 1. Callers may pre-clamp f (e.g. to 0.45*Nyquist).
static inline double one_pole_coeff_hz(double freqHz, double sampleRate) {
  const double sr = soemdsp::debug::safe(sampleRate);
  if (!(sr > 0.0)) return 1.0;
  const double f = soemdsp::debug::safe(freqHz);
  if (!(f > 0.0)) return 0.0;
  return clamp(1.0 - soemdsp_maths::dsp_exp(-soemdsp::constant::kTAU * f / sr), 0.0, 1.0);
}

// y += coeff * (target - y)
static inline double one_pole_step(double y, double target, double coeff) {
  const double c = clamp(soemdsp::debug::safe(coeff), 0.0, 1.0);
  return y + c * (soemdsp::debug::safe(target) - y);
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::one_pole_coeff;
using soemdsp::math::one_pole_coeff_hz;
using soemdsp::math::one_pole_step;
}  // namespace soemdsp_maths
