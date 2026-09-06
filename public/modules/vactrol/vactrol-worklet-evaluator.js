// Vactrol — roll-your-own optical-lag envelope (native preferred).

NodeLiveAudioProcessor.prototype.createVactrolEnvelopeState = function createVactrolEnvelopeState() {
  return {
    nativeHandle: 0,
    out: 0,
    raw: 0,
  };
};

NodeLiveAudioProcessor.prototype.destroyVactrolEnvelopeNativeState = function destroyVactrolEnvelopeNativeState(state) {
  if (state?.nativeHandle && this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_destroy) {
    this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.vactrolEnvelopeSample = function vactrolEnvelopeSample(
  state,
  light,
  params,
  rate = sampleRate,
) {
  const safeRate = Math.max(1, rate || sampleRate || 44100);
  if (this.nativeVactrolEnvelopeReady) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_create();
      }
      if (state.nativeHandle) {
        const out = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_sample(
          state.nativeHandle,
          this.safeFilterNumber(light, null),
          Math.max(0, this.safeFilterNumber(params.attack, null)),
          Math.max(0, this.safeFilterNumber(params.release, null)),
          Math.max(0.001, this.safeFilterNumber(params.curve, null)),
          Math.max(0, this.safeFilterNumber(params.sensitivity, null)),
          safeRate,
        );
        state.out = this.safeFilterNumber(out, null);
        return state.out;
      }
    } catch (error) {
      this.nativeVactrolEnvelopeReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "vactrol_envelope",
        status: "disabled",
        message: String(error?.message || error || "native Vactrol failed"),
      });
    }
  }
  return 0;
};
