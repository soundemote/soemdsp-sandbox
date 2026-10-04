// soemdsp-native-module: filter_morph_oscillator
// soemdsp-native-label: FilterMorph Oscillator
// soemdsp-native-target: filterMorphOscillator
// soemdsp-native-kind: oscillator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/oscillator/PolyBLEP.hpp
//
// Same-phasor Morph: 0 = sine, 1 = PolyBLEP saw. Mix is of the two period
// functions, so sharpness is harmonic-number content, not a Hz cutoff.
// PolyBLEP only on the saw jump. No lowpass, no Poles.

#include <stdint.h>

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 64;

struct FilterMorphState {
  bool active;
  double phase;
  double lastReset;
};

static FilterMorphState gPool[kMaxInstances];

static double wrap01_phase(double x) {
  return wrap01(x);
}

// Same residual family as PolyBLEP module Saw: naive falling saw + poly_blep.
static double polyblep_saw(double phaseCycle, double increment) {
  const double ph = wrap01_phase(phaseCycle);
  double dt = increment < 0.0 ? -increment : increment;
  if (dt < 1.0e-12) {
    return 1.0 - ph * 2.0;
  }
  if (dt > 0.5) dt = 0.5;
  return 1.0 - ph * 2.0 + poly_blep(ph, increment);
}

static double process_one(
  FilterMorphState& s,
  double frequencyHz,
  double sampleRate,
  double morph,
  double phaseOffset,
  double amplitude,
  bool doReset
) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = (frequencyHz * 0.0 == 0.0) ? frequencyHz : 0.0;
  const double increment = f / rate;
  const double po = wrap01_phase(phaseOffset);

  if (doReset) {
    s.phase = 0.0;
  }

  s.phase = wrap01_phase(s.phase + increment);
  const double ph = wrap01_phase(s.phase + po);

  double m = morph;
  if (!(m == m) || m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;

  const double sine = dsp_sin_turns_lut(ph);
  const double saw = polyblep_saw(ph, increment);
  const double y = sine * (1.0 - m) + saw * m;

  double gain = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  if (gain < 0.0) gain = 0.0;
  return y * gain;
}

}  // namespace

extern "C" int soemdsp_filter_morph_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FilterMorphState& s = gPool[i];
      s.phase = 0.0;
      s.lastReset = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_filter_morph_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_filter_morph_oscillator_reset(int handle, double phaseOffset) {
  if (handle < 1 || handle > kMaxInstances) return;
  FilterMorphState& s = gPool[handle - 1];
  if (!s.active) return;
  (void)phaseOffset;
  s.phase = 0.0;
}

extern "C" double soemdsp_filter_morph_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double morph,
  double phaseOffset,
  double amplitude,
  double reset
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  FilterMorphState& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  const double rv = (reset * 0.0 == 0.0) ? reset : 0.0;
  const bool hit = rv > 0.0 && s.lastReset <= 0.0;
  s.lastReset = rv;
  return process_one(s, frequencyHz, sampleRate, morph, phaseOffset, amplitude, hit);
}

extern "C" int soemdsp_filter_morph_oscillator_version() {
  return 2;
}
