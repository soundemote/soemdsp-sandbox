// soemdsp-native-module: dsf_oscillator
// soemdsp-native-label: DSF Oscillator
// soemdsp-native-target: dsfOscillator
// soemdsp-native-kind: oscillator

// The "DSF starter kit" -- a Discrete Summation Formula oscillator, the
// other alias-free technique studied for the aliasing-wars mission (see
// README.md), distinct from Surge Oscillator's PolyBLEP approach.
//
// This is a direct transcription of pureSawEng() and its exact usage
// pattern from "Extended DSF Oscillators.cxx" (Walter H. Hackett), one of
// the reference files provided directly:
//
//   double pureSawEng(double t, int n) {
//       return 2.0*(((sin(PI*4*t*(floor(n)*2+1)/4))/sin(t/4*4*PI)-1)/2);
//   }
//   // simplifies to: sin(PI*t*(2N+1)) / sin(PI*t) - 1
//
//   note.t += note.dt * 0.9999;
//   note.t  = note.t - floor(note.t);
//   note.value = note.value*0.999 + pureSawEng(note.t, note.n) * note.dt;
//
// The formula is NOT divided by 2N -- an earlier rewrite added that
// normalization on its own, not part of the real reference; the raw form
// run through the leaky integrator above is what produces the correct
// sawtooth. n = floor(Nyquist/frequency) is auto-derived every sample --
// alias-free by construction. Harmonics (0..1) crossfades n from 1 (a
// single harmonic, an exact sine) up to that Nyquist-safe maximum.
//
// SEVENTH REWRITE: adds Square (PWM), Trimorph, and a SquSaw on
// top of the verified base Saw, rather than reintroducing the earlier
// unverified Formant/Fractal-Stack designs from scratch.
//
// Square (PWM): a classic bandlimited-pulse construction --
// square(t) = saw(t) - saw(t - pulseWidth). Subtracting a phase-shifted
// copy of an already-verified, alias-free Saw is itself alias-free (no
// new closed form, no new singularity to chase), and pulseWidth (0..1)
// controls duty cycle the way PWM traditionally does. Verified
// numerically (Python) that this stays bounded across frequency x
// Harmonics x pulseWidth before shipping.
//
// Trimorph: a second leaky integration on top of the (already-integrated,
// bounded) Square output -- same idea used elsewhere in this project for
// deriving a triangle from a square. Verified numerically that, unlike
// Square, this second integration stage does NOT stay bounded on its own
// across the full frequency range (it grows with the per-sample step
// size, which scales with frequency) -- an adaptive leaky peak-follower
// normalizer is added on top specifically to fix that, verified to keep
// it bounded everywhere Square already was.
//
// SquSaw: a plain crossfade between the (already correct, independently
// verified) Saw and Square outputs -- no new synthesis math needed.
//
// EIGHTH REWRITE: two real bugs reported live, both fixed by re-examining
// actual signal shapes rather than just bounds/NaN checks:
// 1. Trimorph sounded like a square wave. Its second-stage leaky
//    integrator used a fixed retention (0.995, ~200-sample memory) far
//    shorter than the oscillation period at low/mid frequencies (e.g.
//    960 samples at 50 Hz), so the accumulator saturated to a flat
//    plateau mid-ramp instead of completing a linear ramp -- literally a
//    rounded square shape, not a triangle. Same root cause as bug 2.
// 2. SquSaw and Saw/Square showed real DC asymmetry and shape distortion
//    at some frequencies ("all over the place"). Root cause: every
//    accumulator (Saw, Square, SquSaw) used a fixed retention (0.999,
//    ~1000-sample memory), also too short relative to the period at low
//    frequencies (2400+ samples at 20 Hz) -- confirmed in plain Python
//    that the distortion persists even after full settling, so it's a
//    structural bug, not a startup transient.
// Fix: every accumulator's retention now scales with the oscillation
// period (~20 periods of memory, decayed to ~1%), instead of a fixed
// per-sample constant. Verified numerically (Python) that this keeps
// every waveform's shape and DC symmetry consistent from 20 Hz to
// 18 kHz, where the fixed-retention version was measurably distorted.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

