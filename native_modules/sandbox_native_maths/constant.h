// Sandbox Native Module Maths -- shared constexpr maths constants.
//
// Canonical home matching soemdsp::constant in include/soemdsp/semath.hpp:
//   soemdsp::constant  -- kPI, kTAU, kPIz2, k1z3, ...
// Sandbox-only: kPlanck (universe floor; same as public/node-graph-semath.js).
// Compat aliases: kPi / kTwoPi / kHalfPi / kTau (old sandbox spellings).
// Flat soemdsp_maths:: mirrors both spellings for existing modules.
#pragma once

namespace soemdsp::constant {

// Trig (spellings match soemdsp::constant in semath.hpp)
constexpr double kPI    = +3.1415926535897932385;  // acos(-1)
constexpr double kPIz2  = +1.5707963267948966192;  // acos(0) = pi/2
constexpr double kTAU   = +6.2831853071795864769;  // 2*pi

// Reciprocal fractions used by shared helpers
constexpr double k1z3   = 1.0 / 3.0;

// Universe floor — same number as public/node-graph-semath.js NODE_GRAPH_PLANCK.
// Silence, idle, dirty-near, envelope rest. Not a divide-by-zero guard for
// frequency/scale/period (those keep their own positive floors).
constexpr double kPlanck = 1.0e-7;

// Compat aliases — old sandbox spellings (kPi / kTwoPi / kHalfPi / kTau)
constexpr double kPi     = kPI;
constexpr double kTwoPi  = kTAU;
constexpr double kHalfPi = kPIz2;
constexpr double kTau    = kTAU;

}  // namespace soemdsp::constant

// ---------------------------------------------------------------------------
// Compatibility mirror: existing modules use `using namespace soemdsp_maths`.
// ---------------------------------------------------------------------------
namespace soemdsp_maths {

using soemdsp::constant::kPI;
using soemdsp::constant::kPIz2;
using soemdsp::constant::kTAU;
using soemdsp::constant::k1z3;
using soemdsp::constant::kPlanck;

using soemdsp::constant::kPi;
using soemdsp::constant::kTwoPi;
using soemdsp::constant::kHalfPi;
using soemdsp::constant::kTau;

}  // namespace soemdsp_maths