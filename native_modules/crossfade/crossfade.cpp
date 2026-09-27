// soemdsp-native-module: crossfade
// soemdsp-native-label: Crossfade4
// soemdsp-native-target: crossfade4
// soemdsp-native-kind: dynamics
//
// Shared by Crossfade2 / Crossfade3 / Crossfade4 (lastIndex = N-1 pairs).
// Adjacent stereo-pair linear blend by Crossfade address 0..(N-1).
// Matches public/modules/crossfade/crossfade-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using soemdsp::debug::safe;
using soemdsp::math::clamp;
using soemdsp::math::clamp_int;
using soemdsp::math::dsp_floor;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"crossfade\","
    "\"label\":\"Crossfade4\","
    "\"targetType\":\"crossfade4\","
    "\"kind\":\"dynamics\""
  "}";

static void pick_pair(
  int index,
  double l1, double r1, double l2, double r2,
  double l3, double r3, double l4, double r4,
  double* left, double* right
) {
  switch (clamp_int(index, 0, 3)) {
    case 0: *left = safe(l1); *right = safe(r1); return;
    case 1: *left = safe(l2); *right = safe(r2); return;
    case 2: *left = safe(l3); *right = safe(r3); return;
    default: *left = safe(l4); *right = safe(r4); return;
  }
}

static void compute(
  double lastIndex,
  double crossfade,
  double l1, double r1, double l2, double r2,
  double l3, double r3, double l4, double r4,
  double* left, double* right
) {
  // lastIndex = N-1 (Crossfade2->1 ... Crossfade4->3). Math clamp only for blend.
  const int last = clamp_int((int)(safe(lastIndex) + (safe(lastIndex) >= 0.0 ? 0.5 : -0.5)), 1, 3);
  const double addr = clamp(safe(crossfade), 0.0, (double)last);
  int i0 = (int)dsp_floor(addr);
  i0 = clamp_int(i0, 0, last);
  const int i1 = clamp_int(i0 + 1, 0, last);
  const double frac = clamp(addr - (double)i0, 0.0, 1.0);

  double aL = 0.0, aR = 0.0, bL = 0.0, bR = 0.0;
  pick_pair(i0, l1, r1, l2, r2, l3, r3, l4, r4, &aL, &aR);
  pick_pair(i1, l1, r1, l2, r2, l3, r3, l4, r4, &bL, &bR);
  *left = aL * (1.0 - frac) + bL * frac;
  *right = aR * (1.0 - frac) + bR * frac;
}

}  // namespace

extern "C" double soemdsp_crossfade_sample(
  double channel,
  double lastIndex,
  double crossfade,
  double l1, double r1, double l2, double r2,
  double l3, double r3, double l4, double r4
) {
  double left = 0.0, right = 0.0;
  compute(
    lastIndex, crossfade,
    l1, r1, l2, r2, l3, r3, l4, r4,
    &left, &right
  );
  const int ch = (int)(safe(channel) + 0.5);
  if (ch == 1) return left;
  if (ch == 2) return right;
  return 0.0;
}

extern "C" int soemdsp_crossfade_version() { return 1; }
extern "C" const char* soemdsp_crossfade_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_crossfade_metadata_json_size() { return sizeof(kMetadataJson) - 1; }