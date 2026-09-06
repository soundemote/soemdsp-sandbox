// soemdsp-native-module: active_filter
// soemdsp-native-label: Dual Ladder Filter
// soemdsp-native-target: activeFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// Dual RS-MET multipole ladder (Robin Schmidt):
//   - HP slope + LP slope each: Bypass | 6 | 12 | 18 | 24 dB/oct
//   - Bypass+Bypass = thru; HP only / LP only / both = HP→LP cascade (BP)
//   - Feedback circuit: Off | Resonance only | Clipping only | Res + Clip
//   - Gain compensation on/off
//
// Cutoffs real Hz (0 = frozen). Resonance 0…1 when resonance path enabled.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;

// Slope: 0 Bypass, 1=6, 2=12, 3=18, 4=24. feedbackCircuit: 0..3
static const char kMetadataJson[] =
  "{"
    "\"module\":\"active_filter\","
    "\"label\":\"Dual Ladder Filter\","
    "\"targetType\":\"activeFilter\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"hpSlope\","
        "\"label\":\"HP Slope\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":2,"
        "\"max\":4,"
        "\"step\":1,"
        "\"choices\":[\"Bypass\",\"6\",\"12\",\"18\",\"24\"],"
        "\"tooltip\":\"Highpass ladder slope. Bypass skips the HP stage.\""
      "},"
      "{"
        "\"key\":\"lpSlope\","
        "\"label\":\"LP Slope\","
        "\"defaultValue\":4,"
        "\"min\":0,"
        "\"mid\":2,"
        "\"max\":4,"
        "\"step\":1,"
        "\"choices\":[\"Bypass\",\"6\",\"12\",\"18\",\"24\"],"
        "\"tooltip\":\"Lowpass ladder slope. Bypass skips the LP stage.\""
      "},"
      "{"
        "\"key\":\"lowFrequency\","
        "\"label\":\"Low Cut\","
        "\"kind\":\"frequency\","
        "\"defaultValue\":200,"
        "\"min\":0,"
        "\"mid\":200,"
        "\"max\":20000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\""
      "},"
      "{"
        "\"key\":\"highFrequency\","
        "\"label\":\"High Cut\","
        "\"kind\":\"frequency\","
        "\"defaultValue\":1000,"
        "\"min\":0,"
        "\"mid\":1000,"
        "\"max\":20000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\""
      "},"
      "{"
        "\"key\":\"resonance\","
        "\"label\":\"Resonance\","
        "\"defaultValue\":0.2,"
        "\"min\":0,"
        "\"mid\":0.2,"
        "\"max\":1,"
        "\"step\":\"any\""
      "},"
      "{"
        "\"key\":\"feedbackCircuit\","
        "\"label\":\"Feedback Circuit\","
        "\"defaultValue\":3,"
        "\"min\":0,"
        "\"mid\":1.5,"
        "\"max\":3,"
        "\"step\":1,"
        "\"choices\":[\"Off\",\"Resonance only\",\"Clipping only\",\"Res + Clip\"]"
      "},"
      "{"
        "\"key\":\"gainCompensation\","
        "\"label\":\"Gain Comp\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"mid\":1,"
        "\"max\":1,"
        "\"step\":1,"
        "\"choices\":[\"Off\",\"On\"]"
      "}"
    "]"
  "}";

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

static inline double dsp_tanh(double x) {
  return 1.0 - 2.0 / (dsp_exp_narrow(2.0 * x) + 1.0);
}

// ladderMode: 1 LP, 2 HP. stages: 1..4
static void compute_mix(int ladderMode, int stages, double c[5], double* s_out) {
  for (int i = 0; i < 5; i++) c[i] = 0.0;
  const int st = stages < 1 ? 1 : (stages > 4 ? 4 : stages);
  if (ladderMode == 1) {
    c[st] = 1.0;
    *s_out = st * 0.25;
  } else {
    static const double hp[4][5] = {
      {1.0, -1.0,  0.0,  0.0, 0.0},
      {1.0, -2.0,  1.0,  0.0, 0.0},
      {1.0, -3.0,  3.0, -1.0, 0.0},
      {1.0, -4.0,  6.0, -4.0, 1.0},
    };
    for (int i = 0; i <= st; i++) c[i] = hp[st - 1][i];
    *s_out = st * 0.25;
  }
}

struct LadderCore {
  double y[5];
};

struct ActiveFilterState {
  LadderCore hp;
  LadderCore lp;
  bool active;
};

static ActiveFilterState gPool[kMaxInstances];

