NodeLiveAudioProcessor.prototype.createRadarState = function createRadarState() {
    return {
      phase: 0,
      rotatorPhase: 0,
      resetWasHigh: false,
      nativeHandle: 0,
    };
  };

// Shared stdlib (node-graph-phasor-helpers.js, first in worklet Blob).
NodeLiveAudioProcessor.prototype.radarTrisaw = function radarTrisaw(phase, warp) {
    return nodeGraphTrisaw(phase, warp);
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
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeRadar.soemdsp_jbradar_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            nodeGraphFiniteNumber(options.phaseOffset),
            nodeGraphFiniteNumber(options.density),
            nodeGraphFiniteNumber(options.sharp),
            nodeGraphFiniteNumber(options.fade),
            nodeGraphFiniteNumber(options.rotation),
            nodeGraphFiniteNumber(options.direction),
            nodeGraphFiniteNumber(options.shade),
            nodeGraphFiniteNumber(options.lap),
            nodeGraphFiniteNumber(options.ringcut),
            nodeGraphFiniteNumber(options.pow1Up),
            nodeGraphFiniteNumber(options.pow1Down),
            nodeGraphFiniteNumber(options.pow2Bend),
            nodeGraphFiniteNumber(options.phaseInv),
            nodeGraphFiniteNumber(options.tunnelInv),
            nodeGraphFiniteNumber(options.spiralReturn),
            nodeGraphFiniteNumber(options.length),
            nodeGraphFiniteNumber(options.ratio),
            nodeGraphFiniteNumber(options.frontring),
            nodeGraphFiniteNumber(options.zoom),
            nodeGraphFiniteNumber(options.zDepth),
            nodeGraphFiniteNumber(options.inner),
            nodeGraphFiniteNumber(options.x),
            nodeGraphFiniteNumber(options.y),
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