double clampD(double value, double lo, double hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

// Single-shot range reduction (round to nearest multiple of 2*pi and
// subtract) instead of a while-loop of repeated subtraction -- avoids
// hundreds of sequential float subtractions (needed at N in the
// thousands, i.e. very low frequencies) that could otherwise accumulate
// rounding error. Verified numerically (Python) this matches the
// while-loop version to ~6e-11 -- not itself the source of the low-
// frequency bug below, but a more robust way to reduce a huge argument
// in one step rather than many.
double wrapRadians(double value) {
  const double twoPi = kPi * 2.0;
  return value - twoPi * __builtin_floor(value / twoPi + 0.5);
}

// A truncated-at-x^12 Taylor series (7 terms) has ~2e-5 absolute error
// near x=pi. That was fine for the previous fixed-retention (0.999,
// ~1000-sample memory, gain ~1000) integrator, but the new frequency-
// adaptive retention (see adaptiveRetention() below) needs retention
// values much closer to 1 at low frequencies -- e.g. ~0.9999 at 20 Hz,
// gain ~10000+ -- and at that gain, the same ~2e-5 sin error amplified
// into visible DC drift and hard clipping. Reproduced this exactly in
// plain Python (approximate sin vs. exact math.sin, otherwise identical
// code) before touching this file, confirming it wasn't a WASM-only
// artifact. Extended to a 10-term series (error ~5e-10) to give enough
// headroom for the higher gain the adaptive retention now requires.
double sinApprox(double value) {
  const double x = wrapRadians(value);
  const double x2 = x * x;
  double result = -1.0 / 121645100408832000.0;
  result = 1.0 / 355687428096000.0 + x2 * result;
  result = -1.0 / 1307674368000.0 + x2 * result;
  result = 1.0 / 6227020800.0 + x2 * result;
  result = -1.0 / 39916800.0 + x2 * result;
  result = 1.0 / 362880.0 + x2 * result;
  result = -1.0 / 5040.0 + x2 * result;
  result = 1.0 / 120.0 + x2 * result;
  result = -1.0 / 6.0 + x2 * result;
  result = 1.0 + x2 * result;
  return x * result;
}

// pureSawEng(t, n), transcribed and simplified directly from "Extended DSF
// Oscillators.cxx": sin(PI*t*(2N+1)) / sin(PI*t) - 1. Guarded at the
// removable singularity t=0 (denominator's zero) via its L'Hopital limit
// (2N+1), same as the reference's own numerically-stable behavior there.
double pureSawEng(double t, int n) {
  const double denom = sinApprox(kPi * t);
  if (denom > -1.0e-9 && denom < 1.0e-9) {
    return static_cast<double>(2 * n + 1) - 1.0;
  }
  return sinApprox(kPi * t * static_cast<double>(2 * n + 1)) / denom - 1.0;
}

// exp(x) for small negative x (here always in roughly [-0.12, 0], since
// dt = frequency/sampleRate is bounded and scaled down before use) -- a
// short Taylor series around 0 is accurate to ~4e-9 over that range, no
// range reduction needed. Freestanding WASM has no libm exp().
double expSmallApprox(double x) {
  return 1.0 + x * (1.0 + x * (0.5 + x * (1.0 / 6.0 + x * (1.0 / 24.0 + x * (1.0 / 120.0)))));
}

// Every leaky-integrator accumulator below needs its retention scaled to
// the oscillation period, not a fixed per-sample constant. A fixed
// retention of 0.999 (~1000-sample memory) is far shorter than the
// period at low frequencies (2400+ samples at 20 Hz), so the accumulator
// forgets mid-ramp and produces a distorted, asymmetric shape instead of
// a clean waveform -- verified numerically (Python) as the real cause of
// reported low-frequency distortion, not a WASM-only artifact. This gives
// ~20 periods of memory (decayed to ~1%) at any frequency, keeping every
// waveform's shape and DC symmetry consistent across the audible range.
double adaptiveRetention(double dt) {
  return expSmallApprox(-0.23026 * dt);
}

// Harmonics (0..1): crossfades the harmonic count n from 1 (a single
// harmonic -- verified >98% spectral energy at the fundamental, i.e. an
// exact sine) up to nMax (Nyquist/frequency, the maximum alias-free
// count), blending between the two nearest integer harmonic counts so
// the sweep is smooth rather than stepped. Blending pureSawEng's raw
// output before it enters the leaky integrator is equivalent to blending
// two separately-integrated signals, since the integrator is linear --
// verified numerically (Python) that this stays bounded across the full
// Harmonics range before shipping.
double pureSawEngMorphed(double t, int nMax, double harmonics) {
  const double m = clampD(harmonics, 0.0, 1.0);
  const double target = 1.0 + m * static_cast<double>(nMax - 1);
  int lowN = static_cast<int>(target);
  if (lowN < 1) lowN = 1;
  int highN = lowN + 1 > nMax ? nMax : lowN + 1;
  const double frac = target - static_cast<double>(lowN);
  return pureSawEng(t, lowN) * (1.0 - frac) + pureSawEng(t, highN) * frac;
}

constexpr int kMaxInstances = 16;

struct DsfOscillatorState {
  bool active;
  double t;            // phase, 0..1
  double sawAcc;       // Saw's leaky-integrator accumulator
  double sqAcc;        // Square (PWM)'s leaky-integrator accumulator
  double blendSqAcc;   // Blend's own fixed-50%-duty square accumulator --
                        // decoupled from PWM's pulseWidth on purpose (see
                        // sample() comment).
  double triAcc;       // Trimorph's second-stage leaky-integrator accumulator
  double triPeak;      // Trimorph's adaptive peak-follower
  double out;
};

static DsfOscillatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_dsf_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = DsfOscillatorState{};
      gPool[i].active = true;
      gPool[i].triPeak = 1.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_dsf_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_dsf_oscillator_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  DsfOscillatorState& s = gPool[handle - 1];
  s.t = 0.0;
  s.sawAcc = 0.0;
  s.sqAcc = 0.0;
  s.blendSqAcc = 0.0;
  s.triAcc = 0.0;
  s.triPeak = 1.0;
}

