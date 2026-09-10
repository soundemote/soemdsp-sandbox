// Comb Resonator — worklet. Native-only (APP_POLICY §2/§5). Silence if WASM cold.

NodeLiveAudioProcessor.prototype.createCombResonatorState = function createCombResonatorState() {
  return { nativeHandle: 0, _lastTrig: 0 };
};

NodeLiveAudioProcessor.prototype.combResonatorTriggerEdge = function combResonatorTriggerEdge(state, trigger) {
  if (typeof nodeGraphCombResonatorTriggerEdge === "function") {
    return nodeGraphCombResonatorTriggerEdge(state, trigger);
  }
  const t = nodeGraphFiniteNumber(trigger);
  const on = t > 0.5;
  const edge = on && !state._lastTrig ? 1 : 0;
  state._lastTrig = on ? 1 : 0;
  return edge;
};

NodeLiveAudioProcessor.prototype.combResonatorSample = function combResonatorSample(
  state,
  input,
  frequencyHz,
  decaySec,
  hold,
  damping,
  topology,
  invert,
  depth,
  amplitude,
  rate = sampleRate,
) {
  if (
    !this.nativeCombResonatorReady
    || !this.nativeCombResonator?.soemdsp_comb_resonator_create
    || !this.nativeCombResonator?.soemdsp_comb_resonator_sample
  ) {
    return 0;
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeCombResonator.soemdsp_comb_resonator_create();
    }
    if (!state.nativeHandle) return 0;
    return this.safeFilterNumber(
      this.nativeCombResonator.soemdsp_comb_resonator_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, null),
        Math.max(0, nodeGraphFiniteNumber(frequencyHz)),
        Math.max(0, nodeGraphFiniteNumber(decaySec)),
        hold ? 1 : 0,
        nodeGraphFiniteNumber(damping),
        Math.round(nodeGraphFiniteNumber(topology)),
        Math.round(nodeGraphFiniteNumber(invert)),
        nodeGraphFiniteNumber(depth),
        nodeGraphFiniteNumber(amplitude),
        Math.max(1, nodeGraphFiniteNumber(rate, nodeGraphFiniteNumber(sampleRate, 44100))),
      ),
      null,
    );
  } catch (error) {
    this.nativeCombResonatorReady = false;
    state.nativeHandle = 0;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "comb_resonator",
      status: "disabled",
      message: String(error?.message || error || "native comb resonator failed"),
    });
    return 0;
  }
};
