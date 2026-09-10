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
      nodeGraphFiniteNumber(options.frequencyHz),
      Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000,
      Math.round(nodeGraphFiniteNumber(options.waveform)),
      nodeGraphFiniteNumber(options.morph),
      Number(options.pulseWidth) ?? 0.5,
      Number(options.blend) ?? 0.5,
      nodeGraphFiniteNumber(options.phase),
      nodeGraphFiniteNumber(options.level),
    );
    return {
      Out: nodeGraphFiniteNumber(this.nativeDsfOscillator.soemdsp_dsf_oscillator_out(state.nativeHandle)),
    };
  } catch (_error) {
    this.nativeDsfOscillatorReady = false;
    return { Out: 0 };
  }
};
