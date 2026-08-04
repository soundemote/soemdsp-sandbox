// soemdsp-native-module: noise_generator
// soemdsp-native-label: Noise Generator
// soemdsp-native-target: noiseGenerator
// soemdsp-native-kind: noise

#include <wasm_simd128.h>

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
// Block-processing boundary buffers, same fixed-size-static-array pattern
// as fractal_brownian_noise and sabrina_reverb's process_block APIs.
static const int kMaxBlockFrames = 2048;

struct NoiseChan {
  unsigned int seed;
  double brown;
  double pink[7];
};

struct NoiseGenState {
  NoiseChan left;
  NoiseChan right;
  int currentSeed;
  bool active;
  double lastLeft;
  double lastRight;
  double blockOutLeft[kMaxBlockFrames];
  double blockOutRight[kMaxBlockFrames];
};

static NoiseGenState gPool[kMaxInstances];

static unsigned int seedHash(int seed, int channel) {
  unsigned int h = (unsigned int)(seed ^ (channel * 0x9e3779b9));
  h ^= h >> 16;
  h = h * 0x45d9f3bU;
  h ^= h >> 16;
  h = h * 0x45d9f3bU;
  h ^= h >> 16;
  return h ? h : 1U;
}

static void resetChan(NoiseChan& chan, unsigned int initialSeed) {
  chan.seed = initialSeed;
  chan.brown = 0.0;
  for (int i = 0; i < 7; i++) chan.pink[i] = 0.0;
}

static unsigned int lcgNext(NoiseChan& chan) {
  chan.seed = 1664525U * chan.seed + 1013904223U;
  return chan.seed;
}

static double nextBipolar(NoiseChan& chan) {
  return (double)(lcgNext(chan)) / (double)(0xffffffffU) * 2.0 - 1.0;
}

static double nextUnipolar(NoiseChan& chan) {
  return (double)(lcgNext(chan)) / (double)(0xffffffffU);
}

static double nextGaussian(NoiseChan& chan) {
  // CLT approximation: sum of 12 uniforms ≈ N(6, 1), shifted to N(0, 1)
  double sum = 0.0;
  for (int i = 0; i < 12; i++) sum += nextUnipolar(chan);
  return sum - 6.0;
}

// Continuous morph: 0 = even bipolar U(−1,1), 1 = Gaussian ~N(0,1).
// Smoothstep blend keeps the path full-range and click-free.
static double nextShapedBipolar(NoiseChan& chan, double shape) {
  const double t = clamp(shape, 0.0, 1.0);
  if (t <= 1.0e-12) {
    return nextBipolar(chan);
  }
  if (t >= 1.0 - 1.0e-12) {
    return nextGaussian(chan);
  }
  const double s = t * t * (3.0 - 2.0 * t);
  const double u = nextBipolar(chan);
  const double g = nextGaussian(chan);
  return u * (1.0 - s) + g * s;
}

static double channelSample(NoiseChan& chan, int mode, double mean, double deviation, double shape) {
  const double white = nextBipolar(chan);
  if (mode == 1) {
    // Pure Gaussian (legacy Mode = Gaussian).
    return mean + nextGaussian(chan) * deviation;
  }
  if (mode == 2) {
    const double dev = deviation < 0.001 ? 0.001 : deviation;
    chan.brown = clamp(chan.brown + white * dev * 0.05, -1.0, 1.0);
    return mean + chan.brown;
  }
  if (mode == 3) {
    chan.pink[0] = 0.99886 * chan.pink[0] + white * 0.0555179;
    chan.pink[1] = 0.99332 * chan.pink[1] + white * 0.0750759;
    chan.pink[2] = 0.969   * chan.pink[2] + white * 0.153852;
    chan.pink[3] = 0.8665  * chan.pink[3] + white * 0.3104856;
    chan.pink[4] = 0.55    * chan.pink[4] + white * 0.5329522;
    chan.pink[5] = -0.7616 * chan.pink[5] - white * 0.016898;
    const double out = mean + (chan.pink[0] + chan.pink[1] + chan.pink[2] +
      chan.pink[3] + chan.pink[4] + chan.pink[5] + chan.pink[6] + white * 0.5362) * 0.11;
    chan.pink[6] = white * 0.115926;
    return out;
  }
  if (mode == 4) {
    const double abw = white < 0.0 ? -white : white;
    return mean + (abw > 0.94 ? (white > 0.0 ? deviation : -deviation) : 0.0);
  }
  // Mode 0 Uniform: continuous Uniform → Gaussian via shape.
  return mean + nextShapedBipolar(chan, shape) * deviation;
}

