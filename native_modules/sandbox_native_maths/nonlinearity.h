// Sandbox Native Module Maths -- shared soft-clip / tanh approximations.
#pragma once

#include "exp_log.h"
#include "scalar_helpers.h"

namespace soemdsp_maths {

// Pade tanh used by soft_clipper / clipper_limiter.
static inline double tanh_approx(double value) {
  const double x = value;
  const double x2 = x * x;
  const double denominator = 27.0 + 9.0 * x2;
  return (denominator <= 0.0) ? 0.0 : (x * (27.0 + x2)) / denominator;
}

// ∫ tanh_approx = x²/18 + (4/3) ln(x²+3)
static inline double tanh_antideriv(double value) {
  const double x = value;
  return (x * x) / 18.0 + (4.0 / 3.0) * dsp_ln(x * x + 3.0);
}

// Ladder / analog-filter stability clip: x / (1 + x²).
static inline double soft_clip_rational(double x) {
  const double v = safe(x);
  return v / (1.0 + v * v);
}

}  // namespace soemdsp_maths
