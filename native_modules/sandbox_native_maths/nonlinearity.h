// Sandbox Native Module Maths -- shared soft-clip / tanh approximations.
// Nested soemdsp::math (tanh_approx, soft_clip_*); soemdsp_maths mirror.
#pragma once

#include "exp_log.h"
#include "scalar_helpers.h"

namespace soemdsp::math {

// Pade tanh used by soft_clipper / clipper_limiter / soft_clip_apply.
static inline double tanh_approx(double value) {
  const double x = value;
  const double x2 = x * x;
  const double denominator = 27.0 + 9.0 * x2;
  return (denominator <= 0.0) ? 0.0 : (x * (27.0 + x2)) / denominator;
}

// ∫ tanh_approx = x²/18 + (4/3) ln(x²+3)
static inline double tanh_antideriv(double value) {
  const double x = value;
  return (x * x) / 18.0 + (4.0 / 3.0) * soemdsp_maths::dsp_ln(x * x + 3.0);
}

// Ladder / analog-filter stability clip: x / (1 + x²).
static inline double soft_clip_rational(double x) {
  const double v = soemdsp::debug::safe(x);
  return v / (1.0 + v * v);
}

// Affine soft-clip coefficients from center/width (soft_clipper / clipper_limiter).
// Width near zero falls back to 2.0. Output: sx, shx, sy, shy.
static inline void soft_clip_coeffs(
  double center, double width, double* sx, double* shx, double* sy, double* shy
) {
  const double safeWidth = dsp_fabs(width) > 1.0e-6 ? dsp_fabs(width) : 2.0;
  *sx = 2.0 / safeWidth;
  *shx = -1.0 - ((*sx) * (center - 0.5 * safeWidth));
  *sy = 1.0 / (*sx);
  *shy = -(*shx) * (*sy);
}

// shy + sy * tanh_approx(sx*x + shx). Matches soft_clipper / clipper_limiter.
// ping_pong_delay / soem_reverb keep local exact-tanh apply (behavior differs).
static inline double soft_clip_apply(double x, double sx, double shx, double sy, double shy) {
  return shy + sy * tanh_approx(sx * x + shx);
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::tanh_approx;
using soemdsp::math::tanh_antideriv;
using soemdsp::math::soft_clip_rational;
using soemdsp::math::soft_clip_coeffs;
using soemdsp::math::soft_clip_apply;
}  // namespace soemdsp_maths
