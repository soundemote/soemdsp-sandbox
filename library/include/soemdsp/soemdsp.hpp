// soemdsp-sandbox shared header-only library (freestanding native_modules).
//
// Include path: library/include
// Usage:  #include <soemdsp/soemdsp.hpp>
//
// Canonical nested namespaces (matching soemdsp):
//   soemdsp::constant -- kPI/kTAU/...
//   soemdsp::debug    -- safe / is_bad / is_nan / default_if_*
//   soemdsp::math     -- clamp/wrap/lerp/... poly_blep, midi_hz, pan, one_pole, edges, soft_clip, ...
//                        seed_mix / seed_to_rng_state (math/seed.h, per-module Seed streams)
// Flat soemdsp_maths:: remains a compatibility mirror for older modules.
//
// Domain layout under library/include/soemdsp/:
//   constant/  debug/  math/  nonlinearity/  dynamics/  trigger/
//   musical/  utility/  filter/  additive/  modulator/
#pragma once

#include <soemdsp/constant/constant.h>
#include <soemdsp/debug/debug.h>
#include <soemdsp/math/scalar_helpers.h>
#include <soemdsp/math/noise.h>
#include <soemdsp/math/seed.h>
#include <soemdsp/math/poly_blep.h>
#include <soemdsp/math/midi_hz.h>
#include <soemdsp/math/exp_log.h>
#include <soemdsp/math/phasor.h>
#include <soemdsp/dynamics/dynamics.h>
#include <soemdsp/trigger/trigger.h>
#include <soemdsp/nonlinearity/nonlinearity.h>
#include <soemdsp/utility/graph.h>
#include <soemdsp/math/analog_filter_trig.h>
#include <soemdsp/math/pan.h>
#include <soemdsp/filter/scientific_iir.h>
#include <soemdsp/additive/additive_yellow_graph.h>
#include <soemdsp/musical/musical_pitch.h>
#include <soemdsp/musical/polyphony_voices.h>
#include <soemdsp/dynamics/silence_detector.h>
#include <soemdsp/modulator/vibrato_generator.h>