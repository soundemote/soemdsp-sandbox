// Worklet peel for bias. Math: bias-math.js (same Blob).

NodeLiveAudioProcessor.prototype.biasFrame = function biasFrame(input, left, right, offset) {
  if (this.nativeBiasReady && this.nativeBias?.soemdsp_bias_sample) {
    try {
      return {
        Out: this.safeFilterNumber(this.nativeBias.soemdsp_bias_sample(input, offset), null) ?? 0,
      };
    } catch (error) {
      this.nativeBiasReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "bias",
        status: "disabled",
        message: String(error?.message || error || "native Bias failed"),
      });
    }
  }
  return nodeGraphBiasFrame(input, left, right, offset);
};
