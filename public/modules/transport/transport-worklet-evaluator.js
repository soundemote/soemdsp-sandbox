NodeLiveAudioProcessor.prototype.createTransportState = function createTransportState() {
  return {
    elapsedSamples: 0,
    phase: 0,
    nativeHandle: 0,
    wasHigh: false,
  };
};

/** 1-sample Trigger on gate rising edge. */
NodeLiveAudioProcessor.prototype.transportTriggerSample = function transportTriggerSample(
  state,
  isHighNow,
  amplitude,
) {
  const amp = Number(amplitude) || 0;
  let trigger = 0;
  if (isHighNow && !state.wasHigh) {
    trigger = amp;
  }
  state.wasHigh = Boolean(isHighNow);
  return trigger;
};

// Transport — native preferred; pure math fallback (transport-math.js).
NodeLiveAudioProcessor.prototype.transportSample = function transportSample(state, params, rateHz = sampleRate) {
  const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
  const paramBpm = Number(params?.bpm);
  const tempoBpm = Math.max(
    1,
    (Number.isFinite(paramBpm) && paramBpm > 0 ? paramBpm : Number(this.timing?.tempoBpm)) || 120,
  );
  if (this.nativeTransportReady && this.nativeTransport?.soemdsp_transport_create) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeTransport.soemdsp_transport_create();
      }
      if (state.nativeHandle) {
        const bipolar = this.safeFilterNumber(
          this.nativeTransport.soemdsp_transport_sample(
            state.nativeHandle,
            this.safeFilterNumber(params.amplitude, state),
            this.safeFilterNumber(params.timeNumerator ?? 1, state),
            this.safeFilterNumber(params.timeDenominator ?? 4, state),
            this.safeFilterNumber(params.timingMode ?? 0, state),
            tempoBpm,
            this.safeFilterNumber(params.pulseWidth ?? 0.5, state),
            safeRate,
          ),
          state,
        );
        const unipolar = this.safeFilterNumber(
          this.nativeTransport.soemdsp_transport_unipolar?.(state.nativeHandle) || 0,
          state,
        );
        const freqHz = this.safeFilterNumber(
          this.nativeTransport.soemdsp_transport_frequency?.(state.nativeHandle) || 0,
          state,
        );
        state.elapsedSamples += 1;
        const trigger = this.transportTriggerSample(
          state,
          unipolar > 0,
          this.safeFilterNumber(params.amplitude, state),
        );
        return {
          "Gate -1+1": bipolar,
          "Gate 0-1": unipolar,
          Trigger: trigger,
          f: freqHz,
        };
      }
    } catch (error) {
      this.nativeTransportReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "transport",
        status: "disabled",
        message: String(error?.message || error || "native Transport failed"),
      });
    }
  }
  if (typeof nodeGraphTransportCore === "function") {
    const out = nodeGraphTransportCore(
      params || {},
      state.elapsedSamples || 0,
      safeRate,
      tempoBpm,
    );
    state.elapsedSamples = (state.elapsedSamples || 0) + 1;
    return {
      "Gate -1+1": this.safeFilterNumber(out["Gate -1+1"], state),
      "Gate 0-1": this.safeFilterNumber(out["Gate 0-1"], state),
      Trigger: this.safeFilterNumber(out.Trigger, state),
      f: this.safeFilterNumber(out.f, state),
    };
  }
  return {
    "Gate -1+1": 0,
    "Gate 0-1": 0,
    Trigger: 0,
    f: 0,
  };
};
