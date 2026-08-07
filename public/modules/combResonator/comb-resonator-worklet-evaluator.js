// Comb Resonator — worklet.

NodeLiveAudioProcessor.prototype.createCombResonatorState = function createCombResonatorState() {
  if (typeof createNodeGraphCombResonatorState === "function") {
    return createNodeGraphCombResonatorState();
  }
  return {
    buffer: null,
    capacity: 0,
    writeIndex: 0,
    filled: 0,
    lp: 0,
    thiranX1: 0,
    thiranY1: 0,
    _lastTrig: 0,
  };
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
  if (typeof nodeGraphCombResonatorSample === "function") {
    return this.safeFilterNumber(
      nodeGraphCombResonatorSample(
        state, input, frequencyHz, decaySec, hold, damping, topology, invert, depth, amplitude, rate,
      ),
      null,
    );
  }
  return 0;
};

NodeLiveAudioProcessor.prototype.combResonatorTriggerEdge = function combResonatorTriggerEdge(state, trigger) {
  if (typeof nodeGraphCombResonatorTriggerEdge === "function") {
    return nodeGraphCombResonatorTriggerEdge(state, trigger);
  }
  return 0;
};