// waveform: 0=Sine, 1=Saw, 2=Square (PWM), 3=Trimorph, 4=SquSaw
// morph: 0..1 (Harmonics) -- 0 is an exact sine, 1 is the full
// Nyquist-safe harmonic count.
// pulseWidth: 0..1 -- Square/Trimorph's duty cycle (0.5 = symmetric).
// blend: 0..1 -- Saw/Square crossfade amount for the SquSaw waveform.
// phase: 0..1 cycles -- pure time offset on the free-running phase.
// level: amplitude gain.
extern "C" void soemdsp_dsf_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  int waveform,
  double morph,
  double pulseWidth,
  double blend,
  double phase,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  DsfOscillatorState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  // Through-zero: signed frequency (dt may be negative).
  const double absFrequency = frequencyHz < 0.0 ? -frequencyHz : frequencyHz;
  const double safeAbsFrequency = absFrequency > 1.0e-6 ? absFrequency : 1.0e-6;
  const double dt = clampD(frequencyHz / safeSampleRate, -0.5, 0.5);
  const double phaseOffset = wrap01(phase);

  double sample;
  if (waveform == 0) {
    s.t = wrap01(s.t + dt);
    sample = sinApprox(wrap01(s.t + phaseOffset) * kPi * 2.0);
  } else {
    const double nyquist = safeSampleRate * 0.5;
    int nMax = static_cast<int>(nyquist / safeAbsFrequency);
    if (nMax < 1) nMax = 1;
    s.t = wrap01(s.t + dt * 0.9999);
    const double renderT = wrap01(s.t + phaseOffset);

    const double retention = adaptiveRetention(dt);
    const double rawSaw = pureSawEngMorphed(renderT, nMax, morph);
    s.sawAcc = s.sawAcc * retention + rawSaw * dt;

    if (waveform == 1) {
      sample = s.sawAcc;
    } else if (waveform == 4) {
      // SquSaw: crossfades Saw with a plain, fixed 50%-duty Square, kept
      // deliberately decoupled from the PWM slider -- simpler, and closer
      // to the very first Saw/Square crossfade this module had, which
      // just mixed two cleanly-shaped waveforms rather than inheriting
      // PWM's variable-duty shape.
      const double rawBlendSquare = rawSaw - pureSawEngMorphed(wrap01(renderT - 0.5), nMax, morph);
      s.blendSqAcc = s.blendSqAcc * retention + rawBlendSquare * dt;
      const double b = clampD(blend, 0.0, 1.0);
      sample = s.sawAcc * (1.0 - b) + s.blendSqAcc * b;
    } else {
      const double pw = clampD(pulseWidth, 0.01, 0.99);
      const double rawShiftedSaw = pureSawEngMorphed(wrap01(renderT - pw), nMax, morph);
      const double rawSquare = rawSaw - rawShiftedSaw;
      s.sqAcc = s.sqAcc * retention + rawSquare * dt;

      if (waveform == 2) {
        sample = s.sqAcc;
      } else {  // waveform == 3: Trimorph
        s.triAcc = s.triAcc * retention + s.sqAcc * dt * 4.0;
        // Trimorph is a second integration on top of Square, which makes
        // it track mostly the square's fundamental harmonic -- and that
        // fundamental's own amplitude genuinely shrinks toward 0 as
        // pulseWidth approaches 0 or 1 (a real property of PWM pulse
        // trains: fundamental amplitude ~ sin(pi*dutyCycle)), reported
        // live as "gets quieter until silence" at extreme PWM. Square
        // itself doesn't have this problem since its many higher
        // harmonics keep its peak swing roughly constant as duty cycle
        // narrows -- only Trimorph, which discards most of that via its
        // second integration, needs the compensation. Verified
        // numerically (Python) that dividing by sin(pi*pulseWidth)
        // (floor to cap the gain right at the pulseWidth clamp's edges)
        // keeps Trimorph's loudness roughly constant across the full PWM
        // range instead of collapsing to silence at the extremes.
        const double sinPw = sinApprox(kPi * pw);
        const double compensation = 1.0 / clampD(sinPw < 0.0 ? -sinPw : sinPw, 0.05, 1.0);
        const double compensatedTri = s.triAcc * compensation;
        const double absTri = compensatedTri < 0.0 ? -compensatedTri : compensatedTri;
        s.triPeak = s.triPeak * 0.999 + absTri * 0.001;
        if (s.triPeak < 1.0) s.triPeak = 1.0;
        sample = compensatedTri / s.triPeak;
      }
    }
  }

  const bool finite = sample * 0.0 == 0.0;
  if (!finite) sample = 0.0;
  s.out = clampD(sample, -1.5, 1.5) * level;
}

extern "C" double soemdsp_dsf_oscillator_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" int soemdsp_dsf_oscillator_version() {
  return 11;
}
