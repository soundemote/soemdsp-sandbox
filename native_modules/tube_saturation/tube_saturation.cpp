// soemdsp-native-module: tube_saturation
// soemdsp-native-label: Tube Saturation
// soemdsp-native-target: tubeSaturation
// soemdsp-native-kind: dynamics
//
// First-order (memoryless) triode approx: Koren-style Ip(Vg,Vp) with load line
// Vp = Vbb - R*Ip, precomputed as tables. Runtime interpolates in Vg; Load blends
// two nearby load lines. No same-sample feedback iteration.
// Matches public/modules/tubeSaturation/tube-saturation-math.js.

#include <soemdsp/soemdsp.hpp>

namespace {

using soemdsp::debug::safe;
using soemdsp::math::clamp;
using soemdsp::math::clamp01;
using soemdsp::math::clamp11;
using soemdsp::math::clamp_int;
using soemdsp::math::dsp_floor;
using soemdsp::math::lerp;
using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_ln;

// 12AX7-ish Koren constants (audio-shaped, not SPICE-accurate).
static const double kMu = 100.0;
static const double kEx = 1.4;
static const double kKg1 = 1060.0;
static const double kKp = 600.0;
static const double kKvb = 300.0;
static const double kVbb = 250.0;

static const int kNumLoads = 8;
static const int kNumVg = 257;
static const double kVgMin = -5.0;
static const double kVgMax = 1.0;

static const double kRLoads[kNumLoads] = {
  12000.0, 22000.0, 33000.0, 47000.0, 68000.0, 100000.0, 150000.0, 220000.0
};

static double gVpTable[kNumLoads][kNumVg];
static double gOutScale[kNumLoads];
static bool gTablesReady = false;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"tube_saturation\","
    "\"label\":\"Tube Saturation\","
    "\"targetType\":\"tubeSaturation\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"Mono\",\"Left\",\"Right\"],"
    "\"outputs\":[\"Mono\",\"Left\",\"Right\"],"
    "\"parameters\":["
      "{\"key\":\"drive\",\"label\":\"Drive\",\"defaultValue\":0.5,\"min\":0,\"mid\":1,\"max\":4},"
      "{\"key\":\"bias\",\"label\":\"Bias\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1},"
      "{\"key\":\"load\",\"label\":\"Load\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1},"
      "{\"key\":\"mix\",\"label\":\"Mix\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":1}"
    "]"
  "}";

static double sqrt_approx(double x) {
  if (!(x > 0.0)) return 0.0;
  double y = x < 1.0 ? 1.0 : x;
  for (int i = 0; i < 12; i++) y = 0.5 * (y + x / y);
  return y;
}

static double softplus(double arg) {
  if (arg > 30.0) return arg;
  if (arg < -30.0) return dsp_exp(arg);
  return dsp_ln(1.0 + dsp_exp(arg));
}

static double koren_ip(double vg, double vp) {
  const double vpSafe = vp < 1.0e-6 ? 1.0e-6 : vp;
  const double denom = sqrt_approx(kKvb + vpSafe * vpSafe);
  const double arg = kKp * ((1.0 / kMu) + vg / denom);
  const double e1 = (vpSafe / kKp) * softplus(arg);
  if (!(e1 > 0.0)) return 0.0;
  return dsp_exp(kEx * dsp_ln(e1)) / kKg1;
}

static double solve_vp(double vg, double rLoad) {
  double lo = 0.5;
  double hi = kVbb;
  for (int i = 0; i < 48; i++) {
    const double mid = 0.5 * (lo + hi);
    const double ip = koren_ip(vg, mid);
    const double vpTarget = kVbb - rLoad * ip;
    if (mid > vpTarget) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

static void ensure_tables() {
  if (gTablesReady) return;
  for (int li = 0; li < kNumLoads; li++) {
    const double r = kRLoads[li];
    double vpMin = 1.0e300;
    double vpMax = -1.0e300;
    for (int vi = 0; vi < kNumVg; vi++) {
      const double t = (double)vi / (double)(kNumVg - 1);
      const double vg = kVgMin + t * (kVgMax - kVgMin);
      const double vp = solve_vp(vg, r);
      gVpTable[li][vi] = vp;
      if (vp < vpMin) vpMin = vp;
      if (vp > vpMax) vpMax = vp;
    }
    const double span = vpMax - vpMin;
    gOutScale[li] = span > 1.0e-6 ? (0.5 * span) : 1.0;
  }
  gTablesReady = true;
}

static double lookup_vp(int loadIdx, double vg) {
  const double vgC = clamp(vg, kVgMin, kVgMax);
  const double t = (vgC - kVgMin) / (kVgMax - kVgMin);
  const double idx = t * (double)(kNumVg - 1);
  const int i0 = clamp_int((int)dsp_floor(idx), 0, kNumVg - 2);
  const double frac = clamp01(idx - (double)i0);
  return lerp(gVpTable[loadIdx][i0], gVpTable[loadIdx][i0 + 1], frac);
}

static double tube_wet(double input, double drive, double bias, double load) {
  ensure_tables();
  const double x = safe(input);
  const double d = clamp(safe(drive), 0.0, 4.0);
  const double b = clamp11(safe(bias));
  const double vgBias = -1.2 + b * 2.0;
  const double vg = vgBias + x * d * 2.0;

  const double load01 = clamp01(safe(load));
  const double loadPos = load01 * (double)(kNumLoads - 1);
  const int li0 = clamp_int((int)dsp_floor(loadPos), 0, kNumLoads - 2);
  const int li1 = li0 + 1;
  const double loadFrac = clamp01(loadPos - (double)li0);

  // AC relative to idle plate at this Bias (input=0) — removes DC for any Bias.
  const double vpIdle0 = lookup_vp(li0, vgBias);
  const double vpIdle1 = lookup_vp(li1, vgBias);
  const double vp0 = lookup_vp(li0, vg);
  const double vp1 = lookup_vp(li1, vg);
  const double ac0 = (vpIdle0 - vp0) / gOutScale[li0];
  const double ac1 = (vpIdle1 - vp1) / gOutScale[li1];
  return lerp(ac0, ac1, loadFrac);
}

static double process_one(
  double input, double drive, double bias, double load, double mix, double amplitude
) {
  const double x = safe(input);
  const double wet = tube_wet(x, drive, bias, load);
  const double m = clamp01(safe(mix));
  const double amp = clamp01(safe(amplitude));
  return (x * (1.0 - m) + wet * m) * amp;
}

}  // namespace

extern "C" double soemdsp_tube_saturation_sample(
  double input,
  double drive,
  double bias,
  double load,
  double mix,
  double amplitude
) {
  return process_one(input, drive, bias, load, mix, amplitude);
}

extern "C" int soemdsp_tube_saturation_version() { return 1; }
extern "C" const char* soemdsp_tube_saturation_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_tube_saturation_metadata_json_size() { return sizeof(kMetadataJson) - 1; }