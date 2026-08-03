// Worklet peel for bias. Math: bias-math.js (same Blob).

NodeLiveAudioProcessor.prototype.biasFrame = function biasFrame(mono, left, right, offset) {
  return nodeGraphBiasFrame(mono, left, right, offset);
};
