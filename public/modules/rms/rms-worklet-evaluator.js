// Realtime worklet. Same math as the live evaluator.

NodeLiveAudioProcessor.prototype.createRmsState = function createRmsState() {
  return createNodeGraphRmsState();
};

NodeLiveAudioProcessor.prototype.rmsSample = function rmsSample(
  state,
  left,
  mono,
  right,
  windowSec,
  thresholdDb,
  sampleRate,
  hasLeft,
  hasMono,
  hasRight,
) {
  return nodeGraphRmsSample(
    state,
    this.safeFilterNumber(left, state),
    this.safeFilterNumber(mono, state),
    this.safeFilterNumber(right, state),
    windowSec,
    thresholdDb,
    sampleRate,
    hasLeft,
    hasMono,
    hasRight,
  );
};
