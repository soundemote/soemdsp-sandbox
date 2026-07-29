NodeLiveAudioProcessor.prototype.createRsmetFilterState = function createRsmetFilterState() {
    return { y: [0, 0, 0, 0, 0], nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.rsmetFilterSample = function rsmetFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeRsmetFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeRsmetFilter.soemdsp_rsmet_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeRsmetFilter.soemdsp_rsmet_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(0, Math.min(9, Math.round(Number(params.mode) || 0))),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeRsmetFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "rsmet_filter",
          status: "disabled",
          message: String(error?.message || error || "native RSMET Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

