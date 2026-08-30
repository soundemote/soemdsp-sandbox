// Sandbox Native Module Maths -- analog filter family: freestanding
// trig/pow2/exp2.
//
// This block was duplicated byte-for-byte (module names/`static` vs
// `static inline` aside) across the analog-modeled self-oscillating filter
// family: chaotic_phase_locking_filter, flower_child_filter, human_filter,
// resonator_filter, rsmet_filter, superlove_filter, yellowjacket_filter,
// tb303_filter. All of them need sin/cos/2^x for oscillator/pitch-tracking
// math with no libm available in a freestanding wasm32 build, and all
// independently derived the same polynomial approach.
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

union DoubleBits {
  double d;
  unsigned long long u;
};

static const double kPi     = 3.141592653589793238;
static const double kTwoPi  = 6.283185307179586476;
static const double kHalfPi = 1.5707963267948966192;

static inline double poly_sin_0_halfpi(double x) {
  const double x2 = x * x;
  return x * (1.0 + x2 * (-1.6666666666666667e-1 + x2 * (8.3333333333333329e-3 + x2 * (-1.9841269841269841e-4 + x2 * (2.7557319223985888e-6 + x2 * (-2.5052108385441720e-8 + x2 * 1.6059043836821614e-10))))));
}

// x must be in [0, pi]
static inline double dsp_sin_0_pi(double x) {
  if (x > kHalfPi) x = kPi - x;
  return poly_sin_0_halfpi(x);
}

// x must be in [0, pi]
static inline double dsp_cos_0_pi(double x) {
  double y = kHalfPi - x;
  if (y < 0.0) return -poly_sin_0_halfpi(-y);
  return poly_sin_0_halfpi(y);
}

// x must be in (-pi/2, 0]
static inline double dsp_tan_neg_halfquarter(double x) {
  const double ax = -x;
  const double s = poly_sin_0_halfpi(ax);
  const double c = poly_sin_0_halfpi(kHalfPi - ax);
  return (c == 0.0) ? -1e15 : -(s / c);
}

// Full-range sin/cos via quadrant folding onto the [0, pi/2] polynomial.
static inline double dsp_sin(double x) {
  double wrapped = x - kTwoPi * dsp_floor(x / kTwoPi);
  double sign = 1.0;
  if (wrapped >= kPi) {
    wrapped -= kPi;
    sign = -1.0;
  }
  return sign * dsp_sin_0_pi(wrapped);
}

static inline double dsp_cos(double x) {
  return dsp_sin(x + kHalfPi);
}

// ---------------------------------------------------------------------------
// Fast audio-rate trig (no wavetable). Prefer these when phase is already a
// cycle fraction / when both sin and cos of the same angle are needed.
//
// dsp_sin_turns / dsp_cos_turns: argument in *turns* (1.0 = one cycle = 2π).
//   Cheaper range-reduce (floor once into [0,1)) than radian-domain dsp_sin.
// dsp_sin_cos / dsp_sin_cos_turns: one reduce + two poly evals (sin and cos).
// ---------------------------------------------------------------------------

// sin(2π · turns). Any real turns; reduced mod 1.
static inline double dsp_sin_turns(double turns) {
  double p = turns - dsp_floor(turns);
  // p in [0, 1). Fold onto [0, 0.25] with sign for a single half-quadrant poly.
  double sign = 1.0;
  if (p >= 0.5) {
    p -= 0.5;
    sign = -1.0;
  }
  if (p > 0.25) {
    p = 0.5 - p;
  }
  return sign * poly_sin_0_halfpi(p * kTwoPi);
}

// cos(2π · turns) = sin(2π · (turns + 1/4)).
static inline double dsp_cos_turns(double turns) {
  return dsp_sin_turns(turns + 0.25);
}

// Joint sin/cos of the same turn phase — one mod-1 reduce, two polys.
// ~2× cheaper than separate dsp_sin_turns + dsp_cos_turns when both needed.
static inline void dsp_sin_cos_turns(double turns, double* sOut, double* cOut) {
  double p = turns - dsp_floor(turns);
  // Four quadrants of length 0.25; r = offset inside the quadrant.
  int q = (int)(p * 4.0);
  if (q > 3) {
    q = 3;
  }
  const double r = p - 0.25 * (double)q;
  const double sx = poly_sin_0_halfpi(r * kTwoPi);                 // sin(2π r)
  const double sy = poly_sin_0_halfpi((0.25 - r) * kTwoPi);        // cos(2π r)
  switch (q) {
    case 0:  *sOut =  sx; *cOut =  sy; break;
    case 1:  *sOut =  sy; *cOut = -sx; break;
    case 2:  *sOut = -sx; *cOut = -sy; break;
    default: *sOut = -sy; *cOut =  sx; break;
  }
}

// Joint sin/cos in radians — one 2π reduce, then turns joint on the unit interval.
static inline void dsp_sin_cos(double x, double* sOut, double* cOut) {
  const double turns = x * (1.0 / kTwoPi);
  dsp_sin_cos_turns(turns, sOut, cOut);
}

// 2^f for f in [0,1), truncated Taylor series of e^(f*ln2) -- accurate to
// better than 1e-5 relative error, which is far more precision than a
// musical pitch-to-frequency conversion needs.
static inline double pow2_frac(double f) {
  const double c1 = 0.6931471805599453, c2 = 0.2402265069591007,
               c3 = 0.05550410866482158, c4 = 0.009618129107628477,
               c5 = 0.001333355814670365, c6 = 0.0001540353039338161;
  return 1.0 + f * (c1 + f * (c2 + f * (c3 + f * (c4 + f * (c5 + f * c6)))));
}

// Full-range 2^x via integer/fractional split, building the IEEE-754
// exponent bits directly for the integer part and pow2_frac for the
// fractional remainder.
static inline double dsp_exp2(double x) {
  double xi = dsp_floor(x);
  double f = x - xi;
  double p = pow2_frac(f);
  long long n = (long long)xi;
  DoubleBits bits;
  bits.d = p;
  long long expBits = (long long)((bits.u >> 52) & 0x7FF);
  expBits += n;
  if (expBits < 1) expBits = 1;
  if (expBits > 2046) expBits = 2046;
  bits.u = (bits.u & ~(0x7FFULL << 52)) | ((unsigned long long)expBits << 52);
  return bits.d;
}

// Narrow-range exp(x) via dsp_exp2, clamped to +-40 (this filter family
// never needs exp() outside a modest coefficient-computation range).
static inline double dsp_exp_narrow(double x) {
  double clamped = x < -40.0 ? -40.0 : (x > 40.0 ? 40.0 : x);
  return dsp_exp2(clamped * 1.4426950408889634);
}

// exp(x) via x/4 then square twice -- accurate for |x| <= 4. A second,
// independently-derived narrow-range exp approach, previously duplicated
// identically in tb303_filter and passive_filter.
static inline double dsp_exp_squaring(double x) {
  double y = x * 0.25;
  double t = 1.0 + y*(1.0 + y*(0.5 + y*(1.0/6.0 + y*(1.0/24.0 + y*(1.0/120.0 + y*(1.0/720.0 + y/5040.0))))));
  t *= t; t *= t;
  return t;
}

}  // namespace soemdsp_maths
