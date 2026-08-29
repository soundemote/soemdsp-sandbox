// soemdsp-native-module: range
// soemdsp-native-label: Range
// soemdsp-native-target: range
// soemdsp-native-kind: utility
//
// Linear map: in [inLow, inHigh] → out [outLow, outHigh].
// Out = outLow + (in - inLow) / (inHigh - inLow) * (outHigh - outLow).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxBlockFrames = 128;

struct State {
  bool active;
  double inLow;
  double inHigh;
  double outLow;
  double outHigh;
  double blockIn[kMaxBlockFrames];
  double blockOut[kMaxBlockFrames];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"range\","
    "\"label\":\"Range\","
    "\"targetType\":\"range\","
    "\"kind\":\"utility\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

static double map_one(double x, double inLow, double inHigh, double outLow, double outHigh) {
  const double den = inHigh - inLow;
  if (!(den * 0.0 == 0.0) || (den > -1.0e-30 && den < 1.0e-30)) {
    return outLow;
  }
  return outLow + (safe(x) - inLow) / den * (outHigh - outLow);
}

}  // namespace

extern "C" int soemdsp_range_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.active = true;
      s.inLow = -1.0;
      s.inHigh = 1.0;
      s.outLow = 0.0;
      s.outHigh = 1000.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_range_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_range_set_params(
  int handle,
  double inLow,
  double inHigh,
  double outLow,
  double outHigh
) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  s.inLow = safe(inLow);
  s.inHigh = safe(inHigh);
  s.outLow = safe(outLow);
  s.outHigh = safe(outHigh);
}

extern "C" double soemdsp_range_sample(
  int handle,
  double input,
  double inLow,
  double inHigh,
  double outLow,
  double outHigh
) {
  soemdsp_range_set_params(handle, inLow, inHigh, outLow, outHigh);
  if (handle < 1 || handle > kMaxInstances) {
    return map_one(input, inLow, inHigh, outLow, outHigh);
  }
  State& s = gPool[handle - 1];
  return map_one(input, s.inLow, s.inHigh, s.outLow, s.outHigh);
}

extern "C" void soemdsp_range_process_block(int handle, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int i = 0; i < n; i++) {
    s.blockOut[i] = map_one(s.blockIn[i], s.inLow, s.inHigh, s.outLow, s.outHigh);
  }
}

extern "C" int soemdsp_range_block_input_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockIn);
}

extern "C" int soemdsp_range_block_output_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOut);
}

extern "C" int soemdsp_range_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_range_version() {
  return 1;
}

extern "C" const char* soemdsp_range_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_range_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