// SIMD kernels: pair the left/right channels into one f64x2/i32x4 lane each.
// L and R are independent within a call (each channel's own persistent LCG
// seed / pink-filter taps), the same stereo-pairing shape already proven
// for Sabrina Reverb's delay/diffuse chain -- but here there is no delay
// buffer at all, so unlike Sabrina this is pure ALU-bound state recursion,
// the profile that made fractal_brownian_noise's kernel the biggest win.
//
// Always calls the LCG step for "white" first, exactly like the scalar
// channelSample, so both paths consume the RNG stream in identical order
// -- required for bit-exact equivalence, not just similar output.
static void lcgNextPairSimd(NoiseChan& chanL, NoiseChan& chanR, unsigned int& outL, unsigned int& outR) {
  const v128_t seeds = wasm_i32x4_make(static_cast<int>(chanL.seed), static_cast<int>(chanR.seed), 0, 0);
  const v128_t multiplied = wasm_i32x4_mul(seeds, wasm_i32x4_splat(static_cast<int>(1664525U)));
  const v128_t next = wasm_i32x4_add(multiplied, wasm_i32x4_splat(static_cast<int>(1013904223U)));
  unsigned int lanes[4];
  wasm_v128_store(lanes, next);
  chanL.seed = lanes[0];
  chanR.seed = lanes[1];
  outL = chanL.seed;
  outR = chanR.seed;
}

static void nextBipolarPairSimd(NoiseChan& chanL, NoiseChan& chanR, double& outL, double& outR) {
  unsigned int rawL, rawR;
  lcgNextPairSimd(chanL, chanR, rawL, rawR);
  outL = static_cast<double>(rawL) / static_cast<double>(0xffffffffU) * 2.0 - 1.0;
  outR = static_cast<double>(rawR) / static_cast<double>(0xffffffffU) * 2.0 - 1.0;
}

static void nextUnipolarPairSimd(NoiseChan& chanL, NoiseChan& chanR, double& outL, double& outR) {
  unsigned int rawL, rawR;
  lcgNextPairSimd(chanL, chanR, rawL, rawR);
  outL = static_cast<double>(rawL) / static_cast<double>(0xffffffffU);
  outR = static_cast<double>(rawR) / static_cast<double>(0xffffffffU);
}

static void nextGaussianPairSimd(NoiseChan& chanL, NoiseChan& chanR, double& outL, double& outR) {
  v128_t sum = wasm_f64x2_splat(0.0);
  for (int i = 0; i < 12; i += 1) {
    double uL, uR;
    nextUnipolarPairSimd(chanL, chanR, uL, uR);
    sum = wasm_f64x2_add(sum, wasm_f64x2_make(uL, uR));
  }
  double lanes[2];
  wasm_v128_store(lanes, sum);
  outL = lanes[0] - 6.0;
  outR = lanes[1] - 6.0;
}

