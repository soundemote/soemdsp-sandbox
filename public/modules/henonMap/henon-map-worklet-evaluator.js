NodeLiveAudioProcessor.prototype.createHenonMapState = function createHenonMapState() {
    return { hasStarted: false, phase: 0, x: 0, y: 0, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.henonMapSample = function henonMapSample(state, options = {}) {
    if (
      this.nativeHenonMapReady &&
      this.nativeHenonMap?.soemdsp_henon_map_create &&
      this.nativeHenonMap?.soemdsp_henon_map_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeHenonMap.soemdsp_henon_map_create();
        }
        if (state.nativeHandle) {
          const resetActive = Number(options.reset) > 0 ? 1 : 0;
          const rate = Math.max(0, Number(options.rate) || 0);
          const a = this.clampValue(Number(options.a) || 0, 0, 2);
          const b = this.clampValue(Number(options.b) || 0, -1, 1);
          const seedX = Number(options.seedX) || 0;
          const seedY = Number(options.seedY) || 0;
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeHenonMap.soemdsp_henon_map_sample(
            state.nativeHandle,
            resetActive,
            rate,
            a,
            b,
            seedX,
            seedY,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeHenonMap.soemdsp_henon_map_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeHenonMap.soemdsp_henon_map_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeHenonMapReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "henon_map",
          status: "disabled",
          message: String(error?.message || error || "native Henon Map failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

