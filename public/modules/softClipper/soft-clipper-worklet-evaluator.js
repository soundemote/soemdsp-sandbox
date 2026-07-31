// Native-only Soft Clipper (no dry passthrough fallback).

NodeLiveAudioProcessor.prototype.nativeSoftClipperSample = function nativeSoftClipperSample(input, center = 0, width = 2) {
  if (!this.nativeSoftClipperReady || !this.nativeSoftClipper?.soemdsp_soft_clipper_sample) {
    throw new Error("native Soft Clipper not ready");
  }
  return this.safeFilterNumber(
    this.nativeSoftClipper.soemdsp_soft_clipper_sample(
      Number(input) || 0,
      Number(center) || 0,
      Number(width) || 2,
    ),
    null,
  );
};
