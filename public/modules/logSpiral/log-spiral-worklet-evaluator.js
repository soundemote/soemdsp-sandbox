NodeLiveAudioProcessor.prototype.createLogSpiralState = function createLogSpiralState() {
    return {
      phase: 0,
      spinPhase: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.logSpiralSample = function logSpiralSample(state, options = {}) {
    if (
      this.nativeLogSpiralReady &&
      this.nativeLogSpiral?.soemdsp_log_spiral_create &&
      this.nativeLogSpiral?.soemdsp_log_spiral_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeLogSpiral.soemdsp_log_spiral_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeLogSpiral.soemdsp_log_spiral_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            nodeGraphFiniteNumber(options.spin),
            Math.max(0, nodeGraphFiniteNumber(options.size)),
            nodeGraphFiniteNumber(options.growth),
            Math.max(0.1, nodeGraphFiniteNumber(options.turns, 1)),
            sampleRateValue,
          );
          return {
            x: this.nativeLogSpiral.soemdsp_log_spiral_x(state.nativeHandle),
            y: this.nativeLogSpiral.soemdsp_log_spiral_y(state.nativeHandle),
            z: this.nativeLogSpiral.soemdsp_log_spiral_z(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeLogSpiralReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "log_spiral",
          status: "disabled",
          message: String(error?.message || error || "native Logarithmic Spiral failed"),
        });
      }
    }
    return 0;
  };

