// soemdsp-native-module: attenuverter
// soemdsp-native-label: Attenuverter
// soemdsp-native-target: attenuverter
// soemdsp-native-kind: dynamics
//
// Out = In * amplitude + offset. Wire options "Attenuate" / "Attenuvert"
// are the same module with different paramMeta presets.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxBlockFrames = 128;

struct State {
  bool active;
  double amplitude;
  double offset;
  double blockIn[kMaxBlockFrames];
  double blockOut[kMaxBlockFrames];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"attenuverter\","
    "\"label\":\"Attenuverter\","
    "\"targetType\":\"attenuverter\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"]"
  "}";

}  // namespace

extern "C" int soemdsp_attenuverter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.active = true;
      s.amplitude = 0.5;
      s.offset = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_attenuverter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_attenuverter_set_params(int handle, double amplitude, double offset) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  s.amplitude = safe(amplitude);
  s.offset = safe(offset);
}

extern "C" double soemdsp_attenuverter_sample(double input, double amplitude, double offset) {
  return safe(input) * safe(amplitude) + safe(offset);
}

extern "C" double soemdsp_attenuverter_sample_handle(
  int handle,
  double input,
  double amplitude,
  double offset
) {
  soemdsp_attenuverter_set_params(handle, amplitude, offset);
  if (handle < 1 || handle > kMaxInstances) {
    return soemdsp_attenuverter_sample(input, amplitude, offset);
  }
  State& s = gPool[handle - 1];
  return safe(input) * s.amplitude + s.offset;
}

extern "C" void soemdsp_attenuverter_process_block(int handle, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int i = 0; i < n; i++) {
    s.blockOut[i] = safe(s.blockIn[i]) * s.amplitude + s.offset;
  }
}

extern "C" int soemdsp_attenuverter_block_input_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockIn);
}

extern "C" int soemdsp_attenuverter_block_output_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOut);
}

extern "C" int soemdsp_attenuverter_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_attenuverter_version() {
  return 2; // process_block + instances
}

extern "C" const char* soemdsp_attenuverter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_attenuverter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
