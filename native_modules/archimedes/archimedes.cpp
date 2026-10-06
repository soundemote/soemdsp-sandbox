// soemdsp-native-module: archimedes
// soemdsp-native-label: Archimedes Oscillator
// soemdsp-native-target: archimedes
// soemdsp-native-kind: oscillator
//
// Archimedes -- a 2-cycle integer sine/cosine engine that also extracts pi.
//
// A symplectic (energy-preserving) Euler integrator runs entirely in 16.16
// fixed-point, so a clean sine/cosine pair falls out of a handful of integer
// bit-shift operations with no floating-point in the hot path. A tiny dithered
// noise floor is injected directly into the feedback step (stochastic
// resonance) so the oscillator "shivers" across the integer grid -- that lets a
// long time-average resolve fractional step counts and kills truncation limit
// cycles. Because the time of a half cycle is exactly pi, averaging
// total_steps / zero_crossings over thousands of cycles reconstructs pi to high
// precision straight out of the engine's own clock.
//

typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
// Named for Archimedes, who first pinned down pi by averaging polygons -- this
// does the same trick with dithered clock steps instead of polygon edges.
//
// Freestanding wasm32: no standard library, no imports. All transcendental
// helpers used by the phase-control API are implemented locally.

#include <soemdsp/math/scalar_helpers.h>
#include <soemdsp/math/seed.h>

namespace {

// Fixed seed components (never reorder; append new parts at the end).
enum : unsigned int {
  kSeedDitherNoise = 1u,  // dither / Noise Low / Noise High xorshift
};

using soemdsp_maths::wrap_radians;
using soemdsp_maths::kPi;
using soemdsp_maths::kTwoPi;
using soemdsp_maths::kHalfPi;
using soemdsp_maths::sqrt_newton;
constexpr int kMaxInstances = 16;

// ---- Local transcendental helpers (freestanding, no libm) ------------------
double absD(double v) { return v < 0.0 ? -v : v; }

double sinApprox(double x) {
  const double w = wrap_radians(x);
  const double x2 = w * w;
  return w * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

double cosApprox(double x) { return sinApprox(x + kHalfPi); }

// atan2 via a rational approximation, good enough for phase re-seeding.
double atan2Approx(double y, double x) {
  if (x == 0.0 && y == 0.0) return 0.0;
  const double ax = absD(x);
  const double ay = absD(y);
  const double a = (ax < ay ? ax : ay) / (ax > ay ? ax : ay);
  const double s = a * a;
  double r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = kHalfPi - r;
  if (x < 0.0) r = kPi - r;
  if (y < 0.0) r = -r;
  return r;
}

struct ArchimedesState {
  bool active;
  int32_t x;            // sine state  (16.16)
  int32_t y;            // cosine state (16.16)
  uint32_t rng;         // xorshift PRNG state
  uint32_t seed;        // module Seed (restarts rng on create / Reset / change)
  int32_t lastSign;     // previous sign bit of x (branchless crossing tracker)
  int32_t dtShift;      // base sample-rate scalar (rate = 1 << dtShift)
  double dtFloat;       // 1 / rate
  int32_t phaseInc;     // 16.16 phase velocity
  int32_t freqHz;       // current target frequency
  uint32_t totalSteps;
  uint32_t zeroCrossings;
  // The xorshift stream already updates once per step for dithering -- these
  // two just re-read that same stream as a broadband noise sample and split
  // it with a single one-pole lowpass: noiseLow is the smoothed/below-band
  // half, noiseRaw-minus-noiseLow is the fast-changing/above-band half. No
  // second PRNG, no new per-sample cost beyond one multiply-add.
  double noiseRaw;
  double noiseLow;
};

static ArchimedesState gPool[kMaxInstances];

void recomputeTiming(ArchimedesState& s) {
  double rate = (double)(1u << (s.dtShift & 31));
  s.dtFloat = 1.0 / rate;
}

void computePhaseInc(ArchimedesState& s) {
  if (s.freqHz <= 0) {
    s.phaseInc = 0;
  } else {
    s.phaseInc = (int32_t)((kTwoPi * s.freqHz * s.dtFloat) * 65536.0);
  }
}

ArchimedesState makeState() {
  ArchimedesState s{};
  s.active = true;
  s.x = 0;
  s.y = 65536;   // 1.0
  s.seed = 0u;  // host Seed applied via _set_seed
  s.rng = soemdsp::math::seed_to_rng_state(soemdsp::math::seed_mix(0u, kSeedDitherNoise));
  s.lastSign = 0;
  s.dtShift = 12;
  s.freqHz = 440;
  s.totalSteps = 0;
  s.zeroCrossings = 0;
  s.noiseRaw = 0.0;
  s.noiseLow = 0.0;
  recomputeTiming(s);
  computePhaseInc(s);
  return s;
}

}  // namespace

extern "C" int soemdsp_archimedes_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = makeState();
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_archimedes_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_archimedes_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  s.x = 0;
  s.y = 65536;
  s.lastSign = 0;
  s.totalSteps = 0;
  s.zeroCrossings = 0;
  s.rng = soemdsp::math::seed_to_rng_state(soemdsp::math::seed_mix(s.seed, kSeedDitherNoise));
}

