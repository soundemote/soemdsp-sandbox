// soemdsp-native-module: exp_adsr
// soemdsp-native-label: Curve ADSR
// soemdsp-native-target: expAdsr
// soemdsp-native-kind: envelope
//
// UpdateOnTrigger On: latch knobs on Gate rise.
// Off: knobs/mods apply live, including mid-stage time/target retarget.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"exp_adsr\","
    "\"label\":\"Curve ADSR\","
    "\"targetType\":\"expAdsr\","
    "\"kind\":\"envelope\""
  "}";

static const int kMaxInstances = 64;

enum AdsrStage {
  STAGE_OFF = 0,
  STAGE_DELAY = 1,
  STAGE_ATTACK = 2,
  STAGE_DECAY = 3,
  STAGE_SUSTAIN = 4,
  STAGE_RELEASE = 5
};

struct Shot {
  double delay;
  double attack;
  double attackShape;
  double decay;
  double sustain;
  double release;
  double releaseShape;
  double loop;
  double level;
};

struct ExpAdsrState {
  double out;
  double stageElapsed;
  double stageStart;
  double stageEnd;
  double stageDuration;
  double lastGate;
  int stage;
  bool releasePending;
  bool hasShot;
  Shot shot;
  bool active;
};

static ExpAdsrState gPool[kMaxInstances];

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

static double normalize_shape_param(double shape) {
  const double s = safe(shape);
  if (s > 1.0) {
    const double r = mind(100.0, maxd(1.0e-4, s));
    const double t = (dsp_ln(100.0) - dsp_ln(r)) / (dsp_ln(100.0) - dsp_ln(1.0e-4));
    return clamp(t, 0.0, 1.0);
  }
  return clamp(s, -1.0, 1.0);
}

static double shape_skew(double shape) {
  const double s = normalize_shape_param(shape);
  if (s > -1.0e-6 && s < 1.0e-6) return -1.0e-8;
  return clamp(s, -0.99, 0.99);
}

static void begin_stage(ExpAdsrState& s, double start, double end, double duration) {
  s.stageStart = start;
  s.stageEnd = end;
  s.stageDuration = maxd(0.0, duration);
  s.stageElapsed = 0.0;
  s.out = start;
}

