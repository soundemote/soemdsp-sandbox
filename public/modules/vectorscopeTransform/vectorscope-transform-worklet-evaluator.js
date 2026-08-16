// Worklet peel for vectorscopeTransform.
// Pure math lives in vectorscope-transform-math.js (loaded in the same Blob).
// Dispatch entry is in node-live-audio-worklet-evaluators.js and calls this.

NodeLiveAudioProcessor.prototype.vectorscopeTransformSample = function vectorscopeTransformSample(left, right, rotateDeg) {
  const out = nodeGraphVectorscopeTransform(
    this.safeFilterNumber(left, null),
    this.safeFilterNumber(right, null),
    rotateDeg,
  );
  return {
    X: this.safeFilterNumber(out.X, null),
    Y: this.safeFilterNumber(out.Y, null),
  };
};
