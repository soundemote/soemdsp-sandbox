// soemdsp-native-module: delay_effect
// soemdsp-native-label: Delay Effect
// soemdsp-native-target: delayEffect
// soemdsp-native-kind: effect
//
// Modulated feedback/inverting delay line. The JS original dynamically
// (re)allocates a Float32Array sized to `ceil(sampleRate * 4.25s) + 2` --
// a freestanding wasm32 module can't allocate at runtime, so this uses a
// fixed kMaxDelaySamples buffer (4.25s @ 192kHz, comfortably above any
// realistic Web Audio sample rate) and tracks the *logically* active
// buffer length per instance, resetting state exactly when the JS
// original would have reallocated (i.e. when sampleRate changes).
//
// The seed hash (`stableSeed("{nodeId}:delayVariation")`) is a one-time
// string hash, not per-sample DSP -- same call as randomWalk's seed key,
// computed once JS-side and passed in as a plain integer.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"delay_effect\","
    "\"label\":\"Delay Effect\","
    "\"targetType\":\"delayEffect\","
    "\"kind\":\"effect\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\",\"Wet\"],"
    "\"parameters\":["
      "{\"key\":\"time\",\"label\":\"Time\",\"kind\":\"time\",\"defaultValue\":0.35,\"min\":0.001,\"mid\":0.5,\"max\":4.25,\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"feedback\",\"label\":\"Feedback\",\"defaultValue\":0.4,\"min\":0,\"mid\":0.5,\"max\":2,\"step\":\"any\"},"
      "{\"key\":\"mix\",\"label\":\"Mix\",\"defaultValue\":0.35,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":2,\"step\":\"any\"},"
      "{\"key\":\"modAmount\",\"label\":\"Mod Amount\",\"defaultValue\":0,\"min\":0,\"mid\":0.25,\"max\":0.5,\"step\":\"any\"},"
      "{\"key\":\"modRate\",\"label\":\"Mod Rate\",\"kind\":\"frequency\",\"defaultValue\":0,\"min\":0,\"mid\":10,\"max\":90,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"modVariation\",\"label\":\"Mod Variation\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"mode\",\"label\":\"Mode\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":1}"
    "]"
  "}";

static const int kMaxInstances = 4;
static const double kMaxDelaySeconds = 4.25;
// 4.25s @ 192kHz -- comfortably above any realistic Web Audio sample rate.
static const int kMaxDelaySamples = 816002;

static double delay_parabol_sample(double phase) {
  const double wrapped = phase - dsp_floor(phase);
  return wrapped < 0.5 ? wrapped * 4.0 - 1.0 : 3.0 - wrapped * 4.0;
}

struct DelayState {
  float  buffer[kMaxDelaySamples];
  int    bufferSize;
  int    position;
  double lfoPhase;
  double lfoVariationState;
  double wet;
  double outOut;
  double outWet;
  bool   active;
};

static DelayState gPool[kMaxInstances];

static void reset_delay(DelayState& s, int size) {
  for (int i = 0; i < size; i++) {
    s.buffer[i] = 0.0f;
  }
  s.bufferSize = size;
  s.position = 0;
  s.lfoPhase = 0.0;
  s.lfoVariationState = 0.0;
  s.wet = 0.0;
}

}  // namespace

extern "C" int soemdsp_delay_effect_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      DelayState& s = gPool[i];
      reset_delay(s, 2);
      s.outOut = 0.0;
      s.outWet = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_delay_effect_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_delay_effect_sample(
  int    handle,
  double input,
  double time,
  double feedback,
  double mix,
  double level,
  double modAmount,
  double modRate,
  double modVariation,
  double mode,
  unsigned int seed,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  DelayState& s = gPool[handle - 1];

  const double rate = maxd(1.0, safe(sampleRate));
  int requiredSize = (int)maxd(2.0, dsp_ceil(rate * kMaxDelaySeconds) + 2.0);
  if (requiredSize > kMaxDelaySamples) requiredSize = kMaxDelaySamples;
  if (s.bufferSize != requiredSize) {
    reset_delay(s, requiredSize);
  }

  const double dry = safe(input);
  const double time_ = clamp(safe(time), 0.001, kMaxDelaySeconds);
  // No hardcoded 0.95 ceiling — parameter min/max own the range.
  const double feedback_ = safe(feedback);
  const double mix_ = clamp(safe(mix), 0.0, 1.0);
  const double level_ = clamp(safe(level), 0.0, 2.0);
  const double modAmount_ = clamp(safe(modAmount), 0.0, 0.5);
  const double modRate_ = clamp(safe(modRate), 0.0, 90.0);
  const double modVariation_ = clamp(safe(modVariation), 0.0, 1.0);
  const bool modeInvert = (long long)(safe(mode) + 0.5) >= 1;

  const unsigned int variationIndex = (unsigned int)((long long)dsp_floor(s.lfoPhase * 997.0) + s.position);
  const double variationTarget = hash_bipolar(variationIndex, seed);
  s.lfoVariationState += (variationTarget - s.lfoVariationState) * mind(1.0, modRate_ / rate);
  const double variedRate = maxd(0.0, modRate_ * (1.0 + s.lfoVariationState * modVariation_));
  double lfoPhaseNext = s.lfoPhase + variedRate / rate;
  lfoPhaseNext = lfoPhaseNext - dsp_floor(lfoPhaseNext);
  s.lfoPhase = lfoPhaseNext;
  const double lfo = (delay_parabol_sample(s.lfoPhase) + 1.0) * 0.5;

  const double delaySamples = clamp(time_ * rate, 1.0, (double)(s.bufferSize - 2));
  const double bufferOffset = delaySamples - delaySamples * lfo * modAmount_ + 1.0;
  s.position = (s.position + 1) % s.bufferSize;

  double readPositionRaw = (double)s.position + (double)s.bufferSize - bufferOffset;
  // fmod-style wrap into [0, bufferSize) to match JS's `%` on a
  // guaranteed-nonnegative operand.
  readPositionRaw = readPositionRaw - (double)s.bufferSize * dsp_floor(readPositionRaw / (double)s.bufferSize);

  // delayInterpolateLinear
  const int before = (int)dsp_floor(readPositionRaw) % s.bufferSize;
  const int after = (before + 1) % s.bufferSize;
  const double interpMix = readPositionRaw - dsp_floor(readPositionRaw);
  const double wetRead = (double)s.buffer[before] * (1.0 - interpMix) + (double)s.buffer[after] * interpMix;

  const double write = modeInvert ? ((0.0 - dry) - wetRead * feedback_) : (dry + wetRead * feedback_);
  s.buffer[s.position] = (float)clamp(write, -8.0, 8.0);
  s.wet = modeInvert ? (dry * feedback_ - wetRead * (1.0 - feedback_ * feedback_)) : wetRead;

  s.outOut = (dry * (1.0 - mix_) + s.wet * mix_) * level_;
  s.outWet = s.wet * level_;
}

extern "C" double soemdsp_delay_effect_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outOut;
}

extern "C" double soemdsp_delay_effect_wet(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outWet;
}

extern "C" int soemdsp_delay_effect_version() {
  return 1;
}

extern "C" const char* soemdsp_delay_effect_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_delay_effect_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
