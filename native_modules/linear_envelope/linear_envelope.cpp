// soemdsp-native-module: linear_envelope
// soemdsp-native-label: Linear Envelope
// soemdsp-native-target: linearEnvelope
// soemdsp-native-kind: envelope

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"linear_envelope\","
    "\"label\":\"Linear Envelope\","
    "\"targetType\":\"linearEnvelope\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Gate\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"delay\",\"label\":\"Delay\",\"kind\":\"time\",\"defaultValue\":0,\"min\":0,\"mid\":0.25,\"max\":5,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"attack\",\"label\":\"Attack\",\"kind\":\"time\",\"defaultValue\":0.08,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"kind\":\"time\",\"defaultValue\":0.22,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"sustain\",\"label\":\"Sustain\",\"defaultValue\":0.55,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"release\",\"label\":\"Release\",\"kind\":\"time\",\"defaultValue\":0.45,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"loop\",\"label\":\"Loop\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;

// state: 0=off, 1=delay, 2=attack, 3=decay, 4=sustain, 5=release
enum EnvelopeStage { STAGE_OFF = 0, STAGE_DELAY = 1, STAGE_ATTACK = 2, STAGE_DECAY = 3, STAGE_SUSTAIN = 4, STAGE_RELEASE = 5 };

struct LinearEnvelopeState {
  double out;
  double secondsPassed;
  double releaseDecrement;
  double lastGate;
  int    stage;
  bool   active;
};

static LinearEnvelopeState gPool[kMaxInstances];

static void trigger_attack(LinearEnvelopeState& s, double delay, double attack, double period) {
  if (delay < period) {
    if (attack <= period) {
      s.stage = STAGE_DECAY;
      s.out = 1.0;
    } else {
      s.stage = STAGE_ATTACK;
    }
    return;
  }
  if (s.out <= 0.000001) {
    s.out = 0.0;
    s.secondsPassed = 0.0;
  }
  s.stage = STAGE_DELAY;
}

}  // namespace

extern "C" int soemdsp_linear_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LinearEnvelopeState& s = gPool[i];
      s.out = 0.0;
      s.secondsPassed = 0.0;
      s.releaseDecrement = 0.0;
      s.lastGate = 0.0;
      s.stage = STAGE_OFF;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_linear_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_linear_envelope_sample(
  int    handle,
  double gate,
  double delay,
  double attack,
  double decay,
  double sustain,
  double release,
  double loop,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  LinearEnvelopeState& s = gPool[handle - 1];

  const double safeGate = safe(gate);
  const double safeDelay = maxd(0.0, safe(delay));
  const double safeAttack = maxd(0.0, safe(attack));
  const double safeDecay = maxd(0.0, safe(decay));
  const double safeSustain = clamp(safe(sustain), 0.0, 1.0);
  const double safeRelease = maxd(0.0, safe(release));
  const bool looping = safe(loop) >= 0.5;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;

  if (s.lastGate <= 0.0 && safeGate > 0.0) {
    trigger_attack(s, safeDelay, safeAttack, period);
  } else if (s.lastGate > 0.0 && safeGate <= 0.0) {
    s.stage = STAGE_RELEASE;
    s.releaseDecrement = s.out * period / maxd(safeRelease, period);
  }
  s.lastGate = safeGate;

  const double attackIncrement = mind(period / maxd(safeAttack, period), 1.0);
  const double decayDecrement = (1.0 - safeSustain) * period / maxd(safeDecay, period);

  switch (s.stage) {
    case STAGE_DELAY:
      s.secondsPassed += period;
      if (s.secondsPassed >= safeDelay) {
        s.stage = safeAttack <= period ? STAGE_DECAY : STAGE_ATTACK;
        s.secondsPassed = 0.0;
        if (safeAttack <= period) {
          s.out = 1.0;
        }
      }
      break;
    case STAGE_ATTACK:
      s.out += attackIncrement;
      if (s.out >= 1.0) {
        s.out = 1.0;
        s.stage = STAGE_DECAY;
      }
      break;
    case STAGE_DECAY:
      s.out -= decayDecrement;
      if (s.out <= safeSustain) {
        s.out = safeSustain;
        s.stage = STAGE_SUSTAIN;
      }
      break;
    case STAGE_SUSTAIN:
      if (looping) {
        s.stage = STAGE_ATTACK;
      }
      s.out = safeSustain;
      break;
    case STAGE_RELEASE:
      s.out -= s.releaseDecrement;
      if (s.out <= 0.0) {
        s.out = 0.0;
        s.stage = STAGE_OFF;
        s.secondsPassed = 0.0;
      }
      break;
    case STAGE_OFF:
    default:
      break;
  }

  return safe(clamp(s.out, 0.0, 1.0) * level);
}

extern "C" int soemdsp_linear_envelope_version() {
  return 1;
}

extern "C" const char* soemdsp_linear_envelope_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_linear_envelope_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
