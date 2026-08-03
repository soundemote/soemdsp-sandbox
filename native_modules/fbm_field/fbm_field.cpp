// soemdsp-native-module: fbm_field
// soemdsp-native-label: FBM Field
// soemdsp-native-target: fbmField
// soemdsp-native-kind: noise

// 2D value-noise fBm. Audio X/Y probes and face grid both call the same fbm2d().
// Face does not re-implement noise in JS/GLSL — it uploads this grid only.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
// Face grid: dense enough for bilinear upscale to look smooth, cheap enough for rAF.
static const int kMaxGridW = 256;
static const int kMaxGridH = 256;
static const int kMaxGridCells = kMaxGridW * kMaxGridH;

struct FbmFieldState {
  bool active;
  bool resetWasHigh;
  bool hasStarted;
  double time;
  double lastX;
  double lastY;
  double lastRawX;
  double lastRawY;
};

static FbmFieldState gPool[kMaxInstances];
// Last fill_grid mono 0…1 (row-major). Shared readback for main-thread face.
static float gGridMono[kMaxGridCells];
static int gGridW = 0;
static int gGridH = 0;

static double hash2d(int ix, int iy, int seed) {
  unsigned int value =
    (unsigned int)(ix * 374761393)
    ^ (unsigned int)(iy * 668265263)
    ^ (unsigned int)seed;
  value ^= value >> 16;
  value *= 2246822507u;
  value ^= value >> 13;
  value *= 3266489909u;
  value ^= value >> 16;
  return ((double)value / 4294967295.0) * 2.0 - 1.0;
}

static double fade(double t, double smoothness) {
  const double x = clamp(t, 0.0, 1.0);
  const double s = clamp(smoothness, 0.0, 1.0);
  if (s <= 0.0) return x;
  const double hermite = x * x * (3.0 - 2.0 * x);
  if (s <= 0.5) {
    const double u = s * 2.0;
    return x + (hermite - x) * u;
  }
  const double quintic = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  const double u = (s - 0.5) * 2.0;
  return hermite + (quintic - hermite) * u;
}

static double valueNoise2d(double x, double y, int seed, double smoothness) {
  const double fx0 = dsp_floor(x);
  const double fy0 = dsp_floor(y);
  const int x0 = (int)fx0;
  const int y0 = (int)fy0;
  const double fx = x - fx0;
  const double fy = y - fy0;
  const double u = fade(fx, smoothness);
  const double v = fade(fy, smoothness);
  const double a = hash2d(x0, y0, seed);
  const double b = hash2d(x0 + 1, y0, seed);
  const double c = hash2d(x0, y0 + 1, seed);
  const double d = hash2d(x0 + 1, y0 + 1, seed);
  const double x1 = a + (b - a) * u;
  const double x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}

// Single source of field values for audio probes and face texels.
static double fbm2d(
  double x,
  double y,
  int seed,
  int octaves,
  double persistence,
  double lacunarity,
  double scale,
  double smoothness
) {
  double total = 0.0;
  double amplitude = 1.0;
  double noiseFreq = 1.0;
  double maxValue = 0.0;
  const int baseSeed = seed * 1009 + 17;
  for (int i = 0; i < octaves; i++) {
    const double sx = x * scale * noiseFreq;
    const double sy = y * scale * noiseFreq;
    total += valueNoise2d(sx, sy, baseSeed + i * 1013, smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

static double bipolarToMono(double bipolar, double contrast) {
  double mid = bipolar * 0.5 + 0.5;
  const double c = contrast < 0.0 ? 0.0 : contrast;
  if (c != 1.0) {
    mid = 0.5 + (mid - 0.5) * c;
  }
  return clamp(mid, 0.0, 1.0);
}

}  // namespace

extern "C" int soemdsp_fbm_field_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FbmFieldState& s = gPool[i];
      s = FbmFieldState{};
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_fbm_field_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_fbm_field_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].time = 0.0;
  gPool[handle - 1].hasStarted = false;
}

// Stateless field sample (bipolar −1…1). Same kernel as audio + face.
extern "C" double soemdsp_fbm_field_eval_at(
  double worldX,
  double worldY,
  int seedInt,
  int octaves,
  double persistence,
  double lacunarity,
  double scale,
  double smoothness
) {
  const int safeSeed = clamp_int(seedInt, 0, 99999);
  const int safeOctaves = clamp_int(octaves, 1, 8);
  const double safePers = clamp(persistence, 0.0, 0.99);
  const double safeLac = clamp(lacunarity, 1.0, 4.0);
  const double safeScale = scale < 0.000001 ? 0.000001 : scale;
  const double safeSmooth = clamp(smoothness, 0.0, 1.0);
  return safe_bounded(fbm2d(
    worldX, worldY, safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth
  ));
}

