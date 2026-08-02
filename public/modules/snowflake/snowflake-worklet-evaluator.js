// Snowflake — worklet: prefer native WASM; fall back to snowflake-math.js.

NodeLiveAudioProcessor.prototype.createSnowflakeState = function createSnowflakeState() {
  return {
    phase: 0,
    spinPhase: 0,
    cacheKey: "",
    points: null,
    totalLength: 0,
    segIndex: 0,
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.destroySnowflakeNativeState = function destroySnowflakeNativeState(state) {
  if (state?.nativeHandle && this.nativeSnowflake?.soemdsp_snowflake_destroy) {
    try {
      this.nativeSnowflake.soemdsp_snowflake_destroy(state.nativeHandle);
    } catch (_) { /* ignore */ }
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.snowflakeSample = function snowflakeSample(state, options = {}) {
  const st = state || this.createSnowflakeState();

  // —— Native WASM path (worklet DSP) ————————————————————————————————
  if (
    this.nativeSnowflakeReady
    && this.nativeSnowflake?.soemdsp_snowflake_create
    && this.nativeSnowflake?.soemdsp_snowflake_sample
  ) {
    try {
      if (!st.nativeHandle) {
        st.nativeHandle = this.nativeSnowflake.soemdsp_snowflake_create();
      }
      if (st.nativeHandle) {
        const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
        this.nativeSnowflake.soemdsp_snowflake_sample(
          st.nativeHandle,
          Math.max(0, Number(options.frequencyHz) || 0),
          Number(options.pattern) || 0,
          Number(options.iterations) || 0,
          Number(options.angle) || 60,
          Math.max(0, Number(options.size) || 0),
          Number(options.reverse) || 0,
          Number(options.spin) || 0,
          Number.isFinite(Number(options.level)) ? Number(options.level) : 1,
          Number(options.reset) || 0,
          sampleRateValue,
        );
        return {
          X: this.nativeSnowflake.soemdsp_snowflake_x(st.nativeHandle),
          Y: this.nativeSnowflake.soemdsp_snowflake_y(st.nativeHandle),
          Out: this.nativeSnowflake.soemdsp_snowflake_out(st.nativeHandle),
        };
      }
    } catch (error) {
      this.nativeSnowflakeReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "snowflake",
        status: "disabled",
        message: String(error?.message || error || "native Snowflake failed"),
      });
    }
  }

  // —— JS fallback (snowflake-math.js in worklet Blob) ————————————————
  if (typeof nodeGraphSnowflakeSample === "function") {
    return nodeGraphSnowflakeSample(st, options);
  }
  return { X: 0, Y: 0, Out: 0 };
};
