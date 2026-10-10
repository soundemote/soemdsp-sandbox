// soemdsp-native-module: eq_filter
// soemdsp-native-label: EQ Filter ZDF
// soemdsp-native-target: eqFilter
// soemdsp-native-kind: dynamics
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Filters/Musical/StateVariableFilter.h
//
// Matches public/modules/eqFilter/eq-filter-math.js (Robin ZDF SVF).

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
static const int kMaxCascade = 4;

struct State {
  bool active;
  TptSvfState stage[kMaxCascade];
  int lastMode;
  int lastStages;
  double lastOmega, lastQ, lastA;
  TptSvfCoeffs k;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"eq_filter\","
    "\"label\":\"EQ Filter ZDF\","
    "\"targetType\":\"eqFilter\","
    "\"kind\":\"dynamics\""
  "}";

static void setup_bypass(State* st) {
  st->k.g = 0.0;
  st->k.c = 0.0;
  st->k.s = 1.0;
  st->k.aL = 0.0;
  st->k.aB = 0.0;
  st->k.aH = 1.0;
}

static void setup_muted(State* st) {
  st->k.g = 0.0;
  st->k.c = 0.0;
  st->k.s = 0.0;
  st->k.aL = 0.0;
  st->k.aB = 0.0;
  st->k.aH = 0.0;
}

// TPT SVF core (tan_half, setup, tick): library/include/soemdsp/filter/tpt_svf.h.

static void setup(State* st, int mode, double omega, double q, double A) {
  const double Q = (q > 1e-9 || q < -1e-9) ? q : 1e-9;
  const double a = A > 1e-6 ? A : 1.0;
  if (mode == 0) { setup_bypass(st); return; }
  if (mode == 1) { tpt_svf_setup(st->k, omega, 1.0 / Q, 0, 0, 1, 1); return; }
  if (mode == 2) { tpt_svf_setup(st->k, omega, 1.0 / Q, 1, 0, 0, 1); return; }
  if (mode == 3) { tpt_svf_setup(st->k, omega, 1.0 / Q, 0, 1, 0, 1); return; }
  if (mode == 4) {
    tpt_svf_setup_bandpass_const_peak(st->k, omega, Q);
    return;
  }
  if (mode == 5) { tpt_svf_setup(st->k, omega, 1.0 / Q, 1, 0, 1, 1); return; }
  if (mode == 6) {
    const double r = 1.0 / Q;
    tpt_svf_setup(st->k, omega, r, 1, -r, 1, 1);
    return;
  }
  if (mode == 7) {
    const double r = 1.0 / (Q * a);
    tpt_svf_setup(st->k, omega, r, 1, a * a * r, 1, 1);
    return;
  }
  if (mode == 8) {
    const double r = 1.0 / Q;
    const double gScale = 1.0 / dsp_exp(0.5 * dsp_ln(a));
    tpt_svf_setup(st->k, omega, r, a * a, a * r, 1, gScale);
    return;
  }
  if (mode == 9) {
    const double r = 1.0 / Q;
    const double gScale = dsp_exp(0.5 * dsp_ln(a));
    tpt_svf_setup(st->k, omega, r, 1, a * r, a * a, gScale);
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
  const double safeQ = (q > 1e-9 || q < -1e-9) ? q : 1e-9;
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
      for (int k = 0; k < kMaxCascade; k += 1) tpt_svf_reset(s.stage[k]);
      s.lastMode = -1;
      s.lastStages = 1;
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
  double sampleRate,
  double stages
) {
  const double x = safe(input);
  int safeMode = (int)(safe(mode) + (safe(mode) >= 0.0 ? 0.5 : -0.5));
  if (safeMode < 0) safeMode = 0;
  if (safeMode > 9) safeMode = 9;
  if (safeMode == 0) return x;
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return x;
  State* st = &gPool[handle - 1];
  int n = (int)(safe(stages) + (safe(stages) >= 0.0 ? 0.5 : -0.5));
  if (n < 1) n = 1;
  if (n > kMaxCascade) n = kMaxCascade;
  if (n != st->lastStages) {
    for (int k = 0; k < kMaxCascade; k += 1) tpt_svf_reset(st->stage[k]);
    st->lastStages = n;
  }
  ensure_setup(st, safeMode, frequency, q, gainDb, sampleRate);
  double y = x;
  for (int i = 0; i < n; i += 1) y = tpt_svf_tick(st->stage[i], st->k, y);
  return y;
}

extern "C" int soemdsp_eq_filter_version() { return 2; }
extern "C" const char* soemdsp_eq_filter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_eq_filter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
