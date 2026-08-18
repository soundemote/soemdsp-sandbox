// EQ Filter — worklet. Pure math: eq-filter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createEqFilterState = function createEqFilterState() {
  const state = createNodeGraphEqFilterState();
  state.nativeHandle = 0;
  return state;
};

NodeLiveAudioProcessor.prototype.destroyEqFilterNativeState = function destroyEqFilterNativeState(state) {
  if (state?.nativeHandle && this.nativeEqFilter?.soemdsp_eq_filter_destroy) {
    try { this.nativeEqFilter.soemdsp_eq_filter_destroy(state.nativeHandle); } catch (_error) { /* ignore */ }
  }
  if (state) state.nativeHandle = 0;
};

NodeLiveAudioProcessor.prototype.createStereoEqFilterState = function createStereoEqFilterState() {
  return {
    left: this.createEqFilterState(),
    mono: this.createEqFilterState(),
    right: this.createEqFilterState(),
  };
};

NodeLiveAudioProcessor.prototype.eqFilterSample = function eqFilterSample(
  state,
  input,
  mode,
  frequency,
  q,
  gainDb,
  rate,
) {
  if (this.nativeEqFilterReady && this.nativeEqFilter?.soemdsp_eq_filter_sample) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeEqFilter.soemdsp_eq_filter_create();
      }
      if (state.nativeHandle) {
        return this.safeFilterNumber(
          this.nativeEqFilter.soemdsp_eq_filter_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            mode,
            frequency,
            q,
            gainDb,
            rate,
          ),
          state,
        );
      }
    } catch (error) {
      this.nativeEqFilterReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "eq_filter",
        status: "disabled",
        message: String(error?.message || error || "native EQ Filter failed"),
      });
    }
  }
  return this.safeFilterNumber(
    nodeGraphEqFilterSample(
      state,
      this.safeFilterNumber(input, state),
      mode,
      frequency,
      q,
      gainDb,
      rate,
    ),
    state,
  );
};
