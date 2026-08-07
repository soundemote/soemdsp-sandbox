// Phase Disperse — worklet.

NodeLiveAudioProcessor.prototype.createPhaseDisperseState = function createPhaseDisperseState() {
  if (typeof createNodeGraphPhaseDisperseState === "function") {
    return createNodeGraphPhaseDisperseState();
  }
  return { stages: [], b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
};

NodeLiveAudioProcessor.prototype.phaseDisperseSample = function phaseDisperseSample(
  state,
  input,
  frequencyHz,
  filters,
  pinch,
  rate = sampleRate,
) {
  if (typeof nodeGraphPhaseDisperseSample === "function") {
    return this.safeFilterNumber(
      nodeGraphPhaseDisperseSample(state, input, frequencyHz, filters, pinch, rate),
      null,
    );
  }
  return this.safeFilterNumber(Number(input) || 0, null);
};
