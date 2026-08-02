// Node Graph Standard Library -- pure phase / pitch primitives.
//
// No dependencies on nodeGraphMvp, clampNodeSliderValue, or worklet-only
// APIs. Safe to load:
//   - on the main thread (index.html) before oscillator / Jerobeam modules
//   - first in the AudioWorklet Blob assembly (nodeGraphLiveWorkletSourceFiles)
//
// Use these instead of re-copying wrap01 / trisaw / 0.1V/Oct pitch math into
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
 * 0.1V/Oct pitch tracking: baseHz * 2^((cv - reference) / 0.1).
 * Matches osc / phosphillator / additive convention. referenceVoltage defaults
 * to 0 (cv is absolute 0.1V/Oct); pass a reference when the jack is relative.
 */
function nodeGraphPitchedFrequency(baseHz, cv01Voct = 0, referenceVoltage = 0) {
  const base = Math.max(0, Number(baseHz) || 0);
  const cv = Number(cv01Voct);
  const pitch = Number.isFinite(cv) ? cv : 0;
  const ref = Number(referenceVoltage);
  const reference = Number.isFinite(ref) ? ref : 0;
  return Math.max(0, base * (2 ** ((pitch - reference) / 0.1)));
}

/**
 * Advance a free-running [0,1) phasor by frequencyHz / sampleRate.
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
  const freq = Math.max(0, Number(frequencyHz) || 0);
  const rate = Math.max(1, Number(sampleRate) || 1);
  state.phase = nodeGraphWrap01((Number(state.phase) || 0) + freq / rate);
  return state.phase;
}

/**
 * Convenience: pitch-track then advance. Same state shape as nodeGraphAdvancePhase01.
 * cv01Voct / referenceVoltage follow nodeGraphPitchedFrequency.
 */
function nodeGraphAdvancePitchedPhase01(
  state,
  baseHz,
  cv01Voct,
  sampleRate,
  reset = 0,
  referenceVoltage = 0,
  resetThreshold = 0.5,
) {
  const pitched = nodeGraphPitchedFrequency(baseHz, cv01Voct, referenceVoltage);
  return nodeGraphAdvancePhase01(state, pitched, sampleRate, reset, resetThreshold);
}
