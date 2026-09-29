// soemdsp-native-module: acoustic_pluck
// soemdsp-native-label: Acoustic Pluck
// soemdsp-native-target: acousticPluck
// soemdsp-native-kind: envelope
//
// Bake of patches/modulator breadboards/pluck envelope.json feedback circuit:
//   Curve AR (Gate/Trigger) with Attack/Release/curves
//   Env -> invert -> attenuverter(feedback, bias) -> Amp Curve Exp
//     -> unit-MOD into Release (same fold as graph control_effective)
// KT is a note-mask input. The host reduces its 128-key mask to a normalized
// highest-active MIDI key; the baked Inv/Attenuverter path below applies it to Attack.
// Feedback uses a 128-sample delay (about one quantum), same class as Thump.
// UpdateOnTrigger latches knob times/curves/amplitude/inputMode on rise;
// Feedback/Bias (and the computed release MOD) stay live. Inner Curve AR
// always runs with UpdateOnTrigger Off so release feedback is never frozen.

#include <soemdsp/soemdsp.hpp>

extern "C" int soemdsp_curve_attack_release_create();
extern "C" void soemdsp_curve_attack_release_destroy(int handle);
extern "C" double soemdsp_curve_attack_release_sample(
  int handle,
  double gate,
  double attack,
  double attackShape,
  double release,
  double releaseShape,
  double amplitude,
  double inputMode,
  double updateOnTrigger,
  double sampleRate
);

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kFbDelaySamples = 128;
static const double kExpDbSpan = 5.0;
static const double kLn10 = 2.302585092994046;
static const double kReleaseMin = 0.0;
static const double kReleaseMax = 10.0;
// Breadboard KT path: Inv (-in) -> Attenuverter (x0.31250587099718496 - 0.1)
// -> unit MOD on Curve AR Attack (0..5 s).
static const double kKtAmplitude = 0.31250587099718496;
static const double kKtOffset = -0.1;
static const double kAttackMin = 0.0;
static const double kAttackMax = 5.0;

struct State {
  int ar;
  double fbDelay[kFbDelaySamples];
  int fbIdx;
  double lastGate;
  double latchAttack;
  double latchAttackShape;
  double latchRelease;
  double latchReleaseShape;
  double latchAmplitude;
  double latchInputMode;
  bool hasLatch;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"acoustic_pluck\","
    "\"label\":\"Acoustic Pluck\","
    "\"targetType\":\"acousticPluck\","
    "\"kind\":\"envelope\""
  "}";

// Amp Curve Exp: 10^(5*(x-1)), 0 at x<=0, 1 at x>=1. Matches amp_curve.cpp.
static double amp_curve_exp(double input) {
  const double x = clamp01(safe(input));
  if (!(x > 0.0)) return 0.0;
  if (x >= 1.0) return 1.0;
  const double y = dsp_exp(kExpDbSpan * (x - 1.0) * kLn10);
  if (!(y * 0.0 == 0.0) || y < 0.0) return 0.0;
  return y > 1.0 ? 1.0 : y;
}

// Unit MOD fold: result = min + (baseUnit + mod) * range, clamped.
// Same contract as graph_engine control_effective for 0..1 unit MOD.
static double fold_unit_mod(double base, double mod, double minV, double maxV) {
  const double range = maxV - minV;
  const double m = safe(mod);
  if (!(range > 0.0) || m == 0.0) {
    return clamp(safe(base), minV, maxV);
  }
  const double baseUnit = (safe(base) - minV) / range;
  return clamp(minV + (baseUnit + m) * range, minV, maxV);
}

}  // namespace

extern "C" int soemdsp_acoustic_pluck_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.ar = soemdsp_curve_attack_release_create();
      if (s.ar < 1) return 0;
      for (int n = 0; n < kFbDelaySamples; n++) s.fbDelay[n] = 0.0;
      s.fbIdx = 0;
      s.lastGate = 0.0;
      s.latchAttack = 0.0;
      s.latchAttackShape = -0.07;
      s.latchRelease = 0.11715292599242004;
      s.latchReleaseShape = 1.0;
      s.latchAmplitude = 1.0;
      s.latchInputMode = 1.0;
      s.hasLatch = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_acoustic_pluck_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  soemdsp_curve_attack_release_destroy(s.ar);
  s.ar = 0;
  s.active = false;
}

extern "C" double soemdsp_acoustic_pluck_sample(
  int handle,
  double gate,
  double keyTrack,
  double keyTrackConnected,
  double attack,
  double attackShape,
  double release,
  double releaseShape,
  double feedback,
  double bias,
  double amplitude,
  double inputMode,
  double updateOnTrigger,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double safeGate = safe(gate);
  const bool latchMode = safe(updateOnTrigger) >= 0.5;
  const bool rising = rising_edge(safeGate, &s.lastGate, 0.0);

  double atk = maxd(0.0, safe(attack));
  if (safe(keyTrackConnected) >= 0.5) {
    const double kt = clamp01(safe(keyTrack));
    const double attackMod = (-kt) * kKtAmplitude + kKtOffset;
    atk = fold_unit_mod(atk, attackMod, kAttackMin, kAttackMax);
  }
  double atkShape = safe(attackShape);
  double rel = maxd(0.0, safe(release));
  double relShape = safe(releaseShape);
  double amp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  double mode = safe(inputMode);
  // Feedback / Bias always live (breadboard knobs into the release MOD path).
  const double fbAmt = safe(feedback);
  const double fbBias = safe(bias);

  if (latchMode) {
    if (rising || !s.hasLatch) {
      s.latchAttack = atk;
      s.latchAttackShape = atkShape;
      s.latchRelease = rel;
      s.latchReleaseShape = relShape;
      s.latchAmplitude = amp;
      s.latchInputMode = mode;
      s.hasLatch = true;
    }
    atk = s.latchAttack;
    atkShape = s.latchAttackShape;
    rel = s.latchRelease;
    relShape = s.latchReleaseShape;
    amp = s.latchAmplitude;
    mode = s.latchInputMode;
  } else {
    s.hasLatch = false;
  }

  // Delayed env -> invert -> attenuverter -> Amp Curve Exp -> unit MOD on Release.
  const double delayed = s.fbDelay[s.fbIdx];
  const double atten = (-delayed) * fbAmt + fbBias;
  const double releaseMod = amp_curve_exp(atten);
  const double effRelease = fold_unit_mod(rel, releaseMod, kReleaseMin, kReleaseMax);

  // Inner AR always live so release feedback is never frozen by UpdateOnTrigger.
  const double env = soemdsp_curve_attack_release_sample(
    s.ar,
    gate,
    atk,
    atkShape,
    effRelease,
    relShape,
    amp,
    mode,
    0.0,
    sampleRate
  );
  const double envSafe = (env * 0.0 == 0.0) ? env : 0.0;

  s.fbDelay[s.fbIdx] = clamp(envSafe, 0.0, 1.0);
  s.fbIdx++;
  if (s.fbIdx >= kFbDelaySamples) s.fbIdx = 0;

  return envSafe;
}

extern "C" int soemdsp_acoustic_pluck_version() { return 3; }
extern "C" const char* soemdsp_acoustic_pluck_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_acoustic_pluck_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
