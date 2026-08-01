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
// Delay of 0 returns the current input on Delayed (no one-sample lag).

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
  const double timePart = maxd(0.0, safe(timeSeconds)) * rate;
  const double samplePart = maxd(0.0, safe(samplesParam));
  double delaySamples = timePart + samplePart;
  if (delaySamples > (double)(kMaxDelaySamples - 1)) {
    delaySamples = (double)(kMaxDelaySamples - 1);
  }
  if (delaySamples < 0.0) {
    delaySamples = 0.0;
  }

  double delayed = raw;
  if (delaySamples < 1e-9) {
    // Zero delay: Delayed == In (no lag).
    delayed = raw;
  } else {
    // Fractional read behind the write head (before writing this sample).
    const double readPos = (double)s.writeIndex - delaySamples;
    // Floor / frac for linear interpolation.
    int i0 = (int)dsp_floor(readPos);
    double frac = readPos - (double)i0;
    // Wrap i0 into [0, capacity).
    i0 %= kMaxDelaySamples;
    if (i0 < 0) i0 += kMaxDelaySamples;
    int i1 = i0 + 1;
    if (i1 >= kMaxDelaySamples) i1 = 0;
    const double a = (double)s.buffer[i0];
    const double b = (double)s.buffer[i1];
    delayed = a + (b - a) * frac;
    // Until the ring has enough history, fade toward 0 (silence pad).
    if (s.filled < (int)dsp_ceil(delaySamples)) {
      // Still filling: prefer the interpolated value when available,
      // else 0. filled counts written samples; for delay D we need D samples.
      if (s.filled <= 0) {
        delayed = 0.0;
      }
    }
  }

  s.buffer[s.writeIndex] = (float)raw;
  s.writeIndex += 1;
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
  return 1;
}
