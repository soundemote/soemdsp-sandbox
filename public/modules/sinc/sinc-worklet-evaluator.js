// Sinc oscillator — native-only (APP_POLICY §2/§5). Silence if WASM cold.

NodeLiveAudioProcessor.prototype.createSincState = function createSincState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.sincSample = function sincSample(state, params, nodeId) {
  void nodeId;
  if (
    !this.nativeSincReady
    || !this.nativeSinc?.soemdsp_sinc_create
    || !this.nativeSinc?.soemdsp_sinc_sample
  ) {
    return { Out: 0 };
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeSinc.soemdsp_sinc_create();
    }
    if (!state.nativeHandle) {
      return { Out: 0 };
    }
    const out = this.nativeSinc.soemdsp_sinc_sample(
      state.nativeHandle,
      Math.max(0, this.safeFilterNumber(params.freq, 100) ?? 100),
      this.safeFilterNumber(params.phase, 0) ?? 0,
      Math.max(1, Math.round(this.safeFilterNumber(params.lobes, 4) ?? 4)),
      Math.round(this.safeFilterNumber(params.bandLimit, 1) ?? 1),
      this.effectiveSampleRate(),
    );
    return { Out: this.clampValue(Number(out) || 0, -1, 1) };
  } catch (_error) {
    this.nativeSincReady = false;
    return { Out: 0 };
  }
};
