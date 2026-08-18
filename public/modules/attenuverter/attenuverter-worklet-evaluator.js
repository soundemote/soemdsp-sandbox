// Worklet peel for attenuverter. Math: attenuverter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.attenuverterFrame = function attenuverterFrame(input, amplitude, offset) {
  if (this.nativeAttenuverterReady && this.nativeAttenuverter?.soemdsp_attenuverter_sample) {
    try {
      return {
        Out: this.safeFilterNumber(
          this.nativeAttenuverter.soemdsp_attenuverter_sample(input, amplitude, offset),
          null,
        ) ?? 0,
      };
    } catch (error) {
      this.nativeAttenuverterReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "attenuverter",
        status: "disabled",
        message: String(error?.message || error || "native Attenuverter failed"),
      });
    }
  }
  return nodeGraphAttenuverterFrame(input, amplitude, offset);
};
