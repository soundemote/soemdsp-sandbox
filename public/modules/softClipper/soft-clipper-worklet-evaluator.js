// Soft Clipper — native ADAA preferred; pure math fallback (soft-clipper-math.js).

NodeLiveAudioProcessor.prototype.createSoftClipperState = function createSoftClipperState() {
  const js = typeof createNodeGraphSoftClipperState === "function"
    ? createNodeGraphSoftClipperState()
    : {
      mono: { u1: 0, F1: 0, n: 0, x1: 0, hasX: false },
      left: { u1: 0, F1: 0, n: 0, x1: 0, hasX: false },
      right: { u1: 0, F1: 0, n: 0, x1: 0, hasX: false },
    };
  js.nativeHandle = 0;
  return js;
};

NodeLiveAudioProcessor.prototype.destroySoftClipperState = function destroySoftClipperState(state) {
  if (state?.nativeHandle && this.nativeSoftClipper?.soemdsp_soft_clipper_destroy) {
    try { this.nativeSoftClipper.soemdsp_soft_clipper_destroy(state.nativeHandle); } catch (_) { /* ignore */ }
  }
  if (state) state.nativeHandle = 0;
};

NodeLiveAudioProcessor.prototype.nativeSoftClipperSample = function nativeSoftClipperSample(
  input,
  center = 0,
  width = 2,
  state = null,
  oversample = 2,
  channel = 0,
) {
  const mode = typeof nodeGraphSoftClipperOversampleMode === "function"
    ? nodeGraphSoftClipperOversampleMode(oversample)
    : (Math.round(Number(oversample)) >= 2 ? 2 : (Number(oversample) > 0 ? 1 : 0));
  const chState = state && (channel === 1 ? state.left : channel === 2 ? state.right : state.mono);
  const x = Number(input) || 0;
  const runNativeAa = (sample) => {
    if (!this.nativeSoftClipperReady || !this.nativeSoftClipper?.soemdsp_soft_clipper_sample_aa || !state) {
      return null;
    }
    try {
      if (!state.nativeHandle && this.nativeSoftClipper.soemdsp_soft_clipper_create) {
        state.nativeHandle = this.nativeSoftClipper.soemdsp_soft_clipper_create();
      }
      if (!state.nativeHandle) {
        return null;
      }
      return this.safeFilterNumber(
        this.nativeSoftClipper.soemdsp_soft_clipper_sample_aa(
          state.nativeHandle,
          channel | 0,
          sample,
          Number(center) || 0,
          Number(width) || 2,
          1,
        ),
        null,
      );
    } catch (error) {
      this.nativeSoftClipperReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "soft_clipper",
        status: "disabled",
        message: String(error?.message || error || "native Soft Clipper failed"),
      });
      return null;
    }
  };
  if (mode <= 0) {
    if (chState) {
      chState.x1 = x;
      chState.hasX = true;
    }
    if (this.nativeSoftClipperReady && this.nativeSoftClipper?.soemdsp_soft_clipper_sample) {
      try {
        return this.safeFilterNumber(
          this.nativeSoftClipper.soemdsp_soft_clipper_sample(
            x,
            Number(center) || 0,
            Number(width) || 2,
          ),
          null,
        );
      } catch (error) {
        this.nativeSoftClipperReady = false;
      }
    }
  } else if (mode === 1) {
    const y = runNativeAa(x);
    if (chState) {
      chState.x1 = x;
      chState.hasX = true;
    }
    if (y != null) {
      return y;
    }
  } else {
    const mid = chState?.hasX ? (chState.x1 + x) * 0.5 : x;
    const y0 = runNativeAa(mid);
    const y1 = runNativeAa(x);
    if (chState) {
      chState.x1 = x;
      chState.hasX = true;
    }
    if (y0 != null && y1 != null) {
      return (y0 + y1) * 0.5;
    }
  }
  if (typeof nodeGraphSoftClipperSample === "function") {
    return this.safeFilterNumber(nodeGraphSoftClipperSample(input, center, width, chState, mode), null);
  }
  return this.safeFilterNumber(input, null) ?? 0;
};
