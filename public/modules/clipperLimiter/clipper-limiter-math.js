// Clipper Limiter — original Soft Clipper tanh, engaged only between Min/Max dB.
// Wider Min→Max span = more gradual knee. Below Min the signal is unchanged;
// the curve approaches Max as a ceiling.

function nodeGraphDbToLinAmp(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return 10 ** (n / 20);
}

function nodeGraphClipperLimiterSample(input, minDb = -12, maxDb = 0, gainDb = 0) {
  const loDb = Number(minDb);
  const hiDb = Number(maxDb);
  const minLin = nodeGraphDbToLinAmp(Math.min(loDb, hiDb));
  const maxLin = nodeGraphDbToLinAmp(Math.max(loDb, hiDb));
  const drive = nodeGraphDbToLinAmp(Number(gainDb) || 0);
  const x = (Number(input) || 0) * drive;
  const ax = Math.abs(x);
  const sign = x < 0 ? -1 : 1;
  if (ax <= minLin) {
    return x;
  }
  const span = Math.max(1e-12, maxLin - minLin);
  const excess = ax - minLin;
  // Original: center=0, width=2*span → y = span * tanh(excess/span), asymptote span.
  const shaped = typeof nodeGraphSoftClipperSample === "function"
    ? nodeGraphSoftClipperSample(excess, 0, 2 * span)
    : span * Math.tanh(excess / span);
  return sign * (minLin + shaped);
}

/**
 * Mono sums into L/R before clip (same port contract as Soft Clipper / Gain).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphClipperLimiterFrame(mono, left, right, minDb, maxDb, gainDb) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphClipperLimiterSample(m, minDb, maxDb, gainDb),
    Left: nodeGraphClipperLimiterSample((Number(left) || 0) + m, minDb, maxDb, gainDb),
    Right: nodeGraphClipperLimiterSample((Number(right) || 0) + m, minDb, maxDb, gainDb),
  };
}
