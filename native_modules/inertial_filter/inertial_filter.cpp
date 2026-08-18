// soemdsp-native-module: inertial_filter
// soemdsp-native-label: Inertial Filter
// soemdsp-native-target: inertialFilter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/inertialFilter/inertial-filter-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct State {
  bool active;
  bool initialized;
  double out;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"inertial_filter\","
    "\"label\":\"Inertial Filter\","
    "\"targetType\":\"inertialFilter\","
    "\"kind\":\"dynamics\""
  "}";

static double coeff_from_hz(double hz, double sampleRate) {
  const double fs = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = safe(hz);
  if (!(f * 0.0 == 0.0) || f <= 0.0) return 0.0;
  if (f >= fs * 0.5) return 1.0;
  const double k = 1.0 - dsp_exp((-kTwoPi * f) / fs);
  if (!(k * 0.0 == 0.0)) return 0.0;
  return clamp(k, 0.0, 1.0);
}

}  // namespace

extern "C" int soemdsp_inertial_filter_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].initialized = false;
      gPool[i].out = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_inertial_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_inertial_filter_sample(
  int handle,
  double input,
  double attackHz,
  double releaseHz,
  double sampleRate
) {
  const double target = safe(input);
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return target;
  State& st = gPool[handle - 1];
  if (!st.initialized) {
    st.initialized = true;
    st.out = target;
    return target;
  }
  const double a = coeff_from_hz(attackHz, sampleRate);
  const double r = coeff_from_hz(releaseHz, sampleRate);
  const double cur = safe(st.out);
  const double delta = target - cur;
  const double k = delta >= 0.0 ? a : r;
  st.out = cur + delta * k;
  return st.out;
}

extern "C" int soemdsp_inertial_filter_version() { return 1; }
extern "C" const char* soemdsp_inertial_filter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_inertial_filter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
