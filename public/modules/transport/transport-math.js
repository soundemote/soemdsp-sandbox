// Transport — pure math for offline/render (and worklet JS fallback).
// Tempo from timing.tempoBpm / params.bpm.
// Rate = Numer/Denom × whole note (same family as Ping Pong), with
// Normal / Dotted / Triplet. pulseWidth = gate high duty (0..1).

function nodeGraphTransportTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
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
  const effectiveNumerator = Math.max(0, Number(numerator) || 0);
  if (effectiveNumerator === 0) {
    return 0;
  }
  const effectiveDenominator = Math.max(1, Math.round(Number(denominator) || 0) || 1);
  return effectiveNumerator / effectiveDenominator;
}

/**
 * Period in seconds for one gate cycle.
 * Defaults 1/4 Normal → one beat (same as old divisions=0).
 */
function nodeGraphTransportPeriodSeconds(params, tempoBpm) {
  const bpm = Math.max(1, Number(tempoBpm) || 120);
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
  const division = Math.round(Number(divisions) || 0);
  if (division > 0) {
    return division + 1;
  }
  if (division < 0) {
    return 1 / (Math.abs(division) + 1);
  }
  return 1;
}

function nodeGraphTransportWrap01(p) {
  const x = Number(p) || 0;
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
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const amplitude = Math.max(0, Math.min(1, Number(params?.amplitude) || 0));
  const pulseWidth = nodeGraphTransportPulseWidth(params?.pulseWidth);
  const frame = Math.max(0, Number(absoluteFrame) || 0);

  let frequency = 0;
  const hasNoteParams = params?.timeNumerator != null
    || params?.timeDenominator != null
    || params?.timingMode != null;
  if (hasNoteParams || params?.divisions == null) {
    const periodSec = nodeGraphTransportPeriodSeconds(params, tempoBpm);
    frequency = periodSec > 0 ? 1 / periodSec : 0;
  } else {
    // Legacy Division path (patches that still only have divisions).
    const baseHz = Math.max(0, Number(tempoBpm) || 120) / 60;
    frequency = baseHz * nodeGraphTransportDivisionFactor(params?.divisions);
  }

  const phase = frequency > 0 ? nodeGraphTransportWrap01((frame / rate) * frequency) : 0;
  const high = phase < pulseWidth;
  const previousFrame = Math.max(0, frame - 1);
  const previousPhase = frequency > 0 ? nodeGraphTransportWrap01((previousFrame / rate) * frequency) : 0;
  const wrapped = frame === 0 || phase < previousPhase;
  return {
    "Gate -1+1": high ? amplitude : -amplitude,
    "Gate 0-1": high ? amplitude : 0,
    Trigger: frequency > 0 && wrapped ? amplitude : 0,
    f: frequency,
  };
}
