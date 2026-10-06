// soemdsp-native-module: vactrol_envelope
// soemdsp-native-label: Vactrol
// soemdsp-native-target: vactrol
// soemdsp-native-kind: envelope
//
// Roll-your-own optical-lag envelope (soemdsp::modulator::Vactrol style):
// Light in → attack/release one-pole → gamma curve → dark-current floor.

// Model (waveform Control; choiceIds ModelA=0 default, ModelB=1):
//   ModelA = original one-pole attack/release + fast dsp_pow gamma (unchanged).
//   ModelB = vactrol-style: level-dependent release + light memory + exact pow.
//     target      = clamp(light * sensitivity, 0, 1)
//     rise:  raw += (target - raw) * (1 - exp(-1 / (attack * sr)))
//     fall:  scale       = pow(10, kReleaseDecades * (raw - kReleaseRefLevel))
//            release_eff = release * (1 + kMemoryDepth * m)
//            raw += (target - raw) * (1 - exp(-scale / (release_eff * sr)))
//     memory: m += (raw - m) * (1 - exp(-1 / (tau * sr)))   tau = kMemoryRise up / kMemoryFall down
//     out = pow(raw, curve), raw snapped to 0 below kSnapFloor when dark.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"vactrol_envelope\","
    "\"label\":\"Vactrol\","
    "\"targetType\":\"vactrol\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Light\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"model\","
        "\"label\":\"Model\","
        "\"kind\":\"choice\","
        "\"choices\":[\"ModelA\",\"ModelB\"],"
        "\"choiceIds\":[0,1],"
        "\"defaultValue\":\"ModelA\","
        "\"tooltip\":\"ModelA = original one-pole. ModelB = level-dependent release with light memory.\""
      "},"
      "{"
        "\"key\":\"attack\","
        "\"label\":\"Attack\","
        "\"kind\":\"time\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":0.01,"
        "\"max\":2,"
        "\"step\":\"any\","
        "\"unit\":\"s\","
        "\"tooltip\":\"Time constant for the light-detector rising toward a brighter target. 0 = instant.\""
      "},"
      "{"
        "\"key\":\"release\","
        "\"label\":\"Release\","
        "\"kind\":\"time\","
        "\"defaultValue\":0.1,"
        "\"min\":0,"
        "\"mid\":0.1,"
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
      "}"
    "]"
  "}";

static const int kMaxInstances = 64;

// ModelB tuning.
static const double kReleaseDecades = 2.0;    // release rate spans pow(10, 2) = 100x from bright to dark
static const double kReleaseRefLevel = 0.25;  // raw level where the Release knob is the actual time constant
static const double kMemoryDepth = 2.0;       // fully "charged" memory triples the release time
static const double kMemoryRise = 1.0;        // s, memory charge time constant while lit
static const double kMemoryFall = 3.0;        // s, memory discharge time constant while dark
static const double kSnapFloor = 1.0e-6;      // raw below this with dark target snaps to exactly 0

struct VactrolState {
  double raw;   // smoothed, unshaped light level
  double out;   // shaped output
  double m;     // ModelB light memory (slow follower of raw)
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

// ModelB step (see header comment for the equations). Returns shaped Out.
static double vactrol_model_b(
  VactrolState& s, double target, double attack, double release, double curve, double sampleRate
) {
  double k;
  if (target > s.raw) {
    k = vactrol_coefficient(attack, sampleRate);
  } else {
    // scale = pow(10, D * (raw - ref)); k = 1 - exp(-scale / (release_eff * sr))
    const double scale = pow_pos(10.0, kReleaseDecades * (clamp(s.raw, 0.0, 1.0) - kReleaseRefLevel));
    const double releaseEff = release * (1.0 + kMemoryDepth * s.m);
    k = vactrol_coefficient(releaseEff / scale, sampleRate);
  }
  s.raw = safe(s.raw + (target - s.raw) * k);
  if (target < kSnapFloor && s.raw < kSnapFloor) s.raw = 0.0;
  // m += (raw - m) * (1 - exp(-1 / (tau * sr)))
  const double km = vactrol_coefficient(s.raw > s.m ? kMemoryRise : kMemoryFall, sampleRate);
  s.m = safe(s.m + (s.raw - s.m) * km);
  // out = pow(raw, curve), exact pow (pow_pos(0, c) = 0).
  s.out = clamp(pow_pos(clamp(s.raw, 0.0, 1.0), curve), 0.0, 1.0);
  return safe(s.out);
}

}  // namespace

extern "C" int soemdsp_vactrol_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      VactrolState& s = gPool[i];
      s.raw = 0.0;
      s.out = 0.0;
      s.m = 0.0;
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
  double model,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  VactrolState& s = gPool[handle - 1];

  const double safeLight = safe(light);
  const double safeAttack = attack > 0.0 ? attack : 0.0;
  const double safeRelease = release > 0.0 ? release : 0.0;
  const double safeCurve = curve > 0.001 ? curve : 0.001;
  const double safeSensitivity = sensitivity > 0.0 ? sensitivity : 0.0;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;

  // target = Light × Sensitivity (no light-offset bias; settles to 0 when dark).
  const double target = clamp(safeLight * safeSensitivity, 0.0, 1.0);
  // ModelB (choiceId 1). ModelA (0 / default) falls through to the original path.
  if (safe(model) >= 0.5) {
    return vactrol_model_b(s, target, safeAttack, safeRelease, safeCurve, rate);
  }
  const double coefficient = target > s.raw
    ? vactrol_coefficient(safeAttack, rate)
    : vactrol_coefficient(safeRelease, rate);
  s.raw = safe(s.raw + (target - s.raw) * coefficient);
  // Gamma shape only — no dark-current floor, so Out → 0 when Light stays 0.
  s.out = clamp(dsp_pow(clamp(s.raw, 0.0, 1.0), safeCurve), 0.0, 1.0);
  return safe(s.out);
}

extern "C" int soemdsp_vactrol_envelope_version() {
  return 3; // 2: no lightOffset / darkCurrent. 3: Model choice (ModelA / ModelB)
}

extern "C" const char* soemdsp_vactrol_envelope_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_vactrol_envelope_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
