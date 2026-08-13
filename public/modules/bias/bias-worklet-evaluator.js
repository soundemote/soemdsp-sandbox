// Worklet peel for bias. Math: bias-math.js (same Blob).

NodeLiveAudioProcessor.prototype.biasFrame = function biasFrame(input, left, right, offset) {
  return nodeGraphBiasFrame(input, left, right, offset);
};
