// soemdsp-native-module: vcvrack_superlove_filter
// soemdsp-native-label: VCVRack Superlove Filter
// soemdsp-native-target: vcvrackSuperloveFilter
// soemdsp-native-kind: filter
//
// DSP copied from VCV Rack Super Love (soemdsp-vcvrack SuperLoveFilter.hpp).
// Sandbox ±1 in/out: input is multiplied by Drive (0…4). No Rack 5V conversion.

#include "SuperLoveFilter.hpp"

namespace {

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

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

}  // namespace

extern "C" int soemdsp_vcvrack_superlove_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].voice.reset(0xA5F152F9u + (unsigned int)(i + 1) * 0x9E3779B9u);
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
  const double driveGain = clampd(drive, 0.0, 4.0);
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
