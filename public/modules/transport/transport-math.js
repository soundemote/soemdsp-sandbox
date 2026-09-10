// Transport — pure math for offline/render (and worklet JS fallback).
// Tempo from timing.tempoBpm / params.bpm.
// Rate = Numer/Denom × whole note (same family as Ping Pong), with
// Normal / Dotted / Triplet. pulseWidth = gate high duty (0..1).

function nodeGraphTransportTimingModeMultiplier(mode) {
  const rounded = Math.round(nodeGraphFiniteNumber(mode));
  if (rounded === 1) {
    return 1.5; // Dotted
  }
  if (rounded === 2) {
    return 2 / 3; // Triplet
  }
  return 1; // Normal
}

/** Note fraction of a whole note: Numer/Denom (e.g. 1/4 → quarter note). */
function nodeGraphTransportNoteFraction(numerator, denominator) {
  const effectiveNumerator = Math.max(0, nodeGraphFiniteNumber(numerator));
  if (effectiveNumerator === 0) {
    return 0;
  }
  const effectiveDenominator = Math.max(1, Math.round(nodeGraphFiniteNumber(denominator, 1)));
  return effectiveNumerator / effectiveDenominator;
}

/**
 * Period in seconds for one gate cycle.
 * Defaults 1/4 Normal → one beat (same as old divisions=0).
 */
function nodeGraphTransportPeriodSeconds(params, tempoBpm) {
  const bpm = Math.max(1, nodeGraphFiniteNumber(tempoBpm, 120));
  const secondsPerWholeNote = 240 / bpm;
  const fraction = nodeGraphTransportNoteFraction(
    params?.timeNumerator,
    params?.timeDenominator,
  );
  if (!(fraction > 0)) {
    return 0;
  }
  return secondsPerWholeNote
    * fraction
    * nodeGraphTransportTimingModeMultiplier(params?.timingMode);
}

/** @deprecated kept for older callers / patches that still pass divisions */
function nodeGraphTransportDivisionFactor(divisions) {
  const division = Math.round(nodeGraphFiniteNumber(divisions));
  if (division > 0) {
    return division + 1;
  }
  if (division < 0) {
    return 1 / (Math.abs(division) + 1);
  }
  return 1;
}

function nodeGraphTransportWrap01(p) {
  const x = nodeGraphFiniteNumber(p);
  return x - Math.floor(x);
}

function nodeGraphTransportPulseWidth(raw) {
  const w = Number(raw);
  if (!Number.isFinite(w)) return 0.5;
  return Math.max(0.01, Math.min(0.99, w));
}

/**
 * @param {{
 *   amplitude?: number,
 *   timeNumerator?: number,
 *   timeDenominator?: number,
 *   timingMode?: number,
 *   pulseWidth?: number,
 *   divisions?: number,
 * }} params
 * @param {number} absoluteFrame
 * @param {number} sampleRate
 * @param {number} tempoBpm
 * @returns {{ "Gate -1+1": number, "Gate 0-1": number, Trigger: number, f: number }}
 */
function nodeGraphTransportCore(params, absoluteFrame, sampleRate, tempoBpm) {
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const amplitude = Math.max(0, Math.min(1, nodeGraphFiniteNumber(params?.amplitude)));
  const pulseWidth = nodeGraphTransportPulseWidth(params?.pulseWidth);
  const frame = Math.max(0, nodeGraphFiniteNumber(absoluteFrame));

  let frequency = 0;
  const hasNoteParams = params?.timeNumerator != null
    || params?.timeDenominator != null
    || params?.timingMode != null;
  if (hasNoteParams || params?.divisions == null) {
    const periodSec = nodeGraphTransportPeriodSeconds(params, tempoBpm);
    frequency = periodSec > 0 ? 1 / periodSec : 0;
  } else {
    // Legacy Division path (patches that still only have divisions).
    const baseHz = Math.max(0, nodeGraphFiniteNumber(tempoBpm, 120)) / 60;
    frequency = baseHz * nodeGraphTransportDivisionFactor(params?.divisions);
  }

  const phase = frequency > 0 ? nodeGraphTransportWrap01((frame / rate) * frequency) : 0;
  const high = phase < pulseWidth;
  // Trigger = 1-sample spike on cycle wrap.
  let trigger = 0;
  if (frequency > 0) {
    const samplesPerCycle = rate / frequency;
    const posInCycle = nodeGraphTransportWrap01((frame / rate) * frequency) * samplesPerCycle;
    if (Math.floor(posInCycle) === 0) {
      trigger = amplitude;
    }
  }
  return {
    "Gate -1+1": high ? amplitude : -amplitude,
    "Gate 0-1": high ? amplitude : 0,
    Trigger: trigger,
    f: frequency,
  };
}
