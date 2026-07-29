NodeLiveAudioProcessor.prototype.createTransportState = function createTransportState() {
    return {
      elapsedSamples: 0,
      phase: 0,
      nativeHandle: 0,
      wasHigh: false,
    };
  };

// Edge detection shared by both the native and JS-fallback sample paths --
// trigger fires for exactly one sample on the low-to-high transition of the
// existing unipolar pulse, so it works regardless of which path produced
// that pulse (native doesn't expose its internal phase to JS).
NodeLiveAudioProcessor.prototype.transportTriggerSample = function transportTriggerSample(state, isHighNow, amplitude) {
    const trigger = isHighNow && !state.wasHigh ? amplitude : 0;
    state.wasHigh = isHighNow;
    return trigger;
  };

NodeLiveAudioProcessor.prototype.transportSample = function transportSample(state, params, rateHz = sampleRate) {
    if (this.nativeTransportReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeTransport.soemdsp_transport_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
          const tempoBpm = Math.max(1, Number(this.timing?.tempoBpm) || 120);
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
          const unipolar = this.safeFilterNumber(this.nativeTransport.soemdsp_transport_unipolar?.(state.nativeHandle) || 0, state);
          state.elapsedSamples += 1;
          const trigger = this.transportTriggerSample(state, unipolar > 0, this.safeFilterNumber(params.amplitude, state));
          return { "-1..1": bipolar, "0..1": unipolar, Trigger: trigger };
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
    return { "-1..1": 0, amplitude: 0, "0..1": 0, amplitude: 0, Trigger: 0 };
  };

