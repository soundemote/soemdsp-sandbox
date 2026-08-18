// soemdsp-native-module: vectorscope_transform
// soemdsp-native-label: Vectorscope Rotation
// soemdsp-native-target: vectorscopeTransform
// soemdsp-native-kind: dynamics
//
// Matches public/modules/vectorscopeTransform/vectorscope-transform-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"vectorscope_transform\","
    "\"label\":\"Vectorscope Rotation\","
    "\"targetType\":\"vectorscopeTransform\","
    "\"kind\":\"dynamics\""
  "}";

static const double kInvSqrt2 = 0.7071067811865476;
static const double kDegToRad = 0.017453292519943295;

static void compute(double left, double right, double rotateDeg, double* x, double* y) {
  const double L = safe(left);
  const double R = safe(right);
  double xx = (L - R) * kInvSqrt2;
  double yy = (L + R) * kInvSqrt2;
  const double deg = safe(rotateDeg);
  if (deg != 0.0) {
    double c = 0.0, s = 0.0;
    dsp_sin_cos(deg * kDegToRad, &s, &c);
    const double rx = xx * c - yy * s;
    const double ry = xx * s + yy * c;
    xx = rx;
    yy = ry;
  }
  *x = xx;
  *y = yy;
}

}  // namespace

extern "C" double soemdsp_vectorscope_transform_sample(
  double channel,
  double left,
  double right,
  double rotateDeg
) {
  double x = 0.0, y = 0.0;
  compute(left, right, rotateDeg, &x, &y);
  return (int)(safe(channel) + 0.5) == 1 ? y : x;
}

extern "C" int soemdsp_vectorscope_transform_version() { return 1; }
extern "C" const char* soemdsp_vectorscope_transform_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_vectorscope_transform_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
