// Native-only TB-303 worklet path (no JS DSP fallback).

NodeLiveAudioProcessor.prototype.createTb303FilterState = function createTb303FilterState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.tb303FilterSample = function tb303FilterSample(state, input, params, rate = sampleRate) {
  if (!this.nativeTb303FilterReady) {
    throw new Error("native TB-303 Filter not ready");
  }
  if (!state.nativeHandle) {
    state.nativeHandle = this.nativeTb303Filter.soemdsp_tb303_filter_create();
  }
  if (!state.nativeHandle) {
    throw new Error("native TB-303 Filter failed to create instance");
  }
  return this.safeFilterNumber(
    this.nativeTb303Filter.soemdsp_tb303_filter_sample(
      state.nativeHandle,
      this.safeFilterNumber(input, state),
      Math.max(200, this.safeFilterNumber(params.cutoff, state)),
      Math.max(0, Math.min(100, this.safeFilterNumber(params.resonance, state))),
      Math.max(0, Math.min(14, Math.round(Number(params.mode) || 4))),
      Number(params.drive) || 0,
      Math.max(1, Number(rate) || sampleRate || 44100),
    ),
    state,
  );
};
