// Curve Osc — worklet helpers (curve-osc-math.js loaded in the same Blob).

NodeLiveAudioProcessor.prototype.createCurveOscState = function createCurveOscState() {
  if (typeof createNodeGraphCurveOscState === "function") {
    return createNodeGraphCurveOscState();
  }
  return { phase: 0 };
};

NodeLiveAudioProcessor.prototype.curveOscillatorSample = function curveOscillatorSample(state, options) {
  if (typeof nodeGraphCurveOscillatorSample === "function") {
    return nodeGraphCurveOscillatorSample(state, options);
  }
  return { Out: 0, X: 0, Y: 0 };
};
