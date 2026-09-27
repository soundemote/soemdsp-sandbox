// Sandbox Native Module Maths -- basic scalar helpers with no libm
// dependency, used by nearly every native_modules/*.cpp.
//
// Canonical homes (nested, matching soemdsp):
//   soemdsp::debug  -- safe / is_bad / is_nan  (see debug.h)
//   soemdsp::math   -- clamp, clamp01, wrap01, floor/ceil, ...
// Flat soemdsp_maths:: is a compatibility mirror for existing modules.
#pragma once

#include "debug.h"

namespace soemdsp::math {

// Universe floor — same number as public/node-graph-semath.js NODE_GRAPH_PLANCK.
// Silence, idle, dirty-near, envelope rest. Not a divide-by-zero guard for
// frequency/scale/period (those keep their own positive floors).
constexpr double kPlanck = 1.0e-7;

static inline double clamp(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
static inline double clamp01(double x) { return clamp(x, 0.0, 1.0); }
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
  return dsp_fabs(a - b) < kPlanck;
}

static inline bool silent_planck(double x) {
  return dsp_fabs(x) < kPlanck;
}

// x - floor(x), wrapped into [0, 1).
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

}  // namespace soemdsp::math

// ---------------------------------------------------------------------------
// Compatibility mirror: existing modules use `using namespace soemdsp_maths`.
// ---------------------------------------------------------------------------
namespace soemdsp_maths {

using soemdsp::debug::is_nan;
using soemdsp::debug::is_bad;
using soemdsp::debug::safe;

using soemdsp::math::kPlanck;
using soemdsp::math::clamp;
using soemdsp::math::clamp01;
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
using soemdsp::math::safe_bounded;
using soemdsp::math::hash_bipolar;

}  // namespace soemdsp_maths