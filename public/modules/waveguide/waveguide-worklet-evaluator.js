// Waveguide — worklet (under construction: passthrough).

NodeLiveAudioProcessor.prototype.createWaveguideState = function createWaveguideState() {
  if (typeof createNodeGraphWaveguideState === "function") {
    return createNodeGraphWaveguideState();
  }
  return { stub: true };
};

NodeLiveAudioProcessor.prototype.waveguideSample = function waveguideSample(state, input, amplitude) {
  if (typeof nodeGraphWaveguideSample === "function") {
    return this.safeFilterNumber(nodeGraphWaveguideSample(state, input, amplitude), null);
  }
  const amp = Number.isFinite(Number(amplitude)) ? Number(amplitude) : 1;
  return this.safeFilterNumber((Number(input) || 0) * amp, null);
};
