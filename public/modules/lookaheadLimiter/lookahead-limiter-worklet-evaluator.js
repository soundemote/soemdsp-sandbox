// Look-ahead brickwall limiter — worklet peel. Math: lookahead-limiter-math.js.

NodeLiveAudioProcessor.prototype.createLookaheadLimiterState = function createLookaheadLimiterState() {
  const state = typeof createNodeGraphLookaheadLimiterState === "function"
    ? createNodeGraphLookaheadLimiterState()
    : null;
  if (state) state.nativeHandle = 0;
  return state;
};

NodeLiveAudioProcessor.prototype.destroyLookaheadLimiterNativeState = function destroyLookaheadLimiterNativeState(state) {
  if (state?.nativeHandle && this.nativeLookaheadLimiter?.soemdsp_lookahead_limiter_destroy) {
    try { this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_destroy(state.nativeHandle); } catch (_error) { /* ignore */ }
  }
  if (state) state.nativeHandle = 0;
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
  lookaheadEnabled,
  gainCompensation,
  dipGain,
) {
  if (this.nativeLookaheadLimiterReady && this.nativeLookaheadLimiter?.soemdsp_lookahead_limiter_sample && state) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_create();
      }
      if (state.nativeHandle) {
        const out = this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_sample(
          state.nativeHandle,
          left,
          right,
          ceilingDb,
          lookaheadMs,
          lookaheadSamples,
          attackMs,
          releaseMs,
          sampleRate,
          lookaheadEnabled,
          gainCompensation,
          dipGain,
        );
        return {
          Out: this.safeFilterNumber(out, state) ?? 0,
          Left: this.safeFilterNumber(this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_left(state.nativeHandle), state) ?? 0,
          Right: this.safeFilterNumber(this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_right(state.nativeHandle), state) ?? 0,
          Gain: this.safeFilterNumber(this.nativeLookaheadLimiter.soemdsp_lookahead_limiter_gain(state.nativeHandle), state) ?? 1,
        };
      }
    } catch (error) {
      this.nativeLookaheadLimiterReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "lookahead_limiter",
        status: "disabled",
        message: String(error?.message || error || "native Limiter failed"),
      });
    }
  }
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
      lookaheadEnabled,
      gainCompensation,
      dipGain,
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
