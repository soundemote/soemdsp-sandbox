// Worklet peel for vectorscopeTransform.
// Pure math lives in vectorscope-transform-math.js (loaded in the same Blob).
// Dispatch entry is in node-live-audio-worklet-evaluators.js and calls this.

NodeLiveAudioProcessor.prototype.vectorscopeTransformSample = function vectorscopeTransformSample(left, right, rotateDeg) {
  if (this.nativeVectorscopeTransformReady && this.nativeVectorscopeTransform?.soemdsp_vectorscope_transform_sample) {
    try {
      return {
        X: this.safeFilterNumber(
          this.nativeVectorscopeTransform.soemdsp_vectorscope_transform_sample(0, left, right, rotateDeg),
          null,
        ) ?? 0,
        Y: this.safeFilterNumber(
          this.nativeVectorscopeTransform.soemdsp_vectorscope_transform_sample(1, left, right, rotateDeg),
          null,
        ) ?? 0,
      };
    } catch (error) {
      this.nativeVectorscopeTransformReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "vectorscope_transform",
        status: "disabled",
        message: String(error?.message || error || "native Vectorscope Rotation failed"),
      });
    }
  }
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
