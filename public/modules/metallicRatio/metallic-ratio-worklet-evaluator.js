// Metallic Ratio — native preferred; pure math fallback (metallic-ratio-math.js).

NodeLiveAudioProcessor.prototype.metallicRatioSample = function metallicRatioSample(index) {
  if (this.nativeMetallicRatioReady && this.nativeMetallicRatio?.soemdsp_metallic_ratio_sample) {
    try {
      return this.safeFilterNumber(
        this.nativeMetallicRatio.soemdsp_metallic_ratio_sample(Number(index) || 0),
        null,
      );
    } catch (error) {
      this.nativeMetallicRatioReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "metallic_ratio",
        status: "disabled",
        message: String(error?.message || error || "native Metallic Ratio failed"),
      });
    }
  }
  if (typeof nodeGraphMetallicRatioSample === "function") {
    const out = nodeGraphMetallicRatioSample(index);
    return this.safeFilterNumber(out?.Ratio, null);
  }
  return 0;
};
