// soemdsp-native-module: u2b
// soemdsp-native-label: U2B
// soemdsp-native-target: u2b
// soemdsp-native-kind: utility
//
// Unipolar 0…1 → bipolar −1…1: out = 2·in − 1.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"u2b\","
    "\"label\":\"U2B\","
    "\"targetType\":\"u2b\","
    "\"kind\":\"utility\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_u2b_sample(double input) {
  return safe(input) * 2.0 - 1.0;
}

extern "C" int soemdsp_u2b_version() {
  return 1;
}

extern "C" const char* soemdsp_u2b_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_u2b_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
