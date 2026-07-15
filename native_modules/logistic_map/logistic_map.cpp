// soemdsp-native-module: logistic_map
// soemdsp-native-label: Logistic Map
// soemdsp-native-target: logisticMap
// soemdsp-native-kind: chaos

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxIterationsPerSample = 4096;

struct LogisticMapState {
  bool active;
  bool hasStarted;
  double phase;
  double x;
};

static LogisticMapState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_logistic_map_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LogisticMapState& s = gPool[i];
      s.active = true;
      s.hasStarted = false;
      s.phase = 0.0;
      s.x = 0.5;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_logistic_map_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_logistic_map_sample(
  int handle,
  double reset,
  double rate,
  double r,
  double seed,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  LogisticMapState& s = gPool[handle - 1];

  const bool resetActive = reset > 0.0;
  const double safeRate = rate > 0.0 ? rate : 0.0;
  const double safeR = clamp(safe_bounded(r), 0.0, 4.0);
  const double safeSeed = clamp(safe_bounded(seed), 0.0001, 0.9999);
  const double safeLevel = safe_bounded(level);
  const double rateHz = sampleRate < 1.0 ? 1.0 : sampleRate;

  if (resetActive || !s.hasStarted) {
    s.x = safeSeed;
    s.phase = 0.0;
    s.hasStarted = true;
  }

  if (!resetActive && safeRate > 0.0) {
    s.phase += safeRate / rateHz;
    int iterations = 0;
    while (s.phase >= 1.0 && iterations < kMaxIterationsPerSample) {
      s.phase -= 1.0;
      s.x = clamp(safe_bounded(safeR * s.x * (1.0 - s.x)), 0.0, 1.0);
      iterations++;
    }
    if (s.phase >= 1.0) {
      // Rate is set absurdly high relative to sample rate -- drop the
      // remainder rather than spend the whole audio callback iterating.
      s.phase = 0.0;
    }
  }

  const double bipolar = s.x * 2.0 - 1.0;
  return safe_bounded(bipolar * safeLevel);
}

extern "C" int soemdsp_logistic_map_version() {
  return 1;
}
