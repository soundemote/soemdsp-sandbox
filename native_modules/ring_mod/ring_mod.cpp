// soemdsp-native-module: ring_mod
// soemdsp-native-label: RingMod
// soemdsp-native-target: ringMod
// soemdsp-native-kind: dynamics
//
// True ring modulation: four-quadrant bipolar × bipolar multiply.
// out = carrier * mod — no DC bias, so carrier/modulator originals are rejected
// (balanced AM / diode-ring style).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"ring_mod\","
    "\"label\":\"RingMod\","
    "\"targetType\":\"ringMod\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"Carrier\",\"Mod\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_ring_mod_sample(double carrier, double mod) {
  return safe(carrier) * safe(mod);
}

extern "C" int soemdsp_ring_mod_version() {
  return 1;
}

extern "C" const char* soemdsp_ring_mod_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_ring_mod_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
