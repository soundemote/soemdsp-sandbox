// Mode Resonator — worklet. Native-only (APP_POLICY §2/§5). Silence if WASM cold.

NodeLiveAudioProcessor.prototype.createModeResonatorState = function createModeResonatorState() {
  return { nativeHandle: 0, _lastTrig: 0 };
};

NodeLiveAudioProcessor.prototype.modeResonatorTriggerEdge = function modeResonatorTriggerEdge(state, trigger) {
  if (typeof nodeGraphModeResonatorTriggerEdge === "function") {
    return nodeGraphModeResonatorTriggerEdge(state, trigger);
  }
  const t = Number(trigger) || 0;
  const edge = state._lastTrig <= 0 && t > 0 ? 1 : 0;
  state._lastTrig = t;
  return edge;
};

NodeLiveAudioProcessor.prototype.modeResonatorSample = function modeResonatorSample(
  state,
  input,
  frequencyHz,
  decaySec,
  hold,
  amplitude,
  rate = sampleRate,
) {
  if (
    !this.nativeModeResonatorReady
    || !this.nativeModeResonator?.soemdsp_mode_resonator_create
    || !this.nativeModeResonator?.soemdsp_mode_resonator_sample
  ) {
    return 0;
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeModeResonator.soemdsp_mode_resonator_create();
    }
    if (!state.nativeHandle) return 0;
    return this.safeFilterNumber(
      this.nativeModeResonator.soemdsp_mode_resonator_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, null),
        Math.max(0, Number(frequencyHz) || 0),
        Math.max(0, Number(decaySec) || 0),
        hold ? 1 : 0,
        Number(amplitude) || 0,
        Math.max(1, Number(rate) || sampleRate || 44100),
      ),
      null,
    );
  } catch (error) {
    this.nativeModeResonatorReady = false;
    state.nativeHandle = 0;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "mode_resonator",
      status: "disabled",
      message: String(error?.message || error || "native mode resonator failed"),
    });
    return 0;
  }
};
