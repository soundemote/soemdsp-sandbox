NodeLiveAudioProcessor.prototype.createRadarState = function createRadarState() {
    return {
      phase: 0,
      rotatorPhase: 0,
      resetWasHigh: false,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.radarTrisaw = function radarTrisaw(phase, warp) {
    const safeWarp = this.clampValue(warp, 0.001, 0.999);
    const wrapped = phase - Math.floor(phase);
    return wrapped < safeWarp ? wrapped / safeWarp : (1 - wrapped) / (1 - safeWarp);
  };

NodeLiveAudioProcessor.prototype.radarSign = function radarSign(v) {
    return (v > 0 ? 1 : 0) - (v < 0 ? 1 : 0);
  };

NodeLiveAudioProcessor.prototype.radarSample = function radarSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.rotatorPhase = 0;
      if (state.nativeHandle && this.nativeRadar?.soemdsp_jbradar_reset) {
        this.nativeRadar.soemdsp_jbradar_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeRadarReady &&
      this.nativeRadar?.soemdsp_jbradar_create &&
      this.nativeRadar?.soemdsp_jbradar_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeRadar.soemdsp_jbradar_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeRadar.soemdsp_jbradar_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.phaseOffset) || 0,
            Number(options.density) || 0,
            Number(options.sharp) || 0,
            Number(options.fade) || 0,
            Number(options.rotation) || 0,
            Number(options.direction) || 0,
            Number(options.shade) || 0,
            Number(options.lap) || 0,
            Number(options.ringcut) || 0,
            Number(options.pow1Up) || 0,
            Number(options.pow1Down) || 0,
            Number(options.pow2Bend) || 0,
            Number(options.phaseInv) || 0,
            Number(options.tunnelInv) || 0,
            Number(options.spiralReturn) || 0,
            Number(options.length) || 0,
            Number(options.ratio) || 0,
            Number(options.frontring) || 0,
            Number(options.zoom) || 0,
            Number(options.zDepth) || 0,
            Number(options.inner) || 0,
            Number(options.x) || 0,
            Number(options.y) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeRadar.soemdsp_jbradar_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeRadar.soemdsp_jbradar_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeRadarReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_radar",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Radar failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

