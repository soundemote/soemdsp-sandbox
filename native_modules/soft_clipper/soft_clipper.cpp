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

struct Channel {
  double u1;
  double F1;
  unsigned int n;
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
      }
      s.coeffsValid = false;
      s.lastCenter = 0.0;
      s.lastWidth = 2.0;
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
  Channel& c = s.ch[ch];

  // CONTROL: center/width. LIVE: antialias + audio.
  sync_clip_coeffs(s, center, width);

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

extern "C" int soemdsp_soft_clipper_version() { return 3; }
extern "C" const char* soemdsp_soft_clipper_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_soft_clipper_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
