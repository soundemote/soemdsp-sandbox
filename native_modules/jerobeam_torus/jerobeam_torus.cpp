// soemdsp-native-module: jerobeam_torus
// soemdsp-native-label: Jerobeam Torus
// soemdsp-native-target: torus
// soemdsp-native-kind: jerobeam
//
// Ported from soemdsp/include/soemdsp/oscillator/JerobeamTorus.{h,cpp}
// (Jerobeam Fenderson's "Torus" Gen~ patch). Six independent phasors (main,
// wander, X/Y/Z rotators, dark-angle) drive a 3-layer nested spiral that's
// rotated and zDepth-projected. Note: per the reference header, the X/Y/Z
// rotator and dark-angle phasors have no exposed frequency setter, so they
// always ramp at Phasor's default 1.0 Hz baseline in addition to their
// user-controlled phase offset -- replicated here exactly.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kTau = 6.28318530717958647692;
struct TorusState {
  bool active;
  double phase;
  double wanderPhase;
  double xPhase;
  double yPhase;
  double zPhase;
  double darkAnglePhase;
  double outX;
  double outY;
};

static TorusState gPool[kMaxInstances];

double dsp_sign(double v) {
  return (v > 0.0) - (v < 0.0);
}

double dsp_abs(double v) {
  return v < 0.0 ? -v : v;
}

// soemdsp::math::sincos(): argument is a 0..1 *cycles* value, not radians.
double dsp_sin_cycles(double y) {
  return dsp_sin(y * kTau);
}

double dsp_cos_cycles(double y) {
  return dsp_cos(y * kTau);
}

double trisaw(double phase, double warp) {
  double safeWarp = clamp(warp, 0.001, 0.999);
  double wrapped = wrap01_frac(phase);
  return wrapped < safeWarp ? wrapped / safeWarp : (1.0 - wrapped) / (1.0 - safeWarp);
}

// Fast approximate pow(base, exponent) for base > 0, same pattern used in
// native_modules/vactrol_envelope and jerobeam_boing.
double dsp_pow(double base, double exponent) {
  if (base == 0.0) return 0.0;
  const double sign = base < 0.0 ? -1.0 : 1.0;
  const double absBase = dsp_abs(base);
  union { double d; int x[2]; } u;
  u.d = absBase;
  u.x[1] = (int)(exponent * (double)(u.x[1] - 1072632447) + 1072632447.0);
  u.x[0] = 0;
  // dsp_pow only needs to support odd integer exponents on negative bases
  // here (the "dank" exponent); apply the sign back for odd exponents.
  const bool oddIntExponent = exponent == __builtin_trunc(exponent) && (((long long)exponent) & 1);
  return oddIntExponent ? sign * u.d : u.d;
}

void rotate(double inX, double inY, double inZ, double rotX, double rotY, double rotZ, double& outX, double& outY, double& outZ) {
  const double sinX = dsp_sin_cycles(rotX);
  const double cosX = dsp_cos_cycles(rotX);
  const double help11 = inX * cosX - inY * sinX;
  const double help12 = inX * sinX + inY * cosX;
  const double sinY = dsp_sin_cycles(rotY);
  const double cosY = dsp_cos_cycles(rotY);
  const double help21 = help11 * cosY - inZ * sinY;
  const double help22 = help11 * sinY + inZ * cosY;
  const double sinZ = dsp_sin_cycles(rotZ);
  const double cosZ = dsp_cos_cycles(rotZ);
  const double help31 = help21 * cosZ - help12 * sinZ;
  const double help32 = help21 * sinZ + help12 * cosZ;
  outX = help31;
  outY = help32;
  outZ = help22;
}

void render(double inX, double inY, double inZ, double zaspx, double zaspy, double zdepth, double& outL, double& outR) {
  const double formula001 = zdepth * (inZ / 2.0 + 0.5);
  const double half = 0.5 * zaspx * zdepth;
  outL = inX - formula001 * (inX - zaspx) - half;
  outR = inY - formula001 * (inY + zaspy) + half;
}

}  // namespace

extern "C" int soemdsp_jbtorus_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = TorusState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jbtorus_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jbtorus_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  TorusState& s = gPool[handle - 1];
  s.phase = 0.0;
  s.wanderPhase = 0.0;
  s.xPhase = 0.0;
  s.yPhase = 0.0;
  s.zPhase = 0.0;
  s.darkAnglePhase = 0.0;
}

