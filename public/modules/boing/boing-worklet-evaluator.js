NodeLiveAudioProcessor.prototype.createBoingState = function createBoingState() {
    return { phase: 0, zHistory: 0, resetWasHigh: false, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.boingSample = function boingSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.zHistory = 0;
      if (state.nativeHandle && this.nativeBoing?.soemdsp_jbboing_reset) {
        this.nativeBoing.soemdsp_jbboing_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeBoingReady &&
      this.nativeBoing?.soemdsp_jbboing_create &&
      this.nativeBoing?.soemdsp_jbboing_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeBoing.soemdsp_jbboing_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeBoing.soemdsp_jbboing_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.density) || 0,
            Number(options.sharpness) || 0,
            Number(options.rotX) || 0,
            Number(options.rotY) || 0,
            Number(options.zDepth) || 0,
            Number(options.zAmount) || 0,
            Number(options.ends) || 0,
            Number(options.boing) || 0,
            Number(options.boingStrength) || 0,
            Number(options.dir) || 0,
            Number(options.shape) || 0,
            Number(options.volume) || 0,
            Number(options.volumePreJump) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeBoing.soemdsp_jbboing_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeBoing.soemdsp_jbboing_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeBoingReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_boing",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Boing failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

