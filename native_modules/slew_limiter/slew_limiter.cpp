// soemdsp-native-module: slew_limiter
// soemdsp-native-label: Slew Limiter
// soemdsp-native-target: slewLimiter
// soemdsp-native-kind: utility
//
// Per-sample rate limiter: output moves toward the input at most
// 1/(upTime*sampleRate) per sample when rising, 1/(downTime*sampleRate)
// when falling (0 = unlimited in that direction). The first sample after
// creation snaps straight to the input rather than slewing from 0, so a
// patch that starts mid-signal doesn't ramp up from silence.
//
// This module is stereo (independent left/mono/right instances bundled by
// the JS caller, same as ladder_filter/flower_child_filter/etc.) -- this
// native module itself is single-channel, one handle per channel.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 96;
static const double kUnlimitedRate = 1e300;

struct SlewLimiterState {
  bool active;
  bool initialized;
  double out;
};

static SlewLimiterState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_slew_limiter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SlewLimiterState& s = gPool[i];
      s.initialized = false;
      s.out = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_slew_limiter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_slew_limiter_sample(
  int    handle,
  double input,
  double upTime,
  double downTime,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SlewLimiterState& s = gPool[handle - 1];

  const double safeRate = maxd(1.0, safe(sampleRate));
  const double target = safe(input);

  if (!s.initialized) {
    s.initialized = true;
    s.out = target;
    return target;
  }

  const double upSeconds = maxd(0.0, safe(upTime));
  const double downSeconds = maxd(0.0, safe(downTime));
  const double delta = target - s.out;
  const double maxRise = upSeconds <= 0.0 ? kUnlimitedRate : 1.0 / maxd(1.0, upSeconds * safeRate);
  const double maxFall = downSeconds <= 0.0 ? kUnlimitedRate : 1.0 / maxd(1.0, downSeconds * safeRate);
  const double clamped = maxd(-maxFall, mind(maxRise, delta));
  s.out = safe(s.out + clamped);
  return s.out;
}

extern "C" int soemdsp_slew_limiter_version() {
  return 1;
}
