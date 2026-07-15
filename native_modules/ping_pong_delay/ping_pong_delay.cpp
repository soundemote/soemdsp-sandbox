// soemdsp-native-module: ping_pong_delay
// soemdsp-native-label: Ping Pong Delay
// soemdsp-native-target: pingPongDelay
// soemdsp-native-kind: effect
//
// Classic ping-pong topology: input only ever enters the left delay line;
// the right line is driven purely by the left line's own feedback, so a
// single input bounces left -> right -> left -> right as it decays. Delay
// time is tempo-synced (numerator/denominator fraction of a whole note,
// scaled by a dotted/triplet/normal timing-mode multiplier) plus a
// millisecond offset -- both computed here rather than JS-side, since the
// JS worklet original also does this per-sample rather than caching it.
//
// Freestanding wasm32 can't reallocate at runtime, so this uses a fixed
// kMaxDelaySamples buffer (8s @ 192kHz, comfortably above any realistic
// Web Audio sample rate) instead of the JS original's dynamic resize.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 4;
static const double kMaxDelaySeconds = 8.0;
// 8s @ 192kHz -- comfortably above any realistic Web Audio sample rate.
static const int kMaxDelaySamples = 1536002;

struct PingPongDelayState {
  bool active;
  float bufferL[kMaxDelaySamples];
  float bufferR[kMaxDelaySamples];
  int bufferSize;
  int position;
  double wetL;
  double wetR;
  double outLeft;
  double outRight;
};

static PingPongDelayState gPool[kMaxInstances];

static void reset_delay(PingPongDelayState& s, int size) {
  for (int i = 0; i < size; i++) {
    s.bufferL[i] = 0.0f;
    s.bufferR[i] = 0.0f;
  }
  s.bufferSize = size;
  s.position = 0;
  s.wetL = 0.0;
  s.wetR = 0.0;
}

static double timing_mode_multiplier(double mode) {
  const long long rounded = (long long)(mode + (mode >= 0.0 ? 0.5 : -0.5));
  if (rounded == 1) return 1.5;   // Dotted
  if (rounded == 2) return 2.0 / 3.0;  // Triplet
  return 1.0;  // Normal
}

static double delay_fraction(double numerator, double denominator) {
  const double effectiveNumerator = maxd(0.0, numerator);
  if (effectiveNumerator == 0.0) return 0.0;
  const double effectiveDenominator = maxd(0.0, denominator);
  return effectiveNumerator / maxd(1.0, effectiveDenominator);
}

static double interpolate_linear(const float* buffer, int length, double where) {
  if (length <= 0) return 0.0;
  double whereFloor = dsp_floor(where);
  long long beforeRaw = (long long)whereFloor;
  int before = (int)(((beforeRaw % length) + length) % length);
  int after = (before + 1) % length;
  const double mix = where - whereFloor;
  return (double)buffer[before] * (1.0 - mix) + (double)buffer[after] * mix;
}

}  // namespace

extern "C" int soemdsp_ping_pong_delay_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PingPongDelayState& s = gPool[i];
      reset_delay(s, 2);
      s.outLeft = 0.0;
      s.outRight = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ping_pong_delay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_ping_pong_delay_sample(
  int    handle,
  double input,
  double feedback,
  double mix,
  double level,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double offsetMs,
  double tempoBpm,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PingPongDelayState& s = gPool[handle - 1];

  const double rate = maxd(1.0, safe(sampleRate));
  int requiredSize = (int)maxd(2.0, dsp_ceil(rate * kMaxDelaySeconds) + 2.0);
  if (requiredSize > kMaxDelaySamples) requiredSize = kMaxDelaySamples;
  if (s.bufferSize != requiredSize) {
    reset_delay(s, requiredSize);
  }

  const double dry = safe(input);
  const double safeFeedback = clamp(safe(feedback), 0.0, 0.95);
  const double safeMix = clamp(safe(mix), 0.0, 1.0);
  const double safeLevel = clamp(safe(level), 0.0, 2.0);

  const double secondsPerWholeNote = 240.0 / maxd(1.0, safe(tempoBpm));
  const double fraction = delay_fraction(safe(timeNumerator), safe(timeDenominator));
  const double syncedSeconds = secondsPerWholeNote * fraction * timing_mode_multiplier(safe(timingMode));
  const double offsetSeconds = safe(offsetMs) / 1000.0;
  const double rawSeconds = syncedSeconds + offsetSeconds;
  const double safeSeconds = maxd(0.0, rawSeconds);

  const double delaySamples = clamp(safeSeconds * rate, 1.0, (double)(s.bufferSize - 2));

  s.position = (s.position + 1) % s.bufferSize;
  double readPositionRaw = (double)s.position + (double)s.bufferSize - delaySamples;
  readPositionRaw = readPositionRaw - (double)s.bufferSize * dsp_floor(readPositionRaw / (double)s.bufferSize);

  const double readL = interpolate_linear(s.bufferL, s.bufferSize, readPositionRaw);
  const double readR = interpolate_linear(s.bufferR, s.bufferSize, readPositionRaw);

  const double writeL = dry + readR * safeFeedback;
  const double writeR = readL * safeFeedback;
  s.bufferL[s.position] = (float)clamp(writeL, -8.0, 8.0);
  s.bufferR[s.position] = (float)clamp(writeR, -8.0, 8.0);
  s.wetL = readL;
  s.wetR = readR;

  s.outLeft = (dry * (1.0 - safeMix) + s.wetL * safeMix) * safeLevel;
  s.outRight = (dry * (1.0 - safeMix) + s.wetR * safeMix) * safeLevel;
  return s.outLeft;
}

extern "C" double soemdsp_ping_pong_delay_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" int soemdsp_ping_pong_delay_version() {
  return 1;
}
