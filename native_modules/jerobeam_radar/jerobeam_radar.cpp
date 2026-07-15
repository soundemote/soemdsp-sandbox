// soemdsp-native-module: jerobeam_radar
// soemdsp-native-label: Jerobeam Radar
// soemdsp-native-target: radar
// soemdsp-native-kind: jerobeam
//
// Ported from soemdsp/include/soemdsp/oscillator/JerobeamRadar.{h,cpp}
// (Jerobeam Fenderson's "Radar" Gen~ patch). A polar-coordinate scanner:
// X/Y project onto a circular shape (update_x_y), then render() sweeps a
// triangle/pow-shaped phasor through that polar frame with an independent
// rotator layer. Per the reference header, the rotator phasor has no
// exposed frequency setter, so it always ramps at Phasor's default 1.0 Hz
// baseline in addition to its user-controlled phase offset (rotation) --
// replicated here exactly, same quirk as jerobeam_torus's rotators.
//
// update_x_y() calls atan() directly (radians), which -nostdlib has no
// libm for; dsp_atan below is a minimax-polynomial approximation with
// range reduction via the atan(x)+atan(1/x)=sign(x)*pi/2 identity. The JS
// fallback uses exact Math.atan, so expect small (sub-1e-4) divergence
// through the polar radius/angle terms, consistent with the existing
// dsp_pow approximation tradeoff used elsewhere in this module set.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kTau = 6.28318530717958647692;
static const double kQuarterPi = 0.78539816339744830962;
static const double kInvTau = 0.15915494309189535;

struct RadarState {
  bool active;
  double phase;
  double rotatorPhase;
  double outX;
  double outY;
};

static RadarState gPool[kMaxInstances];

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

void dsp_sincos_cycles(double y, double& outSin, double& outCos) {
  outSin = dsp_sin_cycles(y);
  outCos = dsp_cos_cycles(y);
}

double trisaw(double phase, double warp) {
  double safeWarp = clamp(warp, 0.001, 0.999);
  double wrapped = wrap01_frac(phase);
  return wrapped < safeWarp ? wrapped / safeWarp : (1.0 - wrapped) / (1.0 - safeWarp);
}

// Fast approximate pow(base, exponent), sign-aware for odd-integer
// exponents on negative bases -- same pattern used across this module set.
double dsp_pow(double base, double exponent) {
  if (base == 0.0) return 0.0;
  const double sign = base < 0.0 ? -1.0 : 1.0;
  const double absBase = dsp_abs(base);
  union { double d; int x[2]; } u;
  u.d = absBase;
  u.x[1] = (int)(exponent * (double)(u.x[1] - 1072632447) + 1072632447.0);
  u.x[0] = 0;
  const bool oddIntExponent = exponent == __builtin_trunc(exponent) && (((long long)exponent) & 1);
  return oddIntExponent ? sign * u.d : u.d;
}

// Minimax polynomial for atan(x), valid on [-1, 1] (~1e-5 max error).
double atan_poly(double x) {
  const double x2 = x * x;
  return x * (0.9998660 + x2 * (-0.3302995 + x2 * (0.1801410 + x2 * (-0.0851330 + x2 * 0.0208351))));
}

double dsp_atan(double x) {
  if (x == 0.0) return 0.0;
  if (dsp_abs(x) <= 1.0) return atan_poly(x);
  const double s = x < 0.0 ? -1.0 : 1.0;
  return s * kHalfPi - atan_poly(1.0 / x);
}

double dsp_sqrt(double v) {
  return __builtin_sqrt(v);
}

void updateXY(double x, double y, double& outX, double& outY, double& outPh, double& outR) {
  const double x_ = dsp_sin(x * (kQuarterPi + (1.0 - dsp_abs(y)) * kQuarterPi));
  const double y_ = y * dsp_cos(x * kQuarterPi);
  const double r = (dsp_sign(y_) + (y_ == 0.0 ? 1.0 : 0.0)) * dsp_sqrt(x_ * x_ + y_ * y_);
  const double ph = y_ != 0.0 ? dsp_atan(x_ / y_) : kHalfPi * dsp_sign(x_);
  outX = x_;
  outY = y_;
  outPh = ph;
  outR = r;
}

