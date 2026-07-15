// soemdsp-native-module: passive_filter
// soemdsp-native-label: Passive Filter
// soemdsp-native-target: passiveFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET

// 1-pole RC-style filter in three modes: LP, HP, and BP (HP then LP cascaded).
// mode 0 = LP  (uses highFrequency as cutoff)
// mode 1 = HP  (uses lowFrequency as cutoff)
// mode 2 = BP  (HP at lowFrequency, then LP at highFrequency)

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"passive_filter\","
    "\"label\":\"Passive Filter\","
    "\"targetType\":\"passiveFilter\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"mode\","
        "\"label\":\"Mode\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":1,"
        "\"max\":2,"
        "\"step\":1,"
        "\"choices\":[\"LP\",\"BP\",\"HP\"],"
        "\"tooltip\":\"LP uses High Cut as cutoff. BP chains Low Cut then High Cut. HP uses Low Cut as cutoff.\""
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
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Highpass cutoff. Used in HP and BP modes.\""
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
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Lowpass cutoff. Used in LP and BP modes.\""
      "}"
    "]"
  "}";

static const int kMaxInstances = 64;
struct PassiveState {
  double lpOut;   // LP stage output
  double hpOut;   // HP stage output
  double hpIn;    // HP stage previous input
  bool active;
};

static PassiveState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_passive_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PassiveState& s = gPool[i];
      s.lpOut = 0.0;
      s.hpOut = 0.0;
      s.hpIn  = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_passive_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_passive_filter_sample(
  int    handle,
  double input,
  int    mode,
  double lowFrequency,
  double highFrequency,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PassiveState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double maxW = kTwoPi / rate * 0.45;  // cap at ~0.45 * sample rate

  const double safeIn = safe(input);

  if (mode == 1) {
    // BP mode: HP at lowFrequency, then LP at highFrequency
    const double hpFreq = lowFrequency < 0.0 ? 0.0 : (lowFrequency > 20000.0 ? 20000.0 : lowFrequency);
    const double hpW  = hpFreq * kTwoPi / rate;
    const double hpWc = hpW > maxW ? maxW : hpW;
    const double hpA1 = dsp_exp_squaring(-hpWc);
    const double hpB0 = 0.5 * (1.0 + hpA1);
    s.hpOut = safe(hpB0 * safeIn - hpB0 * s.hpIn + hpA1 * s.hpOut);
    s.hpIn  = safeIn;

    const double lpFreq = highFrequency < 0.0 ? 0.0 : (highFrequency > 20000.0 ? 20000.0 : highFrequency);
    const double lpW  = lpFreq * kTwoPi / rate;
    const double lpWc = lpW > maxW ? maxW : lpW;
    const double lpA1 = dsp_exp_squaring(-lpWc);
    const double lpB0 = 1.0 - lpA1;
    s.lpOut = safe(lpB0 * s.hpOut + lpA1 * s.lpOut);
    return s.lpOut;
  }

  if (mode == 2) {
    // HP mode: uses lowFrequency
    const double freq = lowFrequency < 0.0 ? 0.0 : (lowFrequency > 20000.0 ? 20000.0 : lowFrequency);
    const double w  = freq * kTwoPi / rate;
    const double wc = w > maxW ? maxW : w;
    const double a1 = dsp_exp_squaring(-wc);
    const double b0 = 0.5 * (1.0 + a1);
    s.hpOut = safe(b0 * safeIn - b0 * s.hpIn + a1 * s.hpOut);
    s.hpIn  = safeIn;
    return s.hpOut;
  }

  // LP mode (default, mode == 0): uses highFrequency
  const double freq = highFrequency < 0.0 ? 0.0 : (highFrequency > 20000.0 ? 20000.0 : highFrequency);
  const double w  = freq * kTwoPi / rate;
  const double wc = w > maxW ? maxW : w;
  const double a1 = dsp_exp_squaring(-wc);
  const double b0 = 1.0 - a1;
  s.lpOut = safe(b0 * safeIn + a1 * s.lpOut);
  return s.lpOut;
}

extern "C" int soemdsp_passive_filter_version() {
  return 1;
}

extern "C" const char* soemdsp_passive_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_passive_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
