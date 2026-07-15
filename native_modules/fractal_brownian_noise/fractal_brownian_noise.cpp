// soemdsp-native-module: fractal_brownian_noise
// soemdsp-native-label: Fractal Brownian Noise
// soemdsp-native-target: fractalBrownianNoise
// soemdsp-native-kind: noise

#include <wasm_simd128.h>

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
// Generous upper bound on a single block-processing call. Real AudioWorklet
// render quanta are 128 frames; this leaves headroom for any offline/preview
// caller that might batch more samples per call.
static const int kMaxBlockFrames = 2048;

struct FbmState {
  double time;
  int currentSeed;
  bool active;
  double lastX;
  double lastY;
  double lastZ;
  double lastRawX;
  double lastRawY;
  double lastRawZ;
  // Fixed-size output buffers for soemdsp_fbm_process_block -- no heap in a
  // nostdlib build, so this follows the same pattern as Sabrina Reverb's
  // static delay-line buffers. Exposed to the caller as raw linear-memory
  // pointers (see soemdsp_fbm_block_output_*_ptr) for zero-copy reads.
  double blockOutX[kMaxBlockFrames];
  double blockOutY[kMaxBlockFrames];
  double blockOutZ[kMaxBlockFrames];
  double blockOutXRaw[kMaxBlockFrames];
  double blockOutYRaw[kMaxBlockFrames];
  double blockOutZRaw[kMaxBlockFrames];
};

static FbmState gPool[kMaxInstances];

static unsigned int seedHash(int seed, int axis) {
  unsigned int h = (unsigned int)(seed * 2654435761u) ^ (unsigned int)(axis * 0x9e3779b9u);
  h ^= h >> 16;
  h = h * 0x45d9f3bu;
  h ^= h >> 16;
  return h ? h : 1u;
}

static double smoothNoise1d(double x, unsigned int seed) {
  int left = (int)x;
  if (x < 0.0 && x != (double)left) left -= 1;
  const double frac = x - (double)left;
  const double smooth = frac * frac * (3.0 - 2.0 * frac);
  const double a = hash_bipolar(left, seed);
  const double b = hash_bipolar(left + 1, seed);
  return a + (b - a) * smooth;
}

