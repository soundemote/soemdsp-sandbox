// soemdsp-native-module: active_filter
// soemdsp-native-label: Active Filter
// soemdsp-native-target: activeFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// RS-MET multipole ladder core (Robin Schmidt):
//   - LP/HP 6–24 dB, BP6, BP12 (no Flat/bypass mode)
//   - Feedback circuit: Off | Resonance only | Clipping only | Res + Clip
//   - Gain compensation on/off (g = 1 + mixS*k when on)
//   - Ladder-entry soft clip always for stability
//
// Cutoff real Hz (0 = frozen); resonance 0…1 when resonance path is enabled.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

// feedbackCircuit: 0 Off, 1 Resonance only, 2 Clipping only, 3 Res + Clip
static const char kMetadataJson[] =
  "{"
    "\"module\":\"active_filter\","
    "\"label\":\"Active Filter\","
    "\"targetType\":\"activeFilter\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"mode\","
        "\"label\":\"Mode\","
        "\"defaultValue\":3,"
        "\"min\":0,"
        "\"mid\":3,"
        "\"max\":9,"
        "\"step\":1,"
        "\"choices\":[\"LP6\",\"LP12\",\"LP18\",\"LP24\",\"HP6\",\"HP12\",\"HP18\",\"HP24\",\"BP6\",\"BP12\"],"
        "\"tooltip\":\"Response / slope. No Flat — use graph bypass if needed.\""
      "},"
      "{"
        "\"key\":\"frequency\","
        "\"label\":\"Frequency\","
        "\"kind\":\"frequency\","
        "\"defaultValue\":1000,"
        "\"min\":0,"
        "\"mid\":1000,"
        "\"max\":20000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Cutoff in Hz. 0 allowed (frozen).\""
      "},"
      "{"
        "\"key\":\"resonance\","
        "\"label\":\"Resonance\","
        "\"defaultValue\":0.2,"
        "\"min\":0,"
        "\"mid\":0.2,"
        "\"max\":1,"
        "\"step\":\"any\","
        "\"tooltip\":\"Feedback 0…1 when Feedback circuit includes resonance. Max 1.0.\""
      "},"
      "{"
        "\"key\":\"feedbackCircuit\","
        "\"label\":\"Feedback Circuit\","
        "\"defaultValue\":3,"
        "\"min\":0,"
        "\"mid\":1.5,"
        "\"max\":3,"
        "\"step\":1,"
        "\"choices\":[\"Off\",\"Resonance only\",\"Clipping only\",\"Res + Clip\"],"
        "\"tooltip\":\"Off = clean multipole. Resonance only = feedback. Clipping only = input tanh. Res + Clip = both.\""
      "},"
      "{"
        "\"key\":\"gainCompensation\","
        "\"label\":\"Gain Comp\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"mid\":1,"
        "\"max\":1,"
        "\"step\":1,"
        "\"choices\":[\"Off\",\"On\"],"
        "\"tooltip\":\"When On, input gain scales with resonance (classic gain-compensated ladder). Off = g = 1.\""
      "}"
    "]"
  "}";

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

static inline double dsp_tanh(double x) {
  return 1.0 - 2.0 / (dsp_exp_narrow(2.0 * x) + 1.0);
}

