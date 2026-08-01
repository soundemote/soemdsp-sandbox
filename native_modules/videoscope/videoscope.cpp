// soemdsp-native-module: videoscope
// soemdsp-native-label: Videoscope
// soemdsp-native-target: videoscope
// soemdsp-native-kind: display
//
// The "audio in, dot/line/xy scope out" core described in the design
// thread: ring-buffer both channels every sample, trigger on a level
// crossing, capture a window off the trigger, then let the JS side query
// min/max per pixel column so oversampled windows don't lose narrow spikes.
//
// Capture is frozen into capA/capB on trigger so continued ring writes
// (and burst catch-up after UI stalls / plan sync) cannot overwrite the
// displayed window until the next re-trigger.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kBufferCapacity = 8192;  // buffer_size_max, a rough default

enum Mode { MODE_DOT = 0, MODE_LINE = 1, MODE_XY = 2 };

struct ScopeState {
  bool active;

  // Live ring (always writing when not frozen).
  double bufA[kBufferCapacity];
  double bufB[kBufferCapacity];
  int writeIndex;
  int filled;  // how many samples have ever been written, capped at capacity

  bool lastAboveLevel;
  int triggerIndex;   // ring index just past the trigger sample
  bool hasCapture;
  int windowSize;      // samples in the currently captured frame

  // Frozen acquisition memory — stable until next trigger.
  double capA[kBufferCapacity];
  double capB[kBufferCapacity];
};

static ScopeState gPool[kMaxInstances];

double absVal(double v) { return v < 0.0 ? -v : v; }

int clampInt(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

void copyCaptureWindow(ScopeState& s) {
  const int n = s.windowSize;
  if (n <= 0 || n > kBufferCapacity) {
    s.hasCapture = false;
    return;
  }
  for (int i = 0; i < n; i++) {
    int index = s.triggerIndex - n + i;
    index %= kBufferCapacity;
    if (index < 0) index += kBufferCapacity;
    s.capA[i] = s.bufA[index];
    s.capB[i] = s.bufB[index];
  }
  s.hasCapture = true;
}

}  // namespace

extern "C" int soemdsp_videoscope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ScopeState& s = gPool[i];
      s.active = true;
      s.writeIndex = 0;
      s.filled = 0;
      s.lastAboveLevel = false;
      s.triggerIndex = 0;
      s.hasCapture = false;
      s.windowSize = 0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_videoscope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Called once per audio sample. triggerSource: 0=A, 1=B. triggerPolarity:
// 0=positive (rising through level), 1=negative (falling through level).
// timeDivSamples is the window size in samples (already converted from
// time/div + sample rate on the JS side -- keeping this function unitless).
extern "C" void soemdsp_videoscope_push(
  int handle,
  double a,
  double b,
  double triggerLevel,
  int triggerSource,
  int triggerPolarity,
  int timeDivSamples,
  int freeze
) {
  if (handle < 1 || handle > kMaxInstances) return;
  ScopeState& s = gPool[handle - 1];

  if (freeze) {
    return;  // frozen: don't buffer, don't trigger, don't recapture
  }

  const double sa = safe_bounded(a);
  const double sb = safe_bounded(b);
  s.bufA[s.writeIndex] = sa;
  s.bufB[s.writeIndex] = sb;
  s.writeIndex = (s.writeIndex + 1) % kBufferCapacity;
  if (s.filled < kBufferCapacity) s.filled++;

  const double triggerChannel = (triggerSource == 1) ? sb : sa;
  const bool aboveLevel = triggerChannel >= triggerLevel;
  const bool crossedUp = aboveLevel && !s.lastAboveLevel;
  const bool crossedDown = !aboveLevel && s.lastAboveLevel;
  s.lastAboveLevel = aboveLevel;

  const bool triggered = (triggerPolarity == 1) ? crossedDown : crossedUp;
  if (triggered) {
    s.triggerIndex = s.writeIndex;  // most recent sample = the trigger point
    s.windowSize = clampInt(timeDivSamples, 1, kBufferCapacity);
    if (s.windowSize <= s.filled) {
      // Snapshot into freeze buffer so later ring writes cannot dump it.
      copyCaptureWindow(s);
    }
  }
}

// Reads back a captured sample: offset 0 = oldest sample in the window,
// offset windowSize-1 = the trigger point itself.
double capturedSample(ScopeState& s, const double* cap, int offset) {
  if (!s.hasCapture || s.windowSize <= 0) return 0.0;
  const int clampedOffset = clampInt(offset, 0, s.windowSize - 1);
  return cap[clampedOffset];
}

extern "C" int soemdsp_videoscope_window_size(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].hasCapture ? gPool[handle - 1].windowSize : 0;
}

// Min/max of channel A (channelSelect=0) or B (1) within the pixel column
// `col` out of `columns` total, for the current captured window. This is
// the "don't lose spikes when zoomed out" piece -- one call per column per
// channel per redraw, called from JS.
extern "C" double soemdsp_videoscope_column_min(int handle, int channelSelect, int col, int columns) {
  if (handle < 1 || handle > kMaxInstances || columns <= 0) return 0.0;
  ScopeState& s = gPool[handle - 1];
  if (!s.hasCapture) return 0.0;
  const double* cap = channelSelect == 1 ? s.capB : s.capA;
  const int start = (col * s.windowSize) / columns;
  const int end = clampInt(((col + 1) * s.windowSize) / columns, start + 1, s.windowSize);
  double minValue = capturedSample(s, cap, start);
  for (int i = start + 1; i < end; i++) {
    const double v = capturedSample(s, cap, i);
    if (v < minValue) minValue = v;
  }
  return minValue;
}

extern "C" double soemdsp_videoscope_column_max(int handle, int channelSelect, int col, int columns) {
  if (handle < 1 || handle > kMaxInstances || columns <= 0) return 0.0;
  ScopeState& s = gPool[handle - 1];
  if (!s.hasCapture) return 0.0;
  const double* cap = channelSelect == 1 ? s.capB : s.capA;
  const int start = (col * s.windowSize) / columns;
  const int end = clampInt(((col + 1) * s.windowSize) / columns, start + 1, s.windowSize);
  double maxValue = capturedSample(s, cap, start);
  for (int i = start + 1; i < end; i++) {
    const double v = capturedSample(s, cap, i);
    if (v > maxValue) maxValue = v;
  }
  return maxValue;
}

// X/Y mode doesn't want per-column min/max -- it wants the raw point pairs.
extern "C" double soemdsp_videoscope_xy_a(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ScopeState& s = gPool[handle - 1];
  return capturedSample(s, s.capA, index);
}

extern "C" double soemdsp_videoscope_xy_b(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ScopeState& s = gPool[handle - 1];
  return capturedSample(s, s.capB, index);
}

extern "C" int soemdsp_videoscope_version() {
  return 2;
}