static void ladder_core_reset(LadderCore& c) {
  for (int i = 0; i < 5; i++) c.y[i] = 0.0;
}

// Run one RS-MET multipole ladder stage. ladderMode 1=LP, 2=HP. stages 1..4.
static double run_ladder(
  LadderCore& core,
  double input,
  double cutoffHz,
  int ladderMode,
  int stages,
  double feedback,
  bool useClip,
  bool useGainComp,
  double sampleRate
) {
  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double maxFreq = safeRate * 0.49;
  const double hz = cutoffHz < 0.0 ? 0.0 : (cutoffHz > maxFreq ? maxFreq : cutoffHz);
  const int st = stages < 1 ? 1 : (stages > 4 ? 4 : stages);

  const double wc = clampd((2.0 * kPi * hz) / safeRate, 1e-9, kPi * 0.98);
  const double sine = dsp_sin_0_pi(wc);
  const double cosine = dsp_cos_0_pi(wc);
  const double tangent = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
  double a = sine - cosine * tangent;
  a = (a > -1e-12 && a < 1e-12) ? (a >= 0.0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;

  double c[5];
  double mixS;
  compute_mix(ladderMode, st, c, &mixS);

  const double b = 1.0 + a;
  const double denom = 1.0 + a * a + 2.0 * a * cosine;
  const double safeDenom = denom < 1e-12 ? 1e-12 : denom;
  const double g2 = (b * b) / safeDenom;
  const double g2sq = g2 * g2 < 1e-12 ? 1e-12 : g2 * g2;
  const double k = feedback / g2sq;
  const double g = useGainComp ? (1.0 + mixS * k) : 1.0;

  const double xIn = safe(input);
  const double driven = useClip ? dsp_tanh(xIn * 2.0) : xIn;
  const double safeIn = safe(g * driven - k * core.y[4]);
  double y0 = safeIn / (1.0 + safeIn * safeIn);
  const double ny1 = safe(y0 + a * (y0 - core.y[1]));
  const double ny2 = safe(ny1 + a * (ny1 - core.y[2]));
  const double ny3 = safe(ny2 + a * (ny2 - core.y[3]));
  const double ny4 = safe(ny3 + a * (ny3 - core.y[4]));
  core.y[0] = safe(y0);
  core.y[1] = ny1;
  core.y[2] = ny2;
  core.y[3] = ny3;
  core.y[4] = ny4;

  const double out = c[0] * core.y[0] + c[1] * core.y[1] + c[2] * core.y[2]
    + c[3] * core.y[3] + c[4] * core.y[4];
  return safe(out) * 0.41;
}

}  // namespace

extern "C" int soemdsp_active_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ActiveFilterState& s = gPool[i];
      ladder_core_reset(s.hp);
      ladder_core_reset(s.lp);
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

// Slope: 0=Bypass, 1..4 = 6/12/18/24 dB. Dual: HP then LP when both active.
extern "C" double soemdsp_active_filter_sample(
  int handle,
  double input,
  double lowFrequencyHz,
  double highFrequencyHz,
  int hpSlope,
  int lpSlope,
  double resonance,
  int feedbackCircuit,
  int gainCompensation,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ActiveFilterState& s = gPool[handle - 1];

  int hp = hpSlope < 0 ? 0 : (hpSlope > 4 ? 4 : hpSlope);
  int lp = lpSlope < 0 ? 0 : (lpSlope > 4 ? 4 : lpSlope);
  if (hp == 0 && lp == 0) {
    return safe(input);
  }

  const int circuit = feedbackCircuit < 0 ? 0 : (feedbackCircuit > 3 ? 3 : feedbackCircuit);
  const bool useRes = (circuit == 1 || circuit == 3);
  const bool useClip = (circuit == 2 || circuit == 3);
  const bool useGainComp = gainCompensation != 0;
  const double feedback = useRes ? clampd(resonance, 0.0, 1.0) : 0.0;
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;

  double x = safe(input);
  if (hp > 0) {
    x = run_ladder(s.hp, x, lowFrequencyHz, 2, hp, feedback, useClip, useGainComp, sr);
  }
  if (lp > 0) {
    x = run_ladder(s.lp, x, highFrequencyHz, 1, lp, feedback, useClip, useGainComp, sr);
  }
  return x;
}

extern "C" int soemdsp_active_filter_version() {
  return 2; // Dual Ladder: HP/LP slope Bypass..24
}

extern "C" const char* soemdsp_active_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_active_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
