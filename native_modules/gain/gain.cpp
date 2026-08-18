// soemdsp-native-module: gain
// soemdsp-native-label: Gain
// soemdsp-native-target: gain
// soemdsp-native-kind: dynamics
//
// Matches public/modules/gain/gain-math.js nodeGraphGainFrameDb.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"gain\","
    "\"label\":\"Gain\","
    "\"targetType\":\"gain\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In\",\"Left\",\"Right\"],"
    "\"outputs\":[\"Out\",\"Left\",\"Right\"]"
  "}";

static double db_to_lin(double db) {
  const double x = safe(db);
  if (x <= -140.0) return 0.0;
  return dsp_exp(x * 0.11512925464970229);
}

static double mono_sum(double left, double right, int mode) {
  if (mode == 1) {
    const double energy = (left * left + right * right) * 0.5;
    const double sign = left + right;
    const double mag = energy > 0.0 ? dsp_exp(0.5 * dsp_ln(energy)) : 0.0;
    return (sign < 0.0 ? -1.0 : 1.0) * mag;
  }
  if (mode == 2) return left + right;
  if (mode == 3) return (left + right) * 0.7071067811865476;
  if (mode == 4) return dsp_fabs(left) >= dsp_fabs(right) ? left : right;
  if (mode == 5) return left;
  if (mode == 6) return right;
  return (left + right) * 0.5;
}

static void compute(
  double mono,
  double left,
  double right,
  double masterDb,
  double leftDb,
  double rightDb,
  int monoSum,
  double offset,
  double* out,
  double* outL,
  double* outR
) {
  const double m = safe(mono);
  const double master = db_to_lin(masterDb);
  const double leftLin = master * db_to_lin(leftDb);
  const double rightLin = master * db_to_lin(rightDb);
  const double off = safe(offset);
  *outL = (safe(left) + m) * leftLin + off;
  *outR = (safe(right) + m) * rightLin + off;
  *out = mono_sum(*outL, *outR, monoSum);
}

}  // namespace

extern "C" double soemdsp_gain_sample(
  double channel,
  double mono,
  double left,
  double right,
  double masterDb,
  double leftDb,
  double rightDb,
  double monoSum,
  double offset
) {
  double out = 0.0, outL = 0.0, outR = 0.0;
  int law = (int)(safe(monoSum) + (safe(monoSum) >= 0.0 ? 0.5 : -0.5));
  compute(mono, left, right, masterDb, leftDb, rightDb, law, offset, &out, &outL, &outR);
  const int ch = (int)(safe(channel) + 0.5);
  if (ch == 1) return outL;
  if (ch == 2) return outR;
  return out;
}

extern "C" int soemdsp_gain_version() { return 1; }
extern "C" const char* soemdsp_gain_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_gain_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
