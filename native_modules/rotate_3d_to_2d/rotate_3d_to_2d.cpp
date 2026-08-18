// soemdsp-native-module: rotate_3d_to_2d
// soemdsp-native-label: Rotation 3D to 2D
// soemdsp-native-target: rotate3dTo2d
// soemdsp-native-kind: dynamics
//
// Matches public/modules/rotate3dTo2d/rotate-3d-to-2d-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"rotate_3d_to_2d\","
    "\"label\":\"Rotation 3D to 2D\","
    "\"targetType\":\"rotate3dTo2d\","
    "\"kind\":\"dynamics\""
  "}";

static void compute(
  double x, double y, double z,
  double rotateXCycles, double rotateYCycles, double rotateZCycles,
  double* outX, double* outY
) {
  double px = safe(x);
  double py = safe(y);
  double pz = safe(z);
  double sinX = 0.0, cosX = 0.0, sinY = 0.0, cosY = 0.0, sinZ = 0.0, cosZ = 0.0;
  dsp_sin_cos_turns(safe(rotateXCycles), &sinX, &cosX);
  dsp_sin_cos_turns(safe(rotateYCycles), &sinY, &cosY);
  dsp_sin_cos_turns(safe(rotateZCycles), &sinZ, &cosZ);

  const double nextY = py * cosX - pz * sinX;
  const double nextZ = py * sinX + pz * cosX;
  py = nextY;
  pz = nextZ;

  const double nextX = px * cosY + pz * sinY;
  pz = -px * sinY + pz * cosY;
  px = nextX;

  *outX = px * cosZ - py * sinZ;
  *outY = px * sinZ + py * cosZ;
}

}  // namespace

extern "C" double soemdsp_rotate_3d_to_2d_sample(
  double channel,
  double x, double y, double z,
  double rotateXCycles, double rotateYCycles, double rotateZCycles
) {
  double ox = 0.0, oy = 0.0;
  compute(x, y, z, rotateXCycles, rotateYCycles, rotateZCycles, &ox, &oy);
  return (int)(safe(channel) + 0.5) == 1 ? oy : ox;
}

extern "C" int soemdsp_rotate_3d_to_2d_version() { return 1; }
extern "C" const char* soemdsp_rotate_3d_to_2d_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_rotate_3d_to_2d_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
