// soemdsp-native-module: expo_pluck_envelope
// soemdsp-native-label: Expo Pluck Envelope
// soemdsp-native-target: expoPluckEnvelope
// soemdsp-native-kind: envelope
//
// Env CV with Karplus-Strong *decay math* (no delay line), matching the Comb
// Resonator control feel:
//   Decay long/max, Frequency = "material" (high→glass, low→string),
//   Damping 0…1 = Comb-style loop loss extremes (0 = open ring, 1 = tiny impulse).
//   Comb's loop LPF uses coef=D² (D=1 kills feedback). Env approx shrinks
//   effective Decay by (1-D)²:
//     A *= exp(-f0 / (decaySec * (1-D)² * sr))
// Attack = 1-pole LPF slew toward the strike peak (no hard restart from 0).
// Recalculate On Trig defaults ON — latch Frequency/Damping/Decay/Attack at
// Trigger/Gate so mid-flight knob moves do not warp the current shot.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"expo_pluck_envelope\","
    "\"label\":\"Expo Pluck Envelope\","
    "\"targetType\":\"expoPluckEnvelope\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Trigger\",\"Gate\"],"
    "\"outputs\":[\"Env\"],"
    "\"parameters\":["
      "{\"key\":\"attack\",\"label\":\"Attack\",\"kind\":\"time\",\"defaultValue\":0.002,\"min\":0,\"mid\":0.01,\"max\":0.5,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"kind\":\"time\",\"defaultValue\":5,\"min\":0.01,\"mid\":1,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":110,\"min\":10,\"mid\":110,\"max\":8000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"damping\",\"label\":\"Damping\",\"defaultValue\":0,\"min\":0,\"mid\":0.35,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"recalculateOnTrigger\",\"label\":\"Recalc On Trig\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":1,\"step\":1},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;
static const double kIdleFloor = 1.0e-5;
static const double kMinHz = 10.0;
static const double kPeak = 1.0;

enum Stage {
  STAGE_IDLE = 0,
  STAGE_ATTACK = 1,
  STAGE_DECAY = 2,
  STAGE_HOLD = 3 // Gate held at peak
};

struct Latched {
  double attack;
  double decay;
  double frequency;
  double damping;
  double level;
};

struct ExpoPluckState {
  double env;
  double lastTrigger;
  double lastGate;
  Latched live;
  Latched shot;
  int stage;
  int modeGate;
  bool active;
};

static ExpoPluckState gPool[kMaxInstances];

