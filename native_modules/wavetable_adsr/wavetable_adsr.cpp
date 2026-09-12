// soemdsp-native-module: wavetable_adsr
// soemdsp-native-label: Wavetable ADSR
// soemdsp-native-target: wavetableAdsr
// soemdsp-native-kind: envelope
//
// Cheap per-voice ADSR for Meta Voices:
// - Shape: Analog (one-pole), Linear, Smoothstep (phase 0…1 stretch)
// - Velocity from Gate amplitude (latched on rising edge)
// - Analog-style: Gate↑ does NOT restart from 0 — attacks from current level
// - Reset: rising edge → idle
// - isIdle when Off

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"wavetable_adsr\","
    "\"label\":\"Wavetable ADSR\","
    "\"targetType\":\"wavetableAdsr\","
    "\"kind\":\"envelope\","
    "\"inputs\":[\"Gate\",\"Reset\"],"
    "\"outputs\":[\"Out\",\"isIdle\"],"
    "\"parameters\":["
      "{\"key\":\"shape\",\"label\":\"Shape\",\"defaultValue\":0,\"min\":0,\"max\":2,\"step\":1},"
      "{\"key\":\"attack\",\"label\":\"Attack\",\"kind\":\"time\",\"defaultValue\":0.01,\"min\":0,\"mid\":0.2,\"max\":10,\"unit\":\"s\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"kind\":\"time\",\"defaultValue\":0.2,\"min\":0,\"mid\":0.5,\"max\":10,\"unit\":\"s\"},"
      "{\"key\":\"sustain\",\"label\":\"Sustain\",\"defaultValue\":0.7,\"min\":0,\"mid\":0.5,\"max\":1},"
      "{\"key\":\"release\",\"label\":\"Release\",\"kind\":\"time\",\"defaultValue\":0.3,\"min\":0,\"mid\":0.5,\"max\":10,\"unit\":\"s\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1}"
    "]"
  "}";

static const int kMaxInstances = 128;
static const double kGateOn = 1.0e-4;
static const double kIdleEps = 1.0e-5;
static const double kArriveEps = 1.0e-4;

enum Stage { STAGE_OFF = 0, STAGE_ATTACK = 1, STAGE_DECAY = 2, STAGE_SUSTAIN = 3, STAGE_RELEASE = 4 };
enum Shape { SHAPE_ANALOG = 0, SHAPE_LINEAR = 1, SHAPE_SMOOTHSTEP = 2 };

struct WavetableAdsrState {
  double out;          // 0…1 before Level
  double velocity;     // latched peak scale 0…1
  double lastGate;
  double lastReset;
  double segPos;       // 0…1 within Linear/Smoothstep segment
  double segStart;
  double segTarget;
  int    stage;
  int    shape;
  bool   active;
};

static WavetableAdsrState gPool[kMaxInstances];

static double smoothstep01(double t) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  return t * t * (3.0 - 2.0 * t);
}

static double shapeWarp(int shape, double t) {
  if (shape == SHAPE_SMOOTHSTEP) return smoothstep01(t);
  return clamp(t, 0.0, 1.0); // linear
}

/** ~95% settle in `seconds` at sample period `period`. */
static double onePoleCoeff(double seconds, double period) {
  const double t = maxd(seconds, period);
  // 1 - exp(-dt / (t/3)) ≈ for ~3τ to 95%
  const double tau = t / 3.0;
  const double a = 1.0 - dsp_exp(-period / maxd(tau, period));
  return clamp(a, 0.0, 1.0);
}

static void forceIdle(WavetableAdsrState& s) {
  s.out = 0.0;
  s.velocity = 0.0;
  s.segPos = 0.0;
  s.segStart = 0.0;
  s.segTarget = 0.0;
  s.stage = STAGE_OFF;
}

}  // namespace