static double fbmAxis(double time, int octaves, double persistence, double scale, unsigned int baseSeed) {
  double total = 0.0;
  double amplitude = 1.0;
  double freq = 1.0;
  double maxValue = 0.0;
  for (int i = 0; i < octaves; i++) {
    total += smoothNoise1d(time * scale * freq, baseSeed + (unsigned int)(i * 1013)) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    freq *= 2.0;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

// SIMD kernel: runs hashBipolar's integer chain for up to 4 lanes at once.
// Bit-exact vs the scalar version -- every op here (xor, wrapping i32 mul,
// logical shift) is exact 32-bit modular arithmetic, not floating point, so
// there is no reordering-induced deviation the way there is in the Sabrina
// kernels. Only 3 of the 4 lanes are ever real (X/Y/Z); the 4th is unused
// padding, never read back.
static v128_t hashBipolarBitsBatch(v128_t indexXorSeed) {
  v128_t value = indexXorSeed;
  value = wasm_v128_xor(value, wasm_u32x4_shr(value, 16));
  value = wasm_i32x4_mul(value, wasm_i32x4_splat(static_cast<int>(2246822507u)));
  value = wasm_v128_xor(value, wasm_u32x4_shr(value, 13));
  value = wasm_i32x4_mul(value, wasm_i32x4_splat(static_cast<int>(3266489909u)));
  value = wasm_v128_xor(value, wasm_u32x4_shr(value, 16));
  return value;
}

static void unpackBipolar3(v128_t bits, double out[3]) {
  unsigned int lanes[4];
  wasm_v128_store(lanes, bits);
  for (int lane = 0; lane < 3; lane += 1) {
    out[lane] = static_cast<double>(lanes[lane]) / 4294967295.0 * 2.0 - 1.0;
  }
}

// Computes all three FBM axes together instead of calling fbmAxis three
// times. The key structural fact this exploits: time*scale*freq is IDENTICAL
// for X/Y/Z at a given octave (only the seed differs), so `left`/`frac`/
// `smooth` -- the noise-position math -- only needs computing ONCE per
// octave instead of three times. What's left to vary per axis is just the
// hash lookups, which batch into hashBipolarBitsBatch across X/Y/Z lanes.
// This is a real algorithmic reduction (2/3 less position math) plus a
// genuine SIMD win on ALU-bound integer hashing, unlike the earlier
// Sabrina Reverb attempt where the vectorized portion was too thin to
// outrun its own pack/unpack overhead.
static void fbmAxesSimd(
  double time,
  int octaves,
  double persistence,
  double scale,
  unsigned int baseX,
  unsigned int baseY,
  unsigned int baseZ,
  double& outX,
  double& outY,
  double& outZ
) {
  double totalX = 0.0;
  double totalY = 0.0;
  double totalZ = 0.0;
  double amplitude = 1.0;
  double freq = 1.0;
  double maxValue = 0.0;
  for (int i = 0; i < octaves; i += 1) {
    const double x = time * scale * freq;
    int left = static_cast<int>(x);
    if (x < 0.0 && x != static_cast<double>(left)) {
      left -= 1;
    }
    const double frac = x - static_cast<double>(left);
    const double smooth = frac * frac * (3.0 - 2.0 * frac);
    const int leftPlus1 = left + 1;
    const unsigned int seedOffset = static_cast<unsigned int>(i * 1013);
    const v128_t seeds = wasm_i32x4_make(
      static_cast<int>(baseX + seedOffset),
      static_cast<int>(baseY + seedOffset),
      static_cast<int>(baseZ + seedOffset),
      0
    );

    const v128_t aBits = hashBipolarBitsBatch(wasm_v128_xor(wasm_i32x4_splat(left), seeds));
    const v128_t bBits = hashBipolarBitsBatch(wasm_v128_xor(wasm_i32x4_splat(leftPlus1), seeds));
    double aVals[3];
    double bVals[3];
    unpackBipolar3(aBits, aVals);
    unpackBipolar3(bBits, bVals);

    totalX += (aVals[0] + (bVals[0] - aVals[0]) * smooth) * amplitude;
    totalY += (aVals[1] + (bVals[1] - aVals[1]) * smooth) * amplitude;
    totalZ += (aVals[2] + (bVals[2] - aVals[2]) * smooth) * amplitude;

    maxValue += amplitude;
    amplitude *= persistence;
    freq *= 2.0;
  }
  outX = maxValue > 0.0 ? totalX / maxValue : 0.0;
  outY = maxValue > 0.0 ? totalY / maxValue : 0.0;
  outZ = maxValue > 0.0 ? totalZ / maxValue : 0.0;
}

// --- Block-processing proof: same module, explicit boundary ---
//
// soemdsp_fbm_sample above is the original shape: `sample = fbm(time, params)`,
// called once per audio sample, re-resolving/re-clamping params every call.
// The functions below are a second entry point demonstrating a block-oriented
// boundary instead: params resolved ONCE per call, a whole block of frames
// processed in a loop, results written to an explicit output buffer -- and
// scalar vs. SIMD implementations live behind that one boundary
// (soemdsp_fbm_process_block), exactly mirroring each other's parameters
// and state updates so a caller cannot tell which ran except by timing it.
//
// Both call the *same* per-frame math already proven correct and fast in
// fbmAxis (scalar) / fbmAxesSimd (SIMD) above -- this is purely about the
// calling boundary (resolve-once, loop, write-buffer), not a new kernel.

static void fbmProcessBlockScalar(
  FbmState& s,
  int octaves,
  double persistence,
  double scale,
  double freqParam,
  double level,
  double sampleRate,
  unsigned int baseX,
  unsigned int baseY,
  unsigned int baseZ,
  int frameCount
) {
  double time = s.time;
  for (int frame = 0; frame < frameCount; frame += 1) {
    const double rawX = fbmAxis(time, octaves, persistence, scale, baseX);
    const double rawY = fbmAxis(time, octaves, persistence, scale, baseY);
    const double rawZ = fbmAxis(time, octaves, persistence, scale, baseZ);
    s.blockOutX[frame] = rawX * level;
    s.blockOutY[frame] = rawY * level;
    s.blockOutZ[frame] = rawZ * level;
    s.blockOutXRaw[frame] = rawX;
    s.blockOutYRaw[frame] = rawY;
    s.blockOutZRaw[frame] = rawZ;
    if (frame == frameCount - 1) {
      s.lastRawX = rawX;
      s.lastRawY = rawY;
      s.lastRawZ = rawZ;
    }
    time += freqParam / sampleRate;
  }
  s.time = time;
}

static void fbmProcessBlockSimd(
  FbmState& s,
  int octaves,
  double persistence,
  double scale,
  double freqParam,
  double level,
  double sampleRate,
  unsigned int baseX,
  unsigned int baseY,
  unsigned int baseZ,
  int frameCount
) {
  double time = s.time;
  for (int frame = 0; frame < frameCount; frame += 1) {
    double rawX, rawY, rawZ;
    fbmAxesSimd(time, octaves, persistence, scale, baseX, baseY, baseZ, rawX, rawY, rawZ);
    s.blockOutX[frame] = rawX * level;
    s.blockOutY[frame] = rawY * level;
    s.blockOutZ[frame] = rawZ * level;
    s.blockOutXRaw[frame] = rawX;
    s.blockOutYRaw[frame] = rawY;
    s.blockOutZRaw[frame] = rawZ;
    if (frame == frameCount - 1) {
      s.lastRawX = rawX;
      s.lastRawY = rawY;
      s.lastRawZ = rawZ;
    }
    time += freqParam / sampleRate;
  }
  s.time = time;
}

}  // namespace

extern "C" int soemdsp_fbm_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = FbmState{};
      gPool[i].active = true;
      gPool[i].currentSeed = -1;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_fbm_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_fbm_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].time = 0.0;
}

