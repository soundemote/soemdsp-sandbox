NodeLiveAudioProcessor.prototype.createBlubbState = function createBlubbState() {
    return { phase: 0, resetWasHigh: false, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.blubbSample = function blubbSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      if (state.nativeHandle && this.nativeBlubb?.soemdsp_jbblubb_reset) {
        this.nativeBlubb.soemdsp_jbblubb_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeBlubbReady &&
      this.nativeBlubb?.soemdsp_jbblubb_create &&
      this.nativeBlubb?.soemdsp_jbblubb_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeBlubb.soemdsp_jbblubb_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeBlubb.soemdsp_jbblubb_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.shape) || 0,
            Number(options.rotX) || 0,
            Number(options.rotY) || 0,
            Number(options.zDepth) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeBlubb.soemdsp_jbblubb_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeBlubb.soemdsp_jbblubb_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeBlubbReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_blubb",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Blubb failed"),
        });
      }
    }
    return 0;
  };

