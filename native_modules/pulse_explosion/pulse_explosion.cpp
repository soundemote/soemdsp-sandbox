// soemdsp-native-module: pulse_explosion
// soemdsp-native-label: Pulse Explosion
// soemdsp-native-target: pulseExplosion
// soemdsp-native-kind: generator
//
// On a rising-edge trigger (input crosses above 0.5, the standard trigger
// threshold used elsewhere in this codebase), schedules a burst of single-
// sample pulses distributed over [startTime, endTime], concentrated around
// centerTime. Each subsequent sample checks whether a scheduled pulse's
// time has arrived and outputs its (randomized) amplitude for exactly one
// sample; otherwise outputs 0.
//
// Density shape: the same rational tension curve used throughout this
// project's filter work (rational_curve01(p, skew) = ((1+skew)*p) /
// (1-skew+2*skew*p)) applied to a raised-cosine ease
// (1 - (0.5 + 0.5*sin(((x-x1)/(x2-x1) - 0.5)*pi))), which eases from 1 at
// x1 down to 0 at x2. Calling that ease with (x1=centerTime, x2=startTime)
// on the left side and (x1=centerTime, x2=endTime) on the right side
// produces one shared tent shape peaking at exactly 1.0 at centerTime and
// tapering to 0 at both edges. timeSpread (0..1) maps to that curve's skew
// parameter (-0.99..0.99): 0 concentrates pulses tightly at centerTime, 1
// spreads them widely toward startTime/endTime -- measured empirically via
// the wasmtime verification harness, not assumed from the formula alone.
//
// N pulse times are drawn from that shape via rejection sampling (valid
// here specifically because the density's peak value is exactly 1.0): draw
// a candidate time uniformly in [startTime, endTime] and a uniform [0,1]
// roll, accept when roll < density(candidate). Accepted times are sorted
// and each gets an independently randomized amplitude in
// [lowAmplitude, highAmplitude].
//
// seed: the module's saved Seed (0..16777215; 0 is an ordinary seed). The
// RNG is re-seeded from seed_mix(Seed, kSeedBurst) at the start of every
// burst, so the same Seed + same other parameters always produces the same
// pulse schedule. Nothing depends on the engine slot or creation order.

#include <soemdsp/math/scalar_helpers.h>
#include <soemdsp/math/seed.h>
#include <soemdsp/trigger/trigger.h>
using soemdsp_maths::clamp;
using soemdsp_maths::rational_curve01;
using soemdsp_maths::rising_edge_bool;
using soemdsp_maths::kPi;
using soemdsp_maths::kTwoPi;
using soemdsp_maths::kHalfPi;
using soemdsp_maths::seed_mix;
using soemdsp_maths::seed_param_u32;
using soemdsp_maths::seed_to_rng_state;

namespace {

// Fixed seed components (never reorder; append new parts at the end).
enum : unsigned int {
  kSeedBurst = 1u,  // per-burst schedule RNG
};

static const int kMaxInstances = 16;
static const int kMaxPulses = 128;
static const int kMaxRejectionAttempts = 200;

struct ScheduledPulse {
  double time;
  double amplitude;
};

struct PulseExplosionState {
  bool active;
  bool wasHigh;
  bool exploding;
  double elapsed;  // seconds since trigger
  int pulseCount;
  int nextPulseIndex;
  ScheduledPulse pulses[kMaxPulses];
  unsigned int rngState;
  double lastCurve;  // density(elapsed) at the most recent sample -- Curve output
};

static PulseExplosionState gPool[kMaxInstances];

static inline double nextUniform01(unsigned int* state) {
  unsigned int x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x;
  return (double)x / 4294967295.0;
}

// x must be in [0, pi/2] (we only ever call this with a small clamped
// argument range below, so a low-order polynomial is enough here).
static double dsp_sin_0_halfpi(double x) {
  const double x2 = x * x;
  return x * (1.0 + x2 * (-1.6666666666666667e-1 + x2 * (8.3333333333333329e-3 + x2 * (-1.9841269841269841e-4))));
}

// Full-range sin via quadrant folding, argument in radians, no domain
// restriction (matches this project's established dsp_sin pattern).
static double dsp_sin(double x) {
  double xi = (double)(long long)(x / kTwoPi);
  if (x / kTwoPi < xi) xi -= 1.0;
  double wrapped = x - kTwoPi * xi;
  double sign = 1.0;
  if (wrapped >= kPi) {
    wrapped -= kPi;
    sign = -1.0;
  }
  if (wrapped > kHalfPi) wrapped = kPi - wrapped;
  return sign * dsp_sin_0_halfpi(wrapped);
}

// Raised-cosine ease: 1 at x=x1, 0 at x=x2, smooth in between. x1/x2 order
// doesn't matter mathematically -- only which one is "1" vs "0".
static double raisedCosineEase(double x, double x1, double x2) {
  double span = x2 - x1;
  if (span > -1e-12 && span < 1e-12) return 0.5;
  double p = (x - x1) / span;
  p = clamp(p, 0.0, 1.0);
  return 1.0 - (0.5 + 0.5 * dsp_sin((p - 0.5) * kPi));
}

// The tent-shaped density, peaking at 1.0 at centerTime, tapering to 0 at
// startTime and endTime, skewed by `skew` (mapped from timeSpread).
static double pulseDensity(double t, double startTime, double centerTime, double endTime, double skew) {
  if (t <= startTime || t >= endTime) return 0.0;
  double ease = (t < centerTime)
    ? raisedCosineEase(t, centerTime, startTime)
    : raisedCosineEase(t, centerTime, endTime);
  return clamp(rational_curve01(ease, skew), 0.0, 1.0);
}

// xorshift32 state for one burst of the given Seed (never 0).
static inline unsigned int burstRngState(double seed) {
  return seed_to_rng_state(seed_mix(seed_param_u32(seed), kSeedBurst));
}

static void insertSorted(ScheduledPulse* pulses, int count, ScheduledPulse toInsert) {
  int i = count;
  while (i > 0 && pulses[i - 1].time > toInsert.time) {
    pulses[i] = pulses[i - 1];
    i--;
  }
  pulses[i] = toInsert;
}

}  // namespace

