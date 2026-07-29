NodeLiveAudioProcessor.prototype.createTorusState = function createTorusState() {
    return {
      phase: 0,
      wanderPhase: 0,
      xPhase: 0,
      yPhase: 0,
      zPhase: 0,
      darkAnglePhase: 0,
      resetWasHigh: false,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.torusSample = function torusSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.wanderPhase = 0;
      state.xPhase = 0;
      state.yPhase = 0;
      state.zPhase = 0;
      state.darkAnglePhase = 0;
      if (state.nativeHandle && this.nativeTorus?.soemdsp_jbtorus_reset) {
        this.nativeTorus.soemdsp_jbtorus_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeTorusReady &&
      this.nativeTorus?.soemdsp_jbtorus_create &&
      this.nativeTorus?.soemdsp_jbtorus_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeTorus.soemdsp_jbtorus_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeTorus.soemdsp_jbtorus_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.density) || 0,
            Number(options.quantizeDensity) || 0,
            Number(options.subdensity) || 0,
            Number(options.quantizeSubDensity) || 0,
            Number(options.sharp) || 0,
            Number(options.size) || 0,
            Number(options.length) || 0,
            Number(options.balance) || 0,
            Number(options.wander) || 0,
            Number(options.darkAngle) || 0,
            Number(options.darkIntensity) || 0,
            Number(options.rotX) || 0,
            Number(options.rotY) || 0,
            Number(options.rotZ) || 0,
            Number(options.zAngleX) || 0,
            Number(options.zAngleY) || 0,
            Number(options.zDepth) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeTorus.soemdsp_jbtorus_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeTorus.soemdsp_jbtorus_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeTorusReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_torus",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Torus failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

