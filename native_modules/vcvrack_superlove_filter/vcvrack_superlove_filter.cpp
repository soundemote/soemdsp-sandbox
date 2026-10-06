// soemdsp-native-module: vcvrack_superlove_filter
// soemdsp-native-label: VCVRack Superlove Filter
// soemdsp-native-target: vcvrackSuperloveFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/filter/Superlove.hpp
//
// DSP copied from VCV Rack Super Love (soemdsp-vcvrack SuperLoveFilter.hpp).
// Sandbox ±1 in/out: input is multiplied by Drive (0…4). No Rack 5V conversion.

#include "SuperLoveFilter.hpp"
#include <soemdsp/math/seed.h>

namespace {

// Fixed seed components (never reorder; append new parts at the end).
enum : unsigned int {
  kSeedNoise = 1u,  // noise stream (index = graph lane 0 Mono / 1 Left / 2 Right)
};

static unsigned int noise_rng_state(double seed, int lane) {
  return soemdsp::math::seed_to_rng_state(soemdsp::math::seed_mix(
    soemdsp::math::seed_param_u32(seed), kSeedNoise, (unsigned int)(lane < 0 ? 0 : lane)
  ));
}

using fmd::super_love::Mode;
using fmd::super_love::Voice;
using fmd::super_love::processSample;

static const int kMaxInstances = 256;

struct Slot {
  bool active;
  Voice voice;
};

static Slot gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"vcvrack_superlove_filter\","
    "\"label\":\"VCVRack Superlove Filter\","
    "\"targetType\":\"vcvrackSuperloveFilter\","
    "\"kind\":\"filter\""
  "}";

}  // namespace

extern "C" int soemdsp_vcvrack_superlove_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      // Seed 0 / lane 0 until the host's Seed arrives via _set_seed.
      gPool[i].voice.reset(noise_rng_state(0.0, 0));
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_vcvrack_superlove_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Noise stream from the module Seed only; `lane` (0 Mono / 1 Left / 2 Right)
// keeps the graph's three cores independent. Filter state is untouched.
extern "C" void soemdsp_vcvrack_superlove_filter_set_seed(int handle, double seed, int lane) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].voice.rngState = noise_rng_state(seed, lane);
}

extern "C" double soemdsp_vcvrack_superlove_filter_sample(
  int handle,
  double input,
  double frequency,
  double resonance,
  double noise01,
  double drive,
  int mode,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  Slot& slot = gPool[handle - 1];
  const double driveGain = soemdsp::math::clamp(drive, 0.0, 4.0);
  int safeMode = mode;
  if (safeMode < 0) safeMode = 0;
  if (safeMode > 3) safeMode = 3;
  return processSample(
    slot.voice,
    input * driveGain,
    frequency,
    resonance,
    noise01,
    (Mode)safeMode,
    sampleRate
  );
}

extern "C" int soemdsp_vcvrack_superlove_filter_version() {
  return 3;
}

extern "C" const char* soemdsp_vcvrack_superlove_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_vcvrack_superlove_filter_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
