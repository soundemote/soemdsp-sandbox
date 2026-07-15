// soemdsp-native-module: vactrol_envelope
// soemdsp-native-label: Vactrol Envelope
// soemdsp-native-target: vactrolEnvelope
// soemdsp-native-kind: envelope

// Shared DSP for both vactrol modules (the VTL5C Series selector
// "vactrolEnvelopeSeries" and "vactrolEnvelopeCustom" on the JS side). The
// parts differ only in their default attack/release/resistance figures,
// which live in the JS module definitions -- this binary just runs whatever
// attack/release/curve/sensitivity/lightOffset/darkCurrent values a given
// node instance passes in, exactly like passive_filter's single WASM serving
// LP/BP/HP via a mode param.
//
// "VTL5C1" through "VTL5C10" are PerkinElmer/Excelitas part numbers used here
// only as descriptive labels (nominative fair use) so the attack/release/
// resistance defaults mean something to someone who knows those datasheets.
// No PerkinElmer code, schematics, or datasheet text is reproduced -- this is
// an independent envelope-follower model built from publicly published
// timing/resistance figures, and this project is not affiliated with or
// endorsed by PerkinElmer or Excelitas.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"vactrol_envelope\","
    "\"label\":\"Vactrol Envelope\","
    "\"targetType\":\"vactrolEnvelope\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Light\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"attack\","
        "\"label\":\"Attack\","
        "\"kind\":\"time\","
        "\"defaultValue\":0.0025,"
        "\"min\":0,"
        "\"mid\":0.0025,"
        "\"max\":2,"
        "\"step\":\"any\","
        "\"unit\":\"s\","
        "\"tooltip\":\"Time constant for the light-detector rising toward a brighter target.\""
      "},"
      "{"
        "\"key\":\"release\","
        "\"label\":\"Release\","
        "\"kind\":\"time\","
        "\"defaultValue\":0.035,"
        "\"min\":0,"
        "\"mid\":0.035,"
        "\"max\":5,"
        "\"step\":\"any\","
        "\"unit\":\"s\","
        "\"tooltip\":\"Time constant for the light-detector falling toward a dimmer target.\""
      "},"
      "{"
        "\"key\":\"curve\","
        "\"label\":\"Curve\","
        "\"defaultValue\":1,"
        "\"min\":0.001,"
        "\"mid\":1,"
        "\"max\":8,"
        "\"step\":\"any\","
        "\"tooltip\":\"Photoconductive gamma exponent applied to the smoothed light level.\""
      "},"
      "{"
        "\"key\":\"sensitivity\","
        "\"label\":\"Sensitivity\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"mid\":1,"
        "\"max\":4,"
        "\"step\":\"any\","
        "\"tooltip\":\"Gain applied to the Light input before it drives the detector.\""
      "},"
      "{"
        "\"key\":\"lightOffset\","
        "\"label\":\"Light Offset\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":0,"
        "\"max\":1,"
        "\"step\":\"any\","
        "\"tooltip\":\"Ambient light bias added before the detector target is clamped.\""
      "},"
      "{"
        "\"key\":\"darkCurrent\","
        "\"label\":\"Dark Current\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":0,"
        "\"max\":1,"
        "\"step\":\"any\","
        "\"tooltip\":\"Output floor / leakage when the cell is unlit.\""
      "}"
    "]"
  "}";

static const int kMaxInstances = 64;

struct VactrolState {
  double raw;   // smoothed, unshaped light level
  double out;   // shaped output
  bool   active;
};

static VactrolState gPool[kMaxInstances];

// Fast approximate pow(base, exponent) for base > 0 via IEEE-754 double bit
// manipulation (the well-known Schraudolph/Ankerl "fastpow" one-liner). Good
// to within a few percent -- this only shapes a curve-response knob, not used
// anywhere precision-critical.
static inline double dsp_pow(double base, double exponent) {
  if (base <= 0.0) return 0.0;
  union { double d; int x[2]; } u;
  u.d = base;
  u.x[1] = (int)(exponent * (double)(u.x[1] - 1072632447) + 1072632447.0);
  u.x[0] = 0;
  return u.d;
}

static double vactrol_coefficient(double seconds, double sampleRate) {
  if (!(seconds > 0.0)) {
    return 1.0;
  }
  double samples = seconds * (sampleRate < 1.0 ? 1.0 : sampleRate);
  if (samples < 1.0) samples = 1.0;
  return 1.0 - dsp_exp_squaring(-1.0 / samples);
}

}  // namespace

extern "C" int soemdsp_vactrol_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      VactrolState& s = gPool[i];
      s.raw = 0.0;
      s.out = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_vactrol_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_vactrol_envelope_sample(
  int    handle,
  double light,
  double attack,
  double release,
  double curve,
  double sensitivity,
  double lightOffset,
  double darkCurrent,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  VactrolState& s = gPool[handle - 1];

  const double safeLight = safe(light);
  const double safeAttack = attack > 0.0 ? attack : 0.0;
  const double safeRelease = release > 0.0 ? release : 0.0;
  const double safeCurve = curve > 0.001 ? curve : 0.001;
  const double safeSensitivity = sensitivity > 0.0 ? sensitivity : 0.0;
  const double safeLightOffset = clamp(lightOffset, 0.0, 1.0);
  const double safeDarkCurrent = clamp(darkCurrent, 0.0, 1.0);
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;

  const double target = clamp(safeLight * safeSensitivity + safeLightOffset, 0.0, 1.0);
  const double coefficient = target > s.raw
    ? vactrol_coefficient(safeAttack, rate)
    : vactrol_coefficient(safeRelease, rate);
  s.raw = safe(s.raw + (target - s.raw) * coefficient);
  const double shaped = dsp_pow(clamp(s.raw, 0.0, 1.0), safeCurve);
  s.out = clamp(safeDarkCurrent + shaped * (1.0 - safeDarkCurrent), 0.0, 1.0);
  return safe(s.out);
}

extern "C" int soemdsp_vactrol_envelope_version() {
  return 1;
}

extern "C" const char* soemdsp_vactrol_envelope_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_vactrol_envelope_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
