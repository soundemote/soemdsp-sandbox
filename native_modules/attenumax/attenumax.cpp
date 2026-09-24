// soemdsp-native-module: attenumax
// soemdsp-native-label: AM Index
// soemdsp-native-target: attenumax
// soemdsp-native-kind: dynamics
//
// Out = Bias + In * Bias * Amplitude.
// Amplitude is a normalized index (1 = full). Amp 0 → Out = Bias. No clamp.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"attenumax\","
    "\"label\":\"AM Index\","
    "\"targetType\":\"attenumax\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_attenumax_sample(
  double input,
  double amplitude,
  double bias
) {
  const double x = safe(bias);
  return x + safe(input) * x * safe(amplitude);
}

extern "C" int soemdsp_attenumax_version() {
  return 3;
}

extern "C" const char* soemdsp_attenumax_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_attenumax_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
