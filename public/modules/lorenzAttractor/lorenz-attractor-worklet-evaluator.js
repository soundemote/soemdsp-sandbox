NodeLiveAudioProcessor.prototype.createLorenzAttractorState = function createLorenzAttractorState() {
    return {
      resetWasHigh: false,
      x: 0.1,
      y: 0,
      z: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.lorenzAttractorSample = function lorenzAttractorSample(options = {}) {
    const state = options.state || this.createLorenzAttractorState();
    if (
      this.nativeLorenzAttractorReady &&
      this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_create &&
      this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeLorenzAttractor.soemdsp_lorenz_attractor_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeLorenzAttractor.soemdsp_lorenz_attractor_sample(
            state.nativeHandle,
            Number(options.reset) || 0,
            Math.max(0, Number(options.speed) || 0),
            Math.max(0, Number(options.sigma) || 10),
            Number.isFinite(Number(options.rho)) ? Number(options.rho) : 28,
            Math.max(0, Number(options.beta) || 8 / 3),
            Number(options.rotate) || 0,
            Math.max(0, Number(options.scale) || 1),
            this.clampValue(Number(options.zDepth) || 0, 0, 1),
            sampleRateValue,
          );
          return {
            x: this.nativeLorenzAttractor.soemdsp_lorenz_attractor_x(state.nativeHandle),
            y: this.nativeLorenzAttractor.soemdsp_lorenz_attractor_y(state.nativeHandle),
            z: this.nativeLorenzAttractor.soemdsp_lorenz_attractor_z(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeLorenzAttractorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "lorenz_attractor",
          status: "disabled",
          message: String(error?.message || error || "native Lorenz Attractor failed"),
        });
      }
    }
    return { x: 0, y: 0, z: 0 };
  };

