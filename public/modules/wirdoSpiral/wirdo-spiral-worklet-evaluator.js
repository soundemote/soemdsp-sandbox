NodeLiveAudioProcessor.prototype.createWirdoSpiralState = function createWirdoSpiralState() {
    return { phase: 0, splashPhase: 0, resetWasHigh: false, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.wirdoSpiralWrap01 = function wirdoSpiralWrap01(v) {
    return v - Math.floor(v);
  };

NodeLiveAudioProcessor.prototype.wirdoSpiralSample = function wirdoSpiralSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.splashPhase = 0;
      if (state.nativeHandle && this.nativeWirdoSpiral?.soemdsp_jbwirdo_reset) {
        this.nativeWirdoSpiral.soemdsp_jbwirdo_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeWirdoSpiralReady &&
      this.nativeWirdoSpiral?.soemdsp_jbwirdo_create &&
      this.nativeWirdoSpiral?.soemdsp_jbwirdo_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeWirdoSpiral.soemdsp_jbwirdo_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeWirdoSpiral.soemdsp_jbwirdo_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            this.clampValue(Number(options.sharp) || 0, 0, 1),
            Number(options.cross) || 0,
            Number(options.density) || 0,
            Number(options.length) || 0,
            Number(options.rotate) || 0,
            Number(options.splashDepth) || 0,
            Number(options.splashDensity) || 0,
            Number(options.cut) || 0,
            Number(options.scrap) || 0,
            Number(options.ringCut) || 0,
            Number(options.splashSpeed) || 0,
            Number(options.syncCut) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeWirdoSpiral.soemdsp_jbwirdo_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeWirdoSpiral.soemdsp_jbwirdo_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeWirdoSpiralReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_wirdo_spiral",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam WirdoSpiral failed"),
        });
      }
    }
    return 0;
  };

