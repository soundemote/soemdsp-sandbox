// Linear Envelope — native preferred; pure math fallback (linear-envelope-math.js).

NodeLiveAudioProcessor.prototype.createLinearEnvelopeState = function createLinearEnvelopeState() {
  const base =
    typeof createNodeGraphLinearEnvelopeState === "function"
      ? createNodeGraphLinearEnvelopeState()
      : {
          lastGate: 0,
          out: 0,
          releaseDecrement: 0,
          secondsPassed: 0,
          state: "off",
        };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.linearEnvelopeSample = function linearEnvelopeSample(state, gate, params, rate = sampleRate) {
  if (
    this.nativeLinearEnvelopeReady &&
    this.nativeLinearEnvelope?.soemdsp_linear_envelope_create &&
    this.nativeLinearEnvelope?.soemdsp_linear_envelope_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeLinearEnvelope.soemdsp_linear_envelope_create();
      }
      if (state.nativeHandle) {
        const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
        const out = this.nativeLinearEnvelope.soemdsp_linear_envelope_sample(
          state.nativeHandle,
          Number(gate) || 0,
          Math.max(0, Number(params.delay) || 0),
          Math.max(0, Number(params.attack) || 0),
          Math.max(0, Number(params.decay) || 0),
          this.clampValue(Number(params.sustain) || 0, 0, 1),
          Math.max(0, Number(params.release) || 0),
          Number(params.loop) || 0,
          Number(params.level) || 0,
          safeRate,
        );
        return this.safeFilterNumber(out, null);
      }
    } catch (error) {
      this.nativeLinearEnvelopeReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "linear_envelope",
        status: "disabled",
        message: String(error?.message || error || "native Linear Envelope failed"),
      });
    }
  }
  if (typeof nodeGraphLinearEnvelopeCore === "function") {
    return this.safeFilterNumber(
      nodeGraphLinearEnvelopeCore(state, gate, params, Number(rate) > 1 ? Number(rate) : sampleRate),
      null,
    );
  }
  return 0;
};
