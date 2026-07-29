NodeLiveAudioProcessor.prototype.createPapoulisFilterState = function createPapoulisFilterState() {
    return {
      poleX1: 0,
      poleY1: 0,
      biquadX1: 0,
      biquadX2: 0,
      biquadY1: 0,
      biquadY2: 0,
      coeffs: null,
      cutoffHz: NaN,
      sampleRate: NaN,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.papoulisFilterSample = function papoulisFilterSample(state, input, cutoffHz, rate) {
    if (this.nativePapoulisFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePapoulisFilter.soemdsp_papoulis_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativePapoulisFilter.soemdsp_papoulis_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, null),
              this.safeFilterNumber(cutoffHz, null),
              this.safeFilterNumber(rate, null),
            ),
            null,
          );
        }
      } catch (error) {
        this.nativePapoulisFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "papoulis_filter",
          status: "disabled",
          message: String(error?.message || error || "native Papoulis Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

