// soemdsp-native-module: mix
// soemdsp-native-label: Mix
// soemdsp-native-target: mix
// soemdsp-native-kind: dynamics
//
// Matches public/modules/gainBiasMix/gain-bias-mix-worklet-evaluator.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"mix\","
    "\"label\":\"Mix\","
    "\"targetType\":\"mix\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In1\",\"In2\",\"In3\",\"In4\"],"
    "\"outputs\":[\"Out1\",\"Out2\",\"Out3\",\"Out4\"]"
  "}";

static double clip10(double x) {
  return clamp(safe(x), -10.0, 10.0);
}

}  // namespace

extern "C" double soemdsp_mix_sample(
  double channel,
  double in1, double in2, double in3, double in4,
  double volume1, double volume2, double volume3, double volume4,
  double bias1, double bias2, double bias3, double bias4,
  double bleed2to1, double bleed3to1, double bleed4to1
) {
  const double o1 = clip10(
    safe(in1) * safe(volume1) + safe(bias1)
    + safe(in2) * safe(bleed2to1)
    + safe(in3) * safe(bleed3to1)
    + safe(in4) * safe(bleed4to1)
  );
  const int ch = (int)(safe(channel) + 0.5);
  if (ch == 2) return clip10(safe(in2) * safe(volume2) + safe(bias2));
  if (ch == 3) return clip10(safe(in3) * safe(volume3) + safe(bias3));
  if (ch == 4) return clip10(safe(in4) * safe(volume4) + safe(bias4));
  return o1;
}

extern "C" int soemdsp_mix_version() { return 1; }
extern "C" const char* soemdsp_mix_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_mix_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
