// soemdsp-native-module: amp_db
// soemdsp-native-label: Amp ↔ dB
// soemdsp-native-target: ampDb
// soemdsp-native-kind: utility
//
// Amplitude (linear voltage gain) ↔ decibels. 20·log10 law.
// 0 dB = 1. Floor matches exp_log.h (≤ −140 dB → 0; non-positive lin → −120 dB).
// Mode 0: dB→Amp. Mode 1: Amp→dB.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"amp_db\","
    "\"label\":\"Amp \\u2194 dB\","
    "\"targetType\":\"ampDb\","
    "\"kind\":\"utility\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" double soemdsp_amp_db_sample(double input, double mode) {
  const double in = safe(input);
  if (safe(mode) >= 0.5) return lin_to_db(in);
  return db_to_lin(in);
}

extern "C" int soemdsp_amp_db_version() {
  return 1;
}

extern "C" const char* soemdsp_amp_db_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_amp_db_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
