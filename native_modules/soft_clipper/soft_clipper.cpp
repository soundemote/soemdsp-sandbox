// soemdsp-native-module: soft_clipper
// soemdsp-native-label: Soft Clipper
// soemdsp-native-target: softClipper
// soemdsp-native-kind: dynamics
//
// Memoryless saturating soft-knee. Params (linear, no dB):
//   Drive - input push into the curve
//   Threshold - 0...1 amplitude where limiting starts (dry below)
//   Knee - 0...1 how gradual the thr->ceiling transition is
//   Amplitude - 0...1 output scale after shaping
// Shape uses soemdsp::math::soft_clip_coeffs / soft_clip_apply / tanh_approx.
// No ADAA, dither, oversample, or Gain-dB paths.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kChannels = 3; // 0 mono, 1 left, 2 right
static const int kMaxBlockFrames = 128;
static const double kKneeEps = 1.0e-4;

struct State {
  bool active;
  bool coeffsValid;
  double lastThreshold;
  double lastKnee;
  double scaleX;
  double shiftX;
  double scaleY;
  double shiftY;
  double span;
  double liveDrive;
  double liveThreshold;
  double liveKnee;
  double liveAmplitude;
  double blockIn[kChannels][kMaxBlockFrames];
  double blockOut[kChannels][kMaxBlockFrames];
};

static State gPool[kMaxInstances];

// Remap Threshold/Knee -> soft_clip_coeffs width, then rescale so ceiling stays
// at thr + (1-thr) = 1 (when thr < 1). Knee->0 is hard clip at threshold.
static void sync_knee_coeffs(State& s, double threshold, double knee) {
  if (s.coeffsValid && threshold == s.lastThreshold && knee == s.lastKnee) return;
  double thr = threshold;
  if (!(thr * 0.0 == 0.0) || thr < 0.0) thr = 0.0;
  if (thr > 1.0) thr = 1.0;
  double kn = knee;
  if (!(kn * 0.0 == 0.0) || kn < 0.0) kn = 0.0;
  if (kn > 1.0) kn = 1.0;
  const double headroom = 1.0 - thr;
  const double span = headroom > 1.0e-6 ? headroom : 1.0e-6;
  const double knSafe = kn < kKneeEps ? kKneeEps : kn;
  const double width = 2.0 * span * knSafe;
  soft_clip_coeffs(0.0, width, &s.scaleX, &s.shiftX, &s.scaleY, &s.shiftY);
  s.span = span;
  s.lastThreshold = thr;
  s.lastKnee = kn;
  s.coeffsValid = true;
}

static double shape_one(State& s, double input) {
  double drive = s.liveDrive;
  if (!(drive * 0.0 == 0.0) || drive < 0.0) drive = 0.0;
  double thr = s.liveThreshold;
  if (!(thr * 0.0 == 0.0) || thr < 0.0) thr = 0.0;
  if (thr > 1.0) thr = 1.0;
  double kn = s.liveKnee;
  if (!(kn * 0.0 == 0.0) || kn < 0.0) kn = 0.0;
  if (kn > 1.0) kn = 1.0;
  double amp = s.liveAmplitude;
  if (!(amp * 0.0 == 0.0) || amp < 0.0) amp = 0.0;
  if (amp > 1.0) amp = 1.0;

  const double x = safe(input) * drive;
  const double ax = dsp_fabs(x);
  const double sign = x < 0.0 ? -1.0 : 1.0;

  if (ax <= thr) {
    return amp * x;
  }
  if (kn <= kKneeEps) {
    return amp * sign * thr;
  }

  sync_knee_coeffs(s, thr, kn);
  const double excess = ax - thr;
  const double y = soft_clip_apply(excess, s.scaleX, s.shiftX, s.scaleY, s.shiftY);
  const double sy = s.scaleY;
  const double shaped = (sy > 1.0e-12) ? (y * (s.span / sy)) : 0.0;
  return amp * sign * (thr + shaped);
}

static double shape_stateless(double input, double drive, double threshold, double knee, double amplitude) {
  State tmp;
  tmp.coeffsValid = false;
  tmp.lastThreshold = -1.0;
  tmp.lastKnee = -1.0;
  tmp.liveDrive = drive;
  tmp.liveThreshold = threshold;
  tmp.liveKnee = knee;
  tmp.liveAmplitude = amplitude;
  return shape_one(tmp, input);
}

