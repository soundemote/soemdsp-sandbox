NodeLiveAudioProcessor.prototype.vectorRgbSample = function vectorRgbSample(mixInput, nodeId) {
  return {
    X: Number(mixInput(nodeId, "X")) || 0,
    Y: Number(mixInput(nodeId, "Y")) || 0,
    R: Number(mixInput(nodeId, "R")) || 0,
    G: Number(mixInput(nodeId, "G")) || 0,
    B: Number(mixInput(nodeId, "B")) || 0,
    Blank: Number(mixInput(nodeId, "Blank")) || 0,
  };
};



NodeLiveAudioProcessor.prototype.gradientVectorscopeSample = function gradientVectorscopeSample(mixInput, nodeId) {
  return {
    X: Number(mixInput(nodeId, "X")) || 0,
    Y: Number(mixInput(nodeId, "Y")) || 0,
  };
};
