// Sinepulse — worklet.

NodeLiveAudioProcessor.prototype.createSinepulseState = function createSinepulseState() {
  if (typeof createNodeGraphSinepulseState === "function") {
    return createNodeGraphSinepulseState();
  }
  return { tooth: 0, phase: 0, lastReset: 0 };
};

NodeLiveAudioProcessor.prototype.sinepulseSample = function sinepulseSample(
  state,
  frequencyHz,
  sweep,
  direction,
  curve,
  hardReset,
  phaseOffset,
  amplitude,
  increment,
  resetGate,
  rate = sampleRate,
) {
  if (typeof nodeGraphSinepulseSample === "function") {
    return this.safeFilterNumber(
      nodeGraphSinepulseSample(
        state, frequencyHz, sweep, direction, curve, hardReset,
        phaseOffset, amplitude, increment, resetGate, rate,
      ),
      null,
    );
  }
  return 0;
};
