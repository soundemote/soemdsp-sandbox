// Clipper Limiter — original Soft Clipper tanh between Min/Max dB.

NodeLiveAudioProcessor.prototype.clipperLimiterFrame = function clipperLimiterFrame(
  mono,
  left,
  right,
  minDb,
  maxDb,
  gainDb,
) {
  if (typeof nodeGraphClipperLimiterFrame === "function") {
    return nodeGraphClipperLimiterFrame(mono, left, right, minDb, maxDb, gainDb);
  }
  const m = Number(mono) || 0;
  return {
    Out: m,
    Left: (Number(left) || 0) + m,
    Right: (Number(right) || 0) + m,
  };
};
