// Chua Attractor — native preferred; pure math fallback (chua-attractor-math.js).

NodeLiveAudioProcessor.prototype.createChuaAttractorState = function createChuaAttractorState() {
  return {
    resetWasHigh: false,
    x: 0.1,
    y: 0,
    z: 0,
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.chuaAttractorSample = function chuaAttractorSample(state, options = {}) {
  if (
    this.nativeChuaAttractorReady &&
    this.nativeChuaAttractor?.soemdsp_chua_attractor_create &&
    this.nativeChuaAttractor?.soemdsp_chua_attractor_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeChuaAttractor.soemdsp_chua_attractor_create();
      }
      if (state.nativeHandle) {
        const resetActive = Number(options.reset) > 0.5 ? 1 : 0;
        const speed = Math.max(0, Number(options.speed) || 0);
        const alpha = Number(options.alpha) || 0;
        const beta = Number(options.beta) || 0;
        const m0 = Number(options.m0) || 0;
        const m1 = Number(options.m1) || 0;
        const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
        this.nativeChuaAttractor.soemdsp_chua_attractor_sample(
          state.nativeHandle,
          resetActive,
          speed,
          alpha,
          beta,
          m0,
          m1,
          sampleRateValue,
        );
        return {
          x: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_x(state.nativeHandle), null),
          y: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_y(state.nativeHandle), null),
          z: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_z(state.nativeHandle), null),
        };
      }
    } catch (error) {
      this.nativeChuaAttractorReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "chua_attractor",
        status: "disabled",
        message: String(error?.message || error || "native Chua Attractor failed"),
      });
    }
  }
  if (typeof nodeGraphChuaAttractorCore === "function") {
    if (typeof state.resetWasHigh !== "boolean") state.resetWasHigh = false;
    if (!Number.isFinite(state.x)) state.x = 0.1;
    if (!Number.isFinite(state.y)) state.y = 0;
    if (!Number.isFinite(state.z)) state.z = 0;
    const out = nodeGraphChuaAttractorCore(state, options);
    return {
      x: this.safeFilterNumber(out.x, null),
      y: this.safeFilterNumber(out.y, null),
      z: this.safeFilterNumber(out.z, null),
    };
  }
  return { x: 0, y: 0, z: 0 };
};