extern "C" void soemdsp_archimedes_set_seed(int handle, double seed) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  s.seed = soemdsp::math::seed_param_u32(seed);
  s.rng = soemdsp::math::seed_to_rng_state(soemdsp::math::seed_mix(s.seed, kSeedDitherNoise));
}

// dtShift picks the base sample rate (rate = 1 << dtShift). Profiles:
//   10 = Wavetable Emulator, 12 = Fast Sin, 16 = Standard std::sin,
//   6 = Lo-Fi (coarsest steps -- cheapest and roughest of the four).
extern "C" void soemdsp_archimedes_set_profile(int handle, int dtShift) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  s.dtShift = dtShift < 4 ? 4 : (dtShift > 24 ? 24 : dtShift);
  recomputeTiming(s);
  computePhaseInc(s);
}

extern "C" void soemdsp_archimedes_set_frequency(int handle, int freqHz) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  s.freqHz = freqHz;
  computePhaseInc(s);
}

extern "C" void soemdsp_archimedes_set_amplitude(int handle, double amplitude) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].y = (int32_t)(amplitude * 65536.0);
}

extern "C" void soemdsp_archimedes_reset_counters(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].totalSteps = 0;
  gPool[handle - 1].zeroCrossings = 0;
}

// The 2-cycle hot path: branchless dithered symplectic integer step.
extern "C" double soemdsp_archimedes_step(int handle, int ditherBits) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ArchimedesState& s = gPool[handle - 1];

  // xorshift PRNG (3 ops)
  s.rng ^= (s.rng << 13);
  s.rng ^= (s.rng >> 17);
  s.rng ^= (s.rng << 5);

  const int32_t mask = ditherBits;
  const int32_t dither = (int32_t)(s.rng & (uint32_t)mask) - (mask / 2);

  // symplectic Euler in fixed point
  s.x -= (int32_t)(((int64_t)s.y * s.phaseInc) >> 16) + dither;
  s.y += (int32_t)(((int64_t)s.x * s.phaseInc) >> 16);

  const int32_t sign = (s.x >> 31) & 1;
  s.zeroCrossings += (uint32_t)(sign ^ s.lastSign);
  s.totalSteps += 1;
  s.lastSign = sign;

  // Re-read the same xorshift stream as a broadband noise sample and split
  // it with a one-pole lowpass: the smoothed half is "below Nyquist", the
  // residual (raw minus smoothed) is the fast/aliased-looking half above it.
  s.noiseRaw = ((double)s.rng / 4294967295.0) * 2.0 - 1.0;
  s.noiseLow += 0.01 * (s.noiseRaw - s.noiseLow);

  return (double)s.x / 65536.0;
}

extern "C" double soemdsp_archimedes_sine(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (double)gPool[handle - 1].x / 65536.0;
}

extern "C" double soemdsp_archimedes_cosine(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (double)gPool[handle - 1].y / 65536.0;
}

// Below-Nyquist half of the dither noise stream (one-pole lowpassed).
extern "C" double soemdsp_archimedes_noise_below(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].noiseLow;
}

// Above-Nyquist half: whatever the lowpass above rejected.
extern "C" double soemdsp_archimedes_noise_above(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const ArchimedesState& s = gPool[handle - 1];
  return s.noiseRaw - s.noiseLow;
}

// Jump to an absolute phase angle, preserving current amplitude.
extern "C" void soemdsp_archimedes_set_phase(int handle, double phaseRadians) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  const double xf = (double)s.x / 65536.0;
  const double yf = (double)s.y / 65536.0;
  double amp = sqrt_newton(xf * xf + yf * yf);
  if (amp < 0.0001) amp = 1.0;
  s.x = (int32_t)(amp * sinApprox(phaseRadians) * 65536.0);
  s.y = (int32_t)(amp * cosApprox(phaseRadians) * 65536.0);
  s.lastSign = (s.x >> 31) & 1;
}

// Offset phase relative to current position.
extern "C" void soemdsp_archimedes_shift_phase(int handle, double offsetRadians) {
  if (handle < 1 || handle > kMaxInstances) return;
  ArchimedesState& s = gPool[handle - 1];
  const double xf = (double)s.x / 65536.0;
  const double yf = (double)s.y / 65536.0;
  const double cur = atan2Approx(xf, yf);
  soemdsp_archimedes_set_phase(handle, cur + offsetRadians);
}

extern "C" unsigned soemdsp_archimedes_total_steps(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].totalSteps;
}

extern "C" unsigned soemdsp_archimedes_zero_crossings(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].zeroCrossings;
}

// Extract pi from the time-averaged crossing history.
extern "C" double soemdsp_archimedes_extract_pi(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ArchimedesState& s = gPool[handle - 1];
  if (s.zeroCrossings == 0 || s.freqHz <= 0) return 0.0;
  const double avgStepsPerHalfCycle = (double)s.totalSteps / (double)s.zeroCrossings;
  return (avgStepsPerHalfCycle * s.dtFloat) * s.freqHz * kPi;
}

extern "C" int soemdsp_archimedes_version() { return 2; }