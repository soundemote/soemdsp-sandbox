// RAPT / rosic helpers needed to compile Robin Schmidt's rsFlatZapper reference
// (native_modules/robin_sinepulse_allpass/originalcode/) outside RS-MET, for
// scripts/parity_robin_sinepulse_allpass.cpp. Bodies copied verbatim from RS-MET
// (branch work, Libraries/RobsJuceModules/rapt/):
//   rsRationalMap_01        Math/Functions/RealFunctions.h
//   rsLinToExp              Math/Functions/BasicMathFunctions.h
//   rsIsEven, rsMax         Basics/BasicFunctions.h
//   rsSinCos                Math/Functions/BasicMathFunctions.h (sin and cos of one angle)
//   rsLogB                  Math/Functions/RealFunctions.h
// rsFilterAnalyzer is only declared (unused frequency-response helpers).
// rsPow is std::pow; rsError / RS_DEBUG_BREAK are debug-only in RS-MET and are
// no-ops here. rosic::BiquadDesigner is declared with only the three allpass
// helpers rsFlatZapper calls (definitions: originalcode/rosic_BiquadDesigner_Allpass.h).
#pragma once

#include <cmath>
#include <complex>

#ifndef INLINE
#define INLINE inline
#endif
#define RS_DEBUG_BREAK

static const double PI = 3.1415926535897932384626433832795;

namespace RAPT {

inline void rsError(const char* = nullptr) {}

template<class T> inline T rsPow(T base, T exponent) { return std::pow(base, exponent); }

template<class T> inline bool rsIsEven(T x) { return x % 2 == 0; }

template<class T> inline T rsMax(T in1, T in2) { return in1 > in2 ? in1 : in2; }

template<class T> inline T rsLogB(T x, T b) { return log(x) / log(b); }

template<class T> inline void rsSinCos(T x, T* sinResult, T* cosResult)
{
  *sinResult = sin(x);
  *cosResult = cos(x);
}

// rsBiquadCascade's frequency-response helpers name it; parity never calls them.
template<class T> struct rsFilterAnalyzer { static const int NO_ACCUMULATION = 0; };

template<class T>
inline T rsLinToExp(T in, T inMin, T inMax, T outMin, T outMax)
{
  // map input to the range 0.0...1.0:
  T tmp = (in - inMin) / (inMax - inMin);

  // map the tmp-value exponentially to the range outMin...outMax:
  return outMin * std::exp(tmp * (log(outMax / outMin)));
}

template<class T>
T rsRationalMap_01(T x, T a)
{
  T ax = a*x;
  return (ax+x) / (2*ax - a + 1); // 2 mul, 2 add, 1 sub, 1 div
}

}  // namespace RAPT

namespace rosic {

class BiquadDesigner
{
public:
  static INLINE void calculateSineAndCosine(double& sinResult, double& cosResult,
    const double& frequency, const double& oneOverSampleRate);
  static INLINE void calculateFirstOrderAllpassCoeffs(double& b0, double& b1, double& b2,
    double& a1, double& a2, const double& oneOverSampleRate, const double& frequency);
  static INLINE void calculateCookbookAllpassCoeffs(double& b0, double& b1, double& b2,
    double& a1, double& a2, const double& oneOverSampleRate, const double& frequency,
    const double& q);
};

}  // namespace rosic
