NodeLiveAudioProcessor.prototype.createResonatorFilterState = function createResonatorFilterState() {
    return {
      phase1: 0, phase2: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0],
      osc1Value: 0, osc2Value: 0, osc1SelfMod: 0, osc2SelfMod: 0, sawFeedback: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.resonatorFilterSample = function resonatorFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeResonatorFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeResonatorFilter.soemdsp_resonator_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeResonatorFilter.soemdsp_resonator_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(0, Math.min(2, Math.round(Number(params.mode) || 0))),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeResonatorFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "resonator_filter",
          status: "disabled",
          message: String(error?.message || error || "native Resonator Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

