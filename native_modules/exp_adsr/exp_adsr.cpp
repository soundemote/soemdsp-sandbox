// soemdsp-native-module: exp_adsr
// soemdsp-native-label: Curve Envelope
// soemdsp-native-target: expAdsr
// soemdsp-native-kind: envelope

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"exp_adsr\","
    "\"label\":\"Curve Envelope\","
    "\"targetType\":\"expAdsr\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Gate\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"delay\",\"label\":\"Delay\",\"kind\":\"time\",\"defaultValue\":0,\"min\":0,\"mid\":0.25,\"max\":5,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"attack\",\"label\":\"Attack\",\"kind\":\"time\",\"defaultValue\":0.08,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"attackShape\",\"label\":\"Attack Curve\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"kind\":\"time\",\"defaultValue\":0.22,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"sustain\",\"label\":\"Sustain\",\"defaultValue\":0.55,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"release\",\"label\":\"Release\",\"kind\":\"time\",\"defaultValue\":0.45,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"releaseShape\",\"label\":\"Fall Curve\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"loop\",\"label\":\"Loop\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;

// stage: 0=off, 1=delay, 2=attack, 3=decay, 4=sustain, 5=release
enum AdsrStage { STAGE_OFF = 0, STAGE_DELAY = 1, STAGE_ATTACK = 2, STAGE_DECAY = 3, STAGE_SUSTAIN = 4, STAGE_RELEASE = 5 };

struct ExpAdsrState {
  double out;
  double stageElapsed;
  double stageStart;
  double stageEnd;
  double stageDuration;
  double lastGate;
  double pendingSustain;
  int    stage;
  // Set when Gate falls during Delay/Attack/Decay — finish the rise/fall to
  // Sustain, then Release. Lets a 1-sample Trigger→Gate still produce a full AD.
  bool   releasePending;
  bool   active;
};

static ExpAdsrState gPool[kMaxInstances];

static inline double dsp_log10(double x) {
  return dsp_ln(x) * 0.4342944819032518;
}

// soemdsp::curve::Exponential (skew in [-0.99, 0.99]). 0 ≈ linear.
static double exponential_curve(double value, double skew) {
  double safeValue = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.99, 0.99);
  if (safeSkew == 0.0) safeSkew = -1.0e-8;
  const double c = 0.5 * (safeSkew + 1.0);
  const double a = 2.0 * dsp_log10((1.0 - c) / maxd(1.0e-12, c));
  const double denom = 1.0 - dsp_exp(a);
  return denom == 0.0 ? safeValue : (1.0 - dsp_exp(safeValue * a)) / denom;
}

/** UI shape ∈ [-1,1]; also accepts legacy target-ratio (>1). Tiny positives stay near 0 (linear). */
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

static void trigger_attack(
  ExpAdsrState& s,
  double delay,
  double attack,
  double decay,
  double rate
) {
  const double period = 1.0 / maxd(1.0, rate);
  const double from = s.out;
  const double safeDecay = maxd(0.0, decay);
  s.releasePending = false;
  if (delay < period) {
    if (attack <= period) {
      // Zero/near-zero attack: jump to peak and run Decay (never duration 0 —
      // that skipped the peak and looked like "no trigger" when Sustain is 0).
      s.stage = STAGE_DECAY;
      begin_stage(s, 1.0, s.pendingSustain, safeDecay);
      s.out = 1.0;
    } else {
      s.stage = STAGE_ATTACK;
      begin_stage(s, from, 1.0, attack);
    }
    return;
  }
  if (s.out <= kPlanck) {
    s.out = 0.0;
  }
  s.stage = STAGE_DELAY;
  begin_stage(s, s.out, s.out, delay);
}

static void enter_sustain_or_release(ExpAdsrState& s, double sustain, double release, double gate) {
  s.out = sustain;
  const bool gateLow = !(gate > 0.0);
  if (s.releasePending || gateLow) {
    s.releasePending = false;
    s.stage = STAGE_RELEASE;
    begin_stage(s, s.out, 0.0, maxd(0.0, release));
  } else {
    s.stage = STAGE_SUSTAIN;
  }
}

static bool advance_shaped(ExpAdsrState& s, double shape, double period) {
  // Zero-length stage (e.g. attack=0 → decay with Decay=0): still emit stageStart
  // for one sample so a trigger produces a peak before jumping to the end.
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
      s.pendingSustain = 0.0;
      s.stage = STAGE_OFF;
      s.releasePending = false;
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
  int    handle,
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
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ExpAdsrState& s = gPool[handle - 1];

  const double safeGate = safe(gate);
  const double safeDelay = maxd(0.0, safe(delay));
  const double safeAttack = maxd(0.0, safe(attack));
  const double safeDecay = maxd(0.0, safe(decay));
  const double safeSustain = clamp(safe(sustain), 0.0, 1.0);
  const double safeRelease = maxd(0.0, safe(release));
  const double safeAttackShape = normalize_shape_param(attackShape);
  const double safeReleaseShape = normalize_shape_param(releaseShape);
  const bool looping = safe(loop) >= 0.5;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;
  s.pendingSustain = safeSustain;

  if (s.lastGate <= 0.0 && safeGate > 0.0) {
    trigger_attack(s, safeDelay, safeAttack, safeDecay, rate);
  } else if (s.lastGate > 0.0 && safeGate <= 0.0) {
    // Short Trigger→Gate: do not abort Attack/Decay — mark pending Release.
    if (s.stage == STAGE_SUSTAIN || s.stage == STAGE_OFF) {
      s.stage = STAGE_RELEASE;
      begin_stage(s, s.out, 0.0, safeRelease);
    } else if (
      s.stage == STAGE_DELAY
      || s.stage == STAGE_ATTACK
      || s.stage == STAGE_DECAY
    ) {
      s.releasePending = true;
    } else if (s.stage == STAGE_RELEASE) {
      // already releasing
    } else {
      s.stage = STAGE_RELEASE;
      begin_stage(s, s.out, 0.0, safeRelease);
    }
  }
  s.lastGate = safeGate;

  switch (s.stage) {
    case STAGE_DELAY:
      s.stageElapsed += period;
      if (s.stageElapsed >= s.stageDuration) {
        if (safeAttack <= period) {
          s.stage = STAGE_DECAY;
          begin_stage(s, 1.0, safeSustain, safeDecay);
          s.out = 1.0;
        } else {
          s.stage = STAGE_ATTACK;
          begin_stage(s, s.out, 1.0, safeAttack);
        }
      }
      break;
    case STAGE_ATTACK:
      if (advance_shaped(s, safeAttackShape, period)) {
        s.stage = STAGE_DECAY;
        begin_stage(s, 1.0, safeSustain, safeDecay);
        s.out = 1.0;
      }
      break;
    case STAGE_DECAY:
      if (advance_shaped(s, safeReleaseShape, period)) {
        enter_sustain_or_release(s, safeSustain, safeRelease, safeGate);
      }
      break;
    case STAGE_SUSTAIN:
      s.out = safeSustain;
      if (looping) {
        trigger_attack(s, safeDelay, safeAttack, safeDecay, rate);
      }
      break;
    case STAGE_RELEASE:
      if (advance_shaped(s, safeReleaseShape, period)) {
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

  return safe(s.out * level);
}

extern "C" int soemdsp_exp_adsr_version() {
  return 4; // zero-attack + Trigger→Gate completes AD before Release
}

extern "C" const char* soemdsp_exp_adsr_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_exp_adsr_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
