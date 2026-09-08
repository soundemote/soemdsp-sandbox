// soemdsp-native-module: thump_envelope
// soemdsp-native-label: Thump Envelope
// soemdsp-native-target: thumpEnvelope
// soemdsp-native-kind: envelope
//
// Exact bake of patches/pluck envelope 2.json feedback circuit:
//   Curve ADSR with sustain base permanently 1.0
//   Env × kFbAmplitude → Range(0…1 → 0…−0.149629) →
//     × Decay Snap → decay MOD
//     × Decay Body → sustain MOD  (Body has full control of sustain)
// Gate height latched on rise = velocity (same role Amplitude used to have on
// the env before Range): softer Gate → lower env → less-high pluck + less fb.
// Amplitude knob is a final output trim only — not the feedback path.
// Feedback is always live (128-sample delay ≈ graph cycle).
// UpdateOnTrigger latches knob depths / times on Gate rise — not the
// feedback-computed decay/sustain (those must stay live for Body/Snap).

#include "../sandbox_native_maths/sandbox_native_maths.h"

extern "C" int soemdsp_exp_adsr_create();
extern "C" void soemdsp_exp_adsr_destroy(int handle);
extern "C" double soemdsp_exp_adsr_sample(
  int handle,
  double gate,
  double delay,
  double attack,
  double attackShape,
  double decay,
  double sustain,
  double release,
  double releaseShape,
  double loop,
  double level,
  double updateOnTrigger,
  double sampleRate
);

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kFbDelaySamples = 128;

// patches/pluck envelope 2.json — sustain knob stays 1; Body MOD owns sustain.
static const double kBaseDecay = 1.5052382613562978;
static const double kBaseSustain = 1.0;
// Hardcoded amplitude into feedback (before Range). Not the Amplitude knob.
static const double kFbAmplitude = 0.980691228326368;
static const double kRangeOutHigh = -0.14962892525665872;
static const double kDefaultFallCurve = 0.8062943900342834;
static const double kDefaultAttackShape = 0.30276154850217574;
static const double kDecayMin = 0.0;
static const double kDecayMax = 10.0;
static const double kSustainMin = 0.0;
static const double kSustainMax = 1.0;

struct State {
  int adsr;
  double fbDelay[kFbDelaySamples];
  int fbIdx;
  double lastGate;
  // Gate height at rise → scales feedback (velocity). Always latched on rise.
  double gateVel;
  // Latched when UpdateOnTrigger On (knob depths / times only).
  double latchSnapDepth;
  double latchBodyDepth;
  double latchAttack;
  double latchRelease;
  double latchFall;
  double latchLoop;
  double latchLevel;
  bool hasLatch;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"thump_envelope\","
    "\"label\":\"Thump Envelope\","
    "\"targetType\":\"thumpEnvelope\","
    "\"kind\":\"envelope\""
  "}";

static double fold_param(double base, double mod, double minV, double maxV) {
  const double range = maxV - minV;
  double domainAdd = 0.0;
  double unitAdd = 0.0;
  if (mod > 1.0 || mod < -1.0) domainAdd = mod;
  else unitAdd = mod;
  double result = base + domainAdd;
  if (range > 0.0 && unitAdd != 0.0) {
    const double baseUnit = (base - minV) / range;
    result = minV + (baseUnit + unitAdd) * range + domainAdd;
  }
  return clamp(result, minV, maxV);
}

static double ui_to_snap_depth(double decaySnap) {
  double snapUi = clamp(safe(decaySnap), 0.0, 1.0);
  if (!(snapUi * 0.0 == 0.0)) snapUi = 1.0;
  return 1.0 - snapUi; // UI up = longer = less atten
}

static double ui_to_body_depth(double decayBody) {
  // UI 0…1 inverted; legacy nodes may still send 0…10 atten-style.
  double bodyRaw = safe(decayBody);
  if (!(bodyRaw * 0.0 == 0.0)) bodyRaw = 0.0;
  double bodyUi;
  if (bodyRaw > 1.0) {
    bodyUi = 1.0 - clamp(bodyRaw, 0.0, 10.0) / 10.0;
  } else {
    bodyUi = clamp(bodyRaw, 0.0, 1.0);
  }
  return (1.0 - bodyUi) * 10.0; // patch atten-5 amp
}

}  // namespace

