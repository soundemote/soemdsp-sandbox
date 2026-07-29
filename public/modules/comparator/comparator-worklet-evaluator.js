NodeLiveAudioProcessor.prototype.createComparatorState = function createComparatorState() {
    return {
      wasHigh: false, hasPrev: false, prevRaw: 0,
      upPulseSamples: 0, downPulseSamples: 0, nativeHandle: 0,
      lastHighValue: 0, lastLowValue: 0,
    };
  };

NodeLiveAudioProcessor.prototype.comparatorSample = function comparatorSample(state, signalIn, params, rate = sampleRate) {
    if (this.nativeComparatorReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeComparator.soemdsp_comparator_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
          const gate = this.safeFilterNumber(
            this.nativeComparator.soemdsp_comparator_sample(
              state.nativeHandle,
              this.safeFilterNumber(signalIn, state),
              this.safeFilterNumber(params.changeAmount, state),
              Math.max(0, this.safeFilterNumber(params.pulseTime, state)),
              this.safeFilterNumber(params.triggerLevel, state),
              this.safeFilterNumber(params.pulseLevel, state),
              safeRate,
            ),
            state,
          );
          const invGate = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_inv_gate?.(state.nativeHandle) || 0, state);
          const hold = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_hold?.(state.nativeHandle) || 0, state);
          const up = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_up?.(state.nativeHandle) || 0, state);
          const down = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_down?.(state.nativeHandle) || 0, state);
          const upDn = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_up_dn?.(state.nativeHandle) || 0, state);
          const lastHigh = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_last_high?.(state.nativeHandle) || 0, state);
          const lastLow = this.safeFilterNumber(this.nativeComparator.soemdsp_comparator_last_low?.(state.nativeHandle) || 0, state);
          return {
            Gate: gate,
            "Inv Gate": invGate,
            Hold: hold,
            "Up Trig": up,
            "Down Trig": down,
            "UpDn Trig": upDn,
            "Last High": lastHigh,
            "Last Low": lastLow,
          };
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
    return { Gate: 0, "Inv Gate": 0, Hold: 0, "Up Trig": 0, "Down Trig": 0, "UpDn Trig": 0, "Last High": 0, "Last Low": 0 };
  };
