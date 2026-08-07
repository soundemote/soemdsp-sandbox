// Mode Resonator — worklet.

NodeLiveAudioProcessor.prototype.createModeResonatorState = function createModeResonatorState() {
  if (typeof createNodeGraphModeResonatorState === "function") {
    return createNodeGraphModeResonatorState();
  }
  return { y1: 0, y2: 0, a1: 0, a2: 0, g: 0, _lastTrig: 0 };
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
  if (typeof nodeGraphModeResonatorSample === "function") {
    return this.safeFilterNumber(
      nodeGraphModeResonatorSample(state, input, frequencyHz, decaySec, hold, amplitude, rate),
      null,
    );
  }
  return 0;
};

NodeLiveAudioProcessor.prototype.modeResonatorTriggerEdge = function modeResonatorTriggerEdge(state, trigger) {
  if (typeof nodeGraphModeResonatorTriggerEdge === "function") {
    return nodeGraphModeResonatorTriggerEdge(state, trigger);
  }
  return 0;
};
