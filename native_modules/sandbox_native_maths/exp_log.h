// Sandbox Native Module Maths -- general-purpose exp()/ln() polyfills.
// Freestanding wasm32 (-nostdlib) has no libm, so every module needing
// exp/log has to bring its own. This is the general-purpose (wide-range,
// no precision shortcuts) version -- ported verbatim from pluck_envelope.cpp,
// previously the only copy. Narrower-range/faster variants used by the
// analog filter family live in analog_filter_trig.h instead, since they
// aren't drop-in replacements for this one (different precision/range
// tradeoffs, not just a faster version of the same function).
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

// General-purpose exp(x) via range reduction: exp(x) = 2^n * exp(f*ln2),
// n = floor(x / ln2), f = x/ln2 - n in [0, 1). The 2^n scale is applied by
// directly building the IEEE-754 exponent bits; exp(f*ln2) (f*ln2 in
// [0, ln2)) uses a Taylor series, which converges fast over that small range.
static inline double dsp_exp(double x) {
  if (x < -700.0) return 0.0;
  if (x > 700.0) return 1e300;
  const double LOG2E = 1.4426950408889634;
  const double LN2 = 0.6931471805599453;
  double t = x * LOG2E;
  long long n = (long long)t;
  if (t < 0.0 && (double)n != t) n -= 1;  // floor
  double f = t - (double)n;
  double y = f * LN2;
  double ey = 1.0 + y*(1.0 + y*(0.5 + y*(1.0/6.0 + y*(1.0/24.0 + y*(1.0/120.0 + y*(1.0/720.0 + y/5040.0))))));
  union { double d; unsigned long long u; } bits;
  bits.u = (unsigned long long)(n + 1023) << 52;
  return ey * bits.d;
}

// Natural log via IEEE-754 exponent/mantissa split (x = m * 2^e, m in [1,2))
// plus the atanh-based series ln(m) = 2*atanh((m-1)/(m+1)), which converges
// quickly since (m-1)/(m+1) stays within [0, 1/3] for m in [1,2).
static inline double dsp_ln(double x) {
  if (x <= 0.0) return -700.0;
  union { double d; unsigned long long u; } bits;
  bits.d = x;
  int e = (int)((bits.u >> 52) & 0x7FF) - 1023;
  bits.u = (bits.u & 0x000FFFFFFFFFFFFFULL) | 0x3FF0000000000000ULL;
  double m = bits.d;
  double y = (m - 1.0) / (m + 1.0);
  double y2 = y * y;
  double series = y * (1.0 + y2*(1.0/3.0 + y2*(1.0/5.0 + y2*(1.0/7.0 + y2*(1.0/9.0 + y2/11.0)))));
  const double LN2 = 0.6931471805599453;
  return 2.0*series + (double)e*LN2;
}

}  // namespace soemdsp_maths

namespace soemdsp::math {

// Amplitude dB <-> linear gain (20*log10). Floor <= -140 dB -> 0.
// Renamed from db_to_lin / lin_to_db (amp naming matches signal gain).
static inline double db_to_amp(double db) {
  const double x = soemdsp::debug::safe(db);
  if (!(x * 0.0 == 0.0)) return 1.0;
  if (x <= -140.0) return 0.0;
  return soemdsp_maths::dsp_exp(x * 0.11512925464970229); // ln(10)/20
}

static inline double amp_to_db(double amp) {
  const double x = soemdsp::debug::safe(amp);
  if (!(x > 0.0)) return -120.0;
  return soemdsp_maths::dsp_ln(x) * 8.685889638065035; // 20/ln(10)
}

// Exponential skew on [0,1]: soemdsp::curve::Exponential style.
// skew clamped to [-0.99, 0.99]; exact zero skew is identity (preserves
// pluck_envelope; exp_adsr/curve_ar keep near-zero via shape_skew -1e-8).
static inline double expo_skew01(double t01, double skew) {
  const double t = clamp(t01, 0.0, 1.0);
  const double s = clamp(skew, -0.99, 0.99);
  if (s == 0.0) return t;
  const double c = 0.5 * (s + 1.0);
  const double a = 2.0 * soemdsp_maths::dsp_ln(maxd(1.0e-12, (1.0 - c) / maxd(1.0e-12, c)))
                   * 0.4342944819032518; // log10
  const double denom = 1.0 - soemdsp_maths::dsp_exp(a);
  return denom == 0.0 ? t : (1.0 - soemdsp_maths::dsp_exp(t * a)) / denom;
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::db_to_amp;
using soemdsp::math::amp_to_db;
using soemdsp::math::expo_skew01;
}  // namespace soemdsp_maths