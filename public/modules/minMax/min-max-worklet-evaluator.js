NodeLiveAudioProcessor.prototype.createMinMaxState = function createMinMaxState() {
    return { nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.minMaxSampleJs = function minMaxSampleJs(state, values, connectedMask) {
    let have = false;
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 4; i++) {
      if (!(connectedMask & (1 << i))) continue;
      const v = this.safeFilterNumber(values[i], state);
      if (!have) {
        lo = v;
        hi = v;
        have = true;
      } else {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return {
      Max: this.safeFilterNumber(have ? hi : 0, state),
      Min: this.safeFilterNumber(have ? lo : 0, state),
    };
  };

NodeLiveAudioProcessor.prototype.minMaxSample = function minMaxSample(state, values, connectedMask) {
    if (this.nativeMinMaxReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeMinMax.soemdsp_min_max_create();
        }
        if (state.nativeHandle) {
          const max = this.nativeMinMax.soemdsp_min_max_sample(
            state.nativeHandle,
            this.safeFilterNumber(values[0], state),
            this.safeFilterNumber(values[1], state),
            this.safeFilterNumber(values[2], state),
            this.safeFilterNumber(values[3], state),
            connectedMask,
          );
          return {
            Max: this.safeFilterNumber(max, state),
            Min: this.safeFilterNumber(this.nativeMinMax.soemdsp_min_max_min(state.nativeHandle), state),
          };
        }
      } catch (error) {
        this.nativeMinMaxReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "min_max",
          status: "disabled",
          message: String(error?.message || error || "native Min/Max failed"),
        });
      }
    }
    return this.minMaxSampleJs(state, values, connectedMask);
  };
