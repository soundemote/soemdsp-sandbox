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

// Native-only transport (no JS phase fallback).
NodeLiveAudioProcessor.prototype.transportSample = function transportSample(state, params, rateHz = sampleRate) {
    if (!this.nativeTransportReady || !this.nativeTransport?.soemdsp_transport_create) {
      throw new Error("native Transport not ready");
    }
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeTransport.soemdsp_transport_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Transport failed to create instance");
    }
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
    const unipolar = this.safeFilterNumber(
      this.nativeTransport.soemdsp_transport_unipolar?.(state.nativeHandle) || 0,
      state,
    );
    state.elapsedSamples += 1;
    const trigger = this.transportTriggerSample(
      state,
      unipolar > 0,
      this.safeFilterNumber(params.amplitude, state),
    );
    return { "-1..1": bipolar, "0..1": unipolar, Trigger: trigger };
  };

