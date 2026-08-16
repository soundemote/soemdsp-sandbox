// Clipper Limiter — stages in order: Gain → Min knee → Soft Clipper last.
// Gain drives the input. Below Min the driven signal is unchanged.
// Excess above Min is the shared Soft Clipper tanh (ADAA when state/aa given).
// Wider Min→Max span = more gradual knee. Soft Clipper is never followed by gain.

function nodeGraphClipperLimiterDbToLin(db) {
  if (typeof nodeGraphClipperDbToLin === "function") {
    return nodeGraphClipperDbToLin(db);
  }
  const n = Number(db);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return 10 ** (n / 20);
}

/**
 * Split dry-below-min vs knee. Callers shape `excess` with Soft Clipper.
 * @returns {{ dry: true, y: number } | { dry: false, sign: number, minLin: number, span: number, excess: number }}
 */
function nodeGraphClipperLimiterPrep(input, minDb = -12, maxDb = 0, gainDb = 0) {
  const loDb = Number(minDb);
  const hiDb = Number(maxDb);
  const minLin = nodeGraphClipperLimiterDbToLin(Math.min(loDb, hiDb));
  const maxLin = nodeGraphClipperLimiterDbToLin(Math.max(loDb, hiDb));
  // Stage 1 — Gain (drive). Soft Clipper is applied later, never after this.
  const drive = nodeGraphClipperLimiterDbToLin(Number(gainDb) || 0);
  const x = (Number(input) || 0) * drive;
  const ax = Math.abs(x);
  if (ax <= minLin) {
    return { dry: true, y: x };
  }
  const span = Math.max(1e-12, maxLin - minLin);
  return {
    dry: false,
    sign: x < 0 ? -1 : 1,
    minLin,
    span,
    excess: ax - minLin,
  };
}

function nodeGraphClipperLimiterFinish(prep, shaped) {
  if (!prep || prep.dry) {
    return prep?.y || 0;
  }
  return prep.sign * (prep.minLin + (Number(shaped) || 0));
}

function nodeGraphClipperLimiterSample(input, minDb = -12, maxDb = 0, gainDb = 0, state = null, oversample = 2) {
  const prep = nodeGraphClipperLimiterPrep(input, minDb, maxDb, gainDb);
  if (prep.dry) {
    return prep.y;
  }
  // Last stage — Soft Clipper (Antialias/ADAA lives here, not on Gain).
  const shaped = typeof nodeGraphSoftClipperSample === "function"
    ? nodeGraphSoftClipperSample(prep.excess, 0, 2 * prep.span, state, oversample)
    : prep.span * Math.tanh(prep.excess / prep.span);
  return nodeGraphClipperLimiterFinish(prep, shaped);
}

/**
 * Mono sums into L/R before clip (same port contract as Soft Clipper / Gain).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphClipperLimiterFrame(mono, left, right, minDb, maxDb, gainDb, state = null, oversample = 2) {
  const m = Number(mono) || 0;
  const st = state || null;
  return {
    Out: nodeGraphClipperLimiterSample(m, minDb, maxDb, gainDb, st?.mono, oversample),
    Left: nodeGraphClipperLimiterSample((Number(left) || 0) + m, minDb, maxDb, gainDb, st?.left, oversample),
    Right: nodeGraphClipperLimiterSample((Number(right) || 0) + m, minDb, maxDb, gainDb, st?.right, oversample),
  };
}
