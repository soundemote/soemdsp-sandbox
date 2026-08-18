// Worklet peel for rotate3dTo2d.
// Pure math: rotate-3d-to-2d-math.js (loaded in the same Blob).

NodeLiveAudioProcessor.prototype.rotate3dTo2dSample = function rotate3dTo2dSample(x, y, z, rotateX, rotateY, rotateZ) {
  if (this.nativeRotate3dTo2dReady && this.nativeRotate3dTo2d?.soemdsp_rotate_3d_to_2d_sample) {
    try {
      return {
        X: this.safeFilterNumber(
          this.nativeRotate3dTo2d.soemdsp_rotate_3d_to_2d_sample(0, x, y, z, rotateX, rotateY, rotateZ),
          null,
        ) ?? 0,
        Y: this.safeFilterNumber(
          this.nativeRotate3dTo2d.soemdsp_rotate_3d_to_2d_sample(1, x, y, z, rotateX, rotateY, rotateZ),
          null,
        ) ?? 0,
      };
    } catch (error) {
      this.nativeRotate3dTo2dReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "rotate_3d_to_2d",
        status: "disabled",
        message: String(error?.message || error || "native Rotation 3D to 2D failed"),
      });
    }
  }
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
