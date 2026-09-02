// soemdsp-native-module: speaker_protection
// soemdsp-native-label: Speaker Protection
// soemdsp-native-target: speakerProtection
// soemdsp-native-kind: dynamics
//
// Hard mute per channel if !isfinite(x) || abs(x) > 1 (strict >).
// Matches public/modules/speakerProtection/speaker-protection-worklet-evaluator.js.
// Stateless sample API; create/destroy exist for graph_engine handle convention.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  bool active;
};

static State gPool[kMaxInstances];

static bool is_finite(double x) {
  return (x * 0.0 == 0.0);
}

}  // namespace

extern "C" int soemdsp_speaker_protection_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_speaker_protection_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Returns input if safe, else 0. handle reserved for future meters.
extern "C" double soemdsp_speaker_protection_sample(int handle, double input) {
  (void)handle;
  if (!is_finite(input) || dsp_fabs(input) > 1.0) {
    return 0.0;
  }
  return input;
}

extern "C" int soemdsp_speaker_protection_version() {
  return 1;
}
