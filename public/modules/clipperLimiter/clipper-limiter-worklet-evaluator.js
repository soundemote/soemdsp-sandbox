// Clipper Limiter — Soft Clipper knee (native ADAA when available).

NodeLiveAudioProcessor.prototype.clipperLimiterChannel = function clipperLimiterChannel(
  input,
  minDb,
  maxDb,
  gainDb,
  state,
  antialias,
  channel,
) {
  const prep = typeof nodeGraphClipperLimiterPrep === "function"
    ? nodeGraphClipperLimiterPrep(input, minDb, maxDb, gainDb)
    : { dry: true, y: Number(input) || 0 };
  if (prep.dry) {
    return prep.y;
  }
  const shaped = this.nativeSoftClipperSample
    ? this.nativeSoftClipperSample(prep.excess, 0, 2 * prep.span, state, antialias, channel)
    : (typeof nodeGraphSoftClipperSample === "function"
      ? nodeGraphSoftClipperSample(
        prep.excess,
        0,
        2 * prep.span,
        channel === 1 ? state?.left : channel === 2 ? state?.right : state?.mono,
        antialias,
      )
      : prep.span * Math.tanh(prep.excess / prep.span));
  return typeof nodeGraphClipperLimiterFinish === "function"
    ? nodeGraphClipperLimiterFinish(prep, shaped)
    : prep.sign * (prep.minLin + (Number(shaped) || 0));
};

NodeLiveAudioProcessor.prototype.clipperLimiterFrame = function clipperLimiterFrame(
  mono,
  left,
  right,
  minDb,
  maxDb,
  gainDb,
  state = null,
  antialias = 1,
) {
  if (state && typeof nodeGraphClipperLimiterPrep === "function") {
    const m = Number(mono) || 0;
    return {
      Out: this.clipperLimiterChannel(m, minDb, maxDb, gainDb, state, antialias, 0),
      Left: this.clipperLimiterChannel((Number(left) || 0) + m, minDb, maxDb, gainDb, state, antialias, 1),
      Right: this.clipperLimiterChannel((Number(right) || 0) + m, minDb, maxDb, gainDb, state, antialias, 2),
    };
  }
  if (typeof nodeGraphClipperLimiterFrame === "function") {
    return nodeGraphClipperLimiterFrame(mono, left, right, minDb, maxDb, gainDb, state, antialias);
  }
  const m = Number(mono) || 0;
  return {
    Out: m,
    Left: (Number(left) || 0) + m,
    Right: (Number(right) || 0) + m,
  };
};