extern "C" void soemdsp_jbtorus_sample(
  int handle,
  double frequency,
  double density,
  double quantizeDensity,
  double subdensity,
  double quantizeSubDensity,
  double sharp,
  double size,
  double length,
  double balance,
  double wander,
  double darkAngle,
  double darkIntensity,
  double rotX,
  double rotY,
  double rotZ,
  double zAngleX,
  double zAngleY,
  double zDepth,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  TorusState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double dense = quantizeDensity >= 0.5 ? __builtin_floor(density) : density;
  const double pow2Dense = dense * dense;
  const double sdens = quantizeSubDensity >= 0.5
    ? __builtin_floor(pow2Dense * subdensity) * kTau
    : pow2Dense * subdensity * kTau;
  const double div = size == 0.0 ? 1.0 : (1.0 / size);
  const double volCorrect = 1.0 / (1.0 + size + size * div);
  const double zdepthZ2 = zDepth / 2.0;
  const double dank = __builtin_trunc(darkIntensity) * 2.0 + 1.0;
  const double wanderFreq = dense == 0.0 ? 0.0 : (wander / dense);

  const double dangle = wrap01_frac(s.darkAnglePhase + darkAngle) + 0.5;
  const double rotXValue = -kTau * (wrap01_frac(s.xPhase + rotX) + 1.0);
  const double rotYValue = kTau * wrap01_frac(s.yPhase + rotY) - kHalfPi;
  const double rotZValue = kHalfPi - kTau * wrap01_frac(s.zPhase + rotZ);

  const double triphase = trisaw(s.phase, sharp);
  const double phasRaw = triphase * length - rotXValue / kTau;
  const double phas = phasRaw - __builtin_floor(phasRaw);

  const double blend = dsp_sin(rotYValue);
  const double normPhas = phas * (1.0 - 0.5 * dsp_abs(blend));
  const double phasBipolar = phas * 2.0 - 1.0;
  const double dankedPos = 0.5 * clamp(blend, 0.0, 1.0) * (dsp_pow(phasBipolar, dank) + 1.0) / 2.0;
  const double phasPlusHalf = phas + 0.5;
  const double phasPlusHalfWrapped = phasPlusHalf - __builtin_floor(phasPlusHalf);
  const double dankedNeg = 0.5 * clamp(-blend, 0.0, 1.0) * (0.5 * dsp_pow(phasPlusHalfWrapped * 2.0 - 1.0, dank) + (dsp_sign(phasBipolar) + 1.0) / 2.0);
  const double phasor = normPhas + dankedPos + dankedNeg + 0.25 + rotXValue / kTau + dangle;

  const double sp0sin = dsp_sin_cycles(phasor);
  const double sp0cos = dsp_cos_cycles(phasor);
  const double spiral0X = sp0sin;
  const double spiral0Y = sp0cos;
  const double spiral0Z = 0.0;

  const double sp1sin = dsp_sin_cycles(dense * phasor);
  const double sp1cos = dsp_cos_cycles(dense * phasor);
  const double formula001 = (1.0 - balance) / div;
  const double formula002 = formula001 * sp1sin;
  const double spiral1X = formula002 * sp0sin;
  const double spiral1Y = formula002 * sp0cos;
  const double spiral1Z = formula001 * sp1cos;

  const double sp2sin = dsp_sin_cycles(sdens * (phasor + s.wanderPhase));
  const double sp2cos = dsp_cos_cycles(sdens * (phasor + s.wanderPhase));
  const double balZDivXDiv = balance / (div * div);
  const double spiral2X = balZDivXDiv * (sp2cos * sp0cos + sp2sin * sp1sin * sp0sin);
  const double spiral2Y = balZDivXDiv * (sp2cos * -sp0sin + sp2sin * sp1sin * sp0cos);
  const double spiral2Z = balZDivXDiv * sp2sin * sp1cos;

  const double formula003 = volCorrect + zdepthZ2 - volCorrect * zdepthZ2;
  double waveX = (spiral0X + spiral1X + spiral2X) * formula003;
  double waveY = (spiral0Y + spiral1Y + spiral2Y) * formula003;
  double waveZ = (spiral0Z + spiral1Z + spiral2Z) * formula003;

  rotate(waveX, waveY, waveZ, rotXValue, rotYValue, rotZValue, waveX, waveY, waveZ);

  double outL, outR;
  render(waveX, waveY, waveZ, zAngleX, zAngleY, zDepth, outL, outR);

  s.outX = outL;
  s.outY = outR;

  s.phase = wrap01_frac(s.phase + frequency / safeRate);
  s.wanderPhase = wrap01_frac(s.wanderPhase + wanderFreq / safeRate);
  s.xPhase = wrap01_frac(s.xPhase + 1.0 / safeRate);
  s.yPhase = wrap01_frac(s.yPhase + 1.0 / safeRate);
  s.zPhase = wrap01_frac(s.zPhase + 1.0 / safeRate);
  s.darkAnglePhase = wrap01_frac(s.darkAnglePhase + 1.0 / safeRate);
}

extern "C" double soemdsp_jbtorus_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jbtorus_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jbtorus_version() {
  return 1;
}
