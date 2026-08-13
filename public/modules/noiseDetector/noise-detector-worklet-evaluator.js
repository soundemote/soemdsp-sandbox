// Realtime worklet. Same math as the live evaluator.

NodeLiveAudioProcessor.prototype.createNoiseDetectorState = function createNoiseDetectorState() {
  return createNodeGraphNoiseDetectorState();
};

NodeLiveAudioProcessor.prototype.noiseDetectorSample = function noiseDetectorSample(
  state,
  left,
  mono,
  right,
  threshold,
  sampleRate,
  hasLeft,
  hasMono,
  hasRight,
) {
  return nodeGraphNoiseDetectorSample(
    state,
    this.safeFilterNumber(left, state),
    this.safeFilterNumber(mono, state),
    this.safeFilterNumber(right, state),
    threshold,
    sampleRate,
    hasLeft,
    hasMono,
    hasRight,
  );
};
