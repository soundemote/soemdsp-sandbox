// soemdsp-native-module: henon_map
// soemdsp-native-label: Henon Map
// soemdsp-native-target: henonMap
// soemdsp-native-kind: chaos

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxIterationsPerSample = 4096;

struct HenonMapState {
  bool active;
  bool hasStarted;
  double phase;
  double x;
  double y;
};

static HenonMapState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_henon_map_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      HenonMapState& s = gPool[i];
      s.active = true;
      s.hasStarted = false;
      s.phase = 0.0;
      s.x = 0.0;
      s.y = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_henon_map_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_henon_map_sample(
  int handle,
  double reset,
  double rate,
  double a,
  double b,
  double seedX,
  double seedY,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HenonMapState& s = gPool[handle - 1];

  const bool resetActive = reset > 0.0;
  const double safeRate = rate > 0.0 ? rate : 0.0;
  const double safeA = clamp(safe_bounded(a), 0.0, 2.0);
  const double safeB = clamp(safe_bounded(b), -1.0, 1.0);
  const double rateHz = sampleRate < 1.0 ? 1.0 : sampleRate;

  if (resetActive || !s.hasStarted) {
    s.x = clamp(safe_bounded(seedX), -1.0, 1.0);
    s.y = clamp(safe_bounded(seedY), -1.0, 1.0);
    s.phase = 0.0;
    s.hasStarted = true;
  }

  if (!resetActive && safeRate > 0.0) {
    s.phase += safeRate / rateHz;
    int iterations = 0;
    while (s.phase >= 1.0 && iterations < kMaxIterationsPerSample) {
      s.phase -= 1.0;
      const double nextX = 1.0 - safeA * s.x * s.x + s.y;
      const double nextY = safeB * s.x;
      s.x = clamp(safe_bounded(nextX), -4.0, 4.0);
      s.y = clamp(safe_bounded(nextY), -4.0, 4.0);
      iterations++;
    }
    if (s.phase >= 1.0) {
      s.phase = 0.0;
    }
  }
}

extern "C" double soemdsp_henon_map_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  // Classic a=1.4/b=0.3 attractor spans roughly x in [-1.5, 1.5]; normalize
  // to keep the common case near unity while still tolerating parameter
  // sweeps via the outer clamp.
  return clamp(gPool[handle - 1].x / 1.5, -1.0, 1.0);
}

extern "C" double soemdsp_henon_map_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return clamp(gPool[handle - 1].y / 0.45, -1.0, 1.0);
}

extern "C" int soemdsp_henon_map_version() {
  return 1;
}
