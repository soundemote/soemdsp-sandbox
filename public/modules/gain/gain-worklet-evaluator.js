// Worklet peel for gain. Math: gain-math.js (same Blob).

NodeLiveAudioProcessor.prototype.gainFrame = function gainFrame(mono, left, right, amount, offset = 0) {
  return nodeGraphGainFrame(mono, left, right, amount, offset);
};

NodeLiveAudioProcessor.prototype.gainFrameDb = function gainFrameDb(mono, left, right, opts) {
  return nodeGraphGainFrameDb(mono, left, right, opts);
};

// Legacy name used by old worklet dispatch.
NodeLiveAudioProcessor.prototype.gainBiasFrame = function gainBiasFrame(mono, left, right, amount, offset) {
  return this.gainFrame(mono, left, right, amount, offset);
};
