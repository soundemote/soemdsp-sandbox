NodeLiveAudioProcessor.prototype.b2uSample = function b2uSample(input) {
  const x = Number(input) || 0;
  if (this.nativeB2uReady && this.nativeB2u?.soemdsp_b2u_sample) {
    try {
      return this.safeFilterNumber(this.nativeB2u.soemdsp_b2u_sample(x), null);
    } catch (error) {
      this.nativeB2uReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "b2u",
        status: "disabled",
        message: String(error?.message || error || "native B2U failed"),
      });
    }
  }
  return (x + 1) * 0.5;
};
