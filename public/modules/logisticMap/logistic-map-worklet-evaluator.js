NodeLiveAudioProcessor.prototype.createLogisticMapState = function createLogisticMapState() {
  return {
    hasStarted: false,
    phase: 0,
    x: 0.5,
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.logisticMapSample = function logisticMapSample(state, options = {}) {
  if (
    this.nativeLogisticMapReady &&
    this.nativeLogisticMap?.soemdsp_logistic_map_create &&
    this.nativeLogisticMap?.soemdsp_logistic_map_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeLogisticMap.soemdsp_logistic_map_create();
      }
      if (state.nativeHandle) {
        const resetActive = Number(options.reset) > 0 ? 1 : 0;
        const rate = Math.max(0, Number(options.rate) || 0);
        const r = this.clampValue(Number(options.r) || 0, 0, 4);
        const seed = this.clampValue(Number(options.seed) || 0.5, 0.0001, 0.9999);
        const level = Number(options.level) || 0;
        const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
        const scaled = this.nativeLogisticMap.soemdsp_logistic_map_sample(
          state.nativeHandle,
          resetActive,
          rate,
          r,
          seed,
          level,
          sampleRateValue,
        );
        return this.safeFilterNumber(scaled, null);
      }
    } catch (error) {
      this.nativeLogisticMapReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "logistic_map",
        status: "disabled",
        message: String(error?.message || error || "native Logistic Map failed"),
      });
    }
  }
  // JS path: pure map (logistic-map-math.js).
  if (typeof nodeGraphLogisticMapCore === "function") {
    if (typeof state.hasStarted !== "boolean") state.hasStarted = false;
    if (!Number.isFinite(state.phase)) state.phase = 0;
    if (!Number.isFinite(state.x)) state.x = 0.5;
    return this.safeFilterNumber(nodeGraphLogisticMapCore(state, options), null);
  }
  return 0;
};
