// soemdsp-native-module: flower_child_envelope_follower
// soemdsp-native-label: Flower Child Envelope Follower
// soemdsp-native-target: flowerChildEnvelopeFollower
// soemdsp-native-kind: envelope
//
// Attack/hold/decay peak follower: tracks abs(input) (clamped to [0,1]),
// rising by a fixed 1/attackSamples step per sample whenever the target is
// at or above the current value (never overshooting past the target),
// then holding flat for holdSamples once it stops rising, then falling by
// a fixed 1/decaySamples step (never undershooting past the target).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct FlowerChildEnvelopeFollowerState {
  bool active;
  double currentSlewedValue;
  double holdCounter;
};

static FlowerChildEnvelopeFollowerState gPool[kMaxInstances];

static double seconds_to_samples(double seconds, double rate) {
  if (!(seconds > 0.0)) return 1.0;
  return maxd(1.0, seconds * maxd(1.0, rate));
}

}  // namespace

extern "C" int soemdsp_flower_child_envelope_follower_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FlowerChildEnvelopeFollowerState& s = gPool[i];
      s.currentSlewedValue = 0.0;
      s.holdCounter = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_flower_child_envelope_follower_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_flower_child_envelope_follower_sample(
  int    handle,
  double input,
  double attack,
  double hold,
  double decay,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  FlowerChildEnvelopeFollowerState& s = gPool[handle - 1];

  const double target = clamp(dsp_fabs(safe(input)), 0.0, 1.0);
  const double attackSamples = seconds_to_samples(safe(attack), safe(sampleRate));
  const double holdSamples = seconds_to_samples(safe(hold), safe(sampleRate));
  const double decaySamples = seconds_to_samples(safe(decay), safe(sampleRate));
  const double attackStep = 1.0 / attackSamples;
  const double decayStep = 1.0 / decaySamples;
  const double current = clamp(s.currentSlewedValue, 0.0, 1.0);

  if (target >= current) {
    s.currentSlewedValue = mind(target, current + attackStep);
    s.holdCounter = holdSamples;
  } else if (s.holdCounter > 0.0) {
    s.holdCounter = maxd(0.0, s.holdCounter - 1.0);
    s.currentSlewedValue = current;
  } else {
    s.currentSlewedValue = maxd(target, current - decayStep);
  }

  return safe(clamp(s.currentSlewedValue, 0.0, 1.0));
}

extern "C" int soemdsp_flower_child_envelope_follower_version() {
  return 1;
}
