// Sandbox Native Module Maths -- shared soft-clip / tanh approximations.
// Nested soemdsp::math (tanh_approx, soft_clip_*); soemdsp_maths mirror.
#pragma once

#include "scalar_helpers.h"

namespace soemdsp::math {

// sqrt(1+x*x) without libm. Seed with max(1,|x|) so Newton converges in a
// few steps (seeding with 1+x*x itself stalls near |x| and under-saturates).
static inline double hypot1(double x) {
  const double ax = dsp_fabs(x);
  const double s = 1.0 + x * x;
  double r = ax < 1.0 ? 1.0 : ax;
  for (int i = 0; i < 6; i++) {
    r = 0.5 * (r + s / r);
  }
  return r;
}

// Saturating soft-clip used by soft_clipper / clipper_limiter / soft_clip_apply.
// f(x) = x / sqrt(1+x*x): odd, smooth, |f|->1 as |x|->inf (unlike the old
// Pade x*(27+x*x)/(27+9*x*x) which grew like x/9 and exploded under drive).
static inline double tanh_approx(double value) {
  const double x = value;
  const double r = hypot1(x);
  return (r <= 0.0) ? 0.0 : (x / r);
}

// Exact antiderivative of tanh_approx: d/dx sqrt(1+x*x) = x/sqrt(1+x*x).
static inline double tanh_antideriv(double value) {
  return hypot1(value);
}

// Ladder / analog-filter stability clip: x / (1 + x*x).
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