void render(
  double inPhas,
  double tri1,
  double pow1,
  bool pow1Up,
  bool pow1Down,
  bool phaseInv,
  double dens,
  double frontring,
  bool tunnelInv,
  double length,
  bool spiralReturn,
  double tri2,
  double pow2,
  double rot,
  double lap,
  double ration,
  bool pow2Bend,
  bool ringcut,
  double ph,
  double r,
  double size,
  double x,
  double y,
  double ratio,
  double& outX,
  double& outY,
  double& outZ
) {
  double phas = trisaw(inPhas, tri1);
  if (phaseInv) phas = 1.0 - trisaw(inPhas, tri1);

  if ((pow1Up && inPhas < tri1) || (pow1Down && inPhas >= tri1)) {
    phas = dsp_pow(phas, pow1);
  }

  phas = phas * (dens + frontring / ((tunnelInv ? 1.0 : 0.0) + (tunnelInv ? 0.0 : 1.0) * length)) / dens;

  double sphas = phas;
  if (inPhas > tri1 && spiralReturn) sphas = 2.0 - phas;

  const double sinPhas = clamp(dsp_pow(trisaw(sphas * length * dens, tri2), pow2), -1.0e+100, 1.0e+100);

  double f002Sin, f002Cos;
  dsp_sincos_cycles(
    (sinPhas - (tunnelInv ? 1.0 : 0.0) * frontring - rot / lap - (tunnelInv ? 0.0 : 1.0) * length * dens) * lap,
    f002Sin,
    f002Cos
  );
  const double lilsin = f002Cos * ration;
  const double lilcos = f002Sin * ration;

  phas *= length;
  phas = (pow2Bend ? 0.0 : 1.0) * (__builtin_floor(phas * dens) / dens + sinPhas / dens) + (pow2Bend ? 1.0 : 0.0) * phas;

  if (ringcut) {
    phas = (__builtin_floor(phas * dens + (tunnelInv ? 1.0 : 0.0) * (1.0 - frontring)) + rot - (tunnelInv ? 1.0 : 0.0) * (1.0 - frontring)) / dens;
  }

  if (!tunnelInv) {
    phas = 1.0 - phas - (1.0 - length) + frontring / dens;
  }

  phas = clamp(phas - frontring / dens, 0.0, 1.0);

  double phSinNeg, phCosNeg;
  dsp_sincos_cycles(-ph, phSinNeg, phCosNeg);
  const double lilsin1 = lilsin * phSinNeg + lilcos * phCosNeg;
  const double lilcos1 = lilcos * phSinNeg - lilsin * phCosNeg;

  double f003Sin, f003Cos;
  dsp_sincos_cycles(phas * dsp_abs(r), f003Sin, f003Cos);
  const double bigsin = f003Cos;
  const double bigcos = -f003Sin;

  const double lilX = lilsin1 * bigsin;
  const double lilY = lilcos1;
  const double lilZ = lilsin1 * bigcos * dsp_sign(r);

  double bigX = 0.0;
  double bigY = 0.0;
  double bigZ = -kTau * phas;
  if (r != 0.0) {
    bigZ = bigcos / dsp_abs(r);
    bigX = (bigsin - 1.0) / r;
  }

  const double waveX1 = bigX + lilX;
  const double waveY1 = bigY + lilY;
  const double waveZ2raw = bigZ + lilZ;

  double phSin, phCos;
  dsp_sincos_cycles(ph, phSin, phCos);
  double waveX = waveX1 * phSin + waveY1 * phCos;
  double waveY2 = waveY1 * phSin - waveX1 * phCos;
  double waveZ2 = waveZ2raw;

  const double syz = 2.0 * (size + 0.33) * (dsp_abs(x) * (1.0 - y) + 0.5);
  waveX = size * waveX + (1.0 - size) * (waveX + x * (1.0 - ratio) + x * ratio) * syz;
  waveY2 = size * waveY2 + (1.0 - size) * (waveY2 - y) * syz;
  waveZ2 = size * waveZ2 + (1.0 - size) * waveZ2 * syz;

  double sizSin, sizCos;
  dsp_sincos_cycles((1.0 - size) * kHalfPi, sizSin, sizCos);
  const double waveY = waveY2 * sizCos + waveZ2 * sizSin;
  const double waveZ = waveZ2 * sizCos - waveY2 * sizSin;

  outX = waveX;
  outY = waveY;
  outZ = waveZ;
}

}  // namespace

