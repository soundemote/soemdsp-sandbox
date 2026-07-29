NodeLiveAudioProcessor.prototype.createHumanFilterState = function createHumanFilterState() {
    return {
      phase1: 0, phase2: 0, osc1Value: 0, osc2Value: 0, lastOutValue: 0,
      osc1ModSelf: 0, osc2ModSelf: 0, fbZ1: 0, fbZ2: 0, dcY: [0,0,0,0,0],
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.humanFilterSample = function humanFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeHumanFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeHumanFilter.soemdsp_human_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeHumanFilter.soemdsp_human_filter_sample(
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
        this.nativeHumanFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "human_filter",
          status: "disabled",
          message: String(error?.message || error || "native Human Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

