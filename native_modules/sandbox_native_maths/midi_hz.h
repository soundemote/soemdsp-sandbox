// Sandbox Native Module Maths -- MIDI note <-> Hz (A4=440, MIDI 69).
// Nested soemdsp::math::midi_to_hz / hz_to_midi.
#pragma once

#include "constant.h"
#include "exp_log.h"
#include "analog_filter_trig.h"

namespace soemdsp::math {

// A4 = 440 Hz at MIDI 69: 440 * 2^((midi-69)/12)
static inline double midi_to_hz(double midi) {
  return soemdsp::constant::kA440 * soemdsp_maths::dsp_exp2((midi - 69.0) / 12.0);
}

// Inverse. Nonpositive / non-finite Hz floored to 1e-12 (softwave practice).
static inline double hz_to_midi(double hz) {
  double f = hz;
  if (!(f > 1.0e-12)) f = 1.0e-12;
  return 69.0 + 12.0 * soemdsp_maths::dsp_ln(f / soemdsp::constant::kA440)
         * soemdsp::constant::k1zLN2;
}

}  // namespace soemdsp::math

namespace soemdsp_maths {
using soemdsp::math::midi_to_hz;
using soemdsp::math::hz_to_midi;
}  // namespace soemdsp_maths
