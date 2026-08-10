// Look-ahead brickwall limiter — worklet peel. Math: lookahead-limiter-math.js.

NodeLiveAudioProcessor.prototype.createLookaheadLimiterState = function createLookaheadLimiterState() {
  if (typeof createNodeGraphLookaheadLimiterState === "function") {
    return createNodeGraphLookaheadLimiterState();
  }
  return null;
};

NodeLiveAudioProcessor.prototype.lookaheadLimiterFrame = function lookaheadLimiterFrame(
  state,
  left,
  right,
  ceilingDb,
  lookaheadMs,
  lookaheadSamples,
  attackMs,
  releaseMs,
  sampleRate,
) {
  if (typeof nodeGraphLookaheadLimiterFrame === "function") {
    const out = nodeGraphLookaheadLimiterFrame(
      state,
      left,
      right,
      ceilingDb,
      lookaheadMs,
      lookaheadSamples,
      attackMs,
      releaseMs,
      sampleRate,
    );
    return {
      Out: this.safeFilterNumber(out.Out, state) ?? 0,
      Left: this.safeFilterNumber(out.Left, state) ?? 0,
      Right: this.safeFilterNumber(out.Right, state) ?? 0,
      Gain: this.safeFilterNumber(out.Gain, state) ?? 1,
    };
  }
  const l = this.safeFilterNumber(left, state) ?? 0;
  const r = this.safeFilterNumber(right, state) ?? 0;
  return { Out: 0.5 * (l + r), Left: l, Right: r, Gain: 1 };
};
