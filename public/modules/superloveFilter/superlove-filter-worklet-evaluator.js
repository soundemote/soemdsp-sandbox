NodeLiveAudioProcessor.prototype.createSuperloveFilterState = function createSuperloveFilterState() {
    return { feedbackSignal: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0], nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.superloveFilterSample = function superloveFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeSuperloveFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeSuperloveFilter.soemdsp_superlove_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeSuperloveFilter.soemdsp_superlove_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0))),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeSuperloveFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "superlove_filter",
          status: "disabled",
          message: String(error?.message || error || "native SuperLove Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

