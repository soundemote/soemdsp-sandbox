// 1D value noise and a short fractal-brownian sum.
// Lattice hash + smoothstep copied from ping_pong_delay / ensemble / soem_reverb.
// Not a new noise family: call sites keep their octave count and uni/bipolar map.
#pragma once

#include <soemdsp/math/scalar_helpers.h>

namespace soemdsp::math {

// Bipolar value noise in [-1, 1]. Integer lattice via hash_bipolar;
// smoothstep on the fractional part. Negative x floors toward -inf
// (truncating cast, then one step back), matching the old module copies.
static inline double smooth_noise1d(double x, unsigned int seed) {
  int left = (int)x;
  if (x < 0.0 && x != (double)left) left -= 1;
  const double frac = x - (double)left;
  const double smooth = frac * frac * (3.0 - 2.0 * frac);
  const double a = hash_bipolar((unsigned int)left, seed);
  const double b = hash_bipolar((unsigned int)(left + 1), seed);
  return a + (b - a) * smooth;
}

// Fractal sum of smooth_noise1d. Returns unipolar [0, 1].
// octaves clamped to [1, 8], persistence to [0, 0.999], scale to >= 0.01
// (soem_reverb's guards; fixed 4 / 0.5 / 1.0 call sites are unchanged).
// No energy (maxValue <= 0) returns 0.5. Bipolar is 2*fbm1d-1 at the
// call site, which maps that fallback to 0 (ensemble).
static inline double fbm1d(
  double time, int octaves, double persistence, double scale, unsigned int seed
) {
  double total = 0.0;
  double amplitude = 1.0;
  double freq = 1.0;
  double maxValue = 0.0;
  const int n = octaves < 1 ? 1 : (octaves > 8 ? 8 : octaves);
  const double pers = clamp(persistence, 0.0, 0.999);
  const double sc = maxd(0.01, scale);
  for (int i = 0; i < n; i++) {
    total += smooth_noise1d(time * sc * freq, seed + (unsigned int)(i * 1013)) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2.0;
  }
  if (maxValue <= 0.0) return 0.5;
  return (total / maxValue) * 0.5 + 0.5;
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::smooth_noise1d;
using soemdsp::math::fbm1d;
}  // namespace soemdsp_maths
