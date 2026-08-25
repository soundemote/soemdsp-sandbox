// Realtime worklet. Same math as the live evaluator.

NodeLiveAudioProcessor.prototype.createRmsState = function createRmsState() {
  return createNodeGraphRmsState();
};

NodeLiveAudioProcessor.prototype.rmsReadOptions = function rmsReadOptions(
  node,
  frame,
  frames,
  frameValues,
) {
  const read = (key, fallback) =>
    this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
  return {
    windowSec: read("window", 0.05),
    attackSec: read("attack", 0),
    releaseSec: read("release", 0.15),
    thresholdDb: read("thresholdDb", -12),
    peakHoldSec: read("peakHold", 0),
    logMode: read("logMode", 1),
  };
};

NodeLiveAudioProcessor.prototype.rmsSample = function rmsSample(
  state,
  input,
  options,
  sampleRate,
  hasInput,
) {
  return nodeGraphRmsSample(
    state,
    this.safeFilterNumber(input, state),
    options,
    sampleRate,
    hasInput,
  );
};

NodeLiveAudioProcessor.prototype.rmsStereoSample = function rmsStereoSample(
  state,
  left,
  right,
  options,
  sampleRate,
  hasLeft,
  hasRight,
) {
  return nodeGraphRmsStereoSample(
    state,
    this.safeFilterNumber(left, state),
    this.safeFilterNumber(right, state),
    options,
    sampleRate,
    hasLeft,
    hasRight,
  );
};
