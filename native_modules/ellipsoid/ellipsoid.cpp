// soemdsp-native-module: ellipsoid
// soemdsp-native-label: RoundShape / Ellipsoid
// soemdsp-native-target: ellipsoid
// soemdsp-native-kind: modulator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/oscillator/Ellipsoid.hpp
//
// soemdsp Ellipsoid::getSineToSquare — AA Off | Limit:
//   Limit floors C by ω=2πf/sr (edge slope ≲ 1 sample). Off honors shape as-is.
// soemdsp_ellipsoid_sample — full multi-param ellipsoid oscillator (same AA).

#include <soemdsp/soemdsp.hpp>

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

// soemdsp::oscillator::Ellipsoid::getEllipsoid (A=offset, B=shape, C=scale).
// 1-D out = unit vector of (A+cos, C·sin) dotted with sincos(B·π).
static double ellipsoidCore(
  double phaseRadians,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate,
  bool limitAa
) {
  const double sinPhase = dsp_sin(phaseRadians);
  const double cosPhase = dsp_cos(phaseRadians);
  const double shapeRadians = shape * kPi;
  const double shapeSin = dsp_sin(shapeRadians);
  const double shapeCos = dsp_cos(shapeRadians);
  const double safeOffset = clamp11(offset);
  double s = scale < 0.0 ? 0.0 : scale;
  if (limitAa) {
    const double scaleFloor = ellipseCMin(frequencyHz, sampleRate);
    if (s < scaleFloor) s = scaleFloor;
  }
  const double ax = safeOffset + cosPhase;
  const double ay = s * sinPhase;
  const double denom = __builtin_sqrt((ax * ax) + (ay * ay));
  double x;
  if (denom <= 1.0e-12) {
    if (ax > 0.0) x = 1.0;
    else if (ax < 0.0) x = -1.0;
    else x = 0.0;
  } else {
    x = ((ax * shapeCos) + (ay * shapeSin)) / denom;
  }
  if (!(x * 0.0 == 0.0)) return 0.0;
  return x;
}

static double ellipsoidSampleLegacy(
  double phaseRadians,
  double offset,
  double shape,
  double scale
) {
  return ellipsoidCore(phaseRadians, offset, shape, scale, 0.0, 44100.0, false);
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
  return ellipsoidCore(
    phaseRadians, offset, shape, scale, frequencyHz, sampleRate, limitAa
  );
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

// Stereo / face: Left = getEllipsoid(phase), Right = getEllipsoid(phase − π/2)
// (quadrature, same as RoundShape Bi X/Y — not the unit-vector perpendicular).
extern "C" void soemdsp_ellipsoid_sample_pair(
  double phase,
  double offset,
  double shape,
  double scale,
  double frequencyHz,
  double sampleRate,
  int antialias,
  double* outX,
  double* outY
) {
  const bool limitAa = aaIsLimit(antialias);
  if (outX) {
    *outX = ellipsoidCore(
      phase, offset, shape, scale, frequencyHz, sampleRate, limitAa
    );
  }
  if (outY) {
    *outY = ellipsoidCore(
      phase - kPi * 0.5, offset, shape, scale, frequencyHz, sampleRate, limitAa
    );
  }
}

// Robin ?1-sample cycle dither (same short/mid/long pick as Supersaw Square AA).
// Returns a phase offset in cycles. Does not change the sine-to-square formula.
extern "C" double soemdsp_ellipsoid_robin_dither_cycles(unsigned int* rng, double cycleSamples) {
  if (!rng) return 0.0;
  double c = cycleSamples;
  if (!(c == c) || c < 2.0) c = 2.0;
  if (c > 1.0e9) c = 1.0e9;
  const double ci = dsp_floor(c);
  const double cf = c - ci;
  double c2 = ci;
  if (cf >= 0.5) c2 += 1.0;
  const double c1 = c2 - 1.0;
  const double c3 = c2 + 1.0;
  const double e1 = c1 - c;
  const double e2 = c2 - c;
  const double e3 = c3 - c;
  const double v1 = e1 * e1;
  const double v2 = e2 * e2;
  const double v3 = e3 * e3;
  const double v = 0.25;
  const double d1 = v - v1;
  const double d2 = v - v2;
  const double d3 = v - v3;
  const double denom = e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3);
  if (!(denom == denom) || denom == 0.0) return 0.0;
  const double s = 1.0 / denom;
  const double probShort = (d2 * e3 - d3 * e2) * s;
  const double probMid = (d3 * e1 - d1 * e3) * s;

  unsigned int state = *rng;
  if (state == 0u) state = 1u;
  state = xorshift32(state);
  *rng = state;
  const double r = static_cast<double>(state >> 8) * (1.0 / 16777216.0);
  double lenNow = c2;
  if (r < probShort) lenNow = c2 - 1.0;
  else if (r >= probShort + probMid) lenNow = c2 + 1.0;
  double maxCount = lenNow - 1.0;
  if (!(maxCount >= 1.0)) maxCount = 1.0;
  const double phaseSlope = 1.0 / maxCount;
  if (lenNow < c2) return -phaseSlope;
  if (lenNow > c2) return phaseSlope;
  return 0.0;
}

extern "C" int soemdsp_ellipsoid_version() {
  return 13; // optional Robin cycle dither (phase offset only)
}
