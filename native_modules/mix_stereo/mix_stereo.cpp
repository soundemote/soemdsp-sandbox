// soemdsp-native-module: mix_stereo
// soemdsp-native-label: MixStereo
// soemdsp-native-target: mixStereo
// soemdsp-native-kind: dynamics
//
// Matches public/modules/mixStereo/mix-stereo-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"mix_stereo\","
    "\"label\":\"MixStereo\","
    "\"targetType\":\"mixStereo\","
    "\"kind\":\"dynamics\""
  "}";

static void pan_gains(double pan, double* left, double* right) {
  const double p = clamp(safe(pan), -1.0, 1.0);
  if (p <= 0.0) {
    *left = 1.0;
    *right = dsp_cos(-p * kHalfPi);
    return;
  }
  *left = dsp_cos(p * kHalfPi);
  *right = 1.0;
}

static void compute(
  double l1, double r1, double l2, double r2, double l3, double r3, double l4, double r4,
  double mono,
  double vol1, double pan1, double vol2, double pan2, double vol3, double pan3, double vol4, double pan4,
  double amplitude,
  double* left, double* right
) {
  const double master = db_to_lin(amplitude);
  double L = 0.0;
  double R = 0.0;
  const double vols[4] = { vol1, vol2, vol3, vol4 };
  const double pans[4] = { pan1, pan2, pan3, pan4 };
  const double ls[4] = { l1, l2, l3, l4 };
  const double rs[4] = { r1, r2, r3, r4 };
  for (int i = 0; i < 4; i += 1) {
    const double vol = db_to_lin(vols[i]) * master;
    double pl = 1.0, pr = 1.0;
    pan_gains(pans[i], &pl, &pr);
    L += safe(ls[i]) * vol * pl;
    R += safe(rs[i]) * vol * pr;
  }
  const double monoIn = safe(mono) * master;
  L += monoIn;
  R += monoIn;
  *left = L;
  *right = R;
}

}  // namespace

extern "C" double soemdsp_mix_stereo_sample(
  double channel,
  double l1, double r1, double l2, double r2, double l3, double r3, double l4, double r4,
  double mono,
  double vol1, double pan1, double vol2, double pan2, double vol3, double pan3, double vol4, double pan4,
  double amplitude
) {
  double left = 0.0, right = 0.0;
  compute(
    l1, r1, l2, r2, l3, r3, l4, r4, mono,
    vol1, pan1, vol2, pan2, vol3, pan3, vol4, pan4, amplitude,
    &left, &right
  );
  const int ch = (int)(safe(channel) + 0.5);
  if (ch == 1) return left;
  if (ch == 2) return right;
  return (left + right) * 0.5;
}

extern "C" int soemdsp_mix_stereo_version() { return 1; }
extern "C" const char* soemdsp_mix_stereo_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_mix_stereo_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
