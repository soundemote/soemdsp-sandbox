// soemdsp-native-module: raster_rgb
// soemdsp-native-label: Pixel Grid
// soemdsp-native-target: rasterRgb
// soemdsp-native-kind: processor
//
// Analog color-corrector: contrast → brightness → invert → hue.
// rgba is Rec.709 luma of the processed RGB. Mirrors
// public/modules/rasterRgb/raster-rgb-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"raster_rgb\","
    "\"label\":\"Pixel Grid\","
    "\"targetType\":\"rasterRgb\","
    "\"kind\":\"processor\","
    "\"inputs\":[\"R\",\"G\",\"B\"],"
    "\"outputs\":[\"R\",\"G\",\"B\",\"rgba\"],"
    "\"parameters\":["
      "{\"key\":\"contrast\",\"label\":\"Contrast\",\"defaultValue\":1,\"min\":-4,\"max\":4},"
      "{\"key\":\"brightness\",\"label\":\"Brightness\",\"defaultValue\":1,\"min\":-4,\"max\":4},"
      "{\"key\":\"invert\",\"label\":\"Invert\",\"defaultValue\":0,\"min\":0,\"max\":1},"
      "{\"key\":\"hue\",\"label\":\"Hue\",\"defaultValue\":0,\"min\":-1,\"max\":1}"
    "]"
  "}";

static const int kMaxInstances = 32;

struct RasterRgbState {
  bool active;
  double r;
  double g;
  double b;
  double rgba;
};

static RasterRgbState gPool[kMaxInstances];

static double clamp01(double x) {
  if (!(x > 0.0)) return 0.0;
  if (x > 1.0) return 1.0;
  return x;
}

static double wrapHue(double x) {
  double h = x - dsp_floor(x);
  if (h < 0.0) h += 1.0;
  return h;
}

static double pow01(double base, double expn) {
  if (base <= 0.0) return 0.0;
  return dsp_exp(expn * dsp_ln(base));
}

static double contrast01(double x, double contrast) {
  const double t = clamp01(x);
  if (!(contrast > 0.0) && !(contrast < 0.0)) return 0.5;
  const double mag = contrast < 0.0 ? -contrast : contrast;
  double y = t;
  if (!(mag > 0.9999 && mag < 1.0001)) {
    if (t < 0.5) y = 0.5 * pow01(2.0 * t, mag);
    else y = 1.0 - 0.5 * pow01(2.0 * (1.0 - t), mag);
  }
  return contrast < 0.0 ? 1.0 - y : y;
}

static double applyBrightness01(double x, double brightness) {
  if (!(brightness > 0.0) && !(brightness < 0.0)) return 0.0;
  const double mag = brightness < 0.0 ? -brightness : brightness;
  double y = clamp01(x) * mag;
  if (y > 1.0) y = 1.0;
  return brightness < 0.0 ? 1.0 - y : y;
}

static void hueRotate(double& r, double& g, double& b, double hueCycles) {
  if (!(dsp_fabs(hueCycles) > 1.0e-9)) return;
  const double mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const double mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const double l = (mx + mn) * 0.5;
  const double d = mx - mn;
  double h = 0.0;
  double s = 0.0;
  if (d > 1.0e-9) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == r) h = ((g - b) / d + (g < b ? 6.0 : 0.0)) / 6.0;
    else if (mx == g) h = ((b - r) / d + 2.0) / 6.0;
    else h = ((r - g) / d + 4.0) / 6.0;
  }
  h = wrapHue(h + hueCycles);
  if (!(s > 0.0)) {
    r = g = b = l;
    return;
  }
  const double q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  const double p = 2.0 * l - q;
  auto channel = [&](double offset) {
    double t = h + offset;
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
  };
  r = clamp01(channel(1.0 / 3.0));
  g = clamp01(channel(0.0));
  b = clamp01(channel(-1.0 / 3.0));
}

}  // namespace

extern "C" int soemdsp_raster_rgb_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      gPool[i] = RasterRgbState{true, 0.0, 0.0, 0.0, 0.0};
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_raster_rgb_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_raster_rgb_sample(
  int handle,
  double r,
  double g,
  double b,
  double invert,
  double contrast,
  double brightness,
  double hue
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) {
    return 0.0;
  }
  double R = clamp01(r);
  double G = clamp01(g);
  double B = clamp01(b);
  const double inv = clamp01(invert);
  R = applyBrightness01(contrast01(R, contrast), brightness);
  G = applyBrightness01(contrast01(G, contrast), brightness);
  B = applyBrightness01(contrast01(B, contrast), brightness);
  if (inv > 0.0) {
    R += inv * (1.0 - 2.0 * R);
    G += inv * (1.0 - 2.0 * G);
    B += inv * (1.0 - 2.0 * B);
  }
  R = clamp01(R);
  G = clamp01(G);
  B = clamp01(B);
  hueRotate(R, G, B, hue);
  RasterRgbState& st = gPool[handle - 1];
  st.r = R;
  st.g = G;
  st.b = B;
  st.rgba = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return st.rgba;
}

extern "C" double soemdsp_raster_rgb_r(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].r;
}

extern "C" double soemdsp_raster_rgb_g(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].g;
}

extern "C" double soemdsp_raster_rgb_b(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].b;
}

extern "C" double soemdsp_raster_rgb_rgba(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].rgba;
}

extern "C" int soemdsp_raster_rgb_version() {
  return 2;
}

extern "C" const char* soemdsp_raster_rgb_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_raster_rgb_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