static inline double clampf(double x, double lo, double hi) {
  if (!(x == x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

static void sanitize(Latched& p) {
  p.attack = clampf(p.attack, 0.0, 10.0);
  p.decay = clampf(p.decay, 0.01, 30.0);
  p.frequency = clampf(p.frequency, kMinHz, 20000.0);
  p.damping = clampf(p.damping, 0.0, 1.0);
  p.level = clampf(p.level, 0.0, 4.0);
}

static void reset_state(ExpoPluckState& s) {
  s.env = 0.0;
  s.lastTrigger = 0.0;
  s.lastGate = 0.0;
  s.stage = STAGE_IDLE;
  s.modeGate = 0;
  s.live = Latched{};
  s.live.attack = 0.002;
  s.live.decay = 5.0;
  s.live.frequency = 110.0;
  s.live.damping = 0.0;
  s.live.level = 1.0;
  s.shot = s.live;
}

// 1-pole toward target: coeff = 1 - exp(-1/(attack*sr)); attack≈0 → snap.
static double one_pole_toward(double env, double target, double attackSec, double rate) {
  const double r = rate < 1.0 ? 44100.0 : rate;
  if (!(attackSec == attackSec) || attackSec <= 1.0 / r) {
    return target;
  }
  const double coeff = 1.0 - dsp_exp_squaring(-1.0 / (attackSec * r));
  return env + (target - env) * coeff;
}

// KS loop loss without a delay line (Comb Resonator damping extremes).
// Comb loop LPF uses coef=D*D; at D=1 the feedback path is dead → impulse only.
// Mirror that here by collapsing effective Decay with (1-D)^2.
static double ks_decay_mul(double frequencyHz, double damping01, double decaySec, double rate) {
  const double f0 = frequencyHz < kMinHz ? kMinHz : frequencyHz;
  const double D = clampf(damping01, 0.0, 1.0);
  const double T = decaySec < 0.01 ? 0.01 : decaySec;
  const double r = rate < 1.0 ? 44100.0 : rate;
  // Comb at D=1: loop filter holds 0 → no feedback. Hard-kill sustain.
  if (D >= 1.0 - 1.0e-9) return 0.0;
  const double open = 1.0 - D;
  const double open2 = open * open;
  const double tEff = T * open2;
  if (!(tEff > 1.0e-12)) return 0.0;
  const double x = -f0 / (tEff * r);
  // Keep exp arg in a safe range (avoid squaring-approx blowups).
  if (x <= -80.0) return 0.0;
  return dsp_exp_squaring(x);
}

static void strike(ExpoPluckState& s, int gateMode, int latchParams) {
  s.modeGate = gateMode ? 1 : 0;
  if (latchParams) {
    s.shot = s.live;
  }
  sanitize(s.shot);
  // No hard restart from 0 — 1-pole attack slews from current env toward peak.
  s.stage = STAGE_ATTACK;
}

}  // namespace

extern "C" int soemdsp_expo_pluck_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      reset_state(gPool[i]);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_expo_pluck_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_expo_pluck_envelope_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  if (!gPool[handle - 1].active) return;
  reset_state(gPool[handle - 1]);
}

extern "C" double soemdsp_expo_pluck_envelope_sample(
  int handle,
  double trigger,
  double gate,
  double attack,
  double decay,
  double frequency,
  double damping,
  double recalculateOnTrigger,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ExpoPluckState& s = gPool[handle - 1];
  if (!s.active) return 0.0;

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;

  s.live.attack = attack;
  s.live.decay = decay;
  s.live.frequency = frequency;
  s.live.damping = damping;
  s.live.level = level;
  sanitize(s.live);

  // Default ON: latch at trigger. Off: live knobs always drive the shot.
  const int latch = (recalculateOnTrigger >= 0.5) ? 1 : 0;
  if (!latch) {
    s.shot = s.live;
  }

  const double trig = (trigger == trigger) ? trigger : 0.0;
  const double gat = (gate == gate) ? gate : 0.0;
  const bool trigRise = s.lastTrigger <= 0.0 && trig > 0.0;
  const bool gateRise = s.lastGate <= 0.0 && gat > 0.0;
  const bool gateFall = s.lastGate > 0.0 && gat <= 0.0;
  s.lastTrigger = trig;
  s.lastGate = gat;

  if (gateRise) {
    strike(s, 1, latch);
  } else if (trigRise) {
    strike(s, gat > 0.0 ? 1 : 0, latch);
  } else if (gateFall && s.modeGate
    && (s.stage == STAGE_ATTACK || s.stage == STAGE_HOLD)) {
    s.stage = STAGE_DECAY;
  }

  const Latched& p = s.shot;

  switch (s.stage) {
    case STAGE_ATTACK: {
      s.env = one_pole_toward(s.env, kPeak, p.attack, rate);
      if (s.env >= kPeak - 1.0e-4) {
        s.env = kPeak;
        if (s.modeGate && gat > 0.0) {
          s.stage = STAGE_HOLD;
        } else {
          s.stage = STAGE_DECAY;
        }
      }
      break;
    }
    case STAGE_HOLD: {
      // Gate held: sit at peak (still 1-pole in case peak was approached).
      s.env = one_pole_toward(s.env, kPeak, p.attack, rate);
      if (gat <= 0.0) {
        s.stage = STAGE_DECAY;
      }
      break;
    }
    case STAGE_DECAY: {
      s.env *= ks_decay_mul(p.frequency, p.damping, p.decay, rate);
      if (!(s.env == s.env) || s.env < kIdleFloor) {
        reset_state(s);
      }
      break;
    }
    case STAGE_IDLE:
    default:
      s.env = 0.0;
      break;
  }

  double out = s.env * p.level;
  if (out < 0.0) out = 0.0;
  return (out * 0.0 == 0.0) ? out : 0.0;
}

extern "C" double soemdsp_expo_pluck_envelope_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  if (!gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].env;
}

extern "C" int soemdsp_expo_pluck_envelope_version() {
  return 5; // Damping (1-D)^2 extremes + hard kill at D=1
}

extern "C" const char* soemdsp_expo_pluck_envelope_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_expo_pluck_envelope_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
