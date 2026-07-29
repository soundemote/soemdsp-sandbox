NodeLiveAudioProcessor.prototype.createKeplerBouwkampState = function createKeplerBouwkampState() {
    return { phase: 0, resetWasHigh: false, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.keplerBouwkampSample = function keplerBouwkampSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      if (state.nativeHandle && this.nativeKeplerBouwkamp?.soemdsp_jbkepler_reset) {
        this.nativeKeplerBouwkamp.soemdsp_jbkepler_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeKeplerBouwkampReady &&
      this.nativeKeplerBouwkamp?.soemdsp_jbkepler_create &&
      this.nativeKeplerBouwkamp?.soemdsp_jbkepler_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeKeplerBouwkamp.soemdsp_jbkepler_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeKeplerBouwkamp.soemdsp_jbkepler_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.start) || 0,
            Number(options.length) || 0,
            Number(options.circles) || 0,
            Number(options.zoom) || 0,
            Number(options.rotation) || 0,
            Number(options.tri) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeKeplerBouwkamp.soemdsp_jbkepler_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeKeplerBouwkamp.soemdsp_jbkepler_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeKeplerBouwkampReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_kepler_bouwkamp",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Kepler-Bouwkamp failed"),
        });
      }
    }
    return 0;
  };

