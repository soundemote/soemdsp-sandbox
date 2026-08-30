NodeLiveAudioProcessor.prototype.createTransportState = function createTransportState() {
    return {
      elapsedSamples: 0,
      phase: 0,
      nativeHandle: 0,
      wasHigh: false,
    };
  };

// Trigger edge on unipolar high after native transport sample.
NodeLiveAudioProcessor.prototype.transportTriggerSample = function transportTriggerSample(state, isHighNow, amplitude) {
    const trigger = isHighNow && !state.wasHigh ? amplitude : 0;
    state.wasHigh = isHighNow;
    return trigger;
  };

// Transport — native preferred; pure math fallback (transport-math.js).
NodeLiveAudioProcessor.prototype.transportSample = function transportSample(state, params, rateHz = sampleRate) {
    const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const tempoBpm = Math.max(1, Number(this.timing?.tempoBpm) || 120);
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
              this.safeFilterNumber(params.divisions, state),
              tempoBpm,
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
          return { "-1..1": bipolar, "0..1": unipolar, Trigger: trigger, f: freqHz };
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
    // JS path: pure math keyed by elapsed sample counter.
    if (typeof nodeGraphTransportCore === "function") {
      const out = nodeGraphTransportCore(
        params || {},
        state.elapsedSamples || 0,
        safeRate,
        tempoBpm,
      );
      state.elapsedSamples = (state.elapsedSamples || 0) + 1;
      return {
        "-1..1": this.safeFilterNumber(out["-1..1"], state),
        "0..1": this.safeFilterNumber(out["0..1"], state),
        Trigger: this.safeFilterNumber(out.Trigger, state),
        f: this.safeFilterNumber(out.f, state),
      };
    }
    return { "-1..1": 0, "0..1": 0, Trigger: 0, f: 0 };
  };

