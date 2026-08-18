// Clipper Limiter — Soft Clipper knee (native ADAA when available).

NodeLiveAudioProcessor.prototype.destroyClipperLimiterNativeState = function destroyClipperLimiterNativeState(state) {
  if (state?.clipperNativeHandle && this.nativeClipperLimiter?.soemdsp_clipper_limiter_destroy) {
    try { this.nativeClipperLimiter.soemdsp_clipper_limiter_destroy(state.clipperNativeHandle); } catch (_error) { /* ignore */ }
  }
  if (state) state.clipperNativeHandle = 0;
};

NodeLiveAudioProcessor.prototype.clipperLimiterChannel = function clipperLimiterChannel(
  input,
  minDb,
  maxDb,
  gainDb,
  state,
  oversample,
  channel,
) {
  if (this.nativeClipperLimiterReady && this.nativeClipperLimiter?.soemdsp_clipper_limiter_sample && state) {
    try {
      if (!state.clipperNativeHandle) {
        state.clipperNativeHandle = this.nativeClipperLimiter.soemdsp_clipper_limiter_create();
      }
      if (state.clipperNativeHandle) {
        const aa = Number(oversample) > 0 ? 1 : 0;
        return this.safeFilterNumber(
          this.nativeClipperLimiter.soemdsp_clipper_limiter_sample(
            state.clipperNativeHandle,
            channel | 0,
            input,
            minDb,
            maxDb,
            gainDb,
            aa,
          ),
          null,
        ) ?? 0;
      }
    } catch (error) {
      this.nativeClipperLimiterReady = false;
      state.clipperNativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "clipper_limiter",
        status: "disabled",
        message: String(error?.message || error || "native Clipper Limiter failed"),
      });
    }
  }
  const prep = typeof nodeGraphClipperLimiterPrep === "function"
    ? nodeGraphClipperLimiterPrep(input, minDb, maxDb, gainDb)
    : { dry: true, y: Number(input) || 0 };
  if (prep.dry) {
    return prep.y;
  }
  const shaped = this.nativeSoftClipperSample
    ? this.nativeSoftClipperSample(prep.excess, 0, 2 * prep.span, state, oversample, channel)
    : (typeof nodeGraphSoftClipperSample === "function"
      ? nodeGraphSoftClipperSample(
        prep.excess,
        0,
        2 * prep.span,
        channel === 1 ? state?.left : channel === 2 ? state?.right : state?.mono,
        oversample,
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
  oversample = 2,
) {
  if (state && typeof nodeGraphClipperLimiterPrep === "function") {
    const m = Number(mono) || 0;
    return {
      Out: this.clipperLimiterChannel(m, minDb, maxDb, gainDb, state, oversample, 0),
      Left: this.clipperLimiterChannel((Number(left) || 0) + m, minDb, maxDb, gainDb, state, oversample, 1),
      Right: this.clipperLimiterChannel((Number(right) || 0) + m, minDb, maxDb, gainDb, state, oversample, 2),
    };
  }
  if (typeof nodeGraphClipperLimiterFrame === "function") {
    return nodeGraphClipperLimiterFrame(mono, left, right, minDb, maxDb, gainDb, state, oversample);
  }
  const m = Number(mono) || 0;
  return {
    Out: m,
    Left: (Number(left) || 0) + m,
    Right: (Number(right) || 0) + m,
  };
};
