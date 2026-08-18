// Inertial Filter — worklet. Pure math: inertial-filter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createInertialFilterState = function createInertialFilterState() {
  const state = createNodeGraphInertialFilterState();
  state.nativeHandle = 0;
  return state;
};

NodeLiveAudioProcessor.prototype.destroyInertialFilterNativeState = function destroyInertialFilterNativeState(state) {
  if (state?.nativeHandle && this.nativeInertialFilter?.soemdsp_inertial_filter_destroy) {
    try { this.nativeInertialFilter.soemdsp_inertial_filter_destroy(state.nativeHandle); } catch (_error) { /* ignore */ }
  }
  if (state) state.nativeHandle = 0;
};

NodeLiveAudioProcessor.prototype.createStereoInertialFilterState = function createStereoInertialFilterState() {
  return {
    left: this.createInertialFilterState(),
    mono: this.createInertialFilterState(),
    right: this.createInertialFilterState(),
  };
};

NodeLiveAudioProcessor.prototype.inertialFilterSample = function inertialFilterSample(
  state,
  input,
  attackHz,
  releaseHz,
  rate = sampleRate,
) {
  if (this.nativeInertialFilterReady && this.nativeInertialFilter?.soemdsp_inertial_filter_sample) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeInertialFilter.soemdsp_inertial_filter_create();
      }
      if (state.nativeHandle) {
        return this.safeFilterNumber(
          this.nativeInertialFilter.soemdsp_inertial_filter_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            attackHz,
            releaseHz,
            rate,
          ),
          state,
        );
      }
    } catch (error) {
      this.nativeInertialFilterReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "inertial_filter",
        status: "disabled",
        message: String(error?.message || error || "native Inertial Filter failed"),
      });
    }
  }
  return this.safeFilterNumber(
    nodeGraphInertialFilterSampleHz(
      state,
      this.safeFilterNumber(input, state),
      attackHz,
      releaseHz,
      rate,
    ),
    state,
  );
};
