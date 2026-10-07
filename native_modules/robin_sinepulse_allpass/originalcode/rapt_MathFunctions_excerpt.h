// Excerpt from RS-MET (Robin Schmidt), branch work:
// Libraries/RobsJuceModules/rapt/Math/Functions/BasicMathFunctions.h, rapt/Math/Functions/RealFunctions.h
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Math/Functions/BasicMathFunctions.h, rapt/Math/Functions/RealFunctions.h
// Only rsLinToExp (BasicMathFunctions.h lines 297-305) and rsRationalMap_01 (RealFunctions.h lines 691-702), copied unmodified.
// Used with Robin's permission (2026-10-06, docs/KICK_PLAN.md).
// Reference only: not compiled into the sandbox (the port is ../robin_sinepulse_allpass.cpp).

// ===== BasicMathFunctions.h =====
template<class T>
inline T rsLinToExp(T in, T inMin, T inMax, T outMin, T outMax)
{
  // map input to the range 0.0...1.0:
  T tmp = (in - inMin) / (inMax - inMin);

  // map the tmp-value exponentially to the range outMin...outMax:
  return outMin * std::exp(tmp * (log(outMax / outMin)));
}

// ===== RealFunctions.h =====
template<class T>
T rsRationalMap_01(T x, T a)
{
  T ax = a*x;
  return (ax+x) / (2*ax - a + 1); // 2 mul, 2 add, 1 sub, 1 div

  // The function can also be written more aestetically as:
  //   f(x) = ((1+a)*x) / (2*a*x + (1-a))  // 3 mul, 2 add, 1 sub, 1 div
  // from which we can also read off the Moebius transform coeffs more directly as
  // 1+a, 0, 2*a, 1-a.
}

