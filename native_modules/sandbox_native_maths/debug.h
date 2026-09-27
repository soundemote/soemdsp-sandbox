// Sandbox Native Module Maths -- debug / sanitize helpers.
// Nested soemdsp::debug (inspired by soemdsp/sehelper.hpp BADVAL / NaN checks).
// Freestanding: no libm, no <cmath>.
#pragma once

namespace soemdsp::debug {

// IEEE NaN: only NaN fails x == x.
static inline bool is_nan(double x) { return !(x == x); }

// NaN or Inf. Same predicate as the old soemdsp_maths::safe guard
// (x*0.0 == 0.0 is true for every finite x, false for NaN/+-Inf).
static inline bool is_bad(double x) { return !(x * 0.0 == 0.0); }

// NaN/Inf sanitize matching JS nodeGraphSafeFilterNumber-style helpers.
static inline double safe(double x) { return is_bad(x) ? 0.0 : x; }

// Exact-zero -> fallback (missing / unset param defaults).
// Header-only inline: MSVC may not stop inside the body; break on call sites.
static inline double default_if_zero(double value, double fallback) {
  return value == 0.0 ? fallback : value;
}

}  // namespace soemdsp::debug