// Shared offline JS mirror of native_modules/dsf_oscillator -- the DSF
// starter kit. See dsf_oscillator.cpp for the full derivation and design
// notes. SEVENTH REWRITE: adds Square (PWM), Trimorph, and a Saw/Square
// SquSaw on top of the verified base Saw + Harmonics.
//
// Square (PWM): square(t) = saw(t) - saw(t - pulseWidth). Subtracting a
// phase-shifted copy of an already-verified, alias-free Saw is itself
// alias-free -- no new closed form, no new singularity to chase.
// Trimorph: a second leaky integration on top of the (already bounded)
// Square output, with an adaptive peak-follower on top since -- unlike
// Square -- this second stage doesn't stay bounded on its own across the
// full frequency range (verified numerically before shipping).
// SquSaw: a plain crossfade between Saw and a fixed 50%-duty Square, kept
// deliberately decoupled from the PWM slider -- reported live as sounding
// "triangle-like" when it inherited PWM's variable duty cycle; simplified
// back to always crossfading two cleanly-shaped waveforms instead.
//
// EIGHTH REWRITE: every accumulator's retention now scales with the
// oscillation period (~20 periods of memory) instead of a fixed per-
// sample constant -- a fixed retention was far shorter than the period
// at low frequencies, so accumulators forgot mid-ramp and produced
// distorted, asymmetric shapes (Trimorph sounding like a square wave;
// DC asymmetry in Saw/Square/SquSaw). See dsf_oscillator.cpp for the full
// story.

function createNodeGraphDsfOscillatorState() {
  return { t: 0, sawAcc: 0, sqAcc: 0, blendSqAcc: 0, triAcc: 0, triPeak: 1 };
}

// ~20 periods of memory, decayed to ~1%.
function nodeGraphDsfAdaptiveRetention(dt) {
  return Math.exp(-0.23026 * dt);
}

// pureSawEng(t, n), transcribed and simplified directly from "Extended DSF
// Oscillators.cxx": sin(PI*t*(2N+1)) / sin(PI*t) - 1. Guarded at the
// removable singularity t=0 via its L'Hopital limit (2N+1).
function nodeGraphDsfPureSawEng(t, n) {
  const denom = Math.sin(Math.PI * t);
  if (denom > -1e-9 && denom < 1e-9) return (2 * n + 1) - 1;
  return Math.sin(Math.PI * t * (2 * n + 1)) / denom - 1;
}

// Harmonics (0-1): crossfades the harmonic count from 1 (a single
// harmonic, an exact sine) up to nMax (Nyquist/frequency).
function nodeGraphDsfPureSawEngMorphed(t, nMax, morph) {
  const m = clampNodeSliderValue(Number(morph) || 0, 0, 1);
  const target = 1 + m * (nMax - 1);
  const lowN = Math.max(1, Math.floor(target));
  const highN = Math.min(lowN + 1, nMax);
  const frac = target - lowN;
  return nodeGraphDsfPureSawEng(t, lowN) * (1 - frac) + nodeGraphDsfPureSawEng(t, highN) * frac;
}

// Shared stdlib (node-graph-phasor-helpers.js).
function nodeGraphDsfWrap01(x) {
  return nodeGraphWrap01(x);
}

// options: { frequencyHz, sampleRate, waveform (0=Sine,1=Saw,2=Square PWM,
//            3=Trimorph,4=SquSaw), morph (Harmonics, 0-1),
//            pulseWidth (0-1), blend (0-1), phase (cycles, 0-1), level }
function nodeGraphDsfOscillatorSample(state, options = {}) {
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const safeFrequency = Number(options.frequencyHz) > 1 ? Number(options.frequencyHz) : 1;
  const dt = clampNodeSliderValue((Number(options.frequencyHz) || 0) / sampleRate, -0.5, 0.5);
  const waveform = Math.round(Number(options.waveform) || 0);
  const phaseOffset = nodeGraphDsfWrap01(Number(options.phase) || 0);
  const level = Number(options.level) || 0;

  let sample;
  if (waveform === 0) {
    state.t = nodeGraphDsfWrap01(state.t + dt);
    // Phase is a pure time offset on the free-running cycle.
    sample = Math.sin(nodeGraphDsfWrap01(state.t + phaseOffset) * Math.PI * 2);
  } else {
    const nyquist = sampleRate * 0.5;
    const nMax = Math.max(1, Math.floor(nyquist / safeFrequency));
    state.t = nodeGraphDsfWrap01(state.t + dt * 0.9999);
    const renderT = nodeGraphDsfWrap01(state.t + phaseOffset);

    const retention = nodeGraphDsfAdaptiveRetention(dt);
    const rawSaw = nodeGraphDsfPureSawEngMorphed(renderT, nMax, options.morph);
    state.sawAcc = state.sawAcc * retention + rawSaw * dt;

    if (waveform === 1) {
      sample = state.sawAcc;
    } else if (waveform === 4) {
      const rawBlendSquare = rawSaw - nodeGraphDsfPureSawEngMorphed(nodeGraphDsfWrap01(renderT - 0.5), nMax, options.morph);
      state.blendSqAcc = state.blendSqAcc * retention + rawBlendSquare * dt;
      const blend = clampNodeSliderValue(Number(options.blend) ?? 0.5, 0, 1);
      sample = state.sawAcc * (1 - blend) + state.blendSqAcc * blend;
    } else {
      const pw = clampNodeSliderValue(Number(options.pulseWidth) ?? 0.5, 0.01, 0.99);
      const rawShiftedSaw = nodeGraphDsfPureSawEngMorphed(nodeGraphDsfWrap01(renderT - pw), nMax, options.morph);
      const rawSquare = rawSaw - rawShiftedSaw;
      state.sqAcc = state.sqAcc * retention + rawSquare * dt;

      if (waveform === 2) {
        sample = state.sqAcc;
      } else {
        state.triAcc = state.triAcc * retention + state.sqAcc * dt * 4;
        // Compensate for the fundamental's own amplitude shrinking toward
        // 0 as pulseWidth approaches 0 or 1 (Trimorph mostly tracks
        // Square's fundamental, whose amplitude ~ sin(pi*pulseWidth)) --
        // reported live as Trimorph going quiet toward silence at extreme
        // PWM. Square itself doesn't need this (its higher harmonics keep
        // its peak swing roughly constant as duty cycle narrows).
        const compensation = 1 / clampNodeSliderValue(Math.abs(Math.sin(Math.PI * pw)), 0.05, 1);
        const compensatedTri = state.triAcc * compensation;
        state.triPeak = Math.max(1, state.triPeak * 0.999 + Math.abs(compensatedTri) * 0.001);
        sample = compensatedTri / state.triPeak;
      }
    }
  }

  if (!Number.isFinite(sample)) sample = 0;
  const out = clampNodeSliderValue(sample, -1.5, 1.5) * level;
  return { Out: out };
}
