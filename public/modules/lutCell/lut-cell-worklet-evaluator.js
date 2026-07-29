NodeLiveAudioProcessor.prototype.createLutCellState = function createLutCellState() {
    return { clockWasHigh: false, registeredOut: 0, nativeHandle: 0, selfClockPhase: 0, selfClockValue: 0 };
  };

NodeLiveAudioProcessor.prototype.advanceLutCellSelfClock = function advanceLutCellSelfClock(state) {
    const rate = Math.max(1, Number(this.engineSampleRate) || 44100);
    const increment = (2 * 220) / rate;
    state.selfClockPhase = (state.selfClockPhase || 0) + increment;
    if (state.selfClockPhase >= 1) {
      state.selfClockPhase -= Math.floor(state.selfClockPhase);
      state.selfClockValue = state.selfClockValue ? 0 : 1;
    }
    return state.selfClockValue || 0;
  };

NodeLiveAudioProcessor.prototype.lutCellSample = function lutCellSample(state, options = {}) {
    const effectiveClockHigh = options.hasClockInput
      ? Number(options.clock) > 0
      : this.advanceLutCellSelfClock(state) > 0;
    const effectiveA = options.hasAInput
      ? Number(options.a) || 0
      : (effectiveClockHigh ? 1 : 0);
    const effectiveOptions = {
      ...options,
      a: effectiveA,
      clock: effectiveClockHigh ? 1 : 0,
    };
    if (
      this.nativeLutCellReady &&
      this.nativeLutCell?.soemdsp_lut_cell_create &&
      this.nativeLutCell?.soemdsp_lut_cell_sample &&
      this.nativeLutCell?.soemdsp_lut_cell_q
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeLutCell.soemdsp_lut_cell_create();
        }
        if (state.nativeHandle) {
          const b = Number(effectiveOptions.b) || 0;
          const c = Number(effectiveOptions.c) || 0;
          const d = Number(effectiveOptions.d) || 0;
          const table = Math.max(0, Math.min(0xFFFF, Math.round(Number(effectiveOptions.truthTable) || 0)));
          const combinational = this.nativeLutCell.soemdsp_lut_cell_sample(
            state.nativeHandle,
            effectiveOptions.a,
            b,
            c,
            d,
            effectiveOptions.clock,
            table,
          );
          const q = this.nativeLutCell.soemdsp_lut_cell_q(state.nativeHandle);
          return {
            Out: combinational,
            Q: q,
          };
        }
      } catch (error) {
        this.nativeLutCellReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "lut_cell",
          status: "disabled",
          message: String(error?.message || error || "native LUT Cell failed"),
        });
      }
    }
    return { Out: 0, Q: 0 };
  };

