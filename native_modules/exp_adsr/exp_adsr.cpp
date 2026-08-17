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
      "{\"key\":\"attackShape\",\"label\":\"Attack Shape\",\"defaultValue\":0.3,\"min\":0.000000001,\"mid\":0.5,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"kind\":\"time\",\"defaultValue\":0.22,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"sustain\",\"label\":\"Sustain\",\"defaultValue\":0.55,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"release\",\"label\":\"Release\",\"kind\":\"time\",\"defaultValue\":0.45,\"min\":0,\"mid\":0.5,\"max\":10,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"releaseShape\",\"label\":\"Release Shape\",\"defaultValue\":0.0001,\"min\":0.000000001,\"mid\":0.5,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"loop\",\"label\":\"Loop\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 64;

// stage: 0=off, 1=delay, 2=attack, 3=decay, 4=sustain, 5=release
enum AdsrStage { STAGE_OFF = 0, STAGE_DELAY = 1, STAGE_ATTACK = 2, STAGE_DECAY = 3, STAGE_SUSTAIN = 4, STAGE_RELEASE = 5 };

struct ExpAdsrState {
  double out;
  double secondsPassed;
  double lastGate;
  int    stage;
  bool   active;
};

static ExpAdsrState gPool[kMaxInstances];

static double calc_coef(double rate, double targetRatio) {
  double safeRate = maxd(0.0, rate);
  double safeRatio = maxd(0.000000001, targetRatio);
  return safeRate <= 0.0 ? 0.0 : dsp_exp(-dsp_ln((1.0 + safeRatio) / safeRatio) / safeRate);
}

static void trigger_attack(ExpAdsrState& s, double delay, double attack, double rate) {
  const double period = 1.0 / maxd(1.0, rate);
  if (delay < period) {
    if (attack <= period) {
      s.stage = STAGE_DECAY;
      s.out = 1.0;
    } else {
      s.stage = STAGE_ATTACK;
    }
    return;
  }
  if (s.out <= kPlanck) {
    s.out = 0.0;
    s.secondsPassed = 0.0;
  }
  s.stage = STAGE_DELAY;
}

}  // namespace

extern "C" int soemdsp_exp_adsr_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ExpAdsrState& s = gPool[i];
      s.out = 0.0;
      s.secondsPassed = 0.0;
      s.lastGate = 0.0;
      s.stage = STAGE_OFF;
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
  const double safeAttackShape = maxd(0.000000001, safe(attackShape));
  const double safeReleaseShape = maxd(0.000000001, safe(releaseShape));
  const bool looping = safe(loop) >= 0.5;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;

  if (s.lastGate <= 0.0 && safeGate > 0.0) {
    trigger_attack(s, safeDelay, safeAttack, rate);
  } else if (s.lastGate > 0.0 && safeGate <= 0.0) {
    s.stage = STAGE_RELEASE;
  }
  s.lastGate = safeGate;

  const double attackCoef = calc_coef(safeAttack * rate, safeAttackShape);
  const double decayCoef = calc_coef(safeDecay * rate, safeReleaseShape);
  const double releaseCoef = calc_coef(safeRelease * rate, safeReleaseShape);
  const double attackBase = (1.0 + safeAttackShape) * (1.0 - attackCoef);
  const double decayBase = (safeSustain - safeReleaseShape) * (1.0 - decayCoef);
  const double releaseBase = -safeReleaseShape * (1.0 - releaseCoef);

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
      s.out = attackBase + s.out * attackCoef;
      if (s.out >= 1.0) {
        s.out = 1.0;
        s.stage = STAGE_DECAY;
      }
      break;
    case STAGE_DECAY:
      s.out = decayBase + s.out * decayCoef;
      if (s.out <= safeSustain) {
        s.out = safeSustain;
        s.stage = STAGE_SUSTAIN;
      }
      break;
    case STAGE_SUSTAIN:
      s.out = safeSustain;
      if (looping) {
        trigger_attack(s, safeDelay, safeAttack, rate);
      }
      break;
    case STAGE_RELEASE:
      s.out = releaseBase + s.out * releaseCoef;
      if (s.out <= 0.0) {
        s.out = 0.0;
        s.stage = STAGE_OFF;
      }
      break;
    case STAGE_OFF:
    default:
      s.out = 0.0;
      break;
  }

  return safe(s.out * level);
}

extern "C" int soemdsp_exp_adsr_version() {
  return 1;
}

extern "C" const char* soemdsp_exp_adsr_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_exp_adsr_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
