// Sandbox Native Module Maths -- basic scalar helpers with no libm
// dependency, used by nearly every native_modules/*.cpp.
#pragma once

namespace soemdsp_maths {

// Universe floor — same number as public/node-graph-semath.js NODE_GRAPH_PLANCK.
// Silence, idle, dirty-near, envelope rest. Not a divide-by-zero guard for
// frequency/scale/period (those keep their own positive floors).
constexpr double kPlanck = 1.0e-7;

// NaN/Inf guard matching the JS `nodeGraphSafeFilterNumber`-style sanitizers:
// x*0.0 == 0.0 is true for every finite x and false for NaN/+-Inf.
static inline double safe(double x) { return x * 0.0 == 0.0 ? x : 0.0; }

static inline double clamp(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
static inline int clamp_int(int x, int lo, int hi) { return x < lo ? lo : (x > hi ? hi : x); }

static inline double maxd(double a, double b) { return a > b ? a : b; }
static inline double mind(double a, double b) { return a < b ? a : b; }

// floor()/ceil() without libm (freestanding wasm32 has no libc).
static inline double dsp_floor(double x) {
  if (!(x * 0.0 == 0.0)) return 0.0;
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

// x - floor(x), wrapped into [0, 1). Previously duplicated identically in
// dsf_oscillator, polyblep, and surge_oscillator.
static inline double wrap01(double value) {
  double f = value - dsp_floor(value);
  if (f < 0.0) f += 1.0;
  if (f >= 1.0) f -= 1.0;
  return f;
}

// Plain fractional part: x - floor(x), with no extra range-safety branches
// (unlike wrap01 above -- mathematically always in [0,1) for finite x, but
// kept as a separate name since it isn't a byte-identical copy of wrap01).
// Previously duplicated identically (modulo __builtin_floor vs dsp_floor,
// which compute the same result) across the jerobeam family and the
// spiral/basic_oscillator group.
static inline double wrap01_frac(double value) {
  return value - dsp_floor(value);
}

// NaN/Inf AND extreme-magnitude guard (blanks anything beyond +-1e300, not
// just non-finite values) -- used by the chaotic-attractor/map family
// (chua_attractor, henon_map, logistic_map, videoscope) to catch a
// blown-up-but-still-technically-finite state before it propagates.
// Distinct from `safe` above (which only catches actual NaN/Inf) -- not a
// drop-in replacement, so kept as its own name rather than merged.
static inline double safe_bounded(double v) {
  return (v == v && v > -1.0e300 && v < 1.0e300) ? v : 0.0;
}

// MurmurHash3 fmix32, matching the JS hashBipolar bit-for-bit (unsigned
// 32-bit multiply/xor wraps identically to Math.imul in JS). Returns a
// value in [-1, 1).
static inline double hash_bipolar(unsigned int index, unsigned int seed) {
  unsigned int value = index ^ seed;
  value = (unsigned int)(value ^ (value >> 16)); value = (unsigned int)(value * 2246822507u);
  value = (unsigned int)(value ^ (value >> 13)); value = (unsigned int)(value * 3266489909u);
  value = (unsigned int)(value ^ (value >> 16));
  return ((double)value / 4294967295.0) * 2.0 - 1.0;
}

}  // namespace soemdsp_maths
