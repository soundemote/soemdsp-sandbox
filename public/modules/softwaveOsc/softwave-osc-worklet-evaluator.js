// Softwave Oscillator — native-only (APP_POLICY §2/§5). Silence if WASM cold.

NodeLiveAudioProcessor.prototype.createSoftwaveOscillatorState = function createSoftwaveOscillatorState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.softwaveOscillatorSample = function softwaveOscillatorSample(state, options = {}) {
  if (
    !this.nativeSoftwaveReady
    || !this.nativeSoftwave?.soemdsp_softwave_create
    || !this.nativeSoftwave?.soemdsp_softwave_sample
  ) {
    return { Out: 0 };
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeSoftwave.soemdsp_softwave_create();
    }
    if (!state.nativeHandle) {
      return { Out: 0 };
    }
    const out = this.nativeSoftwave.soemdsp_softwave_sample(
      state.nativeHandle,
      Math.max(0, Number(options.frequencyHz) || 0),
      Math.max(1, Number(options.sampleRate) || 44100),
      Math.round(Number(options.waveform) || 0),
      Number(options.morph) || 0,
      Number(options.phase) || 0,
      Number.isFinite(Number(options.level)) ? Number(options.level) : 1,
      Math.max(0, Number(options.antialias) || 0),
    );
    return { Out: Number.isFinite(out) ? out : 0 };
  } catch (_error) {
    this.nativeSoftwaveReady = false;
    return { Out: 0 };
  }
};
