// Sandbox Native Module Maths -- unit-interval phasor helpers.
// Phase lives in [0, 1). Increment is cycles per sample (freqHz / sampleRate,
// or a normalized frequency that already equals that ratio).
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

// Advance and wrap a [0,1) phase by `increment` cycles.
static inline double phase_advance_wrap01(double phase, double increment) {
  return wrap01(phase + increment);
}

// Hz → cycles/sample. Returns 0 for non-finite / non-positive rates.
static inline double hz_to_increment(double freqHz, double sampleRate) {
  const double sr = safe(sampleRate);
  if (!(sr > 0.0)) return 0.0;
  const double f = safe(freqHz);
  if (!(f > 0.0)) return 0.0;
  return f / sr;
}

// Pitched frequency helper (0.1 V/Oct): f * 2^(cv / 0.1) style is module-local;
// this only clamps a positive Hz to (0, Nyquist].
static inline double clamp_hz_nyquist(double freqHz, double sampleRate) {
  const double sr = safe(sampleRate);
  if (!(sr > 0.0)) return 0.0;
  double f = safe(freqHz);
  if (f < 0.0) f = 0.0;
  const double nyq = sr * 0.5;
  if (f > nyq) f = nyq;
  return f;
}

}  // namespace soemdsp_maths