static void nextShapedBipolarPairSimd(NoiseChan& chanL, NoiseChan& chanR, double shape, double& outL, double& outR) {
  const double t = clamp(shape, 0.0, 1.0);
  if (t <= 1.0e-12) {
    nextBipolarPairSimd(chanL, chanR, outL, outR);
    return;
  }
  if (t >= 1.0 - 1.0e-12) {
    nextGaussianPairSimd(chanL, chanR, outL, outR);
    return;
  }
  const double s = t * t * (3.0 - 2.0 * t);
  double uL, uR, gL, gR;
  nextBipolarPairSimd(chanL, chanR, uL, uR);
  nextGaussianPairSimd(chanL, chanR, gL, gR);
  outL = uL * (1.0 - s) + gL * s;
  outR = uR * (1.0 - s) + gR * s;
}

static void channelSamplePairSimd(NoiseChan& chanL, NoiseChan& chanR, int mode, double mean, double deviation, double shape, double& outL, double& outR) {
  double whiteL, whiteR;
  nextBipolarPairSimd(chanL, chanR, whiteL, whiteR);
  const v128_t white = wasm_f64x2_make(whiteL, whiteR);
  const v128_t meanVec = wasm_f64x2_splat(mean);
  if (mode == 1) {
    double gL, gR;
    nextGaussianPairSimd(chanL, chanR, gL, gR);
    const v128_t result = wasm_f64x2_add(meanVec, wasm_f64x2_mul(wasm_f64x2_make(gL, gR), wasm_f64x2_splat(deviation)));
    double lanes[2];
    wasm_v128_store(lanes, result);
    outL = lanes[0];
    outR = lanes[1];
    return;
  }
  if (mode == 2) {
    const double dev = deviation < 0.001 ? 0.001 : deviation;
    v128_t brown = wasm_f64x2_make(chanL.brown, chanR.brown);
    brown = wasm_f64x2_add(brown, wasm_f64x2_mul(white, wasm_f64x2_splat(dev * 0.05)));
    brown = wasm_f64x2_pmin(wasm_f64x2_pmax(brown, wasm_f64x2_splat(-1.0)), wasm_f64x2_splat(1.0));
    double brownLanes[2];
    wasm_v128_store(brownLanes, brown);
    chanL.brown = brownLanes[0];
    chanR.brown = brownLanes[1];
    outL = mean + chanL.brown;
    outR = mean + chanR.brown;
    return;
  }
  if (mode == 3) {
    v128_t p0 = wasm_f64x2_make(chanL.pink[0], chanR.pink[0]);
    v128_t p1 = wasm_f64x2_make(chanL.pink[1], chanR.pink[1]);
    v128_t p2 = wasm_f64x2_make(chanL.pink[2], chanR.pink[2]);
    v128_t p3 = wasm_f64x2_make(chanL.pink[3], chanR.pink[3]);
    v128_t p4 = wasm_f64x2_make(chanL.pink[4], chanR.pink[4]);
    v128_t p5 = wasm_f64x2_make(chanL.pink[5], chanR.pink[5]);
    const v128_t p6 = wasm_f64x2_make(chanL.pink[6], chanR.pink[6]);
    p0 = wasm_f64x2_add(wasm_f64x2_mul(p0, wasm_f64x2_splat(0.99886)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.0555179)));
    p1 = wasm_f64x2_add(wasm_f64x2_mul(p1, wasm_f64x2_splat(0.99332)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.0750759)));
    p2 = wasm_f64x2_add(wasm_f64x2_mul(p2, wasm_f64x2_splat(0.969)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.153852)));
    p3 = wasm_f64x2_add(wasm_f64x2_mul(p3, wasm_f64x2_splat(0.8665)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.3104856)));
    p4 = wasm_f64x2_add(wasm_f64x2_mul(p4, wasm_f64x2_splat(0.55)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.5329522)));
    p5 = wasm_f64x2_sub(wasm_f64x2_mul(p5, wasm_f64x2_splat(-0.7616)), wasm_f64x2_mul(white, wasm_f64x2_splat(0.016898)));
    v128_t sum = wasm_f64x2_add(p0, p1);
    sum = wasm_f64x2_add(sum, p2);
    sum = wasm_f64x2_add(sum, p3);
    sum = wasm_f64x2_add(sum, p4);
    sum = wasm_f64x2_add(sum, p5);
    sum = wasm_f64x2_add(sum, p6);
    sum = wasm_f64x2_add(sum, wasm_f64x2_mul(white, wasm_f64x2_splat(0.5362)));
    const v128_t out = wasm_f64x2_add(meanVec, wasm_f64x2_mul(sum, wasm_f64x2_splat(0.11)));
    const v128_t p6next = wasm_f64x2_mul(white, wasm_f64x2_splat(0.115926));
    double p0l[2], p1l[2], p2l[2], p3l[2], p4l[2], p5l[2], p6l[2], outl[2];
    wasm_v128_store(p0l, p0);
    wasm_v128_store(p1l, p1);
    wasm_v128_store(p2l, p2);
    wasm_v128_store(p3l, p3);
    wasm_v128_store(p4l, p4);
    wasm_v128_store(p5l, p5);
    wasm_v128_store(p6l, p6next);
    wasm_v128_store(outl, out);
    chanL.pink[0] = p0l[0]; chanR.pink[0] = p0l[1];
    chanL.pink[1] = p1l[0]; chanR.pink[1] = p1l[1];
    chanL.pink[2] = p2l[0]; chanR.pink[2] = p2l[1];
    chanL.pink[3] = p3l[0]; chanR.pink[3] = p3l[1];
    chanL.pink[4] = p4l[0]; chanR.pink[4] = p4l[1];
    chanL.pink[5] = p5l[0]; chanR.pink[5] = p5l[1];
    chanL.pink[6] = p6l[0]; chanR.pink[6] = p6l[1];
    outL = outl[0];
    outR = outl[1];
    return;
  }
  if (mode == 4) {
    // Crackle's branch depends on the sign/magnitude of each lane's own
    // white value, so L and R can take different branches within the same
    // call -- unlike modes 0-3, this can't be expressed as one shared
    // vector op. Left scalar per-lane rather than forcing a false vector
    // shape onto genuinely divergent per-lane control flow.
    double lanes[2];
    wasm_v128_store(lanes, white);
    for (int lane = 0; lane < 2; lane += 1) {
      const double w = lanes[lane];
      const double abw = w < 0.0 ? -w : w;
      const double result = mean + (abw > 0.94 ? (w > 0.0 ? deviation : -deviation) : 0.0);
      if (lane == 0) outL = result; else outR = result;
    }
    return;
  }
  // Mode 0 Uniform: continuous Uniform → Gaussian via shape.
  {
    double sL, sR;
    nextShapedBipolarPairSimd(chanL, chanR, shape, sL, sR);
    outL = mean + sL * deviation;
    outR = mean + sR * deviation;
  }
}

