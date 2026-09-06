// Dual Ladder Filter — worklet (native RS-MET multipole; JS offline in math.js).

NodeLiveAudioProcessor.prototype.createActiveFilterState = function createActiveFilterState() {
  return { y: [0, 0, 0, 0, 0], nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.createStereoActiveFilterState = function createStereoActiveFilterState() {
  return this.createStereoFilterState(() => this.createActiveFilterState());
};

NodeLiveAudioProcessor.prototype.activeFilterSample = function activeFilterSample(
  state,
  input,
  params,
  rate = sampleRate,
) {
  if (this.nativeActiveFilterReady) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeActiveFilter.soemdsp_active_filter_create();
      }
      if (state.nativeHandle) {
        const resolved = typeof nodeGraphActiveFilterResolveParams === "function"
          ? nodeGraphActiveFilterResolveParams(params)
          : params;
        if (resolved?.bypass) {
          return this.safeFilterNumber(input, state) ?? 0;
        }
        const lo = this.safeFilterNumber(resolved.lowFrequency ?? params.lowFrequency, state);
        const hi = this.safeFilterNumber(resolved.highFrequency ?? params.highFrequency, state);
        const hpSlope = Math.max(0, Math.min(4, Math.round(Number(resolved.hpSlope ?? params.hpSlope) || 0)));
        const lpSlope = Math.max(0, Math.min(4, Math.round(Number(resolved.lpSlope ?? params.lpSlope) || 0)));
        return this.safeFilterNumber(
          this.nativeActiveFilter.soemdsp_active_filter_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            Number.isFinite(lo) ? Math.max(0, lo) : 0,
            Number.isFinite(hi) ? Math.max(0, hi) : 0,
            hpSlope,
            lpSlope,
            this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
            Math.max(0, Math.min(3, Math.round(Number(params.feedbackCircuit) || 0))),
            Math.round(Number(params.gainCompensation)) !== 0 ? 1 : 0,
            Math.max(1, Number(rate) || sampleRate || 44100),
          ),
          state,
        );
      }
    } catch (error) {
      this.nativeActiveFilterReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "active_filter",
        status: "disabled",
        message: String(error?.message || error || "native Dual Ladder Filter failed"),
      });
    }
  }
  if (typeof nodeGraphActiveFilterSample === "function") {
    return this.safeFilterNumber(
      nodeGraphActiveFilterSample(state, input, params, rate),
      state,
    );
  }
  return this.safeFilterNumber(input, state) ?? 0;
};

NodeLiveAudioProcessor.prototype.activeFilterProcess = function activeFilterProcess(
  state,
  input,
  params,
  rate = sampleRate,
) {
  // Native Dual Ladder owns HP→LP cascade; one sample() call is enough.
  if (this.nativeActiveFilterReady) {
    return this.activeFilterSample(state, input, params, rate);
  }
  if (typeof nodeGraphActiveFilterProcess === "function") {
    return this.safeFilterNumber(
      nodeGraphActiveFilterProcess(state, input, params, rate),
      state,
    );
  }
  return this.activeFilterSample(state, input, params, rate);
};
