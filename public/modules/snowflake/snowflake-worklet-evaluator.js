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
        // Direction −1…1. Resolve legacy reverse if direction omitted.
        let direction = Number(options.direction);
        if (!Number.isFinite(direction)) {
          direction = Number(options.reverse) > 0.5 ? 0 : 1;
        }
        direction = direction < -1 ? -1 : direction > 1 ? 1 : direction;
        // Native ABI keeps (size, reverse) arity for wasm compatibility:
        //   size ignored (always 1 — Amplitude scales)
        //   reverse slot = direction (−1…1) when version ≥ 2 (trisaw morph)
        //   version 1 treats reverse as bool (map direction → forward/ping-pong)
        const nativeVer = Number(this.nativeSnowflake.soemdsp_snowflake_version?.() || 1);
        const sizeArg = 1;
        const reverseOrDirection = nativeVer >= 2
          ? direction
          : (direction < 0.5 ? 1 : 0);
        this.nativeSnowflake.soemdsp_snowflake_sample(
          st.nativeHandle,
          Math.max(0, Number(options.frequencyHz) || 0),
          Number(options.pattern) || 0,
          Number(options.iterations) || 0,
          Number(options.angle) || 60,
          sizeArg,
          reverseOrDirection,
          Number(options.spin) || 0,
          Number.isFinite(Number(options.level)) ? Number(options.level) : 1,
          Number(options.reset) || 0,
          sampleRateValue,
        );
        return {
          X: this.nativeSnowflake.soemdsp_snowflake_x(st.nativeHandle),
          Y: this.nativeSnowflake.soemdsp_snowflake_y(st.nativeHandle),
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
  return { X: 0, Y: 0 };
};
