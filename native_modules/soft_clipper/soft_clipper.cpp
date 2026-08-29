// soemdsp-native-module: soft_clipper
// soemdsp-native-label: Soft Clipper
// soemdsp-native-target: softClipper
// soemdsp-native-kind: dynamics
//
// Memoryless tanh-shaped clip + optional first-order ADAA (antialias 0..1)
// and Softwave-style bipolar dither. Matches public/modules/softClipper/soft-clipper-math.js.
// 0 = tanh only (no history). 1 = ADAA only. (0,1) = both, then mix.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kChannels = 3; // 0 mono, 1 left, 2 right
static const int kMaxBlockFrames = 128;

struct Channel {
  double u1;
  double F1;
  unsigned int n;
  double x1;
  bool hasX;
};

struct State {
  bool active;
  Channel ch[kChannels];
  // CONTROL: center/width → cached coeffs (Live: antialias, audio in)
  bool coeffsValid;
  double lastCenter;
  double lastWidth;
  double scaleX;
  double shiftX;
  double scaleY;
  double shiftY;
  double liveCenter;
  double liveWidth;
  double liveAntialias;
  int liveOsMode; // 0 = shaped only, 1 = ADAA, 2 = 2× ADAA average
  double blockIn[kChannels][kMaxBlockFrames];
  double blockOut[kChannels][kMaxBlockFrames];
};

static State gPool[kMaxInstances];

static double tanh_approx(double value);
static void coeffs(double center, double width, double* scaleX, double* shiftX, double* scaleY, double* shiftY);

static void sync_clip_coeffs(State& s, double center, double width) {
  if (s.coeffsValid && center == s.lastCenter && width == s.lastWidth) return;
  coeffs(center, width, &s.scaleX, &s.shiftX, &s.scaleY, &s.shiftY);
  s.lastCenter = center;
  s.lastWidth = width;
  s.coeffsValid = true;
}

static double shaped_cached(const State& s, double input) {
  return s.shiftY + s.scaleY * tanh_approx(s.scaleX * input + s.shiftX);
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
        "\"key\":\"center\","
        "\"label\":\"Center\","
        "\"defaultValue\":0,"
        "\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\","
        "\"tooltip\":\"Moves the soft clipping curve left or right before shaping.\""
      "},"
      "{"
        "\"key\":\"width\","
        "\"label\":\"Width\","
        "\"defaultValue\":2,"
        "\"min\":0.0001,\"mid\":2,\"max\":8,\"step\":\"any\","
        "\"skew\":\"mid skew\","
        "\"tooltip\":\"Sets the width of the smooth tanh transition before the signal saturates.\""
      "},"
      "{"
        "\"key\":\"antialias\","
        "\"label\":\"Antialias\","
        "\"defaultValue\":1,"
        "\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\","
        "\"tooltip\":\"First-order ADAA plus a tiny Softwave-style dither. 0 = original clip. 1 = full AA.\""
      "}"
    "]"
  "}";

static double tanh_approx(double value) {
  const double x = value;
  const double x2 = x * x;
  const double denominator = 27.0 + 9.0 * x2;
  return (denominator <= 0.0) ? 0.0 : (x * (27.0 + x2)) / denominator;
}

// ∫ tanh_approx = x²/18 + (4/3) ln(x²+3)
static double tanh_antideriv(double value) {
  const double x = value;
  return (x * x) / 18.0 + (4.0 / 3.0) * dsp_ln(x * x + 3.0);
}

static double shaped(double input, double center, double width) {
  const double safeWidth = dsp_fabs(width) > 1.0e-6 ? dsp_fabs(width) : 2.0;
  const double scaleX = 2.0 / safeWidth;
  const double shiftX = -1.0 - (scaleX * (center - 0.5 * safeWidth));
  const double scaleY = 1.0 / scaleX;
  const double shiftY = -shiftX * scaleY;
  return shiftY + scaleY * tanh_approx(scaleX * input + shiftX);
}

static void coeffs(double center, double width, double* scaleX, double* shiftX, double* scaleY, double* shiftY) {
  const double safeWidth = dsp_fabs(width) > 1.0e-6 ? dsp_fabs(width) : 2.0;
  *scaleX = 2.0 / safeWidth;
  *shiftX = -1.0 - ((*scaleX) * (center - 0.5 * safeWidth));
  *scaleY = 1.0 / (*scaleX);
  *shiftY = -(*shiftX) * (*scaleY);
}

}  // namespace