extern "C" int soemdsp_jbradar_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = RadarState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jbradar_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jbradar_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  RadarState& s = gPool[handle - 1];
  s.phase = 0.0;
  s.rotatorPhase = 0.0;
}

extern "C" void soemdsp_jbradar_sample(
  int handle,
  double frequency,
  double phaseOffset,
  double density,
  double sharp,
  double fade,
  double rotation,
  double direction,
  double shade,
  double lap,
  double ringcut,
  double pow1Up,
  double pow1Down,
  double pow2Bend,
  double phaseInv,
  double tunnelInv,
  double spiralReturn,
  double length,
  double ratio,
  double frontring,
  double zoom,
  double zDepth,
  double inner,
  double x,
  double y,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  RadarState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const bool ringcutB = ringcut >= 0.5;
  const bool pow1UpB = pow1Up >= 0.5;
  const bool pow1DownB = pow1Down >= 0.5;
  const bool pow2BendB = pow2Bend >= 0.5;
  const bool phaseInvB = phaseInv >= 0.5;
  const bool tunnelInvB = tunnelInv >= 0.5;
  const bool spiralReturnB = spiralReturn >= 0.5;

  const double tri1 = sharp * 0.5 + 0.5;
  const double pow1 = fade;
  const double tri2 = direction;
  const double pow2 = clamp(shade, -80.0, 80.0);
  const double lapPlusOne = lap + 1.0;
  const double safeLap = lapPlusOne > 1.0e-6 ? lapPlusOne : 1.0e-6;
  const double ration = ratio + 0.1;
  double dens = (ringcutB ? __builtin_floor(density) : density) + 1.0e-6;
  dens = dens < 1.0e+6 ? dens : 1.0e+6;
  const double size = zoom;
  const double xz = 1.0 - zoom;
  const double yFixForZoom = xz + (xz - dsp_pow(xz, 6.0));

  const double rx = -x;
  const double ry = y;
  double xOut, yOut, ph, r;
  updateXY(rx, ry, xOut, yOut, ph, r);

  const double inPhas = wrap01_frac(s.phase + phaseOffset);
  const double rot = wrap01_frac(s.rotatorPhase + rotation);

  double waveX, waveY, waveZ;
  render(
    inPhas, tri1, pow1, pow1UpB, pow1DownB, phaseInvB, dens, frontring, tunnelInvB, length,
    spiralReturnB, tri2, pow2, rot, safeLap, ration, pow2BendB, ringcutB, ph, r, size, rx, ry, ratio,
    waveX, waveY, waveZ
  );

  const double depth = (1.0 - zDepth) * (1.0 - dsp_abs(waveZ) * kInvTau) + zDepth * dsp_pow(zDepth * 9.0 + 1.0, waveZ);
  const double f001 = (depth * (1.0 - inner) + inner) / ((1.0 - size) + size * ration);
  s.outX = waveX * f001;
  s.outY = waveY * f001 + yFixForZoom;

  s.phase = wrap01_frac(s.phase + frequency / safeRate);
  s.rotatorPhase = wrap01_frac(s.rotatorPhase + 1.0 / safeRate);
}

extern "C" double soemdsp_jbradar_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jbradar_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jbradar_version() {
  return 1;
}
