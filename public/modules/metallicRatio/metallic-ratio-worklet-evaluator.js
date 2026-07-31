// Native-only Metallic Ratio (no closed-form JS fallback).

NodeLiveAudioProcessor.prototype.metallicRatioSample = function metallicRatioSample(index) {
  if (!this.nativeMetallicRatioReady || !this.nativeMetallicRatio?.soemdsp_metallic_ratio_sample) {
    throw new Error("native Metallic Ratio not ready");
  }
  return this.safeFilterNumber(
    this.nativeMetallicRatio.soemdsp_metallic_ratio_sample(Number(index) || 0),
    null,
  );
};
