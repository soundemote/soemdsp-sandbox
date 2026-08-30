// soemdsp-native-module: mid_side_encode
// soemdsp-native-label: Mid/Side
// soemdsp-native-target: midSideEncode
// soemdsp-native-kind: dynamics
//
// Matches public/modules/midSideEncode/mid-side-encode-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"mid_side_encode\","
    "\"label\":\"Mid/Side\","
    "\"targetType\":\"midSideEncode\","
    "\"kind\":\"dynamics\""
  "}";

}  // namespace

extern "C" double soemdsp_mid_side_encode_sample(
  double channel,
  double left,
  double right,
  double midGainDb,
  double sideGainDb
) {
  const double l = safe(left);
  const double r = safe(right);
  const double mid = 0.5 * (l + r) * db_to_lin(midGainDb);
  const double side = 0.5 * (l - r) * db_to_lin(sideGainDb);
  const int ch = (int)(safe(channel) + 0.5);
  return ch == 1 ? side : mid;
}

extern "C" int soemdsp_mid_side_encode_version() { return 1; }
extern "C" const char* soemdsp_mid_side_encode_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_mid_side_encode_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
