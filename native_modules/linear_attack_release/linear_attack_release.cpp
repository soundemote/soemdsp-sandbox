// soemdsp-native-module: linear_attack_release
// soemdsp-native-label: Linear AR
// soemdsp-native-target: linearAttackRelease
// soemdsp-native-kind: envelope
//
// Port of public/modules/linearAttackRelease/linear-attack-release-math.js (exact).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

enum Phase { PHASE_IDLE = 0, PHASE_ATTACK = 1, PHASE_HOLD = 2, PHASE_RELEASE = 3 };

struct State {
  double out;
  double lastGate;
  double releaseDecrement;
  int phase;
  bool active;
};

static State gPool[kMaxInstances];

static void start_release(State& s, double release, double period) {
  s.phase = PHASE_RELEASE;
  s.releaseDecrement = s.out * period / maxd(release, period);
}

}  // namespace

extern "C" int soemdsp_linear_attack_release_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.out = 0.0;
      s.lastGate = 0.0;
      s.releaseDecrement = 0.0;
      s.phase = PHASE_IDLE;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_linear_attack_release_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_linear_attack_release_sample(
  int handle,
  double gate,
  double attack,
  double release,
  double amplitude,
  double inputMode,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double period = 1.0 / rate;
  const double safeAttack = maxd(0.0, safe(attack));
  const double safeRelease = maxd(0.0, safe(release));
  const double level = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;

  int mode = (int)(safe(inputMode) + (safe(inputMode) >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 1) mode = 1;

  const bool gateOn = safe(gate) > 0.5;
  const bool rising = gateOn && !(s.lastGate > 0.5);
  const bool falling = !gateOn && (s.lastGate > 0.5);
  s.lastGate = gateOn ? 1.0 : 0.0;

  if (mode == 0) {
    if (rising || (gateOn && s.phase == PHASE_IDLE)) {
      s.phase = PHASE_ATTACK;
    }
    if (falling) {
      start_release(s, safeRelease, period);
    }
    if (!gateOn && s.phase != PHASE_RELEASE && s.phase != PHASE_IDLE) {
      start_release(s, safeRelease, period);
    }
  } else if (rising) {
    s.phase = PHASE_ATTACK;
  }

  const double attackIncrement = mind(period / maxd(safeAttack, period), 1.0);

  if (s.phase == PHASE_ATTACK) {
    if (safeAttack <= period) {
      s.out = 1.0;
    } else {
      s.out += attackIncrement;
      if (s.out >= 1.0) s.out = 1.0;
    }
    if (s.out >= 1.0) {
      if (mode == 1) {
        start_release(s, safeRelease, period);
      } else if (gateOn) {
        s.phase = PHASE_HOLD;
        s.out = 1.0;
      } else {
        start_release(s, safeRelease, period);
      }
    }
  } else if (s.phase == PHASE_HOLD) {
    s.out = 1.0;
    if (!gateOn) start_release(s, safeRelease, period);
  } else if (s.phase == PHASE_RELEASE) {
    if (safeRelease <= period) {
      s.out = 0.0;
      s.phase = PHASE_IDLE;
      s.releaseDecrement = 0.0;
    } else {
      s.out -= s.releaseDecrement;
      if (s.out <= 0.0) {
        s.out = 0.0;
        s.phase = PHASE_IDLE;
        s.releaseDecrement = 0.0;
      }
    }
  } else {
    s.out = 0.0;
  }

  if (!(s.out * 0.0 == 0.0)) s.out = 0.0;
  const double clamped = s.out < 0.0 ? 0.0 : (s.out > 1.0 ? 1.0 : s.out);
  const double y = clamped * level;
  return (y * 0.0 == 0.0) ? y : 0.0;
}

extern "C" int soemdsp_linear_attack_release_version() {
  return 1;
}

static const char kMetadataJson[] =
  "{"
    "\"module\":\"linear_attack_release\","
    "\"label\":\"Linear AR\","
    "\"targetType\":\"linearAttackRelease\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Gate\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"inputMode\",\"label\":\"Input\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"attack\",\"label\":\"Attack\",\"kind\":\"time\",\"defaultValue\":0.01,\"min\":0,\"mid\":0.1,\"max\":5,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"release\",\"label\":\"Release\",\"kind\":\"time\",\"defaultValue\":0.25,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

extern "C" const char* soemdsp_linear_attack_release_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_linear_attack_release_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
