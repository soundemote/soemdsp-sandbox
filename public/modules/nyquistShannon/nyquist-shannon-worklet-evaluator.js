NodeLiveAudioProcessor.prototype.createNyquistShannonState = function createNyquistShannonState() {
    return {
      phase: 0,
      rotatorPhase: 0,
      lastFphas: 0,
      hasLastFphas: false,
      toneSmoothCurrent: 0,
      toneSmoothInit: false,
      resetWasHigh: false,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.nyquistShannonSample = function nyquistShannonSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.rotatorPhase = 0;
      state.hasLastFphas = false;
      state.toneSmoothInit = false;
      if (state.nativeHandle && this.nativeNyquistShannon?.soemdsp_jbnyquist_reset) {
        this.nativeNyquistShannon.soemdsp_jbnyquist_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeNyquistShannonReady &&
      this.nativeNyquistShannon?.soemdsp_jbnyquist_create &&
      this.nativeNyquistShannon?.soemdsp_jbnyquist_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeNyquistShannon.soemdsp_jbnyquist_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeNyquistShannon.soemdsp_jbnyquist_sample(
            state.nativeHandle,
            Number(options.frequencyA) || 0,
            Number(options.midiNoteRaw) || 0,
            Number(options.rate) || 0,
            Number(options.sampleDots) || 0,
            Number(options.phaseOffset) || 0,
            Number(options.frequencyB) || 0,
            Number(options.subPhase) || 0,
            Number(options.subPhaseRotationSpeed) || 0,
            Number(options.tone) || 0,
            Number(options.toneSmoothTime) || 0,
            Number(options.artifact) || 0,
            Number(options.enableToneModPitch) || 0,
            Number(options.enableToneModFreq) || 0,
            Number(options.enableToneModNote) || 0,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeNyquistShannon.soemdsp_jbnyquist_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeNyquistShannon.soemdsp_jbnyquist_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeNyquistShannonReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_nyquist_shannon",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Nyquist-Shannon failed"),
        });
      }
    }
    return { x: 0, y: 0 };
  };

