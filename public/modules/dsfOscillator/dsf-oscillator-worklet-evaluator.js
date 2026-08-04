// Realtime DSF oscillator — native-only (no JS twin). Silence if WASM cold.

NodeLiveAudioProcessor.prototype.createDsfOscillatorState = function createDsfOscillatorState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.dsfOscillatorSample = function dsfOscillatorSample(state, options = {}) {
  if (
    !this.nativeDsfOscillatorReady
    || !this.nativeDsfOscillator?.soemdsp_dsf_oscillator_create
    || !this.nativeDsfOscillator?.soemdsp_dsf_oscillator_sample
  ) {
    return { Out: 0 };
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeDsfOscillator.soemdsp_dsf_oscillator_create();
    }
    if (!state.nativeHandle) {
      return { Out: 0 };
    }
    this.nativeDsfOscillator.soemdsp_dsf_oscillator_sample(
      state.nativeHandle,
      Number(options.frequencyHz) || 0,
      Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000,
      Math.round(Number(options.waveform) || 0),
      Number(options.morph) || 0,
      Number(options.pulseWidth) ?? 0.5,
      Number(options.blend) ?? 0.5,
      Number(options.phase) || 0,
      Number(options.level) || 0,
    );
    return {
      Out: Number(this.nativeDsfOscillator.soemdsp_dsf_oscillator_out(state.nativeHandle)) || 0,
    };
  } catch (_error) {
    this.nativeDsfOscillatorReady = false;
    return { Out: 0 };
  }
};
