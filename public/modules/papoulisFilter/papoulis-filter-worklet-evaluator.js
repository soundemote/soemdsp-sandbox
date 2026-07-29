// Native papoulis_filter.wasm only — no JS filter path.
NodeLiveAudioProcessor.prototype.createPapoulisFilterState = function createPapoulisFilterState() {
    return { nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.papoulisFilterSample = function papoulisFilterSample(state, input, cutoffHz, rate) {
    if (this.nativePapoulisFilterReady && this.nativePapoulisFilter) {
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
    // Dry when wasm is unavailable (no JS reimplementation).
    return this.safeFilterNumber(input, state) ?? 0;
  };

