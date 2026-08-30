// soemdsp-native-module: eq_filter
// soemdsp-native-label: EQ Filter
// soemdsp-native-target: eqFilter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/eqFilter/eq-filter-math.js (Robin ZDF SVF).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;

struct State {
  bool active;
  double z1, z2;
  int lastMode;
  double lastOmega, lastQ, lastA;
  double g, c, s, aL, aB, aH;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"eq_filter\","
    "\"label\":\"EQ Filter\","
    "\"targetType\":\"eqFilter\","
    "\"kind\":\"dynamics\""
  "}";

static void setup_bypass(State* st) {
  st->g = 0.0;
  st->c = 0.0;
  st->s = 1.0;
  st->aL = 0.0;
  st->aB = 0.0;
  st->aH = 1.0;
}

static void setup_muted(State* st) {
  st->g = 0.0;
  st->c = 0.0;
  st->s = 0.0;
  st->aL = 0.0;
  st->aB = 0.0;
  st->aH = 0.0;
}

static double tan_half(double omega) {
  double s = 0.0, c = 0.0;
  dsp_sin_cos(0.5 * omega, &s, &c);
  if (dsp_fabs(c) < 1.0e-15) return 1e15;
  return s / c;
}

static void setup_core(State* st, double omega, double r, double aL, double aB, double aH, double gScale) {
  const double rawW = safe(omega);
  const double w = rawW < 0.0 ? 0.0 : (rawW > kPi * 0.999 ? kPi * 0.999 : rawW);
  const double safeR = r > 1e-9 ? r : 1e-9;
  const double g = tan_half(w) * (gScale == 0.0 && gScale * 0.0 != 0.0 ? 1.0 : (gScale * 0.0 == 0.0 ? gScale : 1.0));
  const double c = g + safeR;
  const double denom = 1.0 + g * c;
  st->g = g;
  st->c = c;
  st->s = denom != 0.0 ? 1.0 / denom : 0.0;
  st->aL = aL;
  st->aB = aB;
  st->aH = aH;
}

static void setup(State* st, int mode, double omega, double q, double A) {
  const double Q = q > 1e-4 ? q : 0.707;
  const double a = A > 1e-6 ? A : 1.0;
  if (mode == 0) { setup_bypass(st); return; }
  if (mode == 1) { setup_core(st, omega, 1.0 / Q, 0, 0, 1, 1); return; }
  if (mode == 2) { setup_core(st, omega, 1.0 / Q, 1, 0, 0, 1); return; }
  if (mode == 3) { setup_core(st, omega, 1.0 / Q, 0, 1, 0, 1); return; }
  if (mode == 4) {
    const double r = 1.0 / Q;
    setup_core(st, omega, r, 0, r, 0, 1);
    return;
  }
  if (mode == 5) { setup_core(st, omega, 1.0 / Q, 1, 0, 1, 1); return; }
  if (mode == 6) {
    const double r = 1.0 / Q;
    setup_core(st, omega, r, 1, -r, 1, 1);
    return;
  }
  if (mode == 7) {
    const double r = 1.0 / (Q * a);
    setup_core(st, omega, r, 1, a * a * r, 1, 1);
    return;
  }
  if (mode == 8) {
    const double r = 1.0 / Q;
    const double gScale = 1.0 / dsp_exp(0.5 * dsp_ln(a));
    setup_core(st, omega, r, a * a, a * r, 1, gScale);
    return;
  }
  if (mode == 9) {
    const double r = 1.0 / Q;
    const double gScale = dsp_exp(0.5 * dsp_ln(a));
    setup_core(st, omega, r, 1, a * r, a * a, gScale);
    return;
  }
  setup_muted(st);
}

static void ensure_setup(State* st, int mode, double frequency, double q, double gainDb, double sampleRate) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  int safeMode = mode;
  if (safeMode < 0) safeMode = 0;
  if (safeMode > 9) safeMode = 9;
  const double rawFreq = safe(frequency);
  double freq = rawFreq < 0.0 ? 0.0 : rawFreq;
  const double ny = rate * 0.49;
  if (freq > ny) freq = ny;
  const double omega = (kTwoPi * freq) / rate;
  const double safeQ = q > 0.05 ? q : 0.707;
  const double A = dsp_exp(0.025 * safe(gainDb) * 2.302585092994046); // 10^(dB/40) = exp(dB * ln10 / 40)
  if (st->lastMode == safeMode && st->lastOmega == omega && st->lastQ == safeQ && st->lastA == A) {
    return;
  }
  setup(st, safeMode, omega, safeQ, A);
  st->lastMode = safeMode;
  st->lastOmega = omega;
  st->lastQ = safeQ;
  st->lastA = A;
}

}  // namespace

extern "C" int soemdsp_eq_filter_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.z1 = 0.0;
      s.z2 = 0.0;
      s.lastMode = -1;
      s.lastOmega = 0.0 / 0.0;
      s.lastQ = 0.0 / 0.0;
      s.lastA = 0.0 / 0.0;
      setup_bypass(&s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_eq_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_eq_filter_sample(
  int handle,
  double input,
  double mode,
  double frequency,
  double q,
  double gainDb,
  double sampleRate
) {
  const double x = safe(input);
  int safeMode = (int)(safe(mode) + (safe(mode) >= 0.0 ? 0.5 : -0.5));
  if (safeMode < 0) safeMode = 0;
  if (safeMode > 9) safeMode = 9;
  if (safeMode == 0) return x;
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return x;
  State* st = &gPool[handle - 1];
  ensure_setup(st, safeMode, frequency, q, gainDb, sampleRate);
  const double g = st->g;
  const double c = st->c;
  const double s = st->s;
  const double z1 = st->z1;
  const double z2 = st->z2;
  const double yH = (x - c * z1 - z2) * s;
  const double yB = z1 + g * yH;
  const double yL = z2 + g * yB;
  st->z1 = 2.0 * yB - z1;
  st->z2 = 2.0 * yL - z2;
  return st->aH * yH + st->aB * yB + st->aL * yL;
}

extern "C" int soemdsp_eq_filter_version() { return 1; }
extern "C" const char* soemdsp_eq_filter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_eq_filter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
