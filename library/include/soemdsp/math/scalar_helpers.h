// Sandbox Native Module Maths -- basic scalar helpers with no libm
// dependency, used by nearly every native_modules/*.cpp.
//
// Canonical homes (nested, matching soemdsp):
//   soemdsp::constant -- kPI / kTAU / kPIz2 / k1z3 / kPlanck (+ compat aliases; see constant.h)
//   soemdsp::debug    -- safe / is_bad / is_nan / default_if_zero / default_if_near_zero  (see debug.h)
//   soemdsp::math     -- clamp, clamp01, clamp11, wrap01, wrap01_frac, wrap01f, wrap11(_closed)/wrap_radians/wrap/floor/ceil, lerp, morph_width01, naive_trisaw, naive_trisaw_center, naive_analog_square, sqrt_newton, xorshift32, ...
// Flat soemdsp_maths:: is a compatibility mirror for existing modules.
#pragma once

#include <soemdsp/debug/debug.h>
#include <soemdsp/constant/constant.h>

namespace soemdsp::math {

static inline double clamp(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
static inline double clamp01(double x) { return clamp(x, 0.0, 1.0); }
static inline double clamp11(double x) { return clamp(x, -1.0, 1.0); }
static inline int clamp_int(int x, int lo, int hi) { return x < lo ? lo : (x > hi ? hi : x); }

static inline double maxd(double a, double b) { return a > b ? a : b; }
static inline double mind(double a, double b) { return a < b ? a : b; }

// floor()/ceil() without libm (freestanding wasm32 has no libc).
static inline double dsp_floor(double x) {
  if (soemdsp::debug::is_bad(x)) return 0.0;
  // Doubles above 2^53 are already integers; casting to long long is UB past 2^63.
  if (x >= 9007199254740992.0 || x <= -9007199254740992.0) return x;
  double xi = (double)(long long)x;
  return (x < xi) ? xi - 1.0 : xi;
}

static inline double dsp_ceil(double x) {
  return -dsp_floor(-x);
}

static inline double dsp_fabs(double x) { return x < 0.0 ? -x : x; }

static inline bool near_planck(double a, double b) {
  return dsp_fabs(a - b) < soemdsp::constant::kPlanck;
}

static inline bool silent_planck(double x) {
  return dsp_fabs(x) < soemdsp::constant::kPlanck;
}

// x - floor(x), wrapped into [0, 1).
// Canonical unit-interval wrap; matches soemdsp::math::wrap(phase) style.
static inline double wrap01(double value) {
  double f = value - dsp_floor(value);
  if (f < 0.0) f += 1.0;
  if (f >= 1.0) f -= 1.0;
  return f;
}

// Plain fractional part: x - floor(x), with no extra range-safety branches.
static inline double wrap01_frac(double value) {
  return value - dsp_floor(value);
}

// Wrap into [-1, +1). Same half-open convention as wrap01's [0, 1).
// Equivalent to 2*wrap01((value + 1)/2) - 1. Endpoint +1 maps to -1.
static inline double wrap11(double value) {
  return 2.0 * wrap01(0.5 * (value + 1.0)) - 1.0;
}

// Wrap into closed [-1, +1]. Exact +/-1 stay; outside uses wrap11.
static inline double wrap11_closed(double value) {
  if (value >= -1.0 && value <= 1.0) return value;
  return wrap11(value);
}

// Float unit-interval wrap (promoted from additive_yellow_graph local).
static inline float wrap01f(float value) {
  return (float)wrap01((double)value);
}

// Radians wrap into [-period/2, +period/2] via nearest multiple (blit/dsf).
// Default period 2*pi -> [-pi, +pi]. Pass pi for blit half-cycle phase.
static inline double wrap_radians(double value, double period) {
  if (!(period > 0.0)) return 0.0;
  const double turns = value / period;
  const double n = dsp_floor(turns + 0.5);
  return value - n * period;
}

static inline double wrap_radians(double value) {
  return wrap_radians(value, soemdsp::constant::kTAU);
}

// Wrap into [lo, hi). Half-open, matching wrap01 / wrap11.
// Inspired by soemdsp::math::wrap(phase) and wrap(phase, modulus), but with
// explicit endpoints (soemdsp's 2-arg form is modulus-from-zero only).
// Non-positive or non-finite span returns lo.
static inline double wrap(double value, double lo, double hi) {
  const double span = hi - lo;
  if (!(span > 0.0)) return lo;
  return lo + span * wrap01((value - lo) / span);
}

// NaN/Inf AND extreme-magnitude guard (blanks anything beyond +-1e300).
// Distinct from debug::safe (which only catches NaN/Inf).
static inline double safe_bounded(double v) {
  return (v == v && v > -1.0e300 && v < 1.0e300) ? v : 0.0;
}

// MurmurHash3 fmix32, matching the JS hashBipolar bit-for-bit.
static inline double hash_bipolar(unsigned int index, unsigned int seed) {
  unsigned int value = index ^ seed;
  value = (unsigned int)(value ^ (value >> 16)); value = (unsigned int)(value * 2246822507u);
  value = (unsigned int)(value ^ (value >> 13)); value = (unsigned int)(value * 3266489909u);
  value = (unsigned int)(value ^ (value >> 16));
  return ((double)value / 4294967295.0) * 2.0 - 1.0;
}

// Linear interpolate: a + t*(b-a).
static inline double lerp(double a, double b, double t) {
  return a + t * (b - a);
}

// Hermite smoothstep on [0,1] (clamp then 3t^2-2t^3).
static inline double smoothstep01(double t) {
  const double x = clamp01(t);
  return x * x * (3.0 - 2.0 * x);
}

// Quadratic ease-in (Slow Start): t^2.
static inline double ease_in_quad01(double t) {
  const double x = clamp01(t);
  return x * x;
}

// Quadratic ease-out (Slow End): 1-(1-t)^2.
static inline double ease_out_quad01(double t) {
  const double x = clamp01(t);
  const double u = 1.0 - x;
  return 1.0 - u * u;
}


// Morph / PWM width in (0,1): NaNâ†’0.5, clamp [0,1], squeeze to [eps, 1-eps].
// Matches hypersaw2 / polyblep morphWidth01 (default eps = 1e-4).
static inline double morph_width01(double morph, double eps = 1.0e-4) {
  double w = soemdsp::debug::is_nan(morph) ? 0.5 : morph;
  if (w < 0.0) w = 0.0;
  if (w > 1.0) w = 1.0;
  const double e = (eps > 0.0) ? eps : 1.0e-4;
  if (w < e) w = e;
  if (w > 1.0 - e) w = 1.0 - e;
  return w;
}

// Naive peak-shift trisaw (hypersaw2 / polyBlepTrisaw geometry without blep).
// phase01 in turns; Morph moves the peak left/right via morph_width01.
// pwâ‰ˆ0.5 â‰ˆ triangle; extremes approach a saw-like peak at an edge.
static inline double naive_trisaw(double phase01, double morph) {
  const double t = wrap01(phase01);
  const double pw = morph_width01(morph);
  double y = t * 2.0;
  if (y >= 2.0 - pw) {
    y = (y - 2.0) / pw;
  } else if (y >= pw) {
    y = 1.0 - (y - pw) / (1.0 - pw);
  } else {
    y /= pw;
  }
  return y;
}

// Naive zero-crossing trisaw center with opposing peak slide (saw morph).
// Zeros fixed at phase 0 and 0.5. Morph 0.5 -> bipolar triangle (peaks 0.25 / 0.75).
// Morph toward 0 or 1 slides peaks in opposite directions (pos toward wrap, neg toward mid
// or vice versa) so the continuous limit is a single-discontinuity saw  -  Morph 0 and 1 are
// spectral mirrors (both bright); 0.5 is dullest. Not half-wave copy (that moved both peaks
// the same way and produced dual mid spikes at extremes).
static inline double naive_trisaw_center(double phase01, double morph) {
  const double t = wrap01(phase01);
  const double w = morph_width01(morph);
  const double local = (t < 0.5) ? (t * 2.0) : ((t - 0.5) * 2.0);
  const double sgn = (t < 0.5) ? 1.0 : -1.0;
  // First half peak fraction w; second half (1-w)  -  opposing motion within each half.
  const double wLoc = (t < 0.5) ? w : (1.0 - w);
  double y;
  if (local < wLoc) y = local / wLoc;
  else y = (1.0 - local) / (1.0 - wLoc);
  return sgn * y;
}

// Naive Analog Square: half-wave SAME-direction peaks (dual-edge / square-ish family).
// Zeros fixed at phase 0 and 0.5. Morph 0.5 -> bipolar triangle (peaks 0.25 / 0.75).
// Morph toward 0 or 1 slides BOTH peaks the same way (pos and neg lean together) so
// extremes are dual mid-leaning spikes / square-ish — not opposing saws.
// Peaks at 0.5*w and 0.5+0.5*w. Contrast naive_trisaw_center (opposing peaks).
static inline double naive_analog_square(double phase01, double morph) {
  const double t = wrap01(phase01);
  const double w = morph_width01(morph);
  const double local = (t < 0.5) ? (t * 2.0) : ((t - 0.5) * 2.0);
  const double sgn = (t < 0.5) ? 1.0 : -1.0;
  // SAME w in both halves — peaks lean the same direction.
  double y;
  if (local < w) y = local / w;
  else y = (1.0 - local) / (1.0 - w);
  return sgn * y;
}

// Linear map: unit [0,1] source -> [outMin, outMax]. NOT jmap (no JUCE name).
static inline double map01(double v01, double outMin, double outMax) {
  return outMin + (outMax - outMin) * v01;
}

// Bipolar [-1,1] source -> [outMin, outMax].
static inline double map11(double v11, double outMin, double outMax) {
  return outMin + (outMax - outMin) * ((v11 + 1.0) * 0.5);
}

// General linear map inMin..inMax -> outMin..outMax. Zero/non-finite span -> outMin.
static inline double map(double v, double inMin, double inMax, double outMin, double outMax) {
  const double span = inMax - inMin;
  if (!(span > 0.0) && !(span < 0.0)) return outMin;
  return outMin + (outMax - outMin) * ((v - inMin) / span);
}

// Rational tension curve on [0,1]: ((1+s)*t)/(1-s+2*s*t), skew clamped +-0.999.
static inline double rational_curve01(double t01, double skew) {
  const double t = clamp(t01, 0.0, 1.0);
  const double s = clamp(skew, -0.999, 0.999);
  return ((1.0 + s) * t) / (1.0 - s + 2.0 * s * t);
}

// Bipolar [-1,1] rational via unipolar map-through.
static inline double rational_curve11(double v11, double skew) {
  return 2.0 * rational_curve01((v11 + 1.0) * 0.5, skew) - 1.0;
}

// General: map v into [0,1] over in span, rational_curve01, map to out span.
static inline double rational_curve(
  double v, double inMin, double inMax, double outMin, double outMax, double skew
) {
  return map01(rational_curve01(map(v, inMin, inMax, 0.0, 1.0), skew), outMin, outMax);
}

// Newton-Raphson sqrt, 24 iterations, guess=x. Non-positive -> 0.
static inline double sqrt_newton(double x) {
  if (x <= 0.0) return 0.0;
  double guess = x;
  for (int i = 0; i < 24; i++) guess = 0.5 * (guess + x / guess);
  return guess;
}

// Marsaglia xorshift32 (13/17/5). Updates state in place; returns new state.
// Nonzero seed stays nonzero. Callers that need a dead-zero guard seed at init.
static inline unsigned xorshift32(unsigned& state) {
  unsigned x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

}  // namespace soemdsp::math

// ---------------------------------------------------------------------------
// Compatibility mirror: existing modules use `using namespace soemdsp_maths`.
// ---------------------------------------------------------------------------
namespace soemdsp_maths {

using soemdsp::debug::is_nan;
using soemdsp::debug::is_bad;
using soemdsp::debug::safe;
using soemdsp::debug::default_if_zero;
using soemdsp::debug::default_if_near_zero;

using soemdsp::math::clamp;
using soemdsp::math::clamp01;
using soemdsp::math::clamp11;
using soemdsp::math::clamp_int;
using soemdsp::math::maxd;
using soemdsp::math::mind;
using soemdsp::math::dsp_floor;
using soemdsp::math::dsp_ceil;
using soemdsp::math::dsp_fabs;
using soemdsp::math::near_planck;
using soemdsp::math::silent_planck;
using soemdsp::math::wrap01;
using soemdsp::math::wrap01_frac;
using soemdsp::math::wrap01f;
using soemdsp::math::wrap11;
using soemdsp::math::wrap11_closed;
using soemdsp::math::wrap_radians;
using soemdsp::math::wrap;
using soemdsp::math::safe_bounded;
using soemdsp::math::hash_bipolar;
using soemdsp::math::lerp;
using soemdsp::math::smoothstep01;
using soemdsp::math::ease_in_quad01;
using soemdsp::math::ease_out_quad01;

// using-declaration drops default args â€” keep eps default for modules.
static inline double morph_width01(double morph, double eps = 1.0e-4) {
  return soemdsp::math::morph_width01(morph, eps);
}

using soemdsp::math::naive_trisaw;
using soemdsp::math::naive_trisaw_center;
using soemdsp::math::naive_analog_square;

using soemdsp::math::map01;
using soemdsp::math::map11;
using soemdsp::math::map;
using soemdsp::math::rational_curve01;
using soemdsp::math::rational_curve11;
using soemdsp::math::rational_curve;

using soemdsp::math::sqrt_newton;
using soemdsp::math::xorshift32;

}  // namespace soemdsp_maths