static void compute_mix(int mode, int stages, double c[5], double* s_out) {
  for (int i = 0; i < 5; i++) c[i] = 0.0;
  if (mode == 0) {
    // Unused (was Flat) — keep for stages path only.
    c[0] = 1.0;
    *s_out = 0.125;
  } else if (mode == 1) {
    c[stages] = 1.0;
    *s_out = stages * 0.25;
  } else if (mode == 2) {
    static const double hp[4][5] = {
      {1.0, -1.0,  0.0,  0.0, 0.0},
      {1.0, -2.0,  1.0,  0.0, 0.0},
      {1.0, -3.0,  3.0, -1.0, 0.0},
      {1.0, -4.0,  6.0, -4.0, 1.0},
    };
    for (int i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
    *s_out = stages * 0.25;
  } else {
    static const double bp[4][5] = {
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 0.0,  3.0, -3.0, 0.0},
      {0.0, 0.0,  4.0, -8.0, 4.0},
    };
    for (int i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
    *s_out = 0.125;
  }
}

// UI mode 0..9 → (ladderMode LP/HP/BP, stages). No Flat.
static void modeToLadder(int filterMode, int* ladderMode, int* stages) {
  static const int table[10][2] = {
    {1, 1}, {1, 2}, {1, 3}, {1, 4},  // LP6..LP24
    {2, 1}, {2, 2}, {2, 3}, {2, 4},  // HP6..HP24
    {3, 1}, {3, 4},                  // BP6, BP12
  };
  int idx = filterMode < 0 ? 0 : (filterMode > 9 ? 9 : filterMode);
  *ladderMode = table[idx][0];
  *stages = table[idx][1];
}

struct ActiveFilterState {
  double y[5];
  bool active;
};

static ActiveFilterState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_active_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ActiveFilterState& s = gPool[i];
      for (int j = 0; j < 5; j++) s.y[j] = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_active_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_active_filter_sample(
  int handle,
  double input,
  double frequencyHz,
  double resonance,       // 0..1
  int mode,               // 0..9 response
  int feedbackCircuit,    // 0 Off, 1 Res only, 2 Clip only, 3 Res+Clip
  int gainCompensation,   // 0 off, nonzero on
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ActiveFilterState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double rawHz = safe(frequencyHz);
  const double maxFreq = safeRate * 0.49;
  const double cutoffHz = rawHz < 0.0 ? 0.0 : (rawHz > maxFreq ? maxFreq : rawHz);

  const int circuit = feedbackCircuit < 0 ? 0 : (feedbackCircuit > 3 ? 3 : feedbackCircuit);
  const bool useRes = (circuit == 1 || circuit == 3);
  const bool useClip = (circuit == 2 || circuit == 3);
  const bool useGainComp = gainCompensation != 0;

  const double feedback = useRes ? clampd(resonance, 0.0, 1.0) : 0.0;

  int ladderMode, stages;
  modeToLadder(mode, &ladderMode, &stages);

  const double wc = clampd((2.0 * kPi * cutoffHz) / safeRate, 1e-9, kPi * 0.98);
  const double sine = dsp_sin_0_pi(wc);
  const double cosine = dsp_cos_0_pi(wc);
  const double tangent = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
  double a = sine - cosine * tangent;
  a = (a > -1e-12 && a < 1e-12) ? (a >= 0.0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;

  double c[5];
  double mixS;
  compute_mix(ladderMode, stages, c, &mixS);

  const double b = 1.0 + a;
  const double denom = 1.0 + a * a + 2.0 * a * cosine;
  const double safeDenom = denom < 1e-12 ? 1e-12 : denom;
  const double g2 = (b * b) / safeDenom;
  const double g2sq = g2 * g2 < 1e-12 ? 1e-12 : g2 * g2;
  const double k = feedback / g2sq;
  const double g = useGainComp ? (1.0 + mixS * k) : 1.0;

  const double xIn = safe(input);
  const double driven = useClip ? dsp_tanh(xIn * 2.0) : xIn;
  const double safeIn = safe(g * driven - k * s.y[4]);
  // Entry soft clip always — crash-safety, not the character "Clipping" path.
  double y0 = safeIn / (1.0 + safeIn * safeIn);
  const double ny1 = safe(y0 + a * (y0 - s.y[1]));
  const double ny2 = safe(ny1 + a * (ny1 - s.y[2]));
  const double ny3 = safe(ny2 + a * (ny2 - s.y[3]));
  const double ny4 = safe(ny3 + a * (ny3 - s.y[4]));
  s.y[0] = safe(y0);
  s.y[1] = ny1;
  s.y[2] = ny2;
  s.y[3] = ny3;
  s.y[4] = ny4;

  const double out = c[0] * s.y[0] + c[1] * s.y[1] + c[2] * s.y[2] + c[3] * s.y[3] + c[4] * s.y[4];
  return safe(out) * 0.41;
}

extern "C" int soemdsp_active_filter_version() {
  return 1;
}

extern "C" const char* soemdsp_active_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_active_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