extern "C" int soemdsp_pulse_explosion_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PulseExplosionState& s = gPool[i];
      s.wasHigh = false;
      s.exploding = false;
      s.elapsed = 0.0;
      s.pulseCount = 0;
      s.nextPulseIndex = 0;
      s.rngState = burstRngState(0.0);  // re-seeded from the Seed on every burst
      s.lastCurve = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pulse_explosion_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_pulse_explosion_sample(
  int handle,
  double trigger,
  double startTime,
  double centerTime,
  double endTime,
  double timeSpread,   // 0..1: 0 = tightly concentrated at centerTime, 1 = widely spread
  int numberOfPulses,
  double lowAmplitude,
  double highAmplitude,
  double seed,          // module Seed; every burst re-seeds from it (0 is a normal seed)
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PulseExplosionState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double safeStart = startTime < 0.0 ? 0.0 : startTime;
  double safeCenter = clamp(centerTime, safeStart, endTime > safeStart ? endTime : safeStart + 0.001);
  double safeEnd = endTime > safeStart ? endTime : safeStart + 0.001;
  if (safeCenter <= safeStart) safeCenter = safeStart + 1e-6;
  if (safeCenter >= safeEnd) safeCenter = safeEnd - 1e-6;
  // 0..1 spread -> -0.99..0.99 skew (measured: skew near -1 concentrates
  // tightly at centerTime, skew near +1 spreads widely toward the edges).
  const double skew = -0.99 + 1.98 * clamp(timeSpread, 0.0, 1.0);
  const int safeCount = numberOfPulses < 1 ? 1 : (numberOfPulses > kMaxPulses ? kMaxPulses : numberOfPulses);
  const double lo = lowAmplitude < highAmplitude ? lowAmplitude : highAmplitude;
  const double hi = lowAmplitude < highAmplitude ? highAmplitude : lowAmplitude;

  const bool high = trigger > 0.5;
  if (rising_edge_bool(high, &s.wasHigh)) {
    // Rising edge: schedule a fresh burst.
    s.pulseCount = 0;
    s.nextPulseIndex = 0;
    s.elapsed = 0.0;
    s.exploding = true;
    s.rngState = burstRngState(seed);

    for (int i = 0; i < safeCount; i++) {
      double chosenTime = safeCenter;
      bool accepted = false;
      for (int attempt = 0; attempt < kMaxRejectionAttempts; attempt++) {
        double candidate = safeStart + (safeEnd - safeStart) * nextUniform01(&s.rngState);
        double roll = nextUniform01(&s.rngState);
        double density = pulseDensity(candidate, safeStart, safeCenter, safeEnd, skew);
        if (roll < density) {
          chosenTime = candidate;
          accepted = true;
          break;
        }
      }
      (void)accepted;  // falls back to safeCenter if rejection sampling ran dry

      ScheduledPulse pulse;
      pulse.time = chosenTime;
      pulse.amplitude = lo + (hi - lo) * nextUniform01(&s.rngState);
      insertSorted(s.pulses, s.pulseCount, pulse);
      s.pulseCount++;
    }
  }

  double output = 0.0;
  if (s.exploding) {
    if (s.nextPulseIndex < s.pulseCount && s.elapsed >= s.pulses[s.nextPulseIndex].time) {
      output = s.pulses[s.nextPulseIndex].amplitude;
      s.nextPulseIndex++;
    }
    s.elapsed += 1.0 / safeRate;
    if (s.nextPulseIndex >= s.pulseCount && s.elapsed > safeEnd) {
      s.exploding = false;
    }
  }

  // Curve output: the same density shape shown in the node's display,
  // sampled at the current position in the burst -- 0 outside [start, end]
  // or before any trigger has fired. Lets the shape be patched elsewhere.
  s.lastCurve = pulseDensity(s.elapsed, safeStart, safeCenter, safeEnd, skew);

  return output;
}

// Accessor for the Curve output (see soemdsp_pulse_explosion_sample's
// lastCurve comment above). Follows this codebase's established pattern for
// native modules with more than one output (compare soemdsp_pll_vco_out
// etc.): the main _sample call updates state, secondary outputs are read via
// a dedicated query function.
extern "C" double soemdsp_pulse_explosion_curve(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastCurve;
}

extern "C" int soemdsp_pulse_explosion_version() {
  return 1;
}
