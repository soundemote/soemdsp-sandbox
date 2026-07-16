NodeLiveAudioProcessor.prototype.createComparatorState = function createComparatorState() {
    return {
      wasHigh: false, hasPrev: false, prevRaw: 0,
      upPulseSamples: 0, downPulseSamples: 0, nativeHandle: 0,
      lastHighValue: 0, lastLowValue: 0,
    };
  };

NodeLiveAudioProcessor.prototype.comparatorSampleJs = function comparatorSampleJs(state, signalIn, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const changeAmount = this.safeFilterNumber(params.changeAmount, state);
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, state));
    const triggerLevel = this.safeFilterNumber(params.triggerLevel, state);
    const pulseLevel = this.safeFilterNumber(params.pulseLevel, state);
    const raw = this.safeFilterNumber(signalIn, state);

    const high = raw > changeAmount;
    const risingEdge = high && !state.wasHigh;
    const fallingEdge = !high && state.wasHigh;
    state.wasHigh = high;

    if (high) {
      state.lastHighValue = raw;
    } else {
      state.lastLowValue = raw;
    }

    const unchanged = state.hasPrev && raw === state.prevRaw;
    state.prevRaw = raw;
    state.hasPrev = true;

    let upSpike = 0;
    if (risingEdge) {
      upSpike = triggerLevel;
      state.upPulseSamples = Math.max(1, Math.round(pulseTime * safeRate));
    }
    let downSpike = 0;
    if (fallingEdge) {
      downSpike = triggerLevel;
      state.downPulseSamples = Math.max(1, Math.round(pulseTime * safeRate));
    }

    const upPlateau = state.upPulseSamples > 0 ? pulseLevel : 0;
    const downPlateau = state.downPulseSamples > 0 ? pulseLevel : 0;
    state.upPulseSamples = Math.max(0, state.upPulseSamples - 1);
    state.downPulseSamples = Math.max(0, state.downPulseSamples - 1);

    const gate = high ? triggerLevel : 0;
    const invGate = high ? 0 : triggerLevel;
    const hold = unchanged ? triggerLevel : 0;
    const up = upSpike + upPlateau;
    const down = downSpike + downPlateau;

    return {
      Gate: this.safeFilterNumber(gate, state),
      "Inv Gate": this.safeFilterNumber(invGate, state),
      Hold: this.safeFilterNumber(hold, state),
      "Up Trig": this.safeFilterNumber(up, state),
      "Down Trig": this.safeFilterNumber(down, state),
      "UpDn Trig": this.safeFilterNumber(up + down, state),
      "Last High": this.safeFilterNumber(state.lastHighValue, state),
      "Last Low": this.safeFilterNumber(state.lastLowValue, state),
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
    return this.comparatorSampleJs(state, signalIn, params, rate);
  };
