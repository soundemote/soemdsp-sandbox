// FBM Field — native WASM only. No JS DSP fallback.

/** Finite number or fallback — allows 0 (do not use `x || default`). */
NodeLiveAudioProcessor.prototype.fbmFieldNum = function fbmFieldNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

NodeLiveAudioProcessor.prototype.fbmFieldMotionMode = function fbmFieldMotionMode(value) {
  const n = Math.round(this.fbmFieldNum(value, 1));
  return Math.max(0, Math.min(1, n));
};

NodeLiveAudioProcessor.prototype.createFbmFieldState = function createFbmFieldState() {
  return { nativeHandle: 0 };
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
  if (
    !this.nativeFbmFieldReady ||
    !this.nativeFbmField?.soemdsp_fbm_field_create ||
    !this.nativeFbmField?.soemdsp_fbm_field_sample
  ) {
    return { X: 0, Y: 0, Z: 0, "X Raw": 0, "Y Raw": 0, "Z Raw": 0 };
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeFbmField.soemdsp_fbm_field_create();
    }
    if (!state.nativeHandle) {
      return { X: 0, Y: 0, Z: 0, "X Raw": 0, "Y Raw": 0, "Z Raw": 0 };
    }
    const safeRate = Math.max(1, this.fbmFieldNum(rate, sampleRate || 44100));
    const frequency = Math.max(0, this.fbmFieldNum(params.frequency, 0));
    this.nativeFbmField.soemdsp_fbm_field_sample(
      state.nativeHandle,
      Number(reset) > 0.5 ? 1 : 0,
      frequency,
      Math.max(0, Math.round(this.fbmFieldNum(params.seed, 0))),
      Math.max(1, Math.min(8, Math.round(this.fbmFieldNum(params.octaves, 4)))),
      this.clampValue(this.fbmFieldNum(params.persistence, 0.5), 0, 0.99),
      this.clampValue(this.fbmFieldNum(params.lacunarity, 2), 1, 4),
      Math.max(0.000001, this.fbmFieldNum(params.scale, 1)),
      this.clampValue(this.fbmFieldNum(params.smoothness, 0.55), 0, 1),
      Math.max(0.05, this.fbmFieldNum(params.zoom, 1)),
      this.fbmFieldNum(params.panX, 0),
      this.fbmFieldNum(params.panY, 0),
      this.fbmFieldNum(params.level, 1),
      safeRate,
      this.fbmFieldMotionMode(params.motion),
    );
    const x = this.nativeFbmField.soemdsp_fbm_field_x(state.nativeHandle);
    const y = this.nativeFbmField.soemdsp_fbm_field_y(state.nativeHandle);
    const z = this.nativeFbmField.soemdsp_fbm_field_z?.(state.nativeHandle) ?? 0;
    const xRaw = this.nativeFbmField.soemdsp_fbm_field_x_raw?.(state.nativeHandle) ?? x;
    const yRaw = this.nativeFbmField.soemdsp_fbm_field_y_raw?.(state.nativeHandle) ?? y;
    const zRaw = this.nativeFbmField.soemdsp_fbm_field_z_raw?.(state.nativeHandle) ?? z;
    return {
      X: this.safeFilterNumber(x, null),
      Y: this.safeFilterNumber(y, null),
      Z: this.safeFilterNumber(z, null),
      "X Raw": this.safeFilterNumber(xRaw, null),
      "Y Raw": this.safeFilterNumber(yRaw, null),
      "Z Raw": this.safeFilterNumber(zRaw, null),
    };
  } catch (error) {
    this.nativeFbmFieldReady = false;
    this.destroyFbmFieldNativeState(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "fbm_field",
      status: "disabled",
      message: String(error?.message || error || "native FBM Field failed"),
    });
    return { X: 0, Y: 0, Z: 0, "X Raw": 0, "Y Raw": 0, "Z Raw": 0 };
  }
};