// Block-processing boundary: same (state, output, frameCount, useSimd)
// shape as fbmProcessBlockScalar/Simd and sabrinaProcessBlockScalar/Simd.
// This module is a pure generator (no external input), so like FBM its
// block cache can refill transparently in the live worklet with no added
// latency -- unlike Sabrina, which was deliberately kept native-only.
static void noiseProcessBlockScalar(NoiseGenState& s, int mode, double mean, double deviation, double shape, double level, int frameCount) {
  for (int frame = 0; frame < frameCount; frame += 1) {
    const double l = clamp(channelSample(s.left, mode, mean, deviation, shape), -1.0, 1.0) * level;
    const double r = clamp(channelSample(s.right, mode, mean, deviation, shape), -1.0, 1.0) * level;
    s.blockOutLeft[frame] = l;
    s.blockOutRight[frame] = r;
  }
  s.lastLeft = s.blockOutLeft[frameCount - 1];
  s.lastRight = s.blockOutRight[frameCount - 1];
}

static void noiseProcessBlockSimd(NoiseGenState& s, int mode, double mean, double deviation, double shape, double level, int frameCount) {
  for (int frame = 0; frame < frameCount; frame += 1) {
    double l, r;
    channelSamplePairSimd(s.left, s.right, mode, mean, deviation, shape, l, r);
    l = clamp(l, -1.0, 1.0) * level;
    r = clamp(r, -1.0, 1.0) * level;
    s.blockOutLeft[frame] = l;
    s.blockOutRight[frame] = r;
  }
  s.lastLeft = s.blockOutLeft[frameCount - 1];
  s.lastRight = s.blockOutRight[frameCount - 1];
}

}  // namespace

