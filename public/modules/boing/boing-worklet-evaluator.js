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
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeBoing.soemdsp_jbboing_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            nodeGraphFiniteNumber(options.density),
            nodeGraphFiniteNumber(options.sharpness),
            nodeGraphFiniteNumber(options.rotX),
            nodeGraphFiniteNumber(options.rotY),
            nodeGraphFiniteNumber(options.zDepth),
            nodeGraphFiniteNumber(options.zAmount),
            nodeGraphFiniteNumber(options.ends),
            nodeGraphFiniteNumber(options.boing),
            nodeGraphFiniteNumber(options.boingStrength),
            nodeGraphFiniteNumber(options.dir),
            nodeGraphFiniteNumber(options.shape),
            nodeGraphFiniteNumber(options.volume),
            nodeGraphFiniteNumber(options.volumePreJump),
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

