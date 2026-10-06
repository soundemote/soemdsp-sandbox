// Per-module seed hashing. One Seed integer per module; every random part
// inside the module derives its own stream from (seed, component, index):
//   voice n  -> seed_mix(seed, VOICE, n)
//   left lane -> seed_mix(seed, LEFT)
// Component IDs are fixed per module (an enum), never running counters, so
// adding a part later never shifts the streams of existing parts.
// Seed 0 is a real seed: every function here is total over uint32.
//
// JS twin (bit-identical): public/lib/math/soem-math.js
//   SoemMath.seedMix / SoemMath.seedToRngState / SoemMath.SEED_MAX
#pragma once

namespace soemdsp::math {

// Largest user Seed. Seeds travel as doubles but some paths (yellow stages,
// param domains) narrow to float32, which is exact only up to 2^24.
static constexpr unsigned int kSeedParamMax = 16777215u;

// MurmurHash3 fmix32 finalizer. Bijective on uint32; one flipped input bit
// flips ~half the output bits.
static inline unsigned int seed_avalanche(unsigned int x) {
  x ^= x >> 16;
  x *= 0x85EBCA6Bu;
  x ^= x >> 13;
  x *= 0xC2B2AE35u;
  x ^= x >> 16;
  return x;
}

// Hash (seed, component, index) to a well-mixed 32-bit value. Each input is
// folded in with its own odd multiplier + offset and avalanched, so a one-bit
// change in ANY input scrambles the result. Total: seed 0 is valid.
static inline unsigned int seed_mix(unsigned int seed, unsigned int component, unsigned int index) {
  unsigned int h = seed_avalanche(seed + 0x9E3779B9u);
  h = seed_avalanche(h ^ (component * 0x27D4EB2Fu + 0x165667B1u));
  h = seed_avalanche(h ^ (index * 0x85EBCA77u + 0xC2B2AE3Du));
  return h;
}

static inline unsigned int seed_mix(unsigned int seed, unsigned int component) {
  return seed_mix(seed, component, 0u);
}

// Safe xorshift32 state from any uint32 (xorshift32 sticks at 0). Hashes the
// value; the one input that hashes to 0 gets a fixed nonzero constant.
static inline unsigned int seed_to_rng_state(unsigned int s) {
  const unsigned int h = seed_avalanche(s ^ 0x5EED5EEDu);
  return h != 0u ? h : 0x6D2B79F5u;
}

// Seed param (double from the host) -> uint32 in [0, kSeedParamMax].
// Rounds to nearest; NaN / negative -> 0. Explicit 0 stays 0.
static inline unsigned int seed_param_u32(double v) {
  if (!(v == v) || v <= 0.0) return 0u;
  if (v >= (double)kSeedParamMax) return kSeedParamMax;
  return (unsigned int)(v + 0.5);
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::kSeedParamMax;
using soemdsp::math::seed_avalanche;
using soemdsp::math::seed_mix;
using soemdsp::math::seed_to_rng_state;
using soemdsp::math::seed_param_u32;
}  // namespace soemdsp_maths
