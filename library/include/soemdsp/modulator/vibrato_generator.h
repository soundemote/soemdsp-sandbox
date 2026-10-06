// Sandbox port of soemdsp::modulator::VibratoGenerator (VibratoGenerator.hpp).
// Cheap sine via dsp_sin_turns_lut (same half-sine wavetable as Additive / SinCos).
// Shared by the Vibrato Generator module and Hypersaw per-saw LFOs.
#pragma once

#include <soemdsp/math/analog_filter_trig.h>
#include <soemdsp/math/phasor.h>
#include <soemdsp/math/scalar_helpers.h>
#include <soemdsp/math/seed.h>

namespace soemdsp_vibrato {

struct VibratoGenState {
  double phase;          // 0…1 turns
  double heldFreq;       // S&H bipolar (−1…+1), scales increment
  double heldAmp;        // S&H bipolar (−1…+1), scales output
  double targetFreq;
  double targetAmp;
  unsigned int rng;
  double lastPhaseOffset; // detect Offset changes for soft reset
};

static inline unsigned int vib_xorshift(unsigned int& state) {
  // Preserve vib dead-zero seed (0xA341316C); core shift lives in soemdsp::math.
  if (!state) state = 0xA341316Cu;
  return soemdsp::math::xorshift32(state);
}

static inline double vib_random_bipolar(unsigned int& state) {
  return (static_cast<double>(vib_xorshift(state) >> 8) * (1.0 / 16777216.0)) * 2.0 - 1.0;
}

// seed: any uint32, 0 included (callers pass seed_mix(Seed, part, voice)).
// Hashed to a nonzero xorshift32 state, so 0 and 1 are distinct streams.
static inline void vibrato_gen_seed(VibratoGenState& s, unsigned int seed) {
  s.rng = soemdsp::math::seed_to_rng_state(seed);
  s.heldFreq = 0.0;
  s.heldAmp = 0.0;
  s.targetFreq = 0.0;
  s.targetAmp = 0.0;
}

static inline void vibrato_gen_reset(VibratoGenState& s, double phaseOffset) {
  const double po = soemdsp_maths::safe(phaseOffset);
  s.phase = soemdsp_maths::wrap01(po);
  s.lastPhaseOffset = po;
  s.heldFreq = 0.0;
  s.heldAmp = 0.0;
  s.targetFreq = 0.0;
  s.targetAmp = 0.0;
}

static inline void vibrato_gen_trigger_hold(VibratoGenState& s) {
  s.targetFreq = vib_random_bipolar(s.rng);
  s.targetAmp = vib_random_bipolar(s.rng);
}

// One sample. Returns bipolar ≈ −1…+1 (before host Amplitude).
// Matches VibratoGenerator::run(): phase += inc*(1+randFrq); out = sin*(1+randAmp).
// morph reserved (0 = pure sine wavetable).
static inline double vibrato_gen_sample(
  VibratoGenState& s,
  double increment,       // cycles/sample
  double phaseOffset,     // LFO phase offset (turns); applied as display bias only when reset
  double /*morph*/,
  double randomFreqMult,
  double randomAmpMult
) {
  const double inc = soemdsp_maths::safe(increment);
  const double rf = soemdsp_maths::safe(randomFreqMult);
  const double ra = soemdsp_maths::safe(randomAmpMult);
  const double po = soemdsp_maths::safe(phaseOffset);

  // Soft-follow Offset jumps (user twiddling Phase Offset).
  if (!(po == s.lastPhaseOffset)) {
    const double delta = po - s.lastPhaseOffset;
    s.phase = soemdsp_maths::wrap01(s.phase + delta);
    s.lastPhaseOffset = po;
  }

  // Smooth S&H toward targets (period ≈ 1/inc when inc>0).
  double smooth = 0.0;
  if (inc > 1.0e-12) {
    smooth = inc;
    if (smooth > 1.0) smooth = 1.0;
  }
  s.heldFreq += (s.targetFreq - s.heldFreq) * smooth;
  s.heldAmp += (s.targetAmp - s.heldAmp) * smooth;

  const double randFrqOut = s.heldFreq * rf;
  const double randAmpOut = s.heldAmp * ra;

  double step = inc + inc * randFrqOut;
  s.phase += step;
  if (s.phase >= 1.0 || s.phase < 0.0) {
    s.phase = soemdsp_maths::wrap01(s.phase);
    vibrato_gen_trigger_hold(s);
  }

  // Cheap sine wavetable (turns domain).
  const double osc = soemdsp_maths::dsp_sin_turns_lut(s.phase);
  return osc * (1.0 + randAmpOut);
}

}  // namespace soemdsp_vibrato
