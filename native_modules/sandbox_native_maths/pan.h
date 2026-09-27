// Sandbox Native Module Maths -- equal-power stereo pan gains.
// Nested soemdsp::math::pan_gains. Matches mix_stereo + graph_engine.
#pragma once

#include "analog_filter_trig.h"

namespace soemdsp::math {

// Equal-power pan in [-1, +1]: left=1 when p<=0, right=1 when p>=0,
// other side = cos(|p| * pi/2).
static inline void pan_gains(double pan, double* left, double* right) {
  const double p = clamp11(soemdsp::debug::safe(pan));
  if (p <= 0.0) {
    *left = 1.0;
    *right = soemdsp_maths::dsp_cos(-p * soemdsp::constant::kPIz2);
    return;
  }
  *left = soemdsp_maths::dsp_cos(p * soemdsp::constant::kPIz2);
  *right = 1.0;
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::pan_gains;
}  // namespace soemdsp_maths
