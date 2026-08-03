// FBM Field — native WASM preferred; pure math fallback (fbm-field-math.js).

NodeLiveAudioProcessor.prototype.createFbmFieldState = function createFbmFieldState() {
  const base =
    typeof createNodeGraphFbmFieldState === "function"
      ? createNodeGraphFbmFieldState()
      : { resetWasHigh: false, time: 0 };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.destroyFbmFieldNativeState = function destroyFbmFieldNativeState(state) {
  if (state?.nativeHandle && this.nativeFbmField?.soemdsp_fbm_field_destroy) {
    try {
      this.nativeFbmField.soemdsp_fbm_field_destroy(state.nativeHandle);
    } catch (_) { /* ignore */ }
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.fbmFieldVector = function fbmFieldVector(state, params, rate = sampleRate, reset = 0) {
  const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
  if (
    this.nativeFbmFieldReady &&
    this.nativeFbmField?.soemdsp_fbm_field_create &&
    this.nativeFbmField?.soemdsp_fbm_field_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeFbmField.soemdsp_fbm_field_create();
      }
      if (state.nativeHandle) {
        this.nativeFbmField.soemdsp_fbm_field_sample(
          state.nativeHandle,
          Number(reset) > 0.5 ? 1 : 0,
          Math.max(0, Number(params.frequency) || 0),
          Math.max(0, Math.round(Number(params.seed) || 0)),
          Math.max(1, Math.min(8, Math.round(Number(params.octaves) || 4))),
          this.clampValue(Number(params.persistence) || 0.5, 0, 0.99),
          this.clampValue(Number(params.lacunarity) || 2, 1, 4),
          Math.max(0.000001, Number(params.scale) || 1),
          this.clampValue(Number(params.smoothness) || 0.55, 0, 1),
          Math.max(0.05, Number(params.zoom) || 1),
          Number(params.panX) || 0,
          Number(params.panY) || 0,
          Number(params.level) || 0,
          safeRate,
        );
        const x = this.nativeFbmField.soemdsp_fbm_field_x(state.nativeHandle);
        const y = this.nativeFbmField.soemdsp_fbm_field_y(state.nativeHandle);
        const xRaw = this.nativeFbmField.soemdsp_fbm_field_x_raw?.(state.nativeHandle) ?? x;
        const yRaw = this.nativeFbmField.soemdsp_fbm_field_y_raw?.(state.nativeHandle) ?? y;
        return {
          X: this.safeFilterNumber(x, null),
          Y: this.safeFilterNumber(y, null),
          "X Raw": this.safeFilterNumber(xRaw, null),
          "Y Raw": this.safeFilterNumber(yRaw, null),
        };
      }
    } catch (error) {
      this.nativeFbmFieldReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "fbm_field",
        status: "disabled",
        message: String(error?.message || error || "native FBM Field failed"),
      });
    }
  }
  // JS fallback only when native missing (slim without module / no wasm).
  if (typeof nodeGraphFbmFieldVector === "function") {
    const out = nodeGraphFbmFieldVector(state, params, safeRate, reset);
    return {
      X: this.safeFilterNumber(out.X, null),
      Y: this.safeFilterNumber(out.Y, null),
      "X Raw": this.safeFilterNumber(out["X Raw"], null),
      "Y Raw": this.safeFilterNumber(out["Y Raw"], null),
    };
  }
  return { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
};
