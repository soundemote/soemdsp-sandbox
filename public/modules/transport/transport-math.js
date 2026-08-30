// Transport — pure math for offline/render (and worklet JS fallback).
// Tempo from timing.tempoBpm; divisions expand/contract the beat.

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

/**
 * @param {{ amplitude?: number, divisions?: number }} params
 * @param {number} absoluteFrame
 * @param {number} sampleRate
 * @param {number} tempoBpm
 * @returns {{ "-1..1": number, "0..1": number, Trigger: number, f: number }}
 */
function nodeGraphTransportCore(params, absoluteFrame, sampleRate, tempoBpm) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const baseHz = Math.max(0, Number(tempoBpm) || 120) / 60;
  const divisionFactor = nodeGraphTransportDivisionFactor(params?.divisions);
  const frequency = baseHz * divisionFactor;
  const amplitude = Math.max(0, Math.min(1, Number(params?.amplitude) || 0));
  const frame = Math.max(0, Number(absoluteFrame) || 0);
  const phase = frequency > 0 ? nodeGraphTransportWrap01((frame / rate) * frequency) : 0;
  const high = phase < 0.5;
  const previousFrame = Math.max(0, frame - 1);
  const previousPhase = frequency > 0 ? nodeGraphTransportWrap01((previousFrame / rate) * frequency) : 0;
  const wrapped = frame === 0 || phase < previousPhase;
  return {
    "-1..1": high ? amplitude : -amplitude,
    "0..1": high ? amplitude : 0,
    Trigger: frequency > 0 && wrapped ? amplitude : 0,
    f: frequency,
  };
}
