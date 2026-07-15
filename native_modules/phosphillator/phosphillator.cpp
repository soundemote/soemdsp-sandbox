// soemdsp-native-module: phosphillator
// soemdsp-native-label: Phosphillator
// soemdsp-native-target: phosphillator
// soemdsp-native-kind: oscillator
//
// Unlike every other ported module, this one's per-sample behavior depends
// on a variable-length, user-drawn path (X/Y point pairs) rather than fixed
// scalar parameters. That doesn't fit the usual "just pass doubles" calling
// convention, so the path is written into this module's own static wasm
// memory buffers (soemdsp_phosphillator_path_x_ptr/_y_ptr expose the byte
// offsets) by the JS side, only when the path's object-identity reference
// changes -- mirroring the JS worklet's own decode-and-cache-by-identity
// scheme. If the path is longer than kMaxPathPoints, soemdsp_phosphillator_set_path
// returns 0 and the JS wrapper falls back to the JS implementation for that
// node rather than silently truncating a user's drawing.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 8;
static const int kMaxPathPoints = 8192;

struct PhosphillatorState {
  bool active;
  float pathX[kMaxPathPoints];
  float pathY[kMaxPathPoints];
  int pathCount;
  double phase;
  bool lastReset;
  double outY;
};

static PhosphillatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_phosphillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PhosphillatorState& s = gPool[i];
      s.pathCount = 0;
      s.phase = 0.0;
      s.lastReset = false;
      s.outY = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_phosphillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" int soemdsp_phosphillator_path_x_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gPool[handle - 1].pathX;
}

extern "C" int soemdsp_phosphillator_path_y_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gPool[handle - 1].pathY;
}

extern "C" int soemdsp_phosphillator_max_path_points() {
  return kMaxPathPoints;
}

// JS writes decoded X/Y floats directly into wasm memory at the pointers
// above, then calls this to tell the instance how many are valid. Returns 1
// on success, 0 if count exceeds kMaxPathPoints (path left at count 0 == no
// playback path, matching the JS reference's "decoded === null" branch).
extern "C" int soemdsp_phosphillator_set_path(int handle, int count) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  PhosphillatorState& s = gPool[handle - 1];
  if (count < 0 || count > kMaxPathPoints) {
    s.pathCount = 0;
    return 0;
  }
  s.pathCount = count;
  return 1;
}

extern "C" void soemdsp_phosphillator_clear_path(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].pathCount = 0;
}

extern "C" double soemdsp_phosphillator_sample(
  int    handle,
  double cvInput,
  double frequency,
  double phaseOffset,
  double reset,
  double rate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PhosphillatorState& s = gPool[handle - 1];

  const bool resetActive = safe(reset) > 0.5;
  if (resetActive && !s.lastReset) {
    s.phase = 0.0;
  }
  s.lastReset = resetActive;

  const double pitchedFrequency = maxd(0.0, safe(frequency) * dsp_exp2(safe(cvInput) / 0.1));
  const double safeRate = maxd(1.0, safe(rate));
  s.phase = wrap01(s.phase + pitchedFrequency / safeRate);

  if (s.pathCount < 2) {
    s.outY = 0.0;
    return 0.0;
  }

  const double effectivePhase = wrap01(s.phase + safe(phaseOffset));
  const int n = s.pathCount;
  const double index = effectivePhase * (double)n;
  const double indexFloor = dsp_floor(index);
  const int i0 = ((int)indexFloor) % n;
  const int i1 = (i0 + 1) % n;
  const double t = index - indexFloor;

  const double x0 = (double)s.pathX[i0];
  const double x1 = (double)s.pathX[i1];
  const double y0 = (double)s.pathY[i0];
  const double y1 = (double)s.pathY[i1];

  s.outY = y0 + (y1 - y0) * t;
  return x0 + (x1 - x0) * t;
}

extern "C" double soemdsp_phosphillator_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" int soemdsp_phosphillator_version() {
  return 1;
}