extern "C" int soemdsp_wavetable_adsr_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      WavetableAdsrState& s = gPool[i];
      s.out = 0.0;
      s.velocity = 0.0;
      s.lastGate = 0.0;
      s.lastReset = 0.0;
      s.segPos = 0.0;
      s.segStart = 0.0;
      s.segTarget = 0.0;
      s.stage = STAGE_OFF;
      s.shape = SHAPE_ANALOG;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_wavetable_adsr_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_wavetable_adsr_sample(
  int    handle,
  double gate,
  double reset,
  double shapeParam,
  double attack,
  double decay,
  double sustain,
  double release,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  WavetableAdsrState& s = gPool[handle - 1];

  const double gIn = safe(gate);
  const double rIn = safe(reset);
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double period = 1.0 / rate;
  const double atk = maxd(0.0, safe(attack));
  const double dec = maxd(0.0, safe(decay));
  const double sus = clamp(safe(sustain), 0.0, 1.0);
  const double rel = maxd(0.0, safe(release));
  const double lev = clamp(safe(level), 0.0, 1.0);
  int shape = (int)(safe(shapeParam) + 0.5);
  if (shape < 0) shape = 0;
  if (shape > 2) shape = 2;
  s.shape = shape;

  // Reset rising edge → idle (hard).
  if (s.lastReset <= kGateOn && rIn > kGateOn) {
    forceIdle(s);
  }
  s.lastReset = rIn;

  const bool gateOn = gIn > kGateOn;
  const bool gateRise = s.lastGate <= kGateOn && gateOn;
  const bool gateFall = s.lastGate > kGateOn && !gateOn;

  if (gateRise) {
    // Velocity = Gate amplitude at note-on (clamped).
    s.velocity = clamp(gIn, 0.0, 1.0);
    const double peak = s.velocity;
    // Analog: do NOT restart from 0 — attack from current level toward peak.
    s.stage = STAGE_ATTACK;
    s.segPos = 0.0;
    s.segStart = s.out;
    s.segTarget = peak;
    if (peak <= kIdleEps) {
      // Zero velocity → stay/go idle
      forceIdle(s);
    } else if (s.out >= peak - kArriveEps) {
      s.out = peak;
      s.stage = STAGE_DECAY;
      s.segPos = 0.0;
      s.segStart = peak;
      s.segTarget = peak * sus;
    }
  } else if (gateFall) {
    s.stage = STAGE_RELEASE;
    s.segPos = 0.0;
    s.segStart = s.out;
    s.segTarget = 0.0;
  }
  s.lastGate = gIn;

  const double peak = s.velocity;
  const double susLevel = peak * sus;

  switch (s.stage) {
    case STAGE_ATTACK: {
      if (shape == SHAPE_ANALOG) {
        const double ka = onePoleCoeff(atk, period);
        s.out += ka * (peak - s.out);
        if (s.out >= peak - kArriveEps || atk <= period) {
          s.out = peak;
          s.stage = STAGE_DECAY;
          s.segPos = 0.0;
          s.segStart = peak;
          s.segTarget = susLevel;
        }
      } else {
        const double dur = maxd(atk, period);
        s.segPos += period / dur;
        if (s.segPos >= 1.0 || atk <= period) {
          s.out = peak;
          s.stage = STAGE_DECAY;
          s.segPos = 0.0;
          s.segStart = peak;
          s.segTarget = susLevel;
        } else {
          const double w = shapeWarp(shape, s.segPos);
          s.out = s.segStart + (s.segTarget - s.segStart) * w;
        }
      }
      break;
    }
    case STAGE_DECAY: {
      if (shape == SHAPE_ANALOG) {
        const double kd = onePoleCoeff(dec, period);
        s.out += kd * (susLevel - s.out);
        if (s.out <= susLevel + kArriveEps || dec <= period) {
          s.out = susLevel;
          s.stage = STAGE_SUSTAIN;
        }
      } else {
        s.segTarget = susLevel;
        const double dur = maxd(dec, period);
        s.segPos += period / dur;
        if (s.segPos >= 1.0 || dec <= period) {
          s.out = susLevel;
          s.stage = STAGE_SUSTAIN;
        } else {
          const double w = shapeWarp(shape, s.segPos);
          s.out = s.segStart + (s.segTarget - s.segStart) * w;
        }
      }
      break;
    }
    case STAGE_SUSTAIN:
      s.out = susLevel;
      break;
    case STAGE_RELEASE: {
      if (shape == SHAPE_ANALOG) {
        const double kr = onePoleCoeff(rel, period);
        s.out += kr * (0.0 - s.out);
        if (s.out <= kIdleEps || rel <= period) {
          forceIdle(s);
        }
      } else {
        const double dur = maxd(rel, period);
        s.segPos += period / dur;
        if (s.segPos >= 1.0 || rel <= period) {
          forceIdle(s);
        } else {
          const double w = shapeWarp(shape, s.segPos);
          s.out = s.segStart + (s.segTarget - s.segStart) * w;
          if (s.out < 0.0) s.out = 0.0;
        }
      }
      break;
    }
    case STAGE_OFF:
    default:
      s.out = 0.0;
      break;
  }

  if (s.out < 0.0) s.out = 0.0;
  if (s.out > 1.0) s.out = 1.0;
  return safe(s.out * lev);
}

extern "C" int soemdsp_wavetable_adsr_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  const WavetableAdsrState& s = gPool[handle - 1];
  if (!s.active) return 1;
  return (s.stage == STAGE_OFF) ? 1 : 0;
}

extern "C" int soemdsp_wavetable_adsr_version() {
  return 1;
}

extern "C" const char* soemdsp_wavetable_adsr_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_wavetable_adsr_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
