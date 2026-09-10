NodeLiveAudioProcessor.prototype.createMushroomState = function createMushroomState() {
    return { phase: 0, capRotRamp: 0, clusterRotRamp: 0, resetWasHigh: false, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.mushroomSample = function mushroomSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.capRotRamp = 0;
      state.clusterRotRamp = 0;
      if (state.nativeHandle && this.nativeMushroom?.soemdsp_jbmushroom_reset) {
        this.nativeMushroom.soemdsp_jbmushroom_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeMushroomReady &&
      this.nativeMushroom?.soemdsp_jbmushroom_create &&
      this.nativeMushroom?.soemdsp_jbmushroom_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeMushroom.soemdsp_jbmushroom_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeMushroom.soemdsp_jbmushroom_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            nodeGraphFiniteNumber(options.phaseOffset),
            nodeGraphFiniteNumber(options.numMushrooms),
            nodeGraphFiniteNumber(options.grow),
            nodeGraphFiniteNumber(options.density),
            nodeGraphFiniteNumber(options.capRotation),
            nodeGraphFiniteNumber(options.stemRotationSpeed),
            nodeGraphFiniteNumber(options.head),
            nodeGraphFiniteNumber(options.spread),
            nodeGraphFiniteNumber(options.wobble),
            nodeGraphFiniteNumber(options.clusterRotation),
            nodeGraphFiniteNumber(options.clusterRotationSpeed),
            nodeGraphFiniteNumber(options.sharp),
            nodeGraphFiniteNumber(options.width),
            nodeGraphFiniteNumber(options.stem),
            nodeGraphFiniteNumber(options.apart),
            nodeGraphFiniteNumber(options.capStemTransition),
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeMushroom.soemdsp_jbmushroom_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeMushroom.soemdsp_jbmushroom_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeMushroomReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_mushroom",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Mushroom failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

