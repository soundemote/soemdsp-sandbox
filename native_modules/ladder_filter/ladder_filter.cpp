// soemdsp-native-module: ladder_filter
// soemdsp-native-label: Ladder Filter
// soemdsp-native-target: ladderFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"ladder_filter\","
    "\"label\":\"Ladder Filter\","
    "\"targetType\":\"ladderFilter\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"mode\","
        "\"label\":\"Mode\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"mid\":1,"
        "\"max\":3,"
        "\"step\":1,"
        "\"choices\":[\"Flat\",\"Lowpass\",\"Highpass\",\"Bandpass\"],"
        "\"tooltip\":\"Selects the ladder output tap and filter response.\""
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
        "\"tooltip\":\"Sets the ladder cutoff frequency.\""
      "},"
      "{"
        "\"key\":\"resonance\","
        "\"label\":\"Resonance\","
        "\"defaultValue\":0.2,"
        "\"min\":0,"
        "\"mid\":0.2,"
        "\"max\":0.999,"
        "\"step\":\"any\","
        "\"tooltip\":\"Sets the feedback amount near the cutoff frequency.\""
      "},"
      "{"
        "\"key\":\"stages\","
        "\"label\":\"Stages\","
        "\"defaultValue\":4,"
        "\"min\":1,"
        "\"mid\":4,"
        "\"max\":4,"
        "\"step\":1,"
        "\"tooltip\":\"Chooses how many ladder stages are used.\""
      "}"
    "]"
  "}";

struct LadderState {
  double y[5];
  bool active;
  double lastOut;
  // CONTROL cache: frequency/resonance/mode/stages/sampleRate
  bool coeffsValid;
  double lastFrequency;
  double lastResonance;
  int lastMode;
  int lastStages;
  double lastSampleRate;
  double a;
  double c[5];
  double mixS;
  double k;
  double g;
};

static LadderState gPool[kMaxInstances];

static void compute_mix(int mode, int stages, double c[5], double* s_out);

static void sync_ladder_coeffs(
  LadderState& s,
  double frequency,
  double resonance,
  int mode,
  int stages,
  double sampleRate
) {
  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double maxFreq  = safeRate * 0.49 < 20000.0 ? safeRate * 0.49 : 20000.0;
  const double safeFreq = frequency < 0.000001 ? 0.000001 : (frequency > maxFreq ? maxFreq : frequency);
  const double feedback  = resonance < 0.0 ? 0.0 : (resonance > 0.999 ? 0.999 : resonance);
  const int safeMode    = mode < 0 ? 0 : (mode > 3 ? 3 : mode);
  const int safeStages  = stages < 1 ? 1 : (stages > 4 ? 4 : stages);

  if (s.coeffsValid
      && safeFreq == s.lastFrequency
      && feedback == s.lastResonance
      && safeMode == s.lastMode
      && safeStages == s.lastStages
      && safeRate == s.lastSampleRate) {
    return;
  }

  const double rawWc    = 2.0 * kPi * safeFreq / safeRate;
  const double wc       = rawWc < 1e-9 ? 1e-9 : (rawWc > kPi * 0.98 ? kPi * 0.98 : rawWc);
  const double sine    = dsp_sin_0_pi(wc);
  const double cosine  = dsp_cos_0_pi(wc);
  const double tangent = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));

  double a = (sine - cosine * tangent);
  a = (a < 1e-12 && a > -1e-12) ? (a >= 0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;
  if (a * 0.0 != 0.0) a = -1.0;

  double c[5];
  double mixS;
  compute_mix(safeMode, safeStages, c, &mixS);

  const double b     = 1.0 + a;
  const double denom = 1.0 + a * a + 2.0 * a * cosine;
  const double safeDenom = denom < 1e-12 ? 1e-12 : denom;
  const double g2    = (b * b) / safeDenom;
  const double g2sq  = g2 * g2 < 1e-12 ? 1e-12 : g2 * g2;
  const double k     = feedback / g2sq;
  const double g     = 1.0 + mixS * k;

  s.a = a;
  for (int i = 0; i < 5; i++) s.c[i] = c[i];
  s.mixS = mixS;
  s.k = k;
  s.g = g;
  s.lastFrequency = safeFreq;
  s.lastResonance = feedback;
  s.lastMode = safeMode;
  s.lastStages = safeStages;
  s.lastSampleRate = safeRate;
  s.coeffsValid = true;
}

static void compute_mix(int mode, int stages, double c[5], double* s_out) {
  for (int i = 0; i < 5; i++) c[i] = 0.0;
  if (mode == 0) {
    c[0] = 1.0;
    *s_out = 0.125;
  } else if (mode == 1) {
    c[stages] = 1.0;
    *s_out = stages * 0.25;
  } else if (mode == 2) {
    static const double bp[4][5] = {
      {1.0, -1.0,  0.0,  0.0, 0.0},
      {1.0, -2.0,  1.0,  0.0, 0.0},
      {1.0, -3.0,  3.0, -1.0, 0.0},
      {1.0, -4.0,  6.0, -4.0, 1.0},
    };
    for (int i = 0; i <= stages; i++) c[i] = bp[stages - 1][i];
    *s_out = stages * 0.25;
  } else {
    static const double m3[4][5] = {
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 2.0, -2.0,  0.0, 0.0},
      {0.0, 0.0,  3.0, -3.0, 0.0},
      {0.0, 0.0,  4.0, -8.0, 4.0},
    };
    for (int i = 0; i < 5; i++) c[i] = m3[stages - 1][i];
    *s_out = 0.125;
  }
}

}  // namespace

extern "C" int soemdsp_ladder_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LadderState& s = gPool[i];
      for (int j = 0; j < 5; j++) s.y[j] = 0.0;
      s.lastOut = 0.0;
      s.coeffsValid = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ladder_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_ladder_filter_sample(
  int handle,
  double input,
  double frequency,
  double resonance,
  int mode,
  int stages,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  LadderState& s = gPool[handle - 1];

  // CONTROL: freq/res/mode/stages/SR → sin/cos/tan + mix taps cached.
  // LIVE: audio input only.
  sync_ladder_coeffs(s, frequency, resonance, mode, stages, sampleRate);

  const double a = s.a;
  const double k = s.k;
  const double g = s.g;
  const double* c = s.c;

  const double safeIn = safe(input);
  double y0 = g * safeIn - k * s.y[4];
  y0 = safe(y0 / (1.0 + y0 * y0));
  const double ny1 = safe(y0      + a * (y0      - s.y[1]));
  const double ny2 = safe(ny1     + a * (ny1     - s.y[2]));
  const double ny3 = safe(ny2     + a * (ny2     - s.y[3]));
  const double ny4 = safe(ny3     + a * (ny3     - s.y[4]));
  s.y[0] = y0;
  s.y[1] = ny1;
  s.y[2] = ny2;
  s.y[3] = ny3;
  s.y[4] = ny4;

  const double out = c[0]*s.y[0] + c[1]*s.y[1] + c[2]*s.y[2] + c[3]*s.y[3] + c[4]*s.y[4];
  s.lastOut = safe(out);
  return s.lastOut;
}

extern "C" int soemdsp_ladder_filter_version() {
  return 1;
}

extern "C" const char* soemdsp_ladder_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_ladder_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
