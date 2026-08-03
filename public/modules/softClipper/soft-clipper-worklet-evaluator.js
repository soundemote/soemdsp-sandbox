// Soft Clipper — native preferred; pure math fallback (soft-clipper-math.js).

NodeLiveAudioProcessor.prototype.nativeSoftClipperSample = function nativeSoftClipperSample(input, center = 0, width = 2) {
  if (this.nativeSoftClipperReady && this.nativeSoftClipper?.soemdsp_soft_clipper_sample) {
    try {
      return this.safeFilterNumber(
        this.nativeSoftClipper.soemdsp_soft_clipper_sample(
          Number(input) || 0,
          Number(center) || 0,
          Number(width) || 2,
        ),
        null,
      );
    } catch (error) {
      this.nativeSoftClipperReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "soft_clipper",
        status: "disabled",
        message: String(error?.message || error || "native Soft Clipper failed"),
      });
    }
  }
  if (typeof nodeGraphSoftClipperSample === "function") {
    return this.safeFilterNumber(nodeGraphSoftClipperSample(input, center, width), null);
  }
  return this.safeFilterNumber(input, null) ?? 0;
};
