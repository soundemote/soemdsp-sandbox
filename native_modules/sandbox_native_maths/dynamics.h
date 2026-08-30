// Sandbox Native Module Maths -- one-pole / slew building blocks shared by
// envelopes, smoothers, and filters. Freestanding (no libm).
#pragma once

#include "scalar_helpers.h"
#include "exp_log.h"

namespace soemdsp_maths {

// One-pole coefficient from time constant (seconds) and sample rate.
// coeff in (0, 1]; larger → faster chase. time<=0 → 1 (snap).
static inline double one_pole_coeff(double timeSeconds, double sampleRate) {
  const double sr = safe(sampleRate);
  if (!(sr > 0.0)) return 1.0;
  const double t = safe(timeSeconds);
  if (!(t > 0.0)) return 1.0;
  // 1 - exp(-1 / (t * sr))
  const double x = -1.0 / (t * sr);
  return clamp(1.0 - dsp_exp(x), 0.0, 1.0);
}

// y += coeff * (target - y)
static inline double one_pole_step(double y, double target, double coeff) {
  const double c = clamp(safe(coeff), 0.0, 1.0);
  return y + c * (safe(target) - y);
}

}  // namespace soemdsp_maths
