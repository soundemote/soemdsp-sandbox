// soemdsp-native-module: linear_attack_release
// soemdsp-native-label: Linear AR
// soemdsp-native-target: linearAttackRelease
// soemdsp-native-kind: envelope
//
// Port of public/modules/linearAttackRelease/linear-attack-release-math.js.
// App Gate contract (gate_on / gate_hit). Peak = Gate height latched on the hit.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

enum Phase { PHASE_IDLE = 0, PHASE_ATTACK = 1, PHASE_HOLD = 2, PHASE_RELEASE = 3 };

struct State {
  double out;
  double lastGate;
  double velocity; // Gate height latched on hit = attack peak
  double releaseDecrement;
  int phase;
  bool active;
};

static State gPool[kMaxInstances];

static void start_release(State& s, double release, double period) {
  s.phase = PHASE_RELEASE;
  s.releaseDecrement = s.out * period / maxd(release, period);
}

// Step x toward target by inc (either direction). True once it arrives.
static bool step_toward(double& x, double target, double inc) {
  if (x < target) {
    x += inc;
    if (x >= target) { x = target; return true; }
    return false;
  }
  x -= inc;
  if (x <= target) { x = target; return true; }
  return false;
}

}  // namespace

extern "C" int soemdsp_linear_attack_release_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.out = 0.0;
      s.lastGate = 0.0;
      s.velocity = 0.0;
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

  const double g = safe(gate);
  const bool wasOn = gate_on(s.lastGate);
  const bool rising = gate_hit(g, &s.lastGate);
  const bool gateOn = gate_on(g);
  const bool falling = wasOn && !gateOn;

  // Velocity = raw Gate height at the hit (Gate mode: also a Gate already high
  // while idle). Peak target, not an output multiplier.
  if (rising || (mode == 0 && gateOn && s.phase == PHASE_IDLE)) s.velocity = g;

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
    bool atPeak = true;
    if (safeAttack <= period) {
      s.out = s.velocity;
    } else {
      // Glide from the current level to the peak (down too, on a softer re-strike).
      atPeak = step_toward(s.out, s.velocity, attackIncrement);
    }
    if (atPeak) {
      if (mode == 1) {
        start_release(s, safeRelease, period);
      } else if (gateOn) {
        s.phase = PHASE_HOLD;
        s.out = s.velocity;
      } else {
        start_release(s, safeRelease, period);
      }
    }
  } else if (s.phase == PHASE_HOLD) {
    s.out = s.velocity;
    if (!gateOn) start_release(s, safeRelease, period);
  } else if (s.phase == PHASE_RELEASE) {
    if (safeRelease <= period) {
      s.out = 0.0;
      s.phase = PHASE_IDLE;
      s.releaseDecrement = 0.0;
    } else {
      s.out -= s.releaseDecrement;
      // Decrement carries the sign of the level it releases from.
      if (s.releaseDecrement >= 0.0 ? s.out <= 0.0 : s.out >= 0.0) {
        s.out = 0.0;
        s.phase = PHASE_IDLE;
        s.releaseDecrement = 0.0;
      }
    }
  } else {
    s.out = 0.0;
  }

  if (!(s.out * 0.0 == 0.0)) s.out = 0.0;
  const double y = s.out * level;
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
