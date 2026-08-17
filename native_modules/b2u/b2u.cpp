// soemdsp-native-module: b2u
// soemdsp-native-label: B2U
// soemdsp-native-target: b2u
// soemdsp-native-kind: utility
//
// Bipolar −1…1 → unipolar 0…1: out = (in + 1) / 2.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"b2u\","
    "\"label\":\"B2U\","
    "\"targetType\":\"b2u\","
    "\"kind\":\"utility\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_b2u_sample(double input) {
  return (safe(input) + 1.0) * 0.5;
}

extern "C" int soemdsp_b2u_version() {
  return 1;
}

extern "C" const char* soemdsp_b2u_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_b2u_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