static const char kMetadataJson[] =
  "{"
    "\"module\":\"soft_clipper\","
    "\"label\":\"Soft Clipper\","
    "\"targetType\":\"softClipper\","
    "\"kind\":\"dynamics\","
    "\"inputs\":[\"Mono\",\"Left\",\"Right\"],"
    "\"outputs\":[\"Mono\",\"Left\",\"Right\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"drive\","
        "\"label\":\"Drive\","
        "\"defaultValue\":1,"
        "\"min\":0,\"mid\":1,\"max\":8,\"step\":\"any\","
        "\"tooltip\":\"Input push into the soft-knee curve.\""
      "},"
      "{"
        "\"key\":\"threshold\","
        "\"label\":\"Threshold\","
        "\"defaultValue\":1,"
        "\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\","
        "\"tooltip\":\"Amplitude (0...1) where limiting starts. Below this the driven signal is unchanged.\""
      "},"
      "{"
        "\"key\":\"knee\","
        "\"label\":\"Knee\","
        "\"defaultValue\":0.5,"
        "\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\","
        "\"tooltip\":\"How gradual the transition from Threshold toward full scale is. 0 = hard at Threshold.\""
      "},"
      "{"
        "\"key\":\"amplitude\","
        "\"label\":\"Amplitude\","
        "\"defaultValue\":1,"
        "\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\","
        "\"tooltip\":\"Output scale after shaping.\""
      "}"
    "]"
  "}";

}  // namespace

extern "C" double soemdsp_soft_clipper_sample(
  double input,
  double drive,
  double threshold,
  double knee,
  double amplitude
) {
  return shape_stateless(input, drive, threshold, knee, amplitude);
}

extern "C" int soemdsp_soft_clipper_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.coeffsValid = false;
      s.lastThreshold = -1.0;
      s.lastKnee = -1.0;
      s.liveDrive = 1.0;
      s.liveThreshold = 1.0;
      s.liveKnee = 0.5;
      s.liveAmplitude = 1.0;
      s.span = 1.0;
      s.scaleX = 1.0;
      s.shiftX = 0.0;
      s.scaleY = 1.0;
      s.shiftY = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_soft_clipper_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_soft_clipper_set_params(
  int handle,
  double drive,
  double threshold,
  double knee,
  double amplitude
) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  double d = drive;
  if (!(d * 0.0 == 0.0) || d < 0.0) d = 0.0;
  double thr = threshold;
  if (!(thr * 0.0 == 0.0) || thr < 0.0) thr = 0.0;
  if (thr > 1.0) thr = 1.0;
  double kn = knee;
  if (!(kn * 0.0 == 0.0) || kn < 0.0) kn = 0.0;
  if (kn > 1.0) kn = 1.0;
  double amp = amplitude;
  if (!(amp * 0.0 == 0.0) || amp < 0.0) amp = 0.0;
  if (amp > 1.0) amp = 1.0;
  s.liveDrive = d;
  s.liveThreshold = thr;
  s.liveKnee = kn;
  s.liveAmplitude = amp;
  sync_knee_coeffs(s, thr, kn);
}

extern "C" void soemdsp_soft_clipper_process_block(int handle, int channel, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  int ch = channel;
  if (ch < 0) ch = 0;
  if (ch > 2) ch = 2;
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  sync_knee_coeffs(s, s.liveThreshold, s.liveKnee);
  for (int i = 0; i < n; i += 1) {
    s.blockOut[ch][i] = shape_one(s, s.blockIn[ch][i]);
  }
}

extern "C" int soemdsp_soft_clipper_block_input_ptr(int handle, int channel) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  int ch = channel < 0 ? 0 : (channel > 2 ? 2 : channel);
  return reinterpret_cast<int>(gPool[handle - 1].blockIn[ch]);
}

extern "C" int soemdsp_soft_clipper_block_output_ptr(int handle, int channel) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  int ch = channel < 0 ? 0 : (channel > 2 ? 2 : channel);
  return reinterpret_cast<int>(gPool[handle - 1].blockOut[ch]);
}

extern "C" int soemdsp_soft_clipper_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_soft_clipper_version() { return 5; }
extern "C" const char* soemdsp_soft_clipper_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_soft_clipper_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
