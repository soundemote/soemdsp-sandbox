// soemdsp-native-module: alias_sine
// soemdsp-native-label: Alias Sine Generator
// soemdsp-native-target: aliasSine
// soemdsp-native-kind: oscillator
//
// Simple sine generator: 0 to 1 normalized frequency input.
// 0 = DC, 1 = samplerate. Wraps naturally at Nyquist, demonstrating
// aliasing as a pure design choice. frequency = normFreq * sampleRate.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"alias_sine\","
    "\"label\":\"Alias Sine Generator\","
    "\"targetType\":\"aliasSine\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"normFreq\",\"label\":\"Norm Freq\",\"defaultValue\":0.1,\"min\":0,\"mid\":0.5,\"max\":1.5,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 32;

// Local name (not the shared soemdsp_maths::dsp_sin) because this wraps
// via truncation instead of dsp_floor -- equivalent only because the sole
// caller below always passes a non-negative x, so it's not safe to merge
// with the general-purpose version without auditing that invariant away.
static double alias_sine_dsp_sin(double x) {
  double wrapped = x - kTwoPi * (double)(long long)(x / kTwoPi);
  double sign = 1.0;
  if (wrapped >= kPi) {
    wrapped -= kPi;
    sign = -1.0;
  }
  return sign * dsp_sin_0_pi(wrapped);
}

struct AliasSineState {
  double phase;
  bool active;
};

static AliasSineState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_alias_sine_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].phase = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_alias_sine_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_alias_sine_sample(
  int handle,
  double normFreq,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  AliasSineState& s = gPool[handle - 1];

  // normFreq maps 0->1 to frequency 0->sampleRate
  // phase increment per sample = frequency / sampleRate = normFreq
  s.phase = phase_advance_wrap01(s.phase, safe(normFreq));

  // convert phase [0,1] to radians [0, 2*pi]
  double out = alias_sine_dsp_sin(s.phase * kTwoPi);

  return clamp(out * safe(level), -1.0, 1.0);
}

extern "C" int soemdsp_alias_sine_version() {
  return 1;
}

extern "C" const char* soemdsp_alias_sine_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_alias_sine_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
