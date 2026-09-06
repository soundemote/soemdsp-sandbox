// soemdsp-native-module: pluck_envelope
// soemdsp-native-label: Pluck Envelope
// soemdsp-native-target: pluckEnvelope
// soemdsp-native-kind: envelope
//
// soemdsp::modulator::PluckEnvelope + SoEmPluck parameter map:
//   VelocitySensitivity, Attack, DecaySlopeTop/Mid/Bottom,
//   Sustain, Release, AutoReleaseTime, EnvelopeCurve, EnvelopeDamping

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pluck_envelope\","
    "\"label\":\"Pluck Envelope\","
    "\"targetType\":\"pluckEnvelope\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Trigger\",\"Release\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"velocitySensitivity\",\"label\":\"Velocity Sensitivity\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"attack\",\"label\":\"Attack\",\"defaultValue\":0,\"min\":0,\"mid\":0.1,\"max\":2,\"step\":\"any\"},"
      "{\"key\":\"decaySlopeTop\",\"label\":\"Decay Slope Top\",\"defaultValue\":0.9,\"min\":0.001,\"mid\":0.9,\"max\":1.8,\"step\":\"any\"},"
      "{\"key\":\"decaySlopeMid\",\"label\":\"Decay Slope Mid\",\"defaultValue\":0.7,\"min\":0.1,\"mid\":0.7,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"decaySlopeBottom\",\"label\":\"Decay Slope Bottom\",\"defaultValue\":4.8,\"min\":0.01,\"mid\":1,\"max\":6,\"step\":\"any\"},"
      "{\"key\":\"sustain\",\"label\":\"Sustain\",\"defaultValue\":1.2,\"min\":0,\"mid\":0.7,\"max\":1.4,\"step\":\"any\"},"
      "{\"key\":\"release\",\"label\":\"Release\",\"defaultValue\":0.86,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"autoReleaseTime\",\"label\":\"Auto Release Time\",\"defaultValue\":0,\"min\":0,\"mid\":100,\"max\":500,\"step\":\"any\",\"unit\":\"ms\"},"
      "{\"key\":\"envelopeCurve\",\"label\":\"Envelope Curve\",\"defaultValue\":-0.5,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"envelopeDamping\",\"label\":\"Envelope Damping\",\"kind\":\"frequency\",\"defaultValue\":15,\"min\":0,\"mid\":15,\"max\":100,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"velocity\",\"label\":\"Velocity\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;
static const double kMinValue = 1.0e-8;
static const double kMaxFeedback = 1.0 - 1.0e-6;

enum PluckStage { STAGE_OFF = 0, STAGE_DELAY = 1, STAGE_ATTACK = 2, STAGE_DECAY = 3, STAGE_RELEASE = 4 };

struct PluckEnvelopeState {
  double autoReleasePhasor;
  double currentValue;
  double decayIncrement;
  double lastRelease;
  double lastTrigger;
  double phasor;
  double releaseIncrement;
  double secondsPassed;
  double peak;
  int stage;
  bool active;
};

static PluckEnvelopeState gPool[kMaxInstances];

static inline double dsp_log10(double x) {
  return dsp_ln(x) * 0.4342944819032518;
}

// soemdsp::curve::Exponential (skew in [-0.99, 0.99]).
static double exponential_curve(double value, double skew) {
  double safeValue = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.99, 0.99);
  if (safeSkew == 0.0) return safeValue;
  const double c = 0.5 * (safeSkew + 1.0);
  const double a = 2.0 * dsp_log10((1.0 - c) / c);
  const double denom = 1.0 - dsp_exp(a);
  return denom == 0.0 ? safeValue : (1.0 - dsp_exp(safeValue * a)) / denom;
}

// soemdsp::math::valFromVelocityAndSensitivity
static inline double velocity_peak(double velocity, double sensitivity) {
  const double vel = clamp(velocity, 0.0, 1.0);
  const double sens = clamp(sensitivity, 0.0, 1.0);
  return (1.0 - sens) + vel * sens;
}

static void pluck_prepare_for_decay(PluckEnvelopeState& s, double rate, double peak) {
  s.phasor = 0.0;
  s.autoReleasePhasor = 0.0;
  s.currentValue = peak;
  // (current - 1) * period / 50
  s.decayIncrement = (s.currentValue - 1.0) * (1.0 / maxd(1.0, rate)) / 50.0;
}

static void pluck_trigger_attack(
  PluckEnvelopeState& s,
  double attack,
  double velocity,
  double velocitySensitivity,
  double rate
) {
  const double period = 1.0 / maxd(1.0, rate);
  const double peak = velocity_peak(velocity, velocitySensitivity);
  s.secondsPassed = 0.0;
  s.peak = peak;
  // SoEmPluck does not expose Delay — always start from attack (or decay if attack≈0).
  if (attack <= kMinValue) {
    s.stage = STAGE_DECAY;
    pluck_prepare_for_decay(s, rate, peak);
  } else {
    s.stage = STAGE_ATTACK;
    s.currentValue = 0.0;
  }
  (void)period;
}

static void pluck_trigger_release(PluckEnvelopeState& s, double rate) {
  if (s.stage != STAGE_RELEASE) {
    s.stage = STAGE_RELEASE;
    s.releaseIncrement = s.currentValue * (1.0 / maxd(1.0, rate)) / 50.0;
  }
}

