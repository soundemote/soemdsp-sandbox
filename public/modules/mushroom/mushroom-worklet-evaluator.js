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
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeMushroom.soemdsp_jbmushroom_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.phaseOffset) || 0,
            Number(options.numMushrooms) || 0,
            Number(options.grow) || 0,
            Number(options.density) || 0,
            Number(options.capRotation) || 0,
            Number(options.stemRotationSpeed) || 0,
            Number(options.head) || 0,
            Number(options.spread) || 0,
            Number(options.wobble) || 0,
            Number(options.clusterRotation) || 0,
            Number(options.clusterRotationSpeed) || 0,
            Number(options.sharp) || 0,
            Number(options.width) || 0,
            Number(options.stem) || 0,
            Number(options.apart) || 0,
            Number(options.capStemTransition) || 0,
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