// Audio probe: X/Y sample the same fbm2d at domain path positions.
extern "C" void soemdsp_fbm_field_sample(
  int handle,
  double reset,
  double frequency,
  int seedInt,
  int octaves,
  double persistence,
  double lacunarity,
  double scale,
  double smoothness,
  double zoom,
  double panX,
  double panY,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  FbmFieldState& s = gPool[handle - 1];

  const bool resetHigh = reset > 0.5;
  if (resetHigh && !s.resetWasHigh) {
    s.time = 0.0;
  }
  s.resetWasHigh = resetHigh;
  s.hasStarted = true;

  const int safeSeed = clamp_int(seedInt, 0, 99999);
  const int safeOctaves = clamp_int(octaves, 1, 8);
  const double safePers = clamp(persistence, 0.0, 0.99);
  const double safeLac = clamp(lacunarity, 1.0, 4.0);
  const double safeScale = scale < 0.000001 ? 0.000001 : scale;
  const double safeSmooth = clamp(smoothness, 0.0, 1.0);
  const double safeZoom = zoom < 0.05 ? 0.05 : zoom;
  const double safeFreq = frequency < 0.0 ? 0.0 : frequency;
  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double pathScale = 1.0 / safeZoom;
  const double t = s.time;

  const double rawX = fbm2d(
    t * pathScale + panX,
    panY,
    safeSeed,
    safeOctaves,
    safePers,
    safeLac,
    safeScale,
    safeSmooth
  );
  const double rawY = fbm2d(
    panX,
    t * pathScale + panY,
    safeSeed,
    safeOctaves,
    safePers,
    safeLac,
    safeScale,
    safeSmooth
  );

  s.lastRawX = safe_bounded(rawX);
  s.lastRawY = safe_bounded(rawY);
  s.lastX = safe_bounded(s.lastRawX * level);
  s.lastY = safe_bounded(s.lastRawY * level);
  s.time = t + safeFreq / safeRate;
}

// Face grid: each texel = same fbm2d as audio, world map matches probe zoom/pan/time.
// Writes mono 0…1 (contrast applied) into gGridMono. Returns cell count or 0.
extern "C" int soemdsp_fbm_field_fill_grid(
  int width,
  int height,
  double domainTime,
  double zoom,
  double panX,
  double panY,
  double rotate,
  int seedInt,
  int octaves,
  double persistence,
  double lacunarity,
  double scale,
  double smoothness,
  double contrast
) {
  int w = width < 1 ? 1 : (width > kMaxGridW ? kMaxGridW : width);
  int h = height < 1 ? 1 : (height > kMaxGridH ? kMaxGridH : height);
  const int safeSeed = clamp_int(seedInt, 0, 99999);
  const int safeOctaves = clamp_int(octaves, 1, 8);
  const double safePers = clamp(persistence, 0.0, 0.99);
  const double safeLac = clamp(lacunarity, 1.0, 4.0);
  const double safeScale = scale < 0.000001 ? 0.000001 : scale;
  const double safeSmooth = clamp(smoothness, 0.0, 1.0);
  const double safeZoom = zoom < 0.05 ? 0.05 : zoom;
  const double safeContrast = contrast < 0.0 ? 0.0 : contrast;
  const double span = 1.0 / safeZoom;
  const double ang = rotate * 6.283185307179586;
  const double cosR = soemdsp_maths::dsp_cos(ang);
  const double sinR = soemdsp_maths::dsp_sin(ang);

  const double t = domainTime;
  const double scrollX = t * span;
  const double scrollY = t * span * 0.73;

  for (int j = 0; j < h; j++) {
    // v: 0 top → 1 bottom (matches GL face with y flip in UV)
    const double v = (j + 0.5) / (double)h;
    const double ny = 1.0 - 2.0 * v; // +Y up in field space
    for (int i = 0; i < w; i++) {
      const double u = (i + 0.5) / (double)w;
      const double nx = 2.0 * u - 1.0;
      // aspect-ish: square field domain
      double px = nx * span;
      double py = ny * span;
      double rx = px * cosR - py * sinR;
      double ry = px * sinR + py * cosR;
      const double wx = rx + panX + scrollX;
      const double wy = ry + panY + scrollY;
      const double bipolar = fbm2d(
        wx, wy, safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth
      );
      gGridMono[j * w + i] = (float)bipolarToMono(safe_bounded(bipolar), safeContrast);
    }
  }
  gGridW = w;
  gGridH = h;
  return w * h;
}

extern "C" int soemdsp_fbm_field_grid_ptr() {
  return (int)(long long)(void*)gGridMono;
}

extern "C" int soemdsp_fbm_field_grid_width() {
  return gGridW;
}

extern "C" int soemdsp_fbm_field_grid_height() {
  return gGridH;
}

extern "C" int soemdsp_fbm_field_grid_max_width() {
  return kMaxGridW;
}

extern "C" int soemdsp_fbm_field_grid_max_height() {
  return kMaxGridH;
}

extern "C" double soemdsp_fbm_field_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastX;
}

extern "C" double soemdsp_fbm_field_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastY;
}

extern "C" double soemdsp_fbm_field_x_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawX;
}

extern "C" double soemdsp_fbm_field_y_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawY;
}

extern "C" double soemdsp_fbm_field_domain_time(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].time;
}

extern "C" int soemdsp_fbm_field_version() {
  return 2;
}
