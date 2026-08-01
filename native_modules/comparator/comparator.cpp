// soemdsp-native-module: comparator
// soemdsp-native-label: Comparator
// soemdsp-native-target: comparator
// soemdsp-native-kind: utility
//
// 1-sample history edge detector + a few free continuous views.
//
//   In  → compare against previous sample; also used for Sign / Thru
//
//   Up     — 1-sample pulse (1.0) when the value rises  (in > prev)
//   Down   — 1-sample pulse (1.0) when the value falls  (in < prev)
//   Change — 1-sample pulse (1.0) when the value changes at all
//   Steady — 1.0 while the value is unchanged (inverse of Change)
//   Sign   — continuous gate: 1.0 when In > 0, else 0
//   Thru   — passthrough of In
//
// First sample after create seeds history only (Up/Down/Change/Steady all 0).
// Exact float equality counts as "no change".
//
// Main _sample() returns Change; other outputs via accessors.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct ComparatorState {
  bool active;
  bool hasPrev;
  double prev;
  double lastUp;
  double lastDown;
  double lastChange;
  double lastSteady;
  double lastSign;
  double lastThru;
};

static ComparatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_comparator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ComparatorState& s = gPool[i];
      s.hasPrev = false;
      s.prev = 0.0;
      s.lastUp = 0.0;
      s.lastDown = 0.0;
      s.lastChange = 0.0;
      s.lastSteady = 0.0;
      s.lastSign = 0.0;
      s.lastThru = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_comparator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_comparator_sample(int handle, double signalIn) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ComparatorState& s = gPool[handle - 1];

  const double raw = safe(signalIn);
  s.lastThru = raw;
  s.lastSign = raw > 0.0 ? 1.0 : 0.0;

  if (!s.hasPrev) {
    s.prev = raw;
    s.hasPrev = true;
    s.lastUp = 0.0;
    s.lastDown = 0.0;
    s.lastChange = 0.0;
    s.lastSteady = 0.0;
    return 0.0;
  }

  const bool rose = raw > s.prev;
  const bool fell = raw < s.prev;
  s.prev = raw;

  s.lastUp = rose ? 1.0 : 0.0;
  s.lastDown = fell ? 1.0 : 0.0;
  s.lastChange = (rose || fell) ? 1.0 : 0.0;
  s.lastSteady = (rose || fell) ? 0.0 : 1.0;
  return s.lastChange;
}

extern "C" double soemdsp_comparator_up(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastUp;
}

extern "C" double soemdsp_comparator_down(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastDown;
}

extern "C" double soemdsp_comparator_change(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastChange;
}

extern "C" double soemdsp_comparator_steady(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastSteady;
}

extern "C" double soemdsp_comparator_sign(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastSign;
}

extern "C" double soemdsp_comparator_thru(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastThru;
}

extern "C" int soemdsp_comparator_version() {
  return 5;
}
