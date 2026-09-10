NodeLiveAudioProcessor.prototype.vectorRgbSample = function vectorRgbSample(mixInput, nodeId) {
  return {
    X: nodeGraphFiniteNumber(mixInput(nodeId, "X")),
    Y: nodeGraphFiniteNumber(mixInput(nodeId, "Y")),
    R: nodeGraphFiniteNumber(mixInput(nodeId, "R")),
    G: nodeGraphFiniteNumber(mixInput(nodeId, "G")),
    B: nodeGraphFiniteNumber(mixInput(nodeId, "B")),
    Blank: nodeGraphFiniteNumber(mixInput(nodeId, "Blank")),
  };
};



NodeLiveAudioProcessor.prototype.gradientVectorscopeSample = function gradientVectorscopeSample(mixInput, nodeId) {
  return {
    X: nodeGraphFiniteNumber(mixInput(nodeId, "X")),
    Y: nodeGraphFiniteNumber(mixInput(nodeId, "Y")),
  };
};

NodeLiveAudioProcessor.prototype.traceXyzSample = function traceXyzSample(mixInput, nodeId) {
  return {
    X: nodeGraphFiniteNumber(mixInput(nodeId, "X")),
    Y: nodeGraphFiniteNumber(mixInput(nodeId, "Y")),
    Z: nodeGraphFiniteNumber(mixInput(nodeId, "Z")),
  };
};

NodeLiveAudioProcessor.prototype.traceRgbSample = function traceRgbSample(mixInput, nodeId) {
  return {
    R: nodeGraphFiniteNumber(mixInput(nodeId, "R")),
    G: nodeGraphFiniteNumber(mixInput(nodeId, "G")),
    B: nodeGraphFiniteNumber(mixInput(nodeId, "B")),
  };
};
