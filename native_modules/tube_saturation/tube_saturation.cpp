// soemdsp-native-module: tube_saturation
// soemdsp-native-label: Tube Saturation
// soemdsp-native-target: tubeSaturation
// soemdsp-native-kind: dynamics
//
// First-order (memoryless) triode approx: Koren-style Ip(Vg,Vp) with load line
// Vp = Vbb - R*Ip, precomputed as tables. Runtime interpolates in Vg; Load blends
// two nearby load lines. No same-sample feedback iteration.
// Native-only (no JS twin). Bias gain compensation: the wet signal is scaled by
// g(bias 0) / g(bias), the curve gain at the Bias=0 idle point over the gain at
// the current idle point, both from the Vp(Vg) table with the live Drive/Load
// state. Gain Compensation picks the slope span: Small Signal = tangent (one
// table cell, levels quiet input); Large Signal = secant over the full-scale
// grid swing (+/- 2*drive, levels loud input). Stateless; boost capped at
// kMaxBiasBoost.

#include <soemdsp/soemdsp.hpp>

namespace {

using soemdsp::debug::safe;
using soemdsp::math::clamp;
using soemdsp::math::clamp01;
using soemdsp::math::clamp11;
using soemdsp::math::clamp_int;
using soemdsp::math::dsp_floor;
using soemdsp::math::lerp;
using soemdsp::math::maxd;
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
// Bias -1..+1 maps to idle grid voltage kVgIdle + bias * kVgPerBias.
static const double kVgIdle = -1.2;
static const double kVgPerBias = 2.0;
// Max bias-compensation boost (4x = +12 dB). Fully levels Bias >= -0.75 at
// mid/heavy Load (needs <= ~3.4x) and is within ~1 dB at light Load; deep
// cutoff (Bias -1 needs 5.5x..16x) stays quieter instead of lifting noise and
// the harsh cutoff edge by 20+ dB.
static const double kMaxBiasBoost = 4.0;

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
      "{\"key\":\"gainCompensation\",\"label\":\"Gain Compensation\",\"defaultValue\":\"smallSignal\","
        "\"choices\":[\"Small Signal\",\"Large Signal\"],"
        "\"choiceKeys\":[\"smallSignal\",\"largeSignal\"],\"choiceIds\":[0,1]},"
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

// Gain Compensation choiceIds: smallSignal=0 (default), largeSignal=1.
// Unknown / NaN -> smallSignal.
static bool gain_comp_is_large_signal(double choice) {
  const double c = safe(choice);
  return c >= 0.5;
}

// Wet gain at idle grid voltage vgIdle: plate slope -dVp/dVg as a central
// difference over +/- dv, * gridScale (= 2*drive) / outScale, lerped across the
// two load lines exactly like tube_wet's output. dv = one table cell gives the
// small-signal (tangent) gain and stays continuous as Bias moves; dv = gridScale
// gives the secant over the full-scale input swing.
static double curve_gain(
  int li0, int li1, double loadFrac, double gridScale, double vgIdle, double dv
) {
  const double s0 = (lookup_vp(li0, vgIdle - dv) - lookup_vp(li0, vgIdle + dv)) / (2.0 * dv);
  const double s1 = (lookup_vp(li1, vgIdle - dv) - lookup_vp(li1, vgIdle + dv)) / (2.0 * dv);
  return lerp(s0 / gOutScale[li0], s1 / gOutScale[li1], loadFrac) * gridScale;
}

// gRef / g, capped at kMaxBiasBoost. A zero/negative/NaN g lands on the cap;
// gRef <= 0 (Drive 0: wet is silent anyway) leaves the level untouched.
static double bias_gain_comp(double gRef, double g) {
  if (!(gRef > 0.0)) return 1.0;
  return gRef / maxd(g, gRef / kMaxBiasBoost);
}

static double tube_wet(
  double input, double drive, double bias, double load, double gainCompensation
) {
  ensure_tables();
  const double x = safe(input);
  const double d = clamp(safe(drive), 0.0, 4.0);
  const double b = clamp11(safe(bias));
  const double gridScale = d * 2.0;
  const double vgBias = kVgIdle + b * kVgPerBias;
  const double vg = vgBias + x * gridScale;

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

  // Level-match to Bias 0 using the same Drive/Load state as this sample.
  const double cell = (kVgMax - kVgMin) / (double)(kNumVg - 1);
  const double dv = gain_comp_is_large_signal(gainCompensation) ? maxd(cell, gridScale) : cell;
  const double gBias = curve_gain(li0, li1, loadFrac, gridScale, vgBias, dv);
  const double gRef = curve_gain(li0, li1, loadFrac, gridScale, kVgIdle, dv);
  return lerp(ac0, ac1, loadFrac) * bias_gain_comp(gRef, gBias);
}

static double process_one(
  double input, double drive, double bias, double load, double gainCompensation,
  double mix, double amplitude
) {
  const double x = safe(input);
  const double wet = tube_wet(x, drive, bias, load, gainCompensation);
  const double m = clamp01(safe(mix));
  // Amplitude: 0..1 is DOMAIN preference / slider guide (nodeGraphOutputAmplitudeParam +
  // modClamp at host). Do not hard-clamp here — that fights typed/past-unity makeup gain.
  // safe() keeps NaN/Inf out; range is the param's job.
  const double amp = safe(amplitude);
  return (x * (1.0 - m) + wet * m) * amp;
}

}  // namespace

extern "C" double soemdsp_tube_saturation_sample(
  double input,
  double drive,
  double bias,
  double load,
  double gainCompensation,
  double mix,
  double amplitude
) {
  return process_one(input, drive, bias, load, gainCompensation, mix, amplitude);
}

extern "C" int soemdsp_tube_saturation_version() { return 2; }
extern "C" const char* soemdsp_tube_saturation_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_tube_saturation_metadata_json_size() { return sizeof(kMetadataJson) - 1; }