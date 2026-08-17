NodeLiveAudioProcessor.prototype.u2bSample = function u2bSample(input) {
  const x = Number(input) || 0;
  if (this.nativeU2bReady && this.nativeU2b?.soemdsp_u2b_sample) {
    try {
      return this.safeFilterNumber(this.nativeU2b.soemdsp_u2b_sample(x), null);
    } catch (error) {
      this.nativeU2bReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "u2b",
        status: "disabled",
        message: String(error?.message || error || "native U2B failed"),
      });
    }
  }
  return x * 2 - 1;
};
