// soemdsp-native-module: bias
// soemdsp-native-label: Bias
// soemdsp-native-target: bias
// soemdsp-native-kind: dynamics
//
// Matches public/modules/bias/bias-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"bias\","
    "\"label\":\"Bias\","
    "\"targetType\":\"bias\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_bias_sample(double input, double offset) {
  return safe(input) + safe(offset);
}

extern "C" int soemdsp_bias_version() { return 1; }
extern "C" const char* soemdsp_bias_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_bias_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
