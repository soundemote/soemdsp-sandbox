NodeLiveAudioProcessor.prototype.createYellowjacketFilterState = function createYellowjacketFilterState() {
    return { phase: 0, filterY1: 0, oscSelfMod: 0, lastOutValue: 0, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.yellowjacketFilterSample = function yellowjacketFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeYellowjacketFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeYellowjacketFilter.soemdsp_yellowjacket_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeYellowjacketFilter.soemdsp_yellowjacket_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeYellowjacketFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "yellowjacket_filter",
          status: "disabled",
          message: String(error?.message || error || "native Yellowjacket Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

