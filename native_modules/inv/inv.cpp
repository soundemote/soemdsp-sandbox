// soemdsp-native-module: inv
// soemdsp-native-label: Inv
// soemdsp-native-target: inv
// soemdsp-native-kind: utility
//
// Invert: out = −in.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"inv\","
    "\"label\":\"Inv\","
    "\"targetType\":\"inv\","
    "\"kind\":\"utility\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_inv_sample(double input) {
  return -safe(input);
}

extern "C" int soemdsp_inv_version() {
  return 1;
}

extern "C" const char* soemdsp_inv_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_inv_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