extern "C" void soemdsp_fbm_sample(
  int handle,
  int seedInt,
  int octaves,
  double persistence,
  double scale,
  double frequency,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  FbmState& s = gPool[handle - 1];

  const int safeSeed      = seedInt < 0 ? 0 : (seedInt > 99999 ? 99999 : seedInt);
  const int safeOctaves   = octaves < 1 ? 1 : (octaves > 8 ? 8 : octaves);
  const double safePers   = persistence < 0.0 ? 0.0 : (persistence > 0.99 ? 0.99 : persistence);
  const double safeScale  = scale < 0.000001 ? 0.000001 : scale;
  const double safeFreq   = frequency < 0.0 ? 0.0 : frequency;
  const double safeRate   = sampleRate < 1.0 ? 1.0 : sampleRate;

  if (safeSeed != s.currentSeed) {
    s.currentSeed = safeSeed;
    s.time = 0.0;
  }

  const unsigned int baseX = seedHash(safeSeed, 0);
  const unsigned int baseY = seedHash(safeSeed, 1);
  const unsigned int baseZ = seedHash(safeSeed, 2);

  fbmAxesSimd(s.time, safeOctaves, safePers, safeScale, baseX, baseY, baseZ, s.lastRawX, s.lastRawY, s.lastRawZ);
  s.lastX = s.lastRawX * level;
  s.lastY = s.lastRawY * level;
  s.lastZ = s.lastRawZ * level;

  s.time += safeFreq / safeRate;
}

extern "C" double soemdsp_fbm_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastX;
}

extern "C" double soemdsp_fbm_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastY;
}

extern "C" double soemdsp_fbm_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastZ;
}

extern "C" double soemdsp_fbm_x_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawX;
}

extern "C" double soemdsp_fbm_y_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawY;
}

extern "C" double soemdsp_fbm_z_raw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRawZ;
}

extern "C" int soemdsp_fbm_version() {
  return 1;
}

// Block-processing boundary: resolves params once, processes `frameCount`
// samples in one call, writes results into this instance's static output
// buffers (read via the _ptr getters below as a zero-copy Float64Array view
// into WASM memory from JS). `useSimd` is exposed as an explicit runtime
// switch purely so both paths can be A/B tested through the identical
// boundary -- a real caller would just always pass 1, since SIMD support is
// actually a compile-time fact (this module is built with -msimd128) not a
// runtime one.
extern "C" void soemdsp_fbm_process_block(
  int handle,
  int seedInt,
  int octaves,
  double persistence,
  double scale,
  double frequency,
  double level,
  double sampleRate,
  int frameCount,
  int useSimd
) {
  if (handle < 1 || handle > kMaxInstances) return;
  FbmState& s = gPool[handle - 1];

  const int safeSeed = seedInt < 0 ? 0 : (seedInt > 99999 ? 99999 : seedInt);
  const int safeOctaves = octaves < 1 ? 1 : (octaves > 8 ? 8 : octaves);
  const double safePers = persistence < 0.0 ? 0.0 : (persistence > 0.99 ? 0.99 : persistence);
  const double safeScale = scale < 0.000001 ? 0.000001 : scale;
  const double safeFreq = frequency < 0.0 ? 0.0 : frequency;
  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);

  if (safeSeed != s.currentSeed) {
    s.currentSeed = safeSeed;
    s.time = 0.0;
  }

  const unsigned int baseX = seedHash(safeSeed, 0);
  const unsigned int baseY = seedHash(safeSeed, 1);
  const unsigned int baseZ = seedHash(safeSeed, 2);

  if (useSimd) {
    fbmProcessBlockSimd(s, safeOctaves, safePers, safeScale, safeFreq, level, safeRate, baseX, baseY, baseZ, safeFrameCount);
  } else {
    fbmProcessBlockScalar(s, safeOctaves, safePers, safeScale, safeFreq, level, safeRate, baseX, baseY, baseZ, safeFrameCount);
  }

  s.lastX = s.lastRawX * level;
  s.lastY = s.lastRawY * level;
  s.lastZ = s.lastRawZ * level;
}

extern "C" int soemdsp_fbm_block_output_x_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutX);
}

extern "C" int soemdsp_fbm_block_output_y_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutY);
}

extern "C" int soemdsp_fbm_block_output_z_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutZ);
}

extern "C" int soemdsp_fbm_block_output_x_raw_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutXRaw);
}

extern "C" int soemdsp_fbm_block_output_y_raw_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutYRaw);
}

extern "C" int soemdsp_fbm_block_output_z_raw_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutZRaw);
}

extern "C" int soemdsp_fbm_max_block_frames() {
  return kMaxBlockFrames;
}
