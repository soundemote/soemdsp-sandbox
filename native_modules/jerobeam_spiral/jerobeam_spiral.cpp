// soemdsp-native-module: jerobeam_spiral
// soemdsp-native-label: Jerobeam Spiral
// soemdsp-native-target: spiral
// soemdsp-native-kind: jerobeam
//
// Direct port of public/node-graph-jerobeam-spiral.js -- Jerobeam
// Fenderson's original Spiral patch (the module every other native
// Jerobeam port here was modeled after). Emits X/Y/Z motion plus a
// stereo-rendered left/right pair.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"jerobeam_spiral\","
    "\"label\":\"Jerobeam Spiral\","
    "\"targetType\":\"spiral\","
    "\"kind\":\"jerobeam\","
    "\"outputs\":[\"X\",\"Y\",\"Z\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":440,\"min\":0,\"mid\":220,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"density\",\"label\":\"Density\",\"defaultValue\":1,\"min\":-16,\"mid\":1,\"max\":16,\"step\":\"any\"},"
      "{\"key\":\"size\",\"label\":\"Size\",\"defaultValue\":0.5,\"min\":0.1,\"mid\":1,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"sharp\",\"label\":\"Sharp\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"sharpCurve\",\"label\":\"Sharp Curve\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"sharpCurveMult\",\"label\":\"Sharp Curve Mult\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"morph\",\"label\":\"Morph\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"morphSpeed\",\"label\":\"Morph Speed\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\"},"
      "{\"key\":\"position\",\"label\":\"Position\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"positionSpeed\",\"label\":\"Position Speed\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\"},"
      "{\"key\":\"rotX\",\"label\":\"Rotate X\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"rotXSpeed\",\"label\":\"Rotate X Speed\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\"},"
      "{\"key\":\"rotY\",\"label\":\"Rotate Y\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"rotYSpeed\",\"label\":\"Rotate Y Speed\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\"},"
      "{\"key\":\"zAmount\",\"label\":\"Z Amount\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"zDepth\",\"label\":\"Z Depth\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 16;
static const double kQuarterPi = 0.7853981633974483096;

static inline double dsp_trunc(double x) {
  return (double)(long long)x;
}

// Newton-Raphson sqrt, seeded from an IEEE-754 exponent-halving guess.
static double dsp_sqrt(double x) {
  if (x <= 0.0) return 0.0;
  union { double d; unsigned long long u; } bits;
  bits.d = x;
  bits.u = (bits.u >> 1) + (0x3FF0000000000000ULL >> 1);
  double y = bits.d;
  y = 0.5 * (y + x / y);
  y = 0.5 * (y + x / y);
  y = 0.5 * (y + x / y);
  y = 0.5 * (y + x / y);
  return y;
}

// Abramowitz & Stegun 4.4.45 polynomial (|error| <= 5e-5) plus one Newton
// refinement against dsp_sin/dsp_cos, giving double-precision-class accuracy.
static double dsp_asin(double x) {
  double sign = 1.0;
  double ax = x;
  if (ax < 0.0) { sign = -1.0; ax = -ax; }
  if (ax > 1.0) ax = 1.0;
  const double a0 = 1.5707288, a1 = -0.2121144, a2 = 0.0742610, a3 = -0.0187293;
  double theta = kHalfPi - dsp_sqrt(1.0 - ax) * (a0 + ax * (a1 + ax * (a2 + ax * a3)));
  // Newton's method is unstable near the poles (theta -> pi/2): cos(theta)
  // approaches zero there, so dividing by it amplifies dsp_sin/dsp_cos's
  // own tiny polynomial error into a large, overshooting correction. The
  // A&S initial guess is already highly accurate near the poles on its
  // own, so only refine where cos(theta) is comfortably away from zero.
  for (int i = 0; i < 3; i++) {
    const double c = dsp_cos(theta);
    if (c < 0.05 && c > -0.05) break;
    theta = theta - (dsp_sin(theta) - ax) / c;
  }
  return sign * theta;
}

static inline double absd(double a) { return a < 0.0 ? -a : a; }

static double spiral_fmod(double value, double divisor) {
  return value - dsp_trunc(value / divisor) * divisor;
}

static double spiral_trisaw(double phase, double sharp) {
  const double wrapped = wrap01_frac(phase);
  const double warp = clamp(sharp, 0.001, 0.999);
  return wrapped < warp ? wrapped / warp : (1.0 - wrapped) / (1.0 - warp);
}

struct Vec3 { double x, y, z; };

