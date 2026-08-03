// Worklet peel for gainBias. Math: gain-bias-math.js (same Blob).

NodeLiveAudioProcessor.prototype.gainBiasFrame = function gainBiasFrame(mono, left, right, amount, offset) {
  return nodeGraphGainBiasFrame(mono, left, right, amount, offset);
};
