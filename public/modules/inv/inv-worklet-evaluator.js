NodeLiveAudioProcessor.prototype.invSample = function invSample(input) {
  const x = Number(input) || 0;
  if (this.nativeInvReady && this.nativeInv?.soemdsp_inv_sample) {
    try {
      return this.safeFilterNumber(this.nativeInv.soemdsp_inv_sample(x), null);
    } catch (error) {
      this.nativeInvReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "inv",
        status: "disabled",
        message: String(error?.message || error || "native Inv failed"),
      });
    }
  }
  return -x;
};