// Keep progress fraction when duration/target changes mid-stage (live mode).
// stageStart stays fixed so shaped progress is not re-based every sample.
static void retarget_stage(ExpAdsrState& s, double newEnd, double newDuration, double period) {
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

static void capture_shot(
  Shot& shot,
  double delay,
  double attack,
  double attackShape,
  double decay,
  double sustain,
  double release,
  double releaseShape,
  double loop,
  double level
) {
  shot.delay = maxd(0.0, safe(delay));
  shot.attack = maxd(0.0, safe(attack));
  shot.attackShape = normalize_shape_param(attackShape);
  shot.decay = maxd(0.0, safe(decay));
  shot.sustain = clamp(safe(sustain), 0.0, 1.0);
  shot.release = maxd(0.0, safe(release));
  shot.releaseShape = normalize_shape_param(releaseShape);
  shot.loop = safe(loop);
  shot.level = (level * 0.0 == 0.0) ? level : 1.0;
}

static void trigger_attack(ExpAdsrState& s, const Shot& p, double rate) {
  const double period = 1.0 / maxd(1.0, rate);
  const double from = s.out;
  s.releasePending = false;
  if (p.delay < period) {
    if (p.attack <= period) {
      s.stage = STAGE_DECAY;
      begin_stage(s, 1.0, p.sustain, p.decay);
      s.out = 1.0;
    } else {
      s.stage = STAGE_ATTACK;
      begin_stage(s, from, 1.0, p.attack);
    }
    return;
  }
  if (s.out <= kPlanck) s.out = 0.0;
  s.stage = STAGE_DELAY;
  begin_stage(s, s.out, s.out, p.delay);
}

// Gate still high → snap to sustain. Gate low / releasePending → Release from
// the current decay level (no snap-up). Live Body fb sustain recovery used to
// re-attack mid-decay; callers skip that by entering Release instead.
static void enter_sustain_or_release(
  ExpAdsrState& s, const Shot& p, double gate, double outBeforeComplete
) {
  const bool gateLow = !(gate > 0.0);
  if (s.releasePending || gateLow) {
    s.releasePending = false;
    s.stage = STAGE_RELEASE;
    begin_stage(s, outBeforeComplete, 0.0, p.release);
  } else {
    s.out = p.sustain;
    s.stage = STAGE_SUSTAIN;
  }
}

static bool advance_shaped(ExpAdsrState& s, double shape, double period) {
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

}  // namespace

extern "C" int soemdsp_exp_adsr_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ExpAdsrState& s = gPool[i];
      s.out = 0.0;
      s.stageElapsed = 0.0;
      s.stageStart = 0.0;
      s.stageEnd = 0.0;
      s.stageDuration = 0.0;
      s.lastGate = 0.0;
      s.stage = STAGE_OFF;
      s.releasePending = false;
      s.hasShot = false;
      s.shot = Shot();
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_exp_adsr_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

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
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ExpAdsrState& s = gPool[handle - 1];

  const double safeGate = safe(gate);
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;
  const bool latch = safe(updateOnTrigger) >= 0.5;
  const bool rising = s.lastGate <= 0.0 && safeGate > 0.0;
  const bool falling = s.lastGate > 0.0 && safeGate <= 0.0;

  // On: freeze knobs until next Gate rise. Off: always live (+ mid-stage retarget).
  if (!latch || rising || !s.hasShot) {
    capture_shot(
      s.shot, delay, attack, attackShape, decay, sustain, release, releaseShape, loop, level
    );
    s.hasShot = true;
  }
  const Shot& p = s.shot;

  if (rising) {
    trigger_attack(s, p, rate);
  } else if (falling) {
    if (s.stage == STAGE_SUSTAIN || s.stage == STAGE_OFF) {
      s.stage = STAGE_RELEASE;
      begin_stage(s, s.out, 0.0, p.release);
    } else if (
      s.stage == STAGE_DELAY
      || s.stage == STAGE_ATTACK
      || s.stage == STAGE_DECAY
    ) {
      s.releasePending = true;
    } else if (s.stage != STAGE_RELEASE) {
      s.stage = STAGE_RELEASE;
      begin_stage(s, s.out, 0.0, p.release);
    }
  }
  s.lastGate = safeGate;

  // Live mid-stage retarget when UpdateOnTrigger is Off.
  // Decay + live sustain MOD (Thump Body fb): if gate is already down and
  // sustain recovers above current out, finishing Decay would leap back up
  // (extra attack). Depart from that: take Release from the current level.
  if (!latch) {
    if (s.stage == STAGE_DELAY) {
      retarget_stage(s, s.out, p.delay, period);
    } else if (s.stage == STAGE_ATTACK) {
      retarget_stage(s, 1.0, p.attack, period);
    } else if (s.stage == STAGE_DECAY) {
      const bool gateLow = !(safeGate > 0.0);
      if ((s.releasePending || gateLow) && p.sustain > s.out) {
        s.releasePending = false;
        s.stage = STAGE_RELEASE;
        begin_stage(s, s.out, 0.0, p.release);
      } else {
        // Never retarget Decay end above current out (blocks mid-decay rises).
        retarget_stage(s, mind(p.sustain, s.out), p.decay, period);
      }
    } else if (s.stage == STAGE_RELEASE) {
      retarget_stage(s, 0.0, p.release, period);
    }
  }

  const bool looping = p.loop >= 0.5;

  switch (s.stage) {
    case STAGE_DELAY:
      s.stageElapsed += period;
      if (s.stageElapsed >= s.stageDuration) {
        if (p.attack <= period) {
          s.stage = STAGE_DECAY;
          begin_stage(s, 1.0, p.sustain, p.decay);
          s.out = 1.0;
        } else {
          s.stage = STAGE_ATTACK;
          begin_stage(s, s.out, 1.0, p.attack);
        }
      }
      break;
    case STAGE_ATTACK:
      if (advance_shaped(s, p.attackShape, period)) {
        s.stage = STAGE_DECAY;
        begin_stage(s, 1.0, p.sustain, p.decay);
        s.out = 1.0;
      }
      break;
    case STAGE_DECAY: {
      const double outBefore = s.out;
      if (advance_shaped(s, p.releaseShape, period)) {
        // Keep level — do not snap up to a recovered live sustain.
        s.out = outBefore;
        enter_sustain_or_release(s, p, safeGate, outBefore);
      } else if (s.out > outBefore) {
        s.out = outBefore; // monotonic decay (no extra attack)
      }
      break;
    }
    case STAGE_SUSTAIN:
      s.out = p.sustain;
      if (looping) trigger_attack(s, p, rate);
      break;
    case STAGE_RELEASE:
      if (advance_shaped(s, p.releaseShape, period)) {
        s.out = 0.0;
        s.stage = STAGE_OFF;
        s.releasePending = false;
      }
      break;
    case STAGE_OFF:
    default:
      s.out = 0.0;
      s.releasePending = false;
      break;
  }

  return safe(s.out * p.level);
}

extern "C" int soemdsp_exp_adsr_version() {
  return 8; // Monotonic decay; Release from level (no Body-fb re-attack)
}

extern "C" const char* soemdsp_exp_adsr_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_exp_adsr_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