extern "C" double soemdsp_soft_clipper_sample(
  double input,
  double center,
  double width
) {
  return shaped(input, center, width);
}

extern "C" int soemdsp_soft_clipper_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      for (int c = 0; c < kChannels; c++) {
        s.ch[c].u1 = 0.0;
        s.ch[c].F1 = tanh_antideriv(0.0);
        s.ch[c].n = 0;
        s.ch[c].x1 = 0.0;
        s.ch[c].hasX = false;
      }
      s.coeffsValid = false;
      s.lastCenter = 0.0;
      s.lastWidth = 2.0;
      s.liveCenter = 0.0;
      s.liveWidth = 2.0;
      s.liveAntialias = 1.0;
      s.liveOsMode = 2;
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

static double process_aa_one(State& s, Channel& c, double input, double antialias) {
  double aa = antialias;
  if (!(aa * 0.0 == 0.0) || aa < 0.0) aa = 0.0;
  if (aa > 1.0) aa = 1.0;

  if (aa <= 0.0) {
    return shaped_cached(s, input);
  }

  c.n += 1;
  const double x = input + aa * 0.0005 * hash_bipolar(c.n, 0x51edu);
  const double u = s.scaleX * x + s.shiftX;
  const double Fu = tanh_antideriv(u);
  const double du = u - c.u1;
  double adaaF;
  if (du > -1.0e-5 && du < 1.0e-5) {
    adaaF = tanh_approx((u + c.u1) * 0.5);
  } else {
    adaaF = (Fu - c.F1) / du;
  }
  c.u1 = u;
  c.F1 = Fu;
  const double adaaY = s.shiftY + s.scaleY * adaaF;
  if (aa >= 1.0) {
    return adaaY;
  }
  const double y = s.shiftY + s.scaleY * tanh_approx(u);
  return y + aa * (adaaY - y);
}

extern "C" double soemdsp_soft_clipper_sample_aa(
  int handle,
  int channel,
  double input,
  double center,
  double width,
  double antialias
) {
  if (handle < 1 || handle > kMaxInstances) return shaped(input, center, width);
  State& s = gPool[handle - 1];
  if (!s.active) return shaped(input, center, width);
  int ch = channel;
  if (ch < 0) ch = 0;
  if (ch > 2) ch = 2;
  sync_clip_coeffs(s, center, width);
  return process_aa_one(s, s.ch[ch], input, antialias);
}

extern "C" void soemdsp_soft_clipper_set_params(
  int handle,
  double center,
  double width,
  double antialias,
  int oversampleMode
) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  sync_clip_coeffs(s, center, width);
  s.liveCenter = center;
  s.liveWidth = width;
  double aa = antialias;
  if (!(aa * 0.0 == 0.0) || aa < 0.0) aa = 0.0;
  if (aa > 1.0) aa = 1.0;
  s.liveAntialias = aa;
  int os = oversampleMode;
  if (os < 0) os = 0;
  if (os > 2) os = 2;
  s.liveOsMode = os;
}

extern "C" void soemdsp_soft_clipper_process_block(int handle, int channel, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  int ch = channel;
  if (ch < 0) ch = 0;
  if (ch > 2) ch = 2;
  Channel& c = s.ch[ch];
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  sync_clip_coeffs(s, s.liveCenter, s.liveWidth);
  const int os = s.liveOsMode;
  const double aa = s.liveAntialias;
  for (int i = 0; i < n; i += 1) {
    const double x = s.blockIn[ch][i];
    double y;
    if (os <= 0) {
      y = shaped_cached(s, x);
      c.x1 = x;
      c.hasX = true;
    } else if (os == 1) {
      y = process_aa_one(s, c, x, aa);
      c.x1 = x;
      c.hasX = true;
    } else {
      const double mid = c.hasX ? (c.x1 + x) * 0.5 : x;
      const double y0 = process_aa_one(s, c, mid, aa);
      const double y1 = process_aa_one(s, c, x, aa);
      c.x1 = x;
      c.hasX = true;
      y = (y0 + y1) * 0.5;
    }
    s.blockOut[ch][i] = y;
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

extern "C" int soemdsp_soft_clipper_version() { return 4; }
extern "C" const char* soemdsp_soft_clipper_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_soft_clipper_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
