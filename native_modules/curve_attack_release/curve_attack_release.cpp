// soemdsp-native-module: curve_attack_release
// soemdsp-native-label: Curve AR
// soemdsp-native-target: curveAttackRelease
// soemdsp-native-kind: envelope
//
// Shaped Attack–Release (same bipolar curves as Curve ADSR).
// Gate follow or Trigger one-shot. UpdateOnTrigger latches knobs on rise.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

enum Phase { PHASE_IDLE = 0, PHASE_ATTACK = 1, PHASE_HOLD = 2, PHASE_RELEASE = 3 };

struct Shot {
  double attack;
  double attackShape;
  double release;
  double releaseShape;
  double amplitude;
  int inputMode; // 0 Gate, 1 Trigger
};

struct State {
  double out;
  double lastGate;
  double stageElapsed;
  double stageStart;
  double stageEnd;
  double stageDuration;
  int phase;
  bool hasShot;
  Shot shot;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"curve_attack_release\","
    "\"label\":\"Curve AR\","
    "\"targetType\":\"curveAttackRelease\","
    "\"kind\":\"envelope\""
  "}";

static inline double dsp_log10(double x) {
  return dsp_ln(x) * 0.4342944819032518;
}

static double exponential_curve(double value, double skew) {
  double safeValue = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.99, 0.99);
  if (safeSkew == 0.0) safeSkew = -1.0e-8;
  const double c = 0.5 * (safeSkew + 1.0);
  const double a = 2.0 * dsp_log10((1.0 - c) / maxd(1.0e-12, c));
  const double denom = 1.0 - dsp_exp(a);
  return denom == 0.0 ? safeValue : (1.0 - dsp_exp(safeValue * a)) / denom;
}

static double normalize_shape(double shape) {
  const double s = safe(shape);
  if (s > 1.0) {
    const double r = mind(100.0, maxd(1.0e-4, s));
    const double t = (dsp_ln(100.0) - dsp_ln(r)) / (dsp_ln(100.0) - dsp_ln(1.0e-4));
    return clamp(t, 0.0, 1.0);
  }
  return clamp(s, -1.0, 1.0);
}

static double shape_skew(double shape) {
  const double s = normalize_shape(shape);
  if (s > -1.0e-6 && s < 1.0e-6) return -1.0e-8;
  return clamp(s, -0.99, 0.99);
}

static void begin_stage(State& s, double start, double end, double duration) {
  s.stageStart = start;
  s.stageEnd = end;
  s.stageDuration = maxd(0.0, duration);
  s.stageElapsed = 0.0;
  s.out = start;
}

static void retarget_stage(State& s, double newEnd, double newDuration, double period) {
  double t = 0.0;
  if (s.stageDuration > period) {
    t = mind(1.0, s.stageElapsed / s.stageDuration);
  } else if (s.stageElapsed > 0.0) {
    t = 1.0;
  }
  s.stageEnd = newEnd;
  s.stageDuration = maxd(0.0, newDuration);
  if (s.stageDuration <= period) {
    s.stageElapsed = (t >= 1.0) ? period : 0.0;
  } else {
    s.stageElapsed = t * s.stageDuration;
  }
}

static bool advance_shaped(State& s, double shape, double period) {
  if (s.stageDuration <= period) {
    if (s.stageElapsed <= 0.0) {
      s.stageElapsed = period;
      s.out = s.stageStart;
      return false;
    }
    s.out = s.stageEnd;
    return true;
  }
  s.stageElapsed += period;
  const double t = mind(1.0, s.stageElapsed / s.stageDuration);
  const double w = exponential_curve(t, shape_skew(shape));
  s.out = s.stageStart + (s.stageEnd - s.stageStart) * w;
  return t >= 1.0;
}

static void start_attack(State& s, const Shot& p, double period) {
  s.phase = PHASE_ATTACK;
  if (p.attack <= period) {
    begin_stage(s, 1.0, 1.0, 0.0);
    s.out = 1.0;
    s.stageElapsed = period;
  } else {
    begin_stage(s, s.out, 1.0, p.attack);
  }
}

static void start_release(State& s, const Shot& p, double period) {
  s.phase = PHASE_RELEASE;
  if (p.release <= period) {
    begin_stage(s, 0.0, 0.0, 0.0);
    s.out = 0.0;
    s.stageElapsed = period;
  } else {
    begin_stage(s, s.out, 0.0, p.release);
  }
}

}  // namespace

extern "C" int soemdsp_curve_attack_release_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.out = 0.0;
      s.lastGate = 0.0;
      s.stageElapsed = 0.0;
      s.stageStart = 0.0;
      s.stageEnd = 0.0;
      s.stageDuration = 0.0;
      s.phase = PHASE_IDLE;
      s.hasShot = false;
      s.shot.attack = 0.01;
      s.shot.attackShape = 0.0;
      s.shot.release = 0.25;
      s.shot.releaseShape = 0.0;
      s.shot.amplitude = 1.0;
      s.shot.inputMode = 0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_curve_attack_release_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

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
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double period = 1.0 / rate;
  const bool latch = safe(updateOnTrigger) >= 0.5;

  int mode = (int)(safe(inputMode) + (safe(inputMode) >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 1) mode = 1;

  const bool gateOn = safe(gate) > 0.5;
  const bool rising = gateOn && !(s.lastGate > 0.5);
  const bool falling = !gateOn && (s.lastGate > 0.5);
  s.lastGate = gateOn ? 1.0 : 0.0;

  if (!latch || rising || !s.hasShot) {
    s.shot.attack = maxd(0.0, safe(attack));
    s.shot.attackShape = normalize_shape(attackShape);
    s.shot.release = maxd(0.0, safe(release));
    s.shot.releaseShape = normalize_shape(releaseShape);
    s.shot.amplitude = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
    s.shot.inputMode = mode;
    s.hasShot = true;
  }
  const Shot& p = s.shot;

  if (p.inputMode == 0) {
    if (rising || (gateOn && s.phase == PHASE_IDLE)) start_attack(s, p, period);
    if (falling || (!gateOn && s.phase != PHASE_RELEASE && s.phase != PHASE_IDLE)) {
      start_release(s, p, period);
    }
  } else if (rising) {
    start_attack(s, p, period);
  }

  if (!latch) {
    if (s.phase == PHASE_ATTACK) retarget_stage(s, 1.0, p.attack, period);
    else if (s.phase == PHASE_RELEASE) retarget_stage(s, 0.0, p.release, period);
  }

  if (s.phase == PHASE_ATTACK) {
    if (advance_shaped(s, p.attackShape, period) || s.out >= 1.0) {
      s.out = 1.0;
      if (p.inputMode == 1) start_release(s, p, period);
      else if (gateOn) s.phase = PHASE_HOLD;
      else start_release(s, p, period);
    }
  } else if (s.phase == PHASE_HOLD) {
    s.out = 1.0;
    if (!gateOn) start_release(s, p, period);
  } else if (s.phase == PHASE_RELEASE) {
    if (advance_shaped(s, p.releaseShape, period) || s.out <= 0.0) {
      s.out = 0.0;
      s.phase = PHASE_IDLE;
    }
  } else {
    s.out = 0.0;
  }

  if (!(s.out * 0.0 == 0.0)) s.out = 0.0;
  const double y = clamp(s.out, 0.0, 1.0) * p.amplitude;
  return (y * 0.0 == 0.0) ? y : 0.0;
}

extern "C" int soemdsp_curve_attack_release_version() { return 1; }
extern "C" const char* soemdsp_curve_attack_release_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_curve_attack_release_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
