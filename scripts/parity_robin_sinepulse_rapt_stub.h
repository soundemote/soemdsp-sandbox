// RAPT helpers needed to compile Robin Schmidt's rsSweepKicker reference
// (native_modules/robin_sinepulse/originalcode/) outside RS-MET, for
// scripts/parity_robin_sinepulse.cpp. Bodies copied verbatim from RS-MET
// (branch work, Libraries/RobsJuceModules/rapt/):
//   rsTriSaw, rsMidiKeyAndVelToFreqFactor   AudioBasics/AudioFunctions.h
//   rsRationalMap_01                        Math/Functions/RealFunctions.h
//   rsLinToLin, rsRoundToInt, rsSign        Math/Functions/BasicMathFunctions.h
//   rsWrapAround                            Math/Functions/BasicMathFunctions.cpp
//   rsSin, rsAbs, rsMin                     Basics/BasicFunctions.h
// rsAssert / rsError are debug-only in RS-MET and are no-ops here.
#pragma once

#include <cmath>
#include <functional>

#ifndef INLINE
#define INLINE inline
#endif

static const double PI = 3.1415926535897932384626433832795;

namespace RAPT {

inline void rsAssert(bool, const char* = nullptr) {}
inline void rsError(const char* = nullptr) {}

template<class T> inline T rsSin(T x) { return std::sin(x); }
inline double rsAbs(double x) { return fabs(x); }
template<class T> inline T rsMin(T in1, T in2) { return in1 < in2 ? in1 : in2; }

template<class T>
inline T rsLinToLin(T in, T inMin, T inMax, T outMin, T outMax)
{ return outMin + (outMax-outMin) * (in-inMin) / (inMax-inMin); }

template <class T>
inline int rsRoundToInt(T x) { return (int) ::round(x); }

template <class T>
inline T rsSign(T x) { return T(T(0) < x) - (x < T(0)); }

inline double rsWrapAround(double numberToWrap, double length)
{
  while(numberToWrap < 0.0)
    numberToWrap += length;
  return fmod(numberToWrap, length);
}

template<class T>
T rsRationalMap_01(T x, T a)
{
  T ax = a*x;
  return (ax+x) / (2*ax - a + 1); // 2 mul, 2 add, 1 sub, 1 div
}

template<class T>
inline T rsMidiKeyAndVelToFreqFactor(int key, int vel, T keytrack, T veltrack,
  int refKey = 69, int refVel = 64)
{
  return   pow( T(2), (T(0.01/12.0)*keytrack)*(key-T(refKey)) )
         * pow( T(2), (T(0.01/63.0)*veltrack)*(vel-T(refVel)) );
}

template<class T>
T rsTriSaw(T x, T p)
{
  x *= T(1/(2*PI));   // We expect the phase argument x in 0..2*pi but the code below needs 0..1.
  x = rsWrapAround(x, 1.0); // New
  T r2 = 0.25*(p+1);
  if(x < r2)
    return x / r2;
  else if(x > 1-r2)
    return (x-1)/r2;
  else
    return 2*(r2-x)/(1-2*r2) + 1;
}

}  // namespace RAPT