static Vec3 spiral_rotate(double inX, double inY, double inZ, double rotX, double rotY) {
  const double cosRotX = dsp_cos(rotX);
  const double sinRotX = dsp_sin(rotX);
  const double cosRotY = dsp_cos(rotY);
  const double sinRotY = dsp_sin(rotY);
  const double help11 = inX * cosRotX - inY * sinRotX;
  const double help12 = inX * sinRotX + inY * cosRotX;
  const double help21 = help11 * cosRotY - inZ * sinRotY;
  const double help22 = help11 * sinRotY + inZ * cosRotY;
  Vec3 out;
  out.x = help12;
  out.y = help21;
  out.z = help22;
  return out;
}

static Vec3 spiral_shape(double lophas, double phasor, double dense, double div, double morph) {
  const double clampMorph01 = clamp(morph, 0.0, 1.0);
  const double clampMorph02 = clamp(morph, 0.0, 2.0);
  const double formula001 = kHalfPi * (lophas - 0.5) * clampMorph02 + kQuarterPi;
  double loSin = dsp_sin(formula001);
  double loCos = dsp_cos(formula001);
  const double loX = 0.0;
  const double formula002 = clampMorph01 * clampMorph01;
  const double oneZDiv = 1.0 / div;
  const double loY = formula002 * (1.0 - oneZDiv * loSin);
  const double loZ = formula002 * (1.0 - oneZDiv * loCos);

  const double formula003 = kPi / (2.0 + 6.0 * (1.0 - clampMorph01)) * (lophas - 0.5) * clampMorph02 + kQuarterPi;
  loSin = dsp_sin(formula003);
  loCos = dsp_cos(formula003);

  const double tauPhasor = kTwoPi * phasor;
  const double sp0Sin = dsp_sin(tauPhasor);
  const double sp0Cos = dsp_cos(tauPhasor);
  const double spiral0X = sp0Sin;
  const double spiral0Y = sp0Cos * loSin;
  const double spiral0Z = sp0Cos * loCos;

  double sp1Sin = dsp_sin(dense * tauPhasor - kHalfPi);
  const double sp1Cos = dsp_cos(dense * tauPhasor - kHalfPi);
  sp1Sin *= -1.0;
  const double sp1SinTimesSp0Sin = sp1Sin * sp0Sin;
  const double spiral1X = div * sp1SinTimesSp0Sin;
  const double spiral1Y = div * ((sp1Sin * sp0Cos) * loSin + sp1Cos * loCos);
  const double spiral1Z = div * (sp1Cos * -loSin + (sp1Sin * sp0Cos) * loCos);

  double sp2Cos = dsp_sin(dense * dense * kTwoPi * phasor);
  const double sp2Sin = dsp_cos(dense * dense * kTwoPi * phasor);
  sp2Cos *= -1.0;
  const double divSquared = div * div;
  const double spiral2X = divSquared * (sp2Cos * sp0Cos + sp2Sin * sp1SinTimesSp0Sin);
  const double spiral2Y = divSquared * ((sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loSin + (sp2Sin * sp1Cos) * loCos);
  const double spiral2Z = divSquared * ((sp2Sin * sp1Cos) * -loSin + (sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loCos);

  double waveX = loX + spiral0X + spiral1X + spiral2X;
  double waveY = loY + spiral0Y + spiral1Y + spiral2Y;
  double waveZ = loZ + spiral0Z + spiral1Z + spiral2Z;
  double x = dsp_exp(morph * dsp_ln(div));
  waveX *= x;
  waveY *= x;
  waveZ *= x;

  double y = 0.0;
  const double formula004 = dsp_exp(morph * dsp_ln(dense)) / 4.0;
  if (formula004 < 1.0) {
    const double t = 1.0 - formula004;
    y = t * t;
  }
  x = x * dsp_sin(kQuarterPi) * y;
  waveX -= x;
  waveY += x;

  return spiral_rotate(waveX, waveY, waveZ, 0.0, 0.0);
}

struct SpiralState {
  double morph;
  double phase;
  double position;
  double rotX;
  double rotY;
  double zHistory;
  double outX, outY, outZ;
  double outLeft, outRight;
  bool   active;
};

static SpiralState gPool[kMaxInstances];

static double next_phasor(double& stateField, double frequency, double offset, double sampleRate, bool bipolar) {
  const double base = stateField;
  const double current = wrap01_frac(base + offset);
  stateField = wrap01_frac(base + frequency / sampleRate);
  return bipolar ? current * 2.0 - 1.0 : current;
}

}  // namespace

extern "C" int soemdsp_jerobeam_spiral_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SpiralState& s = gPool[i];
      s.morph = 0.0; s.phase = 0.0; s.position = 0.0;
      s.rotX = 0.0; s.rotY = 0.0; s.zHistory = 0.0;
      s.outX = 0.0; s.outY = 0.0; s.outZ = 0.0;
      s.outLeft = 0.0; s.outRight = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jerobeam_spiral_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jerobeam_spiral_sample(
  int    handle,
  double frequency,
  double density,
  double size,
  double sharp,
  double sharpCurve,
  double sharpCurveMult,
  double morph,
  double morphSpeed,
  double position,
  double positionSpeed,
  double rotX,
  double rotXSpeed,
  double rotY,
  double rotYSpeed,
  double zAmount,
  double zDepth,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SpiralState& s = gPool[handle - 1];

  const double rate = maxd(1.0, sampleRate);
  const double dense = maxd(absd(density), 1e-6);
  const double div = maxd(size, 0.1);
  const double logDense = dsp_ln(dense);
  const double zAmountSq = zAmount * zAmount;
  double zBase = zAmountSq * 5.0 + 1.0;
  // zDarkness = zBase ^ zHistory -- zHistory can be negative/fractional, so
  // this needs a real pow, not just squaring: a^b = exp(b * ln(a)).
  const double zDarkness = zBase > 0.0 ? dsp_exp(s.zHistory * dsp_ln(zBase)) : 1.0;
  const double mainPhasor = next_phasor(s.phase, frequency * zDarkness, 0.0, rate, false);
  const double fphasEnds = spiral_trisaw(mainPhasor, sharp);
  const double fphasMids = sharpCurveMult * (dsp_asin((dsp_asin(fphasEnds * 2.0 - 1.0) / kPi + 0.5) * 2.0 - 1.0) / kPi + 0.5);
  const double lophas = sharpCurve * fphasMids + (1.0 - sharpCurve) * fphasEnds;
  const double morphPhasor = next_phasor(s.morph, morphSpeed, morph, rate, true) + 0.5;
  double morph2 = morphPhasor + 1.0;
  if (morph2 > 1.5) {
    morph2 -= 2.0;
  }
  const double fmodLophas = spiral_fmod(lophas - 0.5, 1.0);
  double phas = spiral_fmod(fmodLophas * dsp_exp(morphPhasor * logDense) / 4.0 + 0.375, 1.0);
  const double phas2 = spiral_fmod(fmodLophas * dsp_exp(morph2 * logDense) / 4.0 + 0.375, 1.0);
  phas += next_phasor(s.position, positionSpeed, position, rate, false);
  const Vec3 wave1 = spiral_shape(lophas, phas, dense, div, morphPhasor);
  const Vec3 wave2 = spiral_shape(lophas, phas2, dense, div, morph2);
  const double switchAmount = dsp_sin(kPi * morphPhasor) / 2.0 + 0.5;
  double waveX = wave1.x * switchAmount + wave2.x * (1.0 - switchAmount);
  double waveY = wave1.y * switchAmount + wave2.y * (1.0 - switchAmount);
  double waveZ = wave1.z * switchAmount + wave2.z * (1.0 - switchAmount);
  double volumeCorrection = 1.0 / (1.0 + div + div * div);
  const double halfZDepth = zDepth / 2.0;
  volumeCorrection = volumeCorrection + halfZDepth - volumeCorrection * halfZDepth;
  waveX *= volumeCorrection;
  waveY *= volumeCorrection;
  waveZ *= volumeCorrection;
  waveY += 0.25;
  waveZ += 0.36;
  const Vec3 rotated = spiral_rotate(
    waveX,
    waveY,
    waveZ,
    -kTwoPi * next_phasor(s.rotX, rotXSpeed, rotX, rate, false),
    kTwoPi * next_phasor(s.rotY, rotYSpeed, rotY, rate, false) - kHalfPi
  );
  s.zHistory = rotated.z;
  s.outX = rotated.x;
  s.outY = rotated.y;
  s.outZ = rotated.z;

  // spiralRender inlined -- left/right not currently consumed by any
  // caller, but stored for parity with the JS function's full return value.
  const double formula = zDepth * 1.25 * (rotated.z / 2.0 + 0.5);
  const double multiplier = 1.0 + zDepth;
  s.outLeft = (rotated.x - formula * rotated.x) * multiplier;
  s.outRight = (rotated.y - formula * rotated.y) * multiplier;
}

extern "C" double soemdsp_jerobeam_spiral_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jerobeam_spiral_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jerobeam_spiral_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outZ;
}

extern "C" double soemdsp_jerobeam_spiral_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_jerobeam_spiral_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" int soemdsp_jerobeam_spiral_version() {
  return 1;
}

extern "C" const char* soemdsp_jerobeam_spiral_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_jerobeam_spiral_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
