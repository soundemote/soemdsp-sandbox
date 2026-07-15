// soemdsp-native-module: ellipsoid
// soemdsp-native-label: Ellipsoid
// soemdsp-native-target: ellipsoid
// soemdsp-native-kind: oscillator

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

double wrapRadians(double value) {
  while (value > kPi) {
    value -= kTwoPi;
  }
  while (value < -kPi) {
    value += kTwoPi;
  }
  return value;
}

double sinApprox(double value) {
  const double x = wrapRadians(value);
  const double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 + x2 * (-1.0 / 5040.0))));
}

double cosApprox(double value) {
  return sinApprox(value + kHalfPi);
}

double ellipsoidMono = 0.0;
double ellipsoidX = 0.0;
double ellipsoidY = 0.0;
}  // namespace

extern "C" double soemdsp_ellipsoid_sample(
  double phase,
  double offset,
  double shape,
  double scale
) {
  const double sinPhase = sinApprox(phase);
  const double cosPhase = cosApprox(phase);
  const double shapeRadians = shape * kPi;
  const double shapeSin = sinApprox(shapeRadians);
  const double shapeCos = cosApprox(shapeRadians);
  const double safeOffset = clamp(offset, -1.0, 1.0);
  const double safeScale = scale < 0.0 ? 0.0 : scale;
  const double x = safeOffset + cosPhase;
  const double y = safeScale * sinPhase;
  const double denominator = __builtin_sqrt((x * x) + (y * y));
  if (denominator <= 1.0e-12) {
    return 0.0;
  }
  return clamp(((x * shapeCos) + (y * shapeSin)) / denominator, -1.0, 1.0);
}

extern "C" void soemdsp_ellipsoid_vector_sample(
  double phase,
  double level,
  double offsetX,
  double offsetY,
  double scaleX,
  double scaleY,
  double shapeX,
  double shapeY
) {
  const double x = soemdsp_ellipsoid_sample(phase, offsetX, shapeX, scaleX) * level;
  const double y = soemdsp_ellipsoid_sample(phase - kHalfPi, offsetY, shapeY, scaleY) * level;
  ellipsoidMono = x;
  ellipsoidX = x;
  ellipsoidY = y;
}

extern "C" double soemdsp_ellipsoid_mono() {
  return ellipsoidMono;
}

extern "C" double soemdsp_ellipsoid_x() {
  return ellipsoidX;
}

extern "C" double soemdsp_ellipsoid_y() {
  return ellipsoidY;
}

extern "C" int soemdsp_ellipsoid_version() {
  return 1;
}
