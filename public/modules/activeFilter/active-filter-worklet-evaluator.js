// Active Filter — worklet (native RS-MET multipole; JS offline in math.js).

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
        const rawHz = this.safeFilterNumber(params.frequency, state);
        const frequencyHz = Number.isFinite(rawHz) ? Math.max(0, rawHz) : 0;
        return this.safeFilterNumber(
          this.nativeActiveFilter.soemdsp_active_filter_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            frequencyHz,
            this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
            Math.max(0, Math.min(9, Math.round(Number(params.mode) || 3))),
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
        message: String(error?.message || error || "native Active Filter failed"),
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
  const resolved = typeof nodeGraphActiveFilterResolveInto === "function"
    ? nodeGraphActiveFilterResolveInto(state._resolved || (state._resolved = {}), params)
    : { bandpass: false, frequency: params?.frequency, mode: params?.mode };
  if (resolved.bandpass) {
    if (!state.hp) state.hp = this.createActiveFilterState();
    if (!state.lp) state.lp = this.createActiveFilterState();
    const hpParams = typeof nodeGraphActiveFilterFillLadderParams === "function"
      ? nodeGraphActiveFilterFillLadderParams(state.hp._p || (state.hp._p = {}), resolved, "hp")
      : { ...params, frequency: resolved.hpHz, mode: resolved.hpMode };
    const lpParams = typeof nodeGraphActiveFilterFillLadderParams === "function"
      ? nodeGraphActiveFilterFillLadderParams(state.lp._p || (state.lp._p = {}), resolved, "lp")
      : { ...params, frequency: resolved.lpHz, mode: resolved.lpMode };
    const mid = this.activeFilterSample(state.hp, input, hpParams, rate);
    return this.activeFilterSample(state.lp, mid, lpParams, rate);
  }
  const single = typeof nodeGraphActiveFilterFillLadderParams === "function"
    ? nodeGraphActiveFilterFillLadderParams(state._p || (state._p = {}), resolved, "single")
    : params;
  return this.activeFilterSample(state, input, single, rate);
};
