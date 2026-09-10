NodeLiveAudioProcessor.prototype.createFractalSpiralState = function createFractalSpiralState() {
    return {
      phase: 0,
      spinPhase: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.fractalSpiralSample = function fractalSpiralSample(state, options = {}) {
    if (
      this.nativeFractalSpiralReady &&
      this.nativeFractalSpiral?.soemdsp_fractal_spiral_create &&
      this.nativeFractalSpiral?.soemdsp_fractal_spiral_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeFractalSpiral.soemdsp_fractal_spiral_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeFractalSpiral.soemdsp_fractal_spiral_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            nodeGraphFiniteNumber(options.spin),
            Math.max(0, nodeGraphFiniteNumber(options.size)),
            nodeGraphFiniteNumber(options.growth),
            Math.max(0.001, Math.min(0.98, Number(options.gain))),
            Math.max(1.0001, nodeGraphFiniteNumber(options.lacunarity, 1)),
            Math.max(1, Math.min(16, Math.round(nodeGraphFiniteNumber(options.octaves, 1)))),
            nodeGraphFiniteNumber(options.twist),
            sampleRateValue,
          );
          return {
            x: this.nativeFractalSpiral.soemdsp_fractal_spiral_x(state.nativeHandle),
            y: this.nativeFractalSpiral.soemdsp_fractal_spiral_y(state.nativeHandle),
            z: this.nativeFractalSpiral.soemdsp_fractal_spiral_z(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeFractalSpiralReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "fractal_spiral",
          status: "disabled",
          message: String(error?.message || error || "native Fractal Spiral failed"),
        });
      }
    }
    return 0;
  };

