// soemdsp-native-module: amp_curve
// soemdsp-native-label: Amp Curve
// soemdsp-native-target: ampCurve
// soemdsp-native-kind: dynamics
//
// Shape a control signal for Amplitude parameters (classic VCA CV law).
// Destination modules multiply linearly (out = signal × Amp); this module
// pre-maps CV so Exp mode feels like a classic OTA/2164 VCA response.
//
//   x = clamp01(In)
//   Lin: Out = x
//   Exp: Out = 0 at x≤0, else 10^(k·(x−1))  (unity at 1, ~−100 dB near 0)

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxBlockFrames = 128;
// 10^(5*(x-1)): x=1 → 1, x=0 → 1e-5 (~−100 dB). Exact 0 forced at x≤0.
static const double kExpDbSpan = 5.0;

struct State {
  bool active;
  double mode; // <0.5 Lin, else Exp
  double blockIn[kMaxBlockFrames];
  double blockOut[kMaxBlockFrames];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"amp_curve\","
    "\"label\":\"Amp Curve\","
    "\"targetType\":\"ampCurve\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"Env\"],"
    "\"outputs\":[\"Curve\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"mode\","
        "\"label\":\"Mode\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"max\":1,"
        "\"choices\":[\"Lin\",\"Exp\"]"
      "}"
    "]"
  "}";

static double clamp01(double x) {
  if (x < 0.0) return 0.0;
  if (x > 1.0) return 1.0;
  return x;
}

static double shape(double input, double mode) {
  const double x = clamp01(safe(input));
  if (safe(mode) < 0.5) {
    return x;
  }
  if (!(x > 0.0)) return 0.0;
  if (x >= 1.0) return 1.0;
  const double y = dsp_exp(kExpDbSpan * (x - 1.0) * 2.302585092994046); // 10^(k*(x-1))
  if (!(y * 0.0 == 0.0) || y < 0.0) return 0.0;
  if (y > 1.0) return 1.0;
  return y;
}

}  // namespace

extern "C" int soemdsp_amp_curve_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.active = true;
      s.mode = 1.0; // Exp
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_amp_curve_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_amp_curve_set_params(int handle, double mode) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  s.mode = safe(mode);
}

extern "C" double soemdsp_amp_curve_sample(double input, double mode) {
  return shape(input, mode);
}

extern "C" void soemdsp_amp_curve_process_block(int handle, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int i = 0; i < n; i++) {
    s.blockOut[i] = shape(s.blockIn[i], s.mode);
  }
}

extern "C" int soemdsp_amp_curve_block_input_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockIn);
}

extern "C" int soemdsp_amp_curve_block_output_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOut);
}

extern "C" int soemdsp_amp_curve_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_amp_curve_version() {
  return 3; // Env→Curve gold CV jacks (Mode only)
}

extern "C" const char* soemdsp_amp_curve_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_amp_curve_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