// finalDecayMod = decayMid + map(curve(phasor), top, bottom) while phasor<1, else sustain
static double pluck_decay_feedback(
  PluckEnvelopeState& s,
  double decaySlopeMid,
  double decaySlopeTop,
  double decaySlopeBottom,
  double envelopeCurve,
  double sustain
) {
  double finalDecayMod = sustain;
  if (s.phasor < 1.0) {
    double dmc = envelopeCurve;
    if (dmc > 0.99) dmc = 0.99;
    if (dmc < -0.99) dmc = -0.99;
    if (dmc == 0.0) dmc = -1.0e-8;
    const double shaped = exponential_curve(s.phasor, dmc);
    finalDecayMod = decaySlopeMid + decaySlopeTop + shaped * (decaySlopeBottom - decaySlopeTop);
  }
  return mind(kMaxFeedback, dsp_exp(-finalDecayMod * 10.0));
}

static void pluck_reset(PluckEnvelopeState& s) {
  s.currentValue = 0.0;
  s.secondsPassed = 0.0;
  s.phasor = 0.0;
  s.autoReleasePhasor = 0.0;
  s.stage = STAGE_OFF;
}

}  // namespace

extern "C" int soemdsp_pluck_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PluckEnvelopeState& s = gPool[i];
      pluck_reset(s);
      s.decayIncrement = 0.0;
      s.lastRelease = 0.0;
      s.lastTrigger = 0.0;
      s.releaseIncrement = 0.0;
      s.peak = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pluck_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_pluck_envelope_sample(
  int handle,
  double trigger,
  double releaseGate,
  double velocitySensitivity,
  double attack,
  double decaySlopeTop,
  double decaySlopeMid,
  double decaySlopeBottom,
  double sustain,
  double releaseAmt,
  double autoReleaseTime,
  double envelopeCurve,
  double envelopeDamping,
  double velocity,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PluckEnvelopeState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;
  const double safeTrigger = safe(trigger);
  const double safeRelease = safe(releaseGate);

  const double sens = clamp(safe(velocitySensitivity), 0.0, 1.0);
  const double att = maxd(0.0, safe(attack));
  const double slopeTop = clamp(safe(decaySlopeTop), 0.001, 1.8);
  const double slopeMid = clamp(safe(decaySlopeMid), 0.1, 1.0);
  const double slopeBot = clamp(safe(decaySlopeBottom), 0.01, 6.0);
  const double sus = clamp(safe(sustain), 0.0, 1.4);
  const double rel = clamp(safe(releaseAmt), 0.0, 1.0);
  // UI is milliseconds (SoEm display); DSP wire is seconds.
  double autoRelMs = maxd(0.0, safe(autoReleaseTime));
  if (autoRelMs > 500.0) autoRelMs = 500.0;
  const double autoRelSec = autoRelMs * (1.0 / 1000.0);
  const double curve = clamp(safe(envelopeCurve), -1.0, 1.0);
  const double dampHz = clamp(safe(envelopeDamping), 0.0, 100.0);
  const double vel = clamp(safe(velocity), 0.0, 1.0);
  const double lvl = clamp(safe(level), 0.0, 1.0);

  if (s.lastTrigger <= 0.0 && safeTrigger > 0.0) {
    pluck_trigger_attack(s, att, vel, sens, rate);
  }
  if (s.lastRelease <= 0.0 && safeRelease > 0.0) {
    pluck_trigger_release(s, rate);
  }
  s.lastTrigger = safeTrigger;
  s.lastRelease = safeRelease;

  // timeToIncrement(attack) = 1/(attack*sr)
  const double fbAttackAmp = 1.0 / (maxd(att, kMinValue) * rate);
  const double fbReleaseAmp = mind(kMaxFeedback, dsp_exp(-rel * 10.0));
  const bool doAutoRelease = autoRelSec > kMinValue;
  const double autoReleaseIncrement = doAutoRelease
    ? 1.0 / (maxd(autoRelSec, kMinValue) * rate)
    : 0.0;
  const double phasorIncrement = dampHz / rate;

  switch (s.stage) {
    case STAGE_ATTACK:
      s.currentValue += period + s.currentValue * fbAttackAmp;
      if (s.currentValue >= s.peak) {
        s.stage = STAGE_DECAY;
        pluck_prepare_for_decay(s, rate, s.peak);
      }
      break;
    case STAGE_DECAY: {
      const double feedback = pluck_decay_feedback(
        s, slopeMid, slopeTop, slopeBot, curve, sus
      );
      s.currentValue -= s.decayIncrement + s.currentValue * s.currentValue * feedback;
      s.phasor += phasorIncrement;
      s.autoReleasePhasor += autoReleaseIncrement;
      if (doAutoRelease && s.autoReleasePhasor >= 1.0) {
        pluck_trigger_release(s, rate);
      }
      if (s.currentValue < 0.0) {
        pluck_reset(s);
      }
      break;
    }
    case STAGE_RELEASE:
      s.currentValue -= s.releaseIncrement + s.currentValue * s.currentValue * fbReleaseAmp;
      if (s.currentValue <= 0.0) {
        pluck_reset(s);
      }
      break;
    case STAGE_DELAY:
      // Unused (SoEmPluck has no Delay param); fall through to off.
      s.stage = STAGE_ATTACK;
      break;
    case STAGE_OFF:
    default:
      break;
  }

  return safe(s.currentValue * lvl);
}

extern "C" int soemdsp_pluck_envelope_version() {
  return 3; // AutoReleaseTime in ms (0…500), like SoEm display
}

extern "C" const char* soemdsp_pluck_envelope_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_pluck_envelope_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
