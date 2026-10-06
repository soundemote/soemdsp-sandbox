// soemdsp-native-module: pluck_envelope_fb
// soemdsp-native-label: Pluck Envelope
// soemdsp-native-target: pluckEnvelope
// soemdsp-native-kind: envelope
//
// Bake of patches/modulator breadboards/pluck envelope.json feedback circuit:
//   Curve AR (Gate/Trigger) with Attack/Release/curves
//   Env -> invert -> attenuverter(feedback, bias) -> Amp Curve Exp
//     -> unit-MOD into Release (same fold as graph control_effective)
// KT is MIDI pitch 0..127. The baked Inv/Attenuverter path applies it to Attack.
// Env feedback is a 1-sample delay so Tail and Synth vs Acoustic act on the live Env.
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
static const int kFbDelaySamples = 1;
static const double kExpDbSpan = 5.0;
static const double kLn10 = 2.302585092994046;
static const double kReleaseMin = 0.0;
// Breadboard Curve AR Release max on the knob-driven unit-MOD destination
// (patches/modulator breadboards/pluck envelope.json). Shop Curve AR stays 10 s.
static const double kReleaseMax = 100.0;
static const double kTailMax = 2.2;
// Breadboard KT: MIDI 0..127 → /127 → invert → attenuverter (×0.3125 − 0.1)
// → unit MOD on Attack 0..0.02 s. MIDI 0 ⇒ U=-0.1; MIDI 127 ⇒ U=-0.4125.
static const double kKtAmplitude = 0.31250587099718496;
static const double kKtOffset = -0.1;
static const double kMidiOne = 1.0 / 127.0;
static const double kAttackMin = 0.0;
static const double kAttackMax = 0.02;

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
  double velocity;
  bool hasLatch;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pluck_envelope_fb\","
    "\"label\":\"Pluck Envelope\","
    "\"targetType\":\"pluckEnvelope\","
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

extern "C" int soemdsp_pluck_envelope_fb_create() {
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
      s.velocity = 1.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pluck_envelope_fb_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  soemdsp_curve_attack_release_destroy(s.ar);
  s.ar = 0;
  s.active = false;
}

extern "C" double soemdsp_pluck_envelope_fb_sample(
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
  const bool rising = gate_hit(safeGate, &s.lastGate);

  double soften = safe(attack);
  if (soften < 0.0) soften = 0.0;
  if (soften > 1.0) soften = 1.0;
  double atk = soften * kAttackMax;
  if (safe(keyTrackConnected) >= 0.5) {
    const double midi = safe(keyTrack);
    const double kt = midi * kMidiOne;
    const double attackMod = (-kt) * kKtAmplitude + kKtOffset;
    atk = fold_unit_mod(atk, attackMod, kAttackMin, kAttackMax);
  }
  double atkShape = safe(attackShape);
  double rel = maxd(0.0, safe(release));
  double relShape = safe(releaseShape);
  double amp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  double mode = safe(inputMode);
  if (rising) {
    s.velocity = maxd(0.0, safeGate);
  }
  // Feedback / Bias always live (breadboard knobs into the release MOD path).
  const double tail = safe(feedback);
  const double fbAmt = kTailMax - tail;
  const double fbBias = safe(bias);

  if (latchMode) {
    if (rising || !s.hasLatch) {
      s.latchAttack = atk;
      s.latchAttackShape = atkShape;
      s.latchRelease = rel;
      s.latchReleaseShape = relShape;
      s.latchInputMode = mode;
      s.hasLatch = true;
    }
    atk = s.latchAttack;
    atkShape = s.latchAttackShape;
    rel = s.latchRelease;
    relShape = s.latchReleaseShape;
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
  // Binary gate: Curve AR peaks at Gate height, and Pluck applies its own
  // velocity below, so the inner AR must peak at 1.
  const double env = soemdsp_curve_attack_release_sample(
    s.ar,
    gate_on(safeGate) ? 1.0 : 0.0,
    atk,
    atkShape,
    effRelease,
    relShape,
    1.0,
    mode,
    0.0,
    sampleRate
  );
  const double shape = (env * 0.0 == 0.0) ? env : 0.0;

  s.fbDelay[s.fbIdx] = clamp(shape, 0.0, 1.0);
  s.fbIdx++;
  if (s.fbIdx >= kFbDelaySamples) s.fbIdx = 0;

  const double vel = (s.velocity * 0.0 == 0.0) ? s.velocity : 1.0;
  const double out = clamp(shape, 0.0, 1.0) * vel * amp;
  return (out * 0.0 == 0.0) ? out : 0.0;
}

extern "C" int soemdsp_pluck_envelope_fb_version() { return 4; }
extern "C" const char* soemdsp_pluck_envelope_fb_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_pluck_envelope_fb_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
