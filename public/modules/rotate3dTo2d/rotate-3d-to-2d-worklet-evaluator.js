// Worklet peel for rotate3dTo2d.
// Pure math: rotate-3d-to-2d-math.js (loaded in the same Blob).

NodeLiveAudioProcessor.prototype.rotate3dTo2dSample = function rotate3dTo2dSample(x, y, z, rotateX, rotateY, rotateZ) {
  const out = nodeGraphRotate3dTo2d(
    this.safeFilterNumber(x, null),
    this.safeFilterNumber(y, null),
    this.safeFilterNumber(z, null),
    rotateX,
    rotateY,
    rotateZ,
  );
  return {
    X: this.safeFilterNumber(out.X, null),
    Y: this.safeFilterNumber(out.Y, null),
  };
};