extern "C" int soemdsp_noise_generator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = NoiseGenState{};
      gPool[i].active = true;
      gPool[i].currentSeed = -1;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_noise_generator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_noise_generator_sample(
  int handle,
  double seedValue,
  int mode,
  double mean,
  double deviation,
  double shape,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  NoiseGenState& s = gPool[handle - 1];
  const int seed = seedValue < 0.0 ? 0 : (seedValue > 99999.0 ? 99999 : (int)seedValue);
  if (seed != s.currentSeed) {
    s.currentSeed = seed;
    resetChan(s.left,  seedHash(seed, 0));
    resetChan(s.right, seedHash(seed, 1));
  }
  const int safeMode = mode < 0 ? 0 : (mode > 4 ? 4 : mode);
  const double safeDev = deviation < 0.0 ? 0.0 : deviation;
  const double safeShape = clamp(shape, 0.0, 1.0);
  s.lastLeft  = clamp(channelSample(s.left,  safeMode, mean, safeDev, safeShape), -1.0, 1.0) * level;
  s.lastRight = clamp(channelSample(s.right, safeMode, mean, safeDev, safeShape), -1.0, 1.0) * level;
}

extern "C" double soemdsp_noise_generator_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastLeft;
}

extern "C" double soemdsp_noise_generator_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRight;
}

extern "C" int soemdsp_noise_generator_version() {
  return 2; // +shape (Uniform → Gaussian morph on mode 0)
}

// Block-processing boundary. Caller calls this once per block, then reads
// frameCount samples back from the buffers returned by the _ptr getters
// (zero-copy Float64Array view into WASM memory) -- one JS<->WASM crossing
// per block instead of one per sample. useSimd selects noiseProcessBlockSimd
// (paired L/R kernel) or noiseProcessBlockScalar (the original per-channel
// calls); a real caller always passes 1, same rationale as the other two
// process_block APIs on this branch -- the switch exists purely so both
// paths can be verified through one identical entry point.
//
// Signature v2: (…, deviation, shape, level, frameCount, useSimd)
extern "C" void soemdsp_noise_generator_process_block(
  int handle,
  double seedValue,
  int mode,
  double mean,
  double deviation,
  double shape,
  double level,
  int frameCount,
  int useSimd
) {
  if (handle < 1 || handle > kMaxInstances) return;
  NoiseGenState& s = gPool[handle - 1];
  const int seed = seedValue < 0.0 ? 0 : (seedValue > 99999.0 ? 99999 : (int)seedValue);
  if (seed != s.currentSeed) {
    s.currentSeed = seed;
    resetChan(s.left, seedHash(seed, 0));
    resetChan(s.right, seedHash(seed, 1));
  }
  const int safeMode = mode < 0 ? 0 : (mode > 4 ? 4 : mode);
  const double safeDev = deviation < 0.0 ? 0.0 : deviation;
  const double safeShape = clamp(shape, 0.0, 1.0);
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  if (useSimd) {
    noiseProcessBlockSimd(s, safeMode, mean, safeDev, safeShape, level, safeFrameCount);
  } else {
    noiseProcessBlockScalar(s, safeMode, mean, safeDev, safeShape, level, safeFrameCount);
  }
}

extern "C" int soemdsp_noise_generator_block_output_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutLeft);
}

extern "C" int soemdsp_noise_generator_block_output_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutRight);
}

extern "C" int soemdsp_noise_generator_max_block_frames() {
  return kMaxBlockFrames;
}
