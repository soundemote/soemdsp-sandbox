// Sandbox Native Module Maths -- shared inline helpers for native_modules/*.cpp.
//
// Every native module compiles standalone (single .cpp -> .wasm, -nostdlib,
// no linker step across modules), so this is a header-only library: each
// module #includes this file and gets its own inlined copies at compile
// time. There is no .cpp/object file to build or link here.
//
// Canonical nested namespaces (matching soemdsp):
//   soemdsp::debug  -- safe / is_bad / is_nan / default_if_zero
//   soemdsp::math   -- clamp, clamp01, clamp11, wrap01, poly_blep, poly_blamp, ...
// Flat soemdsp_maths:: remains a compatibility mirror for older modules.
//
// Topic files:
//   debug.h             -- soemdsp::debug sanitize / bad-float / default_if_zero
//   scalar_helpers.h    -- soemdsp::math clamp/clamp01/clamp11/wrap/floor + soemdsp_maths mirror
//   poly_blep.h         -- soemdsp::math::poly_blep / poly_blamp
//   exp_log.h           -- general-purpose exp()/ln() + dB↔lin polyfills (no libm)
//   phasor.h            -- unit-interval phase advance / Hz→increment
//   dynamics.h          -- one-pole coeff / step
//   trigger.h           -- rising/falling/change edges
//   nonlinearity.h      -- Pade tanh + ladder soft-clip
//   graph.h             -- breakpoint X/Y graph (ported from soemdsp::utility::Graph)
//   analog_filter_trig.h -- sin/cos/2^x + turns-domain / joint fast trig
//   scientific_iir.h     -- classical IIR cascade (Butterworth/LR/Bessel/Cheby/Elliptic)
//
// Add a new helper to whichever topic file it belongs to (or a new topic
// file, included below) only once it's confirmed byte-for-byte identical
// across at least two modules -- module-specific DSP stays local to its
// own .cpp.
#pragma once

#include "debug.h"
#include "scalar_helpers.h"
#include "poly_blep.h"
#include "exp_log.h"
#include "phasor.h"
#include "dynamics.h"
#include "trigger.h"
#include "nonlinearity.h"
#include "graph.h"
#include "analog_filter_trig.h"
#include "scientific_iir.h"
#include "additive_yellow_graph.h"
#include "musical_pitch.h"
#include "polyphony_voices.h"
#include "silence_detector.h"
#include "vibrato_generator.h"