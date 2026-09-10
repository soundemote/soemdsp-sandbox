// Realtime worklet evaluator methods for bradley2a, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.bradley2ASample(...) directly.
NodeLiveAudioProcessor.prototype.createBradley2AState = function createBradley2AState() {
  return {
    nativeHandle: 0,
    carrierPhase: 0,
    jitterLfoPhase: 0,
    ampLfoPhase: 0,
    shiftPhase: 0,
    interfPhase: 0,
    hitClock: 0,
    hitSamplesLeft: 0,
    noiseSeed: 0x2a2a2a2a,
  };
};

// JS mirror of bradley_2a.cpp's soemdsp_bradley_2a_sample -- used only
// when the wasm module hasn't loaded yet or fails. Same math, same
// parameter order/meaning; Math.sin replaces the .cpp's hand-rolled
// dsp_sin since JS has a native one.
NodeLiveAudioProcessor.prototype.bradley2ASample = function bradley2ASample(state, params, rate = sampleRate) {
  if (
    this.nativeBradley2AReady &&
    this.nativeBradley2A?.soemdsp_bradley_2a_create &&
    this.nativeBradley2A?.soemdsp_bradley_2a_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeBradley2A.soemdsp_bradley_2a_create();
      }
      if (state.nativeHandle) {
        const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
        const out = this.nativeBradley2A.soemdsp_bradley_2a_sample(
          state.nativeHandle,
          nodeGraphFiniteNumber(params.carrierFreq),
          nodeGraphFiniteNumber(params.freqOffset),
          nodeGraphFiniteNumber(params.jitterDepth),
          nodeGraphFiniteNumber(params.jitterRate),
          nodeGraphFiniteNumber(params.ampDepth),
          nodeGraphFiniteNumber(params.ampRate),
          nodeGraphFiniteNumber(params.interfLevel),
          nodeGraphFiniteNumber(params.interfFreq),
          nodeGraphFiniteNumber(params.harm2),
          nodeGraphFiniteNumber(params.harm3),
          nodeGraphFiniteNumber(params.hitRate),
          nodeGraphFiniteNumber(params.hitDuration),
          nodeGraphFiniteNumber(params.hitGain),
          nodeGraphFiniteNumber(params.hitPhase),
          nodeGraphFiniteNumber(params.impulseLevel),
          nodeGraphFiniteNumber(params.amplitude),
          safeRate,
        );
        return this.safeFilterNumber(out, null);
      }
    } catch (error) {
      this.nativeBradley2AReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "bradley_2a",
        status: "disabled",
        message: String(error?.message || error || "native Bradley 2A failed"),
      });
    }
  }
  return 0;
};
