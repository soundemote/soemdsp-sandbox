// Comparator — 1-sample history edge detector + Steady / Sign / Thru.

NodeLiveAudioProcessor.prototype.createComparatorState = function createComparatorState() {
  return {
    hasPrev: false,
    prev: 0,
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.comparatorSampleJs = function comparatorSampleJs(state, signalIn) {
  const raw = this.safeFilterNumber(signalIn, state);
  const sign = raw > 0 ? 1 : 0;
  if (!state.hasPrev) {
    state.prev = raw;
    state.hasPrev = true;
    return { Up: 0, Down: 0, Change: 0, Steady: 0, Sign: sign, Thru: raw };
  }
  const rose = raw > state.prev;
  const fell = raw < state.prev;
  state.prev = raw;
  const changed = rose || fell;
  return {
    Up: rose ? 1 : 0,
    Down: fell ? 1 : 0,
    Change: changed ? 1 : 0,
    Steady: changed ? 0 : 1,
    Sign: sign,
    Thru: raw,
  };
};

NodeLiveAudioProcessor.prototype.comparatorSample = function comparatorSample(state, signalIn) {
  if (this.nativeComparatorReady && this.nativeComparator) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeComparator.soemdsp_comparator_create();
      }
      if (state.nativeHandle) {
        const change = this.safeFilterNumber(
          this.nativeComparator.soemdsp_comparator_sample(
            state.nativeHandle,
            this.safeFilterNumber(signalIn, state),
          ),
          state,
        );
        const up = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_up(state.nativeHandle), state);
        const down = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_down(state.nativeHandle), state);
        const steady = this.safeFilterNumber(
          this.nativeComparator.soemdsp_comparator_steady?.(state.nativeHandle) ?? (change ? 0 : 1),
          state,
        );
        const sign = this.safeFilterNumber(
          this.nativeComparator.soemdsp_comparator_sign?.(state.nativeHandle) ?? 0,
          state,
        );
        const thru = this.safeFilterNumber(
          this.nativeComparator.soemdsp_comparator_thru?.(state.nativeHandle)
            ?? this.safeFilterNumber(signalIn, state),
          state,
        );
        return { Up: up, Down: down, Change: change, Steady: steady, Sign: sign, Thru: thru };
      }
    } catch (error) {
      this.nativeComparatorReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "comparator",
        status: "disabled",
        message: String(error?.message || error || "native Comparator failed"),
      });
    }
  }
  return this.comparatorSampleJs(state, signalIn);
};
