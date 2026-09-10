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
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeNyquistShannon.soemdsp_jbnyquist_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequencyA),
            nodeGraphFiniteNumber(options.midiNoteRaw),
            nodeGraphFiniteNumber(options.rate),
            nodeGraphFiniteNumber(options.sampleDots),
            nodeGraphFiniteNumber(options.phaseOffset),
            nodeGraphFiniteNumber(options.frequencyB),
            nodeGraphFiniteNumber(options.subPhase),
            nodeGraphFiniteNumber(options.subPhaseRotationSpeed),
            nodeGraphFiniteNumber(options.tone),
            nodeGraphFiniteNumber(options.toneSmoothTime),
            nodeGraphFiniteNumber(options.artifact),
            nodeGraphFiniteNumber(options.enableToneModPitch),
            nodeGraphFiniteNumber(options.enableToneModFreq),
            nodeGraphFiniteNumber(options.enableToneModNote),
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

