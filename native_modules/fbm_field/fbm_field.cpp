// soemdsp-native-module: fbm_field
// soemdsp-native-label: Fractal Brownian Field
// soemdsp-native-target: fbmField
// soemdsp-native-kind: noise

// Value-noise fBm field. Face grid and X/Y/Z probes share one domain mapping
// (What I See Is What I Hear). Motion modes only change how domainTime enters
// the field — not a second visual noise path.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxGridW = 512;
static const int kMaxGridH = 512;
static const int kMaxGridCells = kMaxGridW * kMaxGridH;

// Motion modes (integer param "motion")
// 0 Scroll — time pans XY through frozen 2D field
// 1 Volume — time walks Z of fbm3d; XY fixed → morph in place
static const int kMotionScroll = 0;
static const int kMotionVolume = 1;

struct FbmFieldState {
  bool active;
  bool resetWasHigh;
  bool hasStarted;
  double time;
  double lastX;
  double lastY;
  double lastZ;
  double lastRawX;
  double lastRawY;
  double lastRawZ;
};

static FbmFieldState gPool[kMaxInstances];
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

static double hash3d(int ix, int iy, int iz, int seed) {
  unsigned int value =
    (unsigned int)(ix * 374761393)
    ^ (unsigned int)(iy * 668265263)
    ^ (unsigned int)(iz * 1274126177)
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

static double valueNoise3d(double x, double y, double z, int seed, double smoothness) {
  const double fx0 = dsp_floor(x);
  const double fy0 = dsp_floor(y);
  const double fz0 = dsp_floor(z);
  const int x0 = (int)fx0;
  const int y0 = (int)fy0;
  const int z0 = (int)fz0;
  const double fx = x - fx0;
  const double fy = y - fy0;
  const double fz = z - fz0;
  const double u = fade(fx, smoothness);
  const double v = fade(fy, smoothness);
  const double w = fade(fz, smoothness);

  const double n000 = hash3d(x0, y0, z0, seed);
  const double n100 = hash3d(x0 + 1, y0, z0, seed);
  const double n010 = hash3d(x0, y0 + 1, z0, seed);
  const double n110 = hash3d(x0 + 1, y0 + 1, z0, seed);
  const double n001 = hash3d(x0, y0, z0 + 1, seed);
  const double n101 = hash3d(x0 + 1, y0, z0 + 1, seed);
  const double n011 = hash3d(x0, y0 + 1, z0 + 1, seed);
  const double n111 = hash3d(x0 + 1, y0 + 1, z0 + 1, seed);

  const double x00 = n000 + (n100 - n000) * u;
  const double x10 = n010 + (n110 - n010) * u;
  const double x01 = n001 + (n101 - n001) * u;
  const double x11 = n011 + (n111 - n011) * u;
  const double yz0 = x00 + (x10 - x00) * v;
  const double yz1 = x01 + (x11 - x01) * v;
  return yz0 + (yz1 - yz0) * w;
}

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

static double fbm3d(
  double x,
  double y,
  double z,
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
    const double sz = z * scale * noiseFreq;
    total += valueNoise3d(sx, sy, sz, baseSeed + i * 1013, smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

// Shared field sample for face pixel and audio probes (bipolar −1…1).
// spatialX/Y = world position; domainT = shared domain clock (Frequency).
static double fieldAt(
  double spatialX,
  double spatialY,
  double domainT,
  int motion,
  int seed,
  int octaves,
  double persistence,
  double lacunarity,
  double scale,
  double smoothness,
  double span
) {
  const int mode = clamp_int(motion, 0, 1);
  if (mode == kMotionVolume) {
    // Time walks Z; XY stay put → morph / boil in place.
    return fbm3d(
      spatialX, spatialY, domainT * span,
      seed, octaves, persistence, lacunarity, scale, smoothness
    );
  }
  // Scroll: domainT pans the frozen 2D field so probes and face match.
  const double scrollX = domainT * span;
  const double scrollY = domainT * span * 0.73;
  return fbm2d(
    spatialX + scrollX,
    spatialY + scrollY,
    seed, octaves, persistence, lacunarity, scale, smoothness
  );
}

// Contrast = expand/compress deviation from mid / zero.
// Mono face: mid = 0.5 + (bipolar*0.5)*c  (same as scaling bipolar by c then → 0…1).
// Audio:     bipolar_out = clamp(bipolar * c, -1…1)  — same expansion, stay bipolar.
static double applyContrastBipolar(double bipolar, double contrast) {
  const double c = contrast < 0.0 ? 0.0 : contrast;
  return clamp(bipolar * c, -1.0, 1.0);
}

static double bipolarToMono(double bipolar, double contrast) {
  // Equivalent: mono = 0.5 * (1 + applyContrastBipolar(bipolar, contrast))
  double mid = bipolar * 0.5 + 0.5;
  const double c = contrast < 0.0 ? 0.0 : contrast;
  if (c != 1.0) {
    mid = 0.5 + (mid - 0.5) * c;
  }
  return clamp(mid, 0.0, 1.0);
}

static int normalizeMotion(int motion) {
  return clamp_int(motion, 0, 1);
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

// Stateless field sample (bipolar −1…1). Prefer fieldAt via sample/fill for modes.
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

// Audio probes: three fixed spatial points in the same domain as the face.
// X ≈ face center, Y ≈ offset on +X, Z ≈ offset on +Y (all share domainT).
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
  double amplitude,
  double sampleRate,
  int motion,
  double contrast
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
  const double safeContrast = contrast < 0.0 ? 0.0 : contrast;
  // Amplitude: overall field gain (face mono + jacks). ≥0.
  const double safeAmp = amplitude < 0.0 ? 0.0 : amplitude;
  const double span = 1.0 / safeZoom;
  const int mode = normalizeMotion(motion);
  const double t = s.time;
  // Probe spacing in field space (fraction of view span) — same points face could sample.
  const double d = span * 0.35;
  const double cx = panX;
  const double cy = panY;

  // contrast around 0, then amplitude (same product as face mono path).
  const double rawX = applyContrastBipolar(fieldAt(
    cx, cy, t, mode, safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth, span
  ), safeContrast) * safeAmp;
  const double rawY = applyContrastBipolar(fieldAt(
    cx + d, cy, t, mode, safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth, span
  ), safeContrast) * safeAmp;
  const double rawZ = applyContrastBipolar(fieldAt(
    cx, cy + d, t, mode, safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth, span
  ), safeContrast) * safeAmp;

  s.lastRawX = safe_bounded(rawX);
  s.lastRawY = safe_bounded(rawY);
  s.lastRawZ = safe_bounded(rawZ);
  s.lastX = s.lastRawX;
  s.lastY = s.lastRawY;
  s.lastZ = s.lastRawZ;
  s.time = t + safeFreq / safeRate;
}

// Face grid: each texel = fieldAt at that pixel's spatial pos + same domainT as audio.
// contrast + amplitude match sample() so mono = 0.5 * (1 + bipolar_out).
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
  double contrast,
  int motion,
  double amplitude
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
  const double safeAmp = amplitude < 0.0 ? 0.0 : amplitude;
  const double span = 1.0 / safeZoom;
  const double ang = rotate * 6.283185307179586;
  const double cosR = soemdsp_maths::dsp_cos(ang);
  const double sinR = soemdsp_maths::dsp_sin(ang);
  const int mode = normalizeMotion(motion);
  const double t = domainTime;

  for (int j = 0; j < h; j++) {
    const double v = (j + 0.5) / (double)h;
    const double ny = 1.0 - 2.0 * v;
    for (int i = 0; i < w; i++) {
      const double u = (i + 0.5) / (double)w;
      const double nx = 2.0 * u - 1.0;
      double px = nx * span;
      double py = ny * span;
      double rx = px * cosR - py * sinR;
      double ry = px * sinR + py * cosR;
      const double spatialX = rx + panX;
      const double spatialY = ry + panY;
      const double bipolar = fieldAt(
        spatialX, spatialY, t, mode,
        safeSeed, safeOctaves, safePers, safeLac, safeScale, safeSmooth, span
      );
      // Same pipeline as jacks: contrast, then amplitude, then mono for gradient.
      const double driven = applyContrastBipolar(safe_bounded(bipolar), safeContrast) * safeAmp;
      gGridMono[j * w + i] = (float)bipolarToMono(safe_bounded(driven), 1.0);
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

extern "C" double soemdsp_fbm_field_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastZ;
}

extern "C" double soemdsp_fbm_field_x_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawX;
}

extern "C" double soemdsp_fbm_field_y_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawY;
}

extern "C" double soemdsp_fbm_field_z_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawZ;
}

extern "C" double soemdsp_fbm_field_domain_time(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].time;
}

extern "C" int soemdsp_fbm_field_version() {
  return 3;
}
