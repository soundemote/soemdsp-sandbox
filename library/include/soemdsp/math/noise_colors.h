// Scalar white / pink / brown noise generators, shared by Noise Generator and
// Softpop Oscillator. Moved verbatim from native_modules/noise_generator/
// noise_generator.cpp (APP_POLICY §19, docs/SOFTPOP_PLAN.md §2). Noise
// Generator output (scalar and SIMD block paths) is byte-identical to before
// the move: scripts/test_tpt_svf_noise_colors_regression.mjs.
// (Not math/noise.h, which is value noise / fBm.)
//
// One NoiseColorChannel = one independent stream: 32-bit LCG
// (1664525·s + 1013904223) plus the brown walk and the pink filter taps.
#pragma once

#include <soemdsp/math/scalar_helpers.h>

namespace soemdsp_maths {

struct NoiseColorChannel {
  unsigned int seed;
  double brown;
  double pink[7];
};

static inline void noise_color_reset(NoiseColorChannel& chan, unsigned int initialSeed) {
  chan.seed = initialSeed;
  chan.brown = 0.0;
  for (int i = 0; i < 7; i++) chan.pink[i] = 0.0;
}

static inline unsigned int noise_color_lcg_next(NoiseColorChannel& chan) {
  chan.seed = 1664525U * chan.seed + 1013904223U;
  return chan.seed;
}

static inline double noise_color_bipolar(NoiseColorChannel& chan) {
  return (double)(noise_color_lcg_next(chan)) / (double)(0xffffffffU) * 2.0 - 1.0;
}

static inline double noise_color_unipolar(NoiseColorChannel& chan) {
  return (double)(noise_color_lcg_next(chan)) / (double)(0xffffffffU);
}

static inline double noise_color_gaussian(NoiseColorChannel& chan) {
  // CLT approximation: sum of 12 uniforms ≈ N(6, 1), shifted to N(0, 1)
  double sum = 0.0;
  for (int i = 0; i < 12; i++) sum += noise_color_unipolar(chan);
  return sum - 6.0;
}

// Continuous morph: 0 = even bipolar U(−1,1), 1 = Gaussian ~N(0,1).
// Smoothstep blend keeps the path full-range and click-free.
static inline double noise_color_shaped_bipolar(NoiseColorChannel& chan, double shape) {
  const double t = clamp(shape, 0.0, 1.0);
  if (t <= 1.0e-12) {
    return noise_color_bipolar(chan);
  }
  if (t >= 1.0 - 1.0e-12) {
    return noise_color_gaussian(chan);
  }
  const double s = t * t * (3.0 - 2.0 * t);
  const double u = noise_color_bipolar(chan);
  const double g = noise_color_gaussian(chan);
  return u * (1.0 - s) + g * s;
}

// mode 0 Uniform (→ Gaussian via shape), 1 Gaussian (CLT-12), 2 Brown
// (clamped walk, step 0.05·deviation), 3 Pink (Kellet), 4 Sparse (crackle).
// Every mode draws the "white" LCG step first.
static inline double noise_color_sample(NoiseColorChannel& chan, int mode, double mean, double deviation, double shape) {
  const double white = noise_color_bipolar(chan);
  if (mode == 1) {
    // Pure Gaussian (legacy Mode = Gaussian).
    return mean + noise_color_gaussian(chan) * deviation;
  }
  if (mode == 2) {
    const double dev = deviation < 0.001 ? 0.001 : deviation;
    chan.brown = clamp11(chan.brown + white * dev * 0.05);
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
  return mean + noise_color_shaped_bipolar(chan, shape) * deviation;
}

}  // namespace soemdsp_maths
