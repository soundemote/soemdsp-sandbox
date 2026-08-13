// soemdsp-native-module: sample_delay
// soemdsp-native-label: Sample Delay
// soemdsp-native-target: sampleDelay
// soemdsp-native-kind: utility
//
// Fixed-buffer sample delay for CV/audio. Delay amount is:
//   delaySamples = clamp(timeSeconds * sampleRate + samplesParam, 0, max)
// with max = 4 seconds of ring storage reserved at create time so time can
// be modulated freely without reallocation.
//
//   In → Delayed (fractional read, linear interp) + Thru is handled in JS
//        as a pure passthrough of In (no native state needed).
//
// Delay of 0 (and any 0…1 fractional tap) mixes the current input on Delayed.
// Write first, then read. Speaker protection owns unsafe levels — no min-delay floor.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 8;
// 4.0s @ 192 kHz — covers host 48 kHz × 4× oversampling with headroom.
static const double kMaxDelaySeconds = 4.0;
static const int kMaxDelaySamples = 768000;

struct SampleDelayState {
  bool active;
  float buffer[kMaxDelaySamples];
  int writeIndex;
  int filled;  // how many samples written, capped at capacity
};

static SampleDelayState gPool[kMaxInstances];

static void clear_buffer(SampleDelayState& s) {
  for (int i = 0; i < kMaxDelaySamples; i++) {
    s.buffer[i] = 0.0f;
  }
  s.writeIndex = 0;
  s.filled = 0;
}

}  // namespace

extern "C" int soemdsp_sample_delay_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SampleDelayState& s = gPool[i];
      clear_buffer(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sample_delay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_sample_delay_sample(
  int handle,
  double input,
  double timeSeconds,
  double samplesParam,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SampleDelayState& s = gPool[handle - 1];

  const double rate = maxd(1.0, safe(sampleRate));
  const double raw = safe(input);
  const double timePart = safe(timeSeconds) * rate;
  const double samplePart = safe(samplesParam);
  double delaySamples = timePart + samplePart;
  if (!(delaySamples >= 0.0)) {
    delaySamples = 0.0;
  }
  // Stay inside the already-allocated ring (memory bound, not a user clamp).
  if (delaySamples > (double)(kMaxDelaySamples - 1)) {
    delaySamples = (double)(kMaxDelaySamples - 1);
  }

  const int write = s.writeIndex;
  s.buffer[write] = (float)raw;

  const double readPos = (double)write - delaySamples;
  int i0 = (int)dsp_floor(readPos);
  const double frac = readPos - (double)i0;
  i0 %= kMaxDelaySamples;
  if (i0 < 0) i0 += kMaxDelaySamples;
  int i1 = i0 + 1;
  if (i1 >= kMaxDelaySamples) i1 = 0;
  // Write tap is this sample — mix it in, never the stale wrap-around cell.
  const double a = (i0 == write) ? raw : (double)s.buffer[i0];
  const double b = (i1 == write) ? raw : (double)s.buffer[i1];
  const double delayed = a + (b - a) * frac;

  s.writeIndex = write + 1;
  if (s.writeIndex >= kMaxDelaySamples) {
    s.writeIndex = 0;
  }
  if (s.filled < kMaxDelaySamples) {
    s.filled += 1;
  }

  return safe(delayed);
}

extern "C" int soemdsp_sample_delay_max_samples() {
  return kMaxDelaySamples;
}

extern "C" double soemdsp_sample_delay_max_seconds() {
  return kMaxDelaySeconds;
}

extern "C" int soemdsp_sample_delay_version() {
  return 2;
}
