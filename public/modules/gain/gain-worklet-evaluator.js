// Worklet peel for gain. Math: gain-math.js (same Blob).

NodeLiveAudioProcessor.prototype.gainFrame = function gainFrame(mono, left, right, amount) {
  return nodeGraphGainFrame(mono, left, right, amount);
};
