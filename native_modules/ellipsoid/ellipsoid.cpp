// soemdsp-native-module: ellipsoid
// soemdsp-native-label: RoundShape / Ellipsoid
// soemdsp-native-target: ellipsoid
// soemdsp-native-kind: modulator
//
// soemdsp Ellipsoid::getSineToSquare — Limit AA always on:
//   floor C by ω=2πf/sr (edge slope ≲ 1 sample).
// soemdsp_ellipsoid_sample — full multi-param ellipsoid oscillator.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static double ellipseCMin(double frequencyHz, double sampleRate) {
  const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = frequencyHz > 0.0 ? frequencyHz : 0.0;
  return clamp((kTwoPi * f) / sr, 0.0, 1.0);
}

// Always Limit: geometric C floor when frequency/sampleRate known.
static double sineToSquareCore(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate
) {
  const double angle = phaseCycles * kTwoPi;
  const double sinPhase = dsp_sin(angle);
  const double cosPhase = dsp_cos(angle);
  double c = 1.0 - clamp(shape, 0.0, 1.0);
  const double cFloor = ellipseCMin(frequencyHz, sampleRate);
  if (c < cFloor) c = cFloor;
  const double xx = (cosPhase * cosPhase) + (sinPhase * c) * (sinPhase * c);
  if (xx <= 1.0e-24) {
    if (cosPhase > 0.0) return 1.0;
    if (cosPhase < 0.0) return -1.0;
    return 0.0;
  }
  const double out = cosPhase / __builtin_sqrt(xx);
  if (!(out * 0.0 == 0.0)) return 0.0;
  return out;
}

static double ellipsoidSampleLegacy(
  double phaseRadians,
  double offset,
  double shape,
  double scale
) {
  const double sinPhase = dsp_sin(phaseRadians);
  const double cosPhase = dsp_cos(phaseRadians);
  const double shapeRadians = shape * kPi;
  const double shapeSin = dsp_sin(shapeRadians);
  const double shapeCos = dsp_cos(shapeRadians);
  const double safeOffset = clamp(offset, -1.0, 1.0);
  const double safeScale = scale < 0.0 ? 0.0 : scale;
  const double ax = safeOffset + cosPhase;
  const double ay = safeScale * sinPhase;
  const double denom = __builtin_sqrt((ax * ax) + (ay * ay));
  if (denom <= 1.0e-12) {
    if (ax > 0.0) return 1.0;
    if (ax < 0.0) return -1.0;
    return 0.0;
  }
  const double out = ((ax * shapeCos) + (ay * shapeSin)) / denom;
  if (!(out * 0.0 == 0.0)) return 0.0;
  return out;
}

// Full ellipsoid with Limit-style scale floor (same ω idea as C floor).
static double ellipsoidSampleLimited(
  double phaseRadians,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate
) {
  const double scaleFloor = ellipseCMin(frequencyHz, sampleRate);
  double s = scale < 0.0 ? 0.0 : scale;
  // Soft edge: prevent scale→0 (pointy/aliased) at high f, same spirit as C floor.
  if (s < scaleFloor) s = scaleFloor;
  return ellipsoidSampleLegacy(phaseRadians, offset, shape, s);
}

}  // namespace

extern "C" double soemdsp_ellipsoid_sine_to_square(double phaseCycles, double shape) {
  // No f → pure shape (C floor 0). Prefer sine_to_square_aa / _mode with f.
  return sineToSquareCore(phaseCycles, shape, 0.0, 44100.0);
}

// antialias ignored — Limit is always on when f/sr provided.
extern "C" double soemdsp_ellipsoid_sine_to_square_aa(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  int /* antialias */
) {
  return sineToSquareCore(phaseCycles, shape, frequencyHz, sampleRate);
}

// mode ignored — Limit always. ABI kept for hosts.
extern "C" double soemdsp_ellipsoid_sine_to_square_mode(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  int /* mode */,
  double /* phaseIncCycles */
) {
  return sineToSquareCore(phaseCycles, shape, frequencyHz, sampleRate);
}

extern "C" double soemdsp_ellipsoid_sample(
  double phase,
  double offset,
  double shape,
  double scale
) {
  return ellipsoidSampleLegacy(phase, offset, shape, scale);
}

// Full osc path with Limit (scale floor by f/sr).
extern "C" double soemdsp_ellipsoid_sample_aa(
  double phase,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate
) {
  return ellipsoidSampleLimited(phase, offset, shape, scale, frequencyHz, sampleRate);
}

extern "C" int soemdsp_ellipsoid_version() {
  return 9; // Limit always; no Auto/None mode switch
}
