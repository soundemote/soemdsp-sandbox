// Node Graph Standard Library -- pure phase / pitch primitives.
//
// No dependencies on nodeGraphMvp, clampNodeSliderValue, or worklet-only
// APIs. Safe to load:
//   - on the main thread (index.html) before oscillator / Jerobeam modules
//   - first in the AudioWorklet Blob assembly (nodeGraphLiveWorkletSourceFiles)
//
// Use these instead of re-copying wrap01 / trisaw / pitch (♯/♭) math into
// every port module.

/** Wrap any real into [0, 1). Matches native wrap01 / Jerobeam floor wrap. */
function nodeGraphWrap01(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) {
    return 0;
  }
  return v - Math.floor(v);
}

/**
 * Morphable triangle ↔ saw (Jerobeam / soemdsp trisaw).
 * warp 0 ≈ reverse saw, 0.5 = triangle, 1 ≈ forward saw.
 * Phase may be any real; it is wrapped to [0, 1) first.
 */
function nodeGraphTrisaw(phase, warp) {
  const wrapped = nodeGraphWrap01(phase);
  let safeWarp = Number(warp);
  if (!Number.isFinite(safeWarp)) {
    safeWarp = 0.5;
  }
  if (safeWarp < 0.001) {
    safeWarp = 0.001;
  } else if (safeWarp > 0.999) {
    safeWarp = 0.999;
  }
  return wrapped < safeWarp
    ? wrapped / safeWarp
    : (1 - wrapped) / (1 - safeWarp);
}

/**
 * pitch MIDI-note pitch tracking: baseHz * 2^((cv - reference) / 0.1).
 * CV is MIDI/120 (+0.1 = +1 octave). reference is pitchReferenceMidiNote/120
 * (default MIDI 69 → 0.575). Through-zero: baseHz may be negative.
 */
function nodeGraphPitchedFrequency(baseHz, pitchMidi = 0, referenceMidi = 69) {
  const base = Number(baseHz);
  if (!(base > 0) || !Number.isFinite(base)) return 0;
  const midi = Number(pitchMidi);
  const ref = Number(referenceMidi);
  const m = Number.isFinite(midi) ? midi : 0;
  const r = Number.isFinite(ref) ? ref : 69;
  const out = base * (2 ** ((m - r) / 12));
  return Number.isFinite(out) ? out : 0;
}

/**
 * Advance a free-running [0, 1) phasor by frequencyHz / sampleRate.
 * Through-zero: negative frequency reverses (phase decreases).
 * Rising-edge reset (reset > threshold while lastReset was low) zeros phase.
 *
 * state must be a mutable object; uses/creates:
 *   state.phase      number in [0, 1)
 *   state.lastReset  boolean edge memory
 *
 * Returns the new phase (also written to state.phase).
 */
function nodeGraphAdvancePhase01(state, frequencyHz, sampleRate, reset = 0, resetThreshold = 0.5) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  const threshold = Number.isFinite(Number(resetThreshold)) ? Number(resetThreshold) : 0.5;
  const resetActive = Number(reset) > threshold;
  if (resetActive && !state.lastReset) {
    state.phase = 0;
  }
  state.lastReset = resetActive;
  const freq = Number(frequencyHz);
  const safeFreq = Number.isFinite(freq) ? freq : 0;
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 1));
  state.phase = nodeGraphWrap01((nodeGraphFiniteNumber(state.phase)) + safeFreq / rate);
  return state.phase;
}

/**
 * Convenience: pitch-track then advance. Same state shape as nodeGraphAdvancePhase01.
 * pitchMidi / referenceMidi follow nodeGraphPitchedFrequency.
 */
function nodeGraphAdvancePitchedPhase01(
  state,
  baseHz,
  pitchMidi,
  sampleRate,
  reset = 0,
  referenceMidi = 69,
  resetThreshold = 0.5,
) {
  const pitched = nodeGraphPitchedFrequency(baseHz, pitchMidi, referenceMidi);
  return nodeGraphAdvancePhase01(state, pitched, sampleRate, reset, resetThreshold);
}
