// soemdsp-native-module: expo_pluck_envelope_2
// soemdsp-native-label: Expo Pluck Envelope 2
// soemdsp-native-target: expoPluckEnvelope2
// soemdsp-native-kind: envelope
//
// Faithful port of soemdsp::modulator::PluckEnvelope (PluckEnvelope.hpp)
// with SoEmPluck.cpp parameter map:
//   Attack → attackFeedback_
//   DecaySlopeTop → decayModStart_   (Attack Energy)
//   DecaySlopeMid → decay_           (Decay)
//   DecaySlopeBottom → decayModEnd_  (Decay Energy)
//   Sustain → endingDecay_
//   Release → fbRelease_
//   AutoReleaseTime (UI ms → seconds)
//   EnvelopeCurve → decayModCurve_
//   EnvelopeDamping → decayModFrequency_ (Hz phasor for Top→Bottom morph)

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"expo_pluck_envelope_2\","
    "\"label\":\"Expo Pluck Envelope 2\","
    "\"targetType\":\"expoPluckEnvelope2\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Trigger\",\"Release\"],"
    "\"outputs\":[\"Env\"],"
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
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;
static const double kMinValue = 1.0e-8;
static const double kMaxFeedback = 1.0 - 1.0e-6;

enum Stage { STAGE_OFF = 0, STAGE_ATTACK = 1, STAGE_DECAY = 2, STAGE_RELEASE = 3 };

struct State {
  double autoReleasePhasor;
  double currentValue;
  double decayIncrement;
  double lastRelease;
  double lastTrigger;
  double phasor;
  double releaseIncrement;
  double peak;
  int stage;
  bool active;
};

static State gPool[kMaxInstances];

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

static inline double velocity_peak(double velocity, double sensitivity) {
  const double vel = clamp(velocity, 0.0, 1.0);
  const double sens = clamp(sensitivity, 0.0, 1.0);
  return (1.0 - sens) + vel * sens;
}

static void prepare_for_decay(State& s, double rate, double peak) {
  s.phasor = 0.0;
  s.autoReleasePhasor = 0.0;
  s.currentValue = peak;
  // PluckEnvelope::updateDecayIncrement
  s.decayIncrement = (s.currentValue - 1.0) * (1.0 / maxd(1.0, rate)) / 50.0;
}

static void reset_state(State& s) {
  s.currentValue = 0.0;
  s.phasor = 0.0;
  s.autoReleasePhasor = 0.0;
  s.decayIncrement = 0.0;
  s.releaseIncrement = 0.0;
  s.peak = 0.0;
  s.stage = STAGE_OFF;
}

static void trigger_attack(
  State& s,
  double attack,
  double velocity,
  double velocitySensitivity,
  double rate
) {
  const double peak = velocity_peak(velocity, velocitySensitivity);
  s.peak = peak;
  // SoEmPluck has no Delay — skip delay stage.
  if (attack <= kMinValue) {
    s.stage = STAGE_DECAY;
    prepare_for_decay(s, rate, peak);
  } else {
    s.stage = STAGE_ATTACK;
    s.currentValue = 0.0;
  }
}

static void trigger_release(State& s, double rate) {
  if (s.stage != STAGE_RELEASE) {
    s.stage = STAGE_RELEASE;
    // PluckEnvelope::updateReleaseIncrement
    s.releaseIncrement = s.currentValue * (1.0 / maxd(1.0, rate)) / 50.0;
  }
}

// decay_ + map0to1(Exponential(curve).get(phasor), start, end) while phasor<1
// else endingDecay_ (Sustain)
static double decay_feedback(
  State& s,
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
    // map0to1(shaped, top, bottom) = top + shaped*(bottom-top)
    finalDecayMod = decaySlopeMid + decaySlopeTop + shaped * (decaySlopeBottom - decaySlopeTop);
  }
  return mind(kMaxFeedback, dsp_exp(-finalDecayMod * 10.0));
}

}  // namespace

extern "C" int soemdsp_expo_pluck_envelope_2_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      reset_state(gPool[i]);
      gPool[i].lastRelease = 0.0;
      gPool[i].lastTrigger = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_expo_pluck_envelope_2_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_expo_pluck_envelope_2_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  if (!gPool[handle - 1].active) return;
  reset_state(gPool[handle - 1]);
  gPool[handle - 1].lastRelease = 0.0;
  gPool[handle - 1].lastTrigger = 0.0;
}

extern "C" double soemdsp_expo_pluck_envelope_2_sample(
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
  double autoReleaseTimeMs,
  double envelopeCurve,
  double envelopeDamping,
  double velocity,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
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
  double autoRelMs = maxd(0.0, safe(autoReleaseTimeMs));
  if (autoRelMs > 500.0) autoRelMs = 500.0;
  const double autoRelSec = autoRelMs * (1.0 / 1000.0);
  const double curve = clamp(safe(envelopeCurve), -1.0, 1.0);
  const double dampHz = clamp(safe(envelopeDamping), 0.0, 100.0);
  const double vel = clamp(safe(velocity), 0.0, 1.0);
  const double lvl = clamp(safe(level), 0.0, 1.0);

  if (s.lastTrigger <= 0.0 && safeTrigger > 0.0) {
    trigger_attack(s, att, vel, sens, rate);
  }
  if (s.lastRelease <= 0.0 && safeRelease > 0.0) {
    trigger_release(s, rate);
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
      // currentValue_ += period + currentValue_ * fbAttackAmp_
      s.currentValue += period + s.currentValue * fbAttackAmp;
      if (s.currentValue >= s.peak) {
        s.stage = STAGE_DECAY;
        prepare_for_decay(s, rate, s.peak);
      }
      break;
    case STAGE_DECAY: {
      const double feedback = decay_feedback(s, slopeMid, slopeTop, slopeBot, curve, sus);
      // currentValue_ -= decayIncrement_ + currentValue_^2 * fbDecayAmp_
      s.currentValue -= s.decayIncrement + s.currentValue * s.currentValue * feedback;
      s.phasor += phasorIncrement;
      s.autoReleasePhasor += autoReleaseIncrement;
      if (doAutoRelease && s.autoReleasePhasor >= 1.0) {
        trigger_release(s, rate);
      }
      if (s.currentValue < 0.0) {
        reset_state(s);
      }
      break;
    }
    case STAGE_RELEASE:
      s.currentValue -= s.releaseIncrement + s.currentValue * s.currentValue * fbReleaseAmp;
      if (s.currentValue <= 0.0) {
        reset_state(s);
      }
      break;
    case STAGE_OFF:
    default:
      break;
  }

  return safe(s.currentValue * lvl);
}

extern "C" double soemdsp_expo_pluck_envelope_2_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  if (!gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].currentValue;
}

extern "C" int soemdsp_expo_pluck_envelope_2_version() {
  return 3; // SoEmPluck / PluckEnvelope.hpp port
}

extern "C" const char* soemdsp_expo_pluck_envelope_2_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_expo_pluck_envelope_2_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
