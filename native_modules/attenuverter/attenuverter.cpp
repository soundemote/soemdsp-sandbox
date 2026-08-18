// soemdsp-native-module: attenuverter
// soemdsp-native-label: Attenuverter
// soemdsp-native-target: attenuverter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/attenuverter/attenuverter-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"attenuverter\","
    "\"label\":\"Attenuverter\","
    "\"targetType\":\"attenuverter\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_attenuverter_sample(double input, double amplitude, double offset) {
  return safe(input) * safe(amplitude) + safe(offset);
}

extern "C" int soemdsp_attenuverter_version() { return 1; }
extern "C" const char* soemdsp_attenuverter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_attenuverter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