extern "C" int soemdsp_thump_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.adsr = soemdsp_exp_adsr_create();
      if (s.adsr < 1) return 0;
      for (int n = 0; n < kFbDelaySamples; n++) s.fbDelay[n] = 0.0;
      s.fbIdx = 0;
      s.lastGate = 0.0;
      s.gateVel = 1.0;
      s.latchSnapDepth = 1.0;
      s.latchBodyDepth = 10.0;
      s.latchAttack = 0.0;
      s.latchRelease = 12.824772066678985;
      s.latchFall = kDefaultFallCurve;
      s.latchLoop = 0.0;
      s.latchLevel = 1.0;
      s.hasLatch = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_thump_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  soemdsp_exp_adsr_destroy(s.adsr);
  s.adsr = 0;
  s.active = false;
}

extern "C" double soemdsp_thump_envelope_sample(
  int handle,
  double gate,
  double attack,
  double release,
  double decaySnap,
  double decayBody,
  double fallCurve,
  double loop,
  double amplitude,
  double updateOnTrigger,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double safeGate = safe(gate);
  const bool latchMode = safe(updateOnTrigger) >= 0.5;
  const bool rising = s.lastGate <= 0.0 && safeGate > 0.0;

  double snapDepth = ui_to_snap_depth(decaySnap);
  double bodyDepth = ui_to_body_depth(decayBody);
  double fall = clamp(safe(fallCurve), -1.0, 1.0);
  if (!(fall * 0.0 == 0.0)) fall = kDefaultFallCurve;
  double atk = maxd(0.0, safe(attack));
  double rel = maxd(0.0, safe(release));
  // Amplitude = final output trim. Gate height is velocity (old Amplitude→fb role).
  double outAmp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  double looping = safe(loop);

  // Velocity: Gate height at rise scales env (and therefore feedback).
  if (rising) {
    s.gateVel = clamp(safeGate, 0.0, 1.0);
  }

  // UpdateOnTrigger: freeze knob depths/times on rise. Feedback stays live.
  if (latchMode) {
    if (rising || !s.hasLatch) {
      s.latchSnapDepth = snapDepth;
      s.latchBodyDepth = bodyDepth;
      s.latchAttack = atk;
      s.latchRelease = rel;
      s.latchFall = fall;
      s.latchLoop = looping;
      s.latchLevel = outAmp;
      s.hasLatch = true;
    }
    snapDepth = s.latchSnapDepth;
    bodyDepth = s.latchBodyDepth;
    atk = s.latchAttack;
    rel = s.latchRelease;
    fall = s.latchFall;
    looping = s.latchLoop;
    outAmp = s.latchLevel;
  } else {
    s.hasLatch = false;
  }
  s.lastGate = safeGate;

  // Live env → ×kFbAmplitude → Range → Snap/Body. Sustain base always 1.0.
  const double delayed = s.fbDelay[s.fbIdx];
  const double rangeOut = delayed * kRangeOutHigh;
  const double effDecay = fold_param(
    kBaseDecay, rangeOut * snapDepth, kDecayMin, kDecayMax
  );
  const double effSustain = fold_param(
    kBaseSustain, rangeOut * bodyDepth, kSustainMin, kSustainMax
  );

  // ADSR level = gate velocity (soft Gate → less-high pluck). Stages still
  // binary on Gate > 0. Feedback sees the same scaled env Amplitude used to.
  const double env = soemdsp_exp_adsr_sample(
    s.adsr,
    gate,
    0.0,
    atk,
    kDefaultAttackShape,
    effDecay,
    effSustain, // from base sustain 1.0 + Body MOD only
    rel,
    fall,
    looping,
    s.gateVel,
    0.0,
    sampleRate
  );
  const double envSafe = (env * 0.0 == 0.0) ? env : 0.0;

  // Hardcoded fb amp × velocity-scaled env, then Range(0…1 → 0…−0.149629).
  s.fbDelay[s.fbIdx] = clamp(envSafe * kFbAmplitude, 0.0, 1.0);
  s.fbIdx++;
  if (s.fbIdx >= kFbDelaySamples) s.fbIdx = 0;

  return envSafe * outAmp;
}

extern "C" int soemdsp_thump_envelope_version() { return 18; }
extern "C" const char* soemdsp_thump_envelope_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_thump_envelope_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
