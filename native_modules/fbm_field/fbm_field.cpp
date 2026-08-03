// soemdsp-native-module: fbm_field
// soemdsp-native-label: FBM Field
// soemdsp-native-target: fbmField
// soemdsp-native-kind: noise

// 2D value-noise fractal Brownian field. Matches public/modules/fbmField/fbm-field-math.js
// lattice hash + octave stack. X/Y probe the same field used by the WebGL face.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

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

// Matches JS nodeGraphFbmFieldHashBipolar (2D lattice murmur).
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

extern "C" int soemdsp_fbm_field_version() {
  return 1;
}
