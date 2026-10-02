// Sandbox Native Module Maths -- shared constexpr maths constants.
//
// Canonical home matching soemdsp::constant in include/soemdsp/semath.hpp:
//   soemdsp::constant  -- kPI, kTAU, kPIz2, kPIz4, k4zPI, k1z3, kPHI, ...
// Sandbox-only: kPlanck (universe floor; same as public/node-graph-semath.js),
//               kTauOver44100 (one-pole w clamp at 44.1 kHz),
//               kInvTAU / kInvPI (clear 1/tau and 1/pi spellings).
// Compat aliases: kPi / kTwoPi / kHalfPi / kTau / kQuarterPi / kDegToRad / kInvSqrt2.
// Flat soemdsp_maths:: mirrors every spelling for existing modules.
//
// Naming (semath.hpp): z=divide, juxtapose=multiply, m=minus, p=plus.
// calculate constants here : https://www.mathsisfun.com/scientific-calculator.html
#pragma once

namespace soemdsp::constant {

// Trig (spellings match soemdsp::constant in semath.hpp)
constexpr double kPI         = +3.1415926535897932385; // acos(-1)
constexpr double kA440       = +440.00000000000000000; // pitch of A3 / MIDI 69
constexpr double kPIz2       = +1.5707963267948966192; // acos(0) = pi/2
constexpr double kPIz4       = +0.7853981633974483096; // acos(0)/2 = pi/4
constexpr double k2zPI       = +0.6366197723675813430; // 2/pi
constexpr double k4zPI       = +1.2732395447351626862; // 4/pi
constexpr double kTAU        = +6.2831853071795864769; // 2*pi
constexpr double kInvTAU     = 1.0 / kTAU;             // 1/tau ≈ 0.1591549…
constexpr double kInvPI      = 1.0 / kPI;              // 1/pi  ≈ 0.3183098…
constexpr double ksin_PIx1p5 = -1.0000000000000000000; // sin(pi*1.5)
constexpr double kcos_PIx1p5 = -0.0000000000000000000; // cos(pi*1.5)
constexpr double k1zLN2      = +1.4426950408889634074; // 1/ln(2)
constexpr double k1zSQRT2    = +0.7071067811865475244; // 1/sqrt(2)
constexpr double kSQRT6x2    = +4.8989794855663561964; // sqrt(6)*2
constexpr double kSQRT6z2    = +1.2247448713915890491; // sqrt(6)/2
constexpr double kPHI        = +1.6180339887498948482; // (sqrt(5)+1)/2
constexpr double k1zPHI      = +0.6180339887498948482; // (sqrt(5)-1)/2

// Reciprocal fractions
constexpr double k1z2      = 1.0 / 2.0;
constexpr double k1z3      = 1.0 / 3.0;
constexpr double k1z4      = 1.0 / 4.0;
constexpr double k1z5      = 1.0 / 5.0;
constexpr double k1z6      = 1.0 / 6.0;
constexpr double k1z11     = 1.0 / 11.0;
constexpr double k1z127    = 1.0 / 127.0;
constexpr double k1z180    = 1.0 / 180.0;
constexpr double kPIx1z180 = kPI * k1z180;             // degrees -> radians
constexpr double k1z8192   = 1.0 / 8192.0;
constexpr double k1z16384  = 1.0 / 16384.0;
constexpr double k2z3      = 2.0 / 3.0;

// Universe floor — same number as public/node-graph-semath.js NODE_GRAPH_PLANCK.
// Silence, idle, dirty-near, envelope rest. Not a divide-by-zero guard for
// frequency/scale/period (those keep their own positive floors).
constexpr double kPlanck = 1.0e-7;
// Reciprocal of the universe floor. Ceiling for modules that can explode
// (Divide, 1/x). 1 / 1e-7 = 10,000,000.
constexpr double kInvPlanck = 1.0 / kPlanck;

// One-pole angular-freq clamp: tau / 44100 (caps w at ~44.1 kHz Nyquist-ish).
constexpr double kTauOver44100 = kTAU / 44100.0; // 0.000142475857...

// Compat aliases — old sandbox / module spellings
constexpr double kPi        = kPI;
constexpr double kTwoPi     = kTAU;
constexpr double kHalfPi    = kPIz2;
constexpr double kTau       = kTAU;
constexpr double kQuarterPi = kPIz4;
constexpr double kDegToRad  = kPIx1z180;
constexpr double kInvSqrt2  = k1zSQRT2;

}  // namespace soemdsp::constant

// ---------------------------------------------------------------------------
// Compatibility mirror: existing modules use `using namespace soemdsp_maths`.
// ---------------------------------------------------------------------------
namespace soemdsp_maths {

using soemdsp::constant::kPI;
using soemdsp::constant::kA440;
using soemdsp::constant::kPIz2;
using soemdsp::constant::kPIz4;
using soemdsp::constant::k2zPI;
using soemdsp::constant::k4zPI;
using soemdsp::constant::kTAU;
using soemdsp::constant::kInvTAU;
using soemdsp::constant::kInvPI;
using soemdsp::constant::ksin_PIx1p5;
using soemdsp::constant::kcos_PIx1p5;
using soemdsp::constant::k1zLN2;
using soemdsp::constant::k1zSQRT2;
using soemdsp::constant::kSQRT6x2;
using soemdsp::constant::kSQRT6z2;
using soemdsp::constant::kPHI;
using soemdsp::constant::k1zPHI;

using soemdsp::constant::k1z2;
using soemdsp::constant::k1z3;
using soemdsp::constant::k1z4;
using soemdsp::constant::k1z5;
using soemdsp::constant::k1z6;
using soemdsp::constant::k1z11;
using soemdsp::constant::k1z127;
using soemdsp::constant::k1z180;
using soemdsp::constant::kPIx1z180;
using soemdsp::constant::k1z8192;
using soemdsp::constant::k1z16384;
using soemdsp::constant::k2z3;

using soemdsp::constant::kPlanck;
using soemdsp::constant::kInvPlanck;
using soemdsp::constant::kTauOver44100;

using soemdsp::constant::kPi;
using soemdsp::constant::kTwoPi;
using soemdsp::constant::kHalfPi;
using soemdsp::constant::kTau;
using soemdsp::constant::kQuarterPi;
using soemdsp::constant::kDegToRad;
using soemdsp::constant::kInvSqrt2;

}  // namespace soemdsp_maths