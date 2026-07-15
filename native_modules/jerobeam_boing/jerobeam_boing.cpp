// soemdsp-native-module: jerobeam_boing
// soemdsp-native-label: Jerobeam Boing
// soemdsp-native-target: boing
// soemdsp-native-kind: jerobeam
//
// Ported from soemdsp/include/soemdsp/oscillator/JerobeamBoing.{h,cpp}
// (Jerobeam Fenderson's "Boing" Gen~ patch). A phasor-driven sphere shape
// run through two rotation stages, a "boing" squash-and-jump nonlinearity,
// and a zDepth-projected render, with the phasor's own frequency modulated
// each sample by a "z darkness" feedback term derived from the previous
// sample's Z.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kTau = 6.28318530717958647692;
struct BoingState {
  bool active;
  double phase;
  double zHistory;
  double outX;
  double outY;
};

static BoingState gPool[kMaxInstances];

// Standard library sin()/cos(): argument already in radians.
// soemdsp::math::sincos(): argument is a 0..1 *cycles* value, not radians.
double dsp_sin_cycles(double y) {
  return dsp_sin(y * kTau);
}

double dsp_cos_cycles(double y) {
  return dsp_cos(y * kTau);
}

// soemdsp::utility::gen::triangle(x, y) == trisaw(wrap(x), y)
double trisaw(double phase, double warp) {
  double safeWarp = clamp(warp, 0.001, 0.999);
  double wrapped = wrap01_frac(phase);
  return wrapped < safeWarp ? wrapped / safeWarp : (1.0 - wrapped) / (1.0 - safeWarp);
}

// asin via Newton refinement on sin (good enough for the fphas-mids reshape,
// whose input is always in [-1, 1]).
double dsp_asin(double x) {
  x = clamp(x, -1.0, 1.0);
  double guess = x * (kHalfPi);  // initial guess, refined below
  for (int i = 0; i < 6; i++) {
    double s = dsp_sin(guess);
    double c = dsp_cos(guess);
    if (c < 1e-9 && c > -1e-9) break;
    guess -= (s - x) / c;
  }
  return clamp(guess, -kHalfPi, kHalfPi);
}

// Fast approximate pow(base, exponent) for base > 0, matching the
// established pattern in native_modules/vactrol_envelope -- a curve-shaping
// approximation, not precision-critical for a chaotic generator.
double dsp_pow(double base, double exponent) {
  if (base <= 0.0) return 0.0;
  union { double d; int x[2]; } u;
  u.d = base;
  u.x[1] = (int)(exponent * (double)(u.x[1] - 1072632447) + 1072632447.0);
  u.x[0] = 0;
  return u.d;
}

double dsp_abs(double x) {
  return x < 0.0 ? -x : x;
}

void sphere(double fphas, double dens, double shape, double& waveX, double& waveY, double& waveZ) {
  const double formula001 = dens * kTau * fphas - 3.0 * dens;
  const double sin001 = dsp_sin_cycles(formula001);
  const double cos001 = dsp_cos_cycles(formula001);
  const double formula002 = shape + (1.0 - shape) * dsp_sin(kPi * (fphas + 1.0));
  waveY = sin001 * formula002;
  waveX = -dsp_cos(kPi * fphas);
  waveZ = cos001 * formula002;
}

void rotate(double inX, double inY, double inZ, double rotX, double rotY, double& outX, double& outY, double& outZ) {
  const double sinX = dsp_sin_cycles(rotX);
  const double cosX = dsp_cos_cycles(rotX);
  const double help11 = inX * cosX - inY * sinX;
  const double help12 = inX * sinX + inY * cosX;
  const double sinY = dsp_sin_cycles(rotY);
  const double cosY = dsp_cos_cycles(rotY);
  const double help21 = help11 * cosY - inZ * sinY;
  const double help22 = help11 * sinY + inZ * cosY;
  outX = help21;
  outY = help12;
  outZ = help22;
}

void boingfunc(double inX, double inY, double inZ, double boing, double strength, double& outX, double& outY, double& outZ) {
  const double formula001 = 1.0 - dsp_pow(boing, 2.0) * strength;
  outX = inX * formula001;
  outY = inY * formula001 * (1.0 - dsp_pow(1.0 - boing, 4.0) * strength) + (dsp_pow(boing, 0.8) * 2.0 - 1.0) * strength;
  outZ = inZ;
}

void render(double inX, double inY, double inZ, double zdepth, double& outL, double& outR) {
  const double zd = dsp_pow(zdepth, 2.0) + 1.0;
  const double exponent = -inZ - zd * 0.2;
  outL = inX * dsp_pow(zd, exponent);
  outR = inY * dsp_pow(zd, exponent);
}

}  // namespace

extern "C" int soemdsp_jbboing_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = BoingState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jbboing_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jbboing_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].phase = 0.0;
  gPool[handle - 1].zHistory = 0.0;
}

extern "C" void soemdsp_jbboing_sample(
  int handle,
  double frequency,
  double density,
  double sharpness,
  double rotX,
  double rotY,
  double zDepth,
  double zAmount,
  double ends,
  double boing,
  double boingStrength,
  double dir,
  double shape,
  double volume,
  double volumePreJump,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  BoingState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double tri = sharpness * 0.5 + 0.5;
  const double rotXTurns = (rotX + 90.0) / 360.0;
  const double rotYTurns = rotY / 360.0;
  const bool prejump = volumePreJump >= 0.5;

  const double zDarkness = dsp_pow(zAmount * zAmount * 5.0 + 1.0, s.zHistory) + dsp_pow(zAmount, 1.5) * 0.22;

  const double fphasEnds = trisaw(s.phase, tri);
  const double fphasMids = dsp_asin((dsp_asin(fphasEnds * 2.0 - 1.0) / kPi + 0.5) * 2.0 - 1.0) / kPi + 0.5;
  const double fphas = ends * fphasMids + (1.0 - ends) * fphasEnds;

  double waveX, waveY, waveZ;
  sphere(fphas, density, shape, waveX, waveY, waveZ);
  rotate(waveX, waveY, waveZ, rotXTurns, rotYTurns, waveX, waveY, waveZ);
  rotate(waveX, waveY, waveZ, -dir, 0.0, waveX, waveY, waveZ);

  if (prejump) {
    waveX *= volume;
    waveY *= volume;
  }

  boingfunc(waveX, waveY, waveZ, boing, boingStrength, waveX, waveY, waveZ);

  waveY *= 1.0 - boingStrength * (0.5 + volume / 2.0) * (-dsp_cos(dir * 8.0 * kPi) / 2.0 + 0.5) * dsp_abs(dsp_pow(waveX * 0.75, 2.0)) * dsp_pow(1.0 - boing, 5.0);

  rotate(waveX, waveY, waveZ, dir, 0.0, waveX, waveY, waveZ);

  double outL, outR;
  render(waveX, waveY, waveZ, zDepth, outL, outR);

  if (!prejump) {
    outL *= volume;
    outR *= volume;
  }

  s.zHistory = waveZ;
  s.outX = outL;
  s.outY = outR;

  s.phase = wrap01_frac(s.phase + (frequency * zDarkness) / safeRate);
}

extern "C" double soemdsp_jbboing_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jbboing_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jbboing_version() {
  return 1;
}
