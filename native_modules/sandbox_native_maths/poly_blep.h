// Sandbox Native Module Maths -- PolyBLEP / PolyBLAMP residuals.
// Nested soemdsp::math::poly_blep / poly_blamp (kills local blepSoem / blampSoem).
// Matches soemdsp::oscillator::PolyBLEP::blep / blamp (quadratic / cubic).
// Freestanding: no libm.
#pragma once

namespace soemdsp::math {

namespace detail {
constexpr double k1z3 = 1.0 / 3.0;
}

// Quadratic PolyBLEP residual around a unit-interval discontinuity.
// dt <= 0 (e.g. 0 Hz): no correction -- callers own any floor/clamp policy.
static inline double poly_blep(double t, double dt) {
  if (!(dt > 0.0)) return 0.0;
  if (t < dt) {
    const double u = t / dt - 1.0;
    return -(u * u);
  }
  if (t > 1.0 - dt) {
    const double u = (t - 1.0) / dt + 1.0;
    return u * u;
  }
  return 0.0;
}

// Cubic PolyBLAMP residual around a slope discontinuity (triangles, rect-sin).
static inline double poly_blamp(double t, double dt) {
  if (!(dt > 0.0)) return 0.0;
  if (t < dt) {
    const double u = t / dt - 1.0;
    return -detail::k1z3 * u * u * u;
  }
  if (t > 1.0 - dt) {
    const double u = (t - 1.0) / dt + 1.0;
    return detail::k1z3 * u * u * u;
  }
  return 0.0;
}

}  // namespace soemdsp::math

// Compatibility mirror for modules that using namespace soemdsp_maths.
namespace soemdsp_maths {
using soemdsp::math::poly_blep;
using soemdsp::math::poly_blamp;
}  // namespace soemdsp_maths
