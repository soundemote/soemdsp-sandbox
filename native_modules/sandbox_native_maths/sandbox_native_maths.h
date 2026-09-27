// Sandbox Native Module Maths -- shared inline helpers for native_modules/*.cpp.
//
// Every native module compiles standalone (single .cpp -> .wasm, -nostdlib,
// no linker step across modules), so this is a header-only library: each
// module #includes this file and gets its own inlined copies at compile
// time. There is no .cpp/object file to build or link here.
//
// Canonical nested namespaces (matching soemdsp):
//   soemdsp::constant -- kPI/kTAU/kInvTAU/kInvPI/kPIz2/kPIz4/k4zPI/k1z*/kPHI/kPlanck/kTauOver44100 (+ compat aliases)
//   soemdsp::debug    -- safe / is_bad / is_nan / default_if_zero / default_if_near_zero
//   soemdsp::math     -- clamp/wrap/lerp/map*/morph_width01/sqrt_newton/xorshift32, midi_to_hz/hz_to_midi, pan_gains, soft_clip_*, one_pole_*, poly_blep/poly_blamp, rising_edge*/rational_curve*/expo_skew01/db_to_amp, ...
// Flat soemdsp_maths:: remains a compatibility mirror for older modules.
//
// Topic files:
//   constant.h          -- soemdsp::constant trig/phi/reciprocals/planck/kTauOver44100 (+ soemdsp_maths mirror)
//   debug.h             -- soemdsp::debug sanitize / bad-float / default_if_zero / default_if_near_zero
//   scalar_helpers.h    -- soemdsp::math clamp/wrap/lerp/map*/rational_curve*/morph_width01/floor + soemdsp_maths mirror
//   poly_blep.h         -- soemdsp::math::poly_blep / poly_blamp
//   midi_hz.h           -- soemdsp::math::midi_to_hz / hz_to_midi (A4=440)
//   pan.h               -- soemdsp::math::pan_gains (equal-power)
//   exp_log.h           -- general-purpose exp()/ln() + db_to_amp/amp_to_db + expo_skew01 (no libm)
//   phasor.h            -- unit-interval phase advance / Hz→increment
//   dynamics.h          -- one_pole_coeff / one_pole_coeff_hz / one_pole_step
//   trigger.h           -- rising_edge/falling_edge/change_edge/rising_edge_bool
//   nonlinearity.h      -- saturating soft-clip tanh_approx + soft_clip_* + ladder clip
//   graph.h             -- breakpoint X/Y graph (ported from soemdsp::utility::Graph)
//   analog_filter_trig.h -- sin/cos/2^x + turns-domain / joint fast trig
//   scientific_iir.h     -- classical IIR cascade (Butterworth/LR/Bessel/Cheby/Elliptic)
//
// Add a new helper to whichever topic file it belongs to (or a new topic
// file, included below) only once it's confirmed byte-for-byte identical
// across at least two modules -- module-specific DSP stays local to its
// own .cpp.
#pragma once

#include "constant.h"
#include "debug.h"
#include "scalar_helpers.h"
#include "poly_blep.h"
#include "midi_hz.h"
#include "exp_log.h"
#include "phasor.h"
#include "dynamics.h"
#include "trigger.h"
#include "nonlinearity.h"
#include "graph.h"
#include "analog_filter_trig.h"
#include "pan.h"
#include "scientific_iir.h"
#include "additive_yellow_graph.h"
#include "musical_pitch.h"
#include "polyphony_voices.h"
#include "silence_detector.h"
#include "vibrato_generator.h"