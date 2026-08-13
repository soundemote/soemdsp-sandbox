// Soft Clipper — native ADAA preferred; pure math fallback (soft-clipper-math.js).

NodeLiveAudioProcessor.prototype.createSoftClipperState = function createSoftClipperState() {
  const js = typeof createNodeGraphSoftClipperState === "function"
    ? createNodeGraphSoftClipperState()
    : { mono: { u1: 0, F1: 0, n: 0 }, left: { u1: 0, F1: 0, n: 0 }, right: { u1: 0, F1: 0, n: 0 } };
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
  antialias = 1,
  channel = 0,
) {
  const aa = Math.max(0, Math.min(1, Number(antialias) || 0));
  if (aa <= 0 && this.nativeSoftClipperReady && this.nativeSoftClipper?.soemdsp_soft_clipper_sample) {
    try {
      return this.safeFilterNumber(
        this.nativeSoftClipper.soemdsp_soft_clipper_sample(
          Number(input) || 0,
          Number(center) || 0,
          Number(width) || 2,
        ),
        null,
      );
    } catch (error) {
      this.nativeSoftClipperReady = false;
    }
  }
  if (aa > 0 && this.nativeSoftClipperReady && this.nativeSoftClipper?.soemdsp_soft_clipper_sample_aa && state) {
    try {
      if (!state.nativeHandle && this.nativeSoftClipper.soemdsp_soft_clipper_create) {
        state.nativeHandle = this.nativeSoftClipper.soemdsp_soft_clipper_create();
      }
      if (state.nativeHandle) {
        return this.safeFilterNumber(
          this.nativeSoftClipper.soemdsp_soft_clipper_sample_aa(
            state.nativeHandle,
            channel | 0,
            Number(input) || 0,
            Number(center) || 0,
            Number(width) || 2,
            aa,
          ),
          null,
        );
      }
    } catch (error) {
      this.nativeSoftClipperReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "soft_clipper",
        status: "disabled",
        message: String(error?.message || error || "native Soft Clipper failed"),
      });
    }
  }
  const chState = state && (channel === 1 ? state.left : channel === 2 ? state.right : state.mono);
  if (typeof nodeGraphSoftClipperSample === "function") {
    return this.safeFilterNumber(nodeGraphSoftClipperSample(input, center, width, chState, aa), null);
  }
  return this.safeFilterNumber(input, null) ?? 0;
};
