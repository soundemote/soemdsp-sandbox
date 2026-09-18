// soemdsp-native-module: ellipsoid
// soemdsp-native-label: RoundShape / Ellipsoid
// soemdsp-native-target: ellipsoid
// soemdsp-native-kind: modulator
//
// soemdsp Ellipsoid::getSineToSquare — AA Off | Limit:
//   Limit floors C by ω=2πf/sr (edge slope ≲ 1 sample). Off honors shape as-is.
// soemdsp_ellipsoid_sample — full multi-param ellipsoid oscillator (same AA).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static double ellipseCMin(double frequencyHz, double sampleRate) {
  const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = frequencyHz > 0.0 ? frequencyHz : 0.0;
  return clamp((kTwoPi * f) / sr, 0.0, 1.0);
}

// limitAa: false = Off (pure shape); true = Limit (steepness floor by omega).
static double sineToSquareCore(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  bool limitAa
) {
  const double angle = phaseCycles * kTwoPi;
  const double sinPhase = dsp_sin(angle);
  const double cosPhase = dsp_cos(angle);
  double c = 1.0 - clamp(shape, 0.0, 1.0);
  if (limitAa) {
    const double cFloor = ellipseCMin(frequencyHz, sampleRate);
    if (c < cFloor) c = cFloor;
  }
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

// Full ellipsoid; Limit floors scale by ω (same spirit as C floor).
static double ellipsoidSampleLimited(
  double phaseRadians,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate,
  bool limitAa
) {
  double s = scale < 0.0 ? 0.0 : scale;
  if (limitAa) {
    const double scaleFloor = ellipseCMin(frequencyHz, sampleRate);
    if (s < scaleFloor) s = scaleFloor;
  }
  return ellipsoidSampleLegacy(phaseRadians, offset, shape, s);
}

static bool aaIsLimit(int antialias) {
  // 0 = Off; nonzero = Limit (legacy hosts that passed 1 keep Limit).
  return antialias != 0;
}

}  // namespace

extern "C" double soemdsp_ellipsoid_sine_to_square(double phaseCycles, double shape) {
  // No f / no AA arg → Off (pure shape). Prefer sine_to_square_aa with f.
  return sineToSquareCore(phaseCycles, shape, 0.0, 44100.0, false);
}

// antialias: 0 = Off, nonzero = Limit (steepness floor by omega when f/sr known).
extern "C" double soemdsp_ellipsoid_sine_to_square_aa(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  int antialias
) {
  return sineToSquareCore(
    phaseCycles, shape, frequencyHz, sampleRate, aaIsLimit(antialias)
  );
}

// mode: 0 = Off, nonzero = Limit. phaseIncCycles unused (ABI kept for hosts).
extern "C" double soemdsp_ellipsoid_sine_to_square_mode(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  int mode,
  double /* phaseIncCycles */
) {
  return sineToSquareCore(
    phaseCycles, shape, frequencyHz, sampleRate, aaIsLimit(mode)
  );
}

extern "C" double soemdsp_ellipsoid_sample(
  double phase,
  double offset,
  double shape,
  double scale
) {
  return ellipsoidSampleLegacy(phase, offset, shape, scale);
}

// Full osc path. antialias: 0 = Off, nonzero = Limit (scale floor by f/sr).
extern "C" double soemdsp_ellipsoid_sample_aa(
  double phase,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate,
  int antialias
) {
  return ellipsoidSampleLimited(
    phase, offset, shape, scale, frequencyHz, sampleRate, aaIsLimit(antialias)
  );
}

extern "C" int soemdsp_ellipsoid_version() {
  return 10; // Off | Limit steepness AA
}
