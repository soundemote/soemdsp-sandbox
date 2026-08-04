// Sample Delay — fixed 4s ring; delay = time*sr + samples (both ≥ 0).

NodeLiveAudioProcessor.prototype.createSampleDelayState = function createSampleDelayState() {
  return {
    nativeHandle: 0,
    // JS fallback ring (allocated lazily to engine rate × 4s).
    buffer: null,
    writeIndex: 0,
    filled: 0,
    capacity: 0,
  };
};

NodeLiveAudioProcessor.prototype.sampleDelayEnsureJsBuffer = function sampleDelayEnsureJsBuffer(state, rate) {
  const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
  const capacity = Math.max(2, Math.min(768000, Math.ceil(safeRate * 4) + 2));
  if (!(state.buffer instanceof Float32Array) || state.capacity !== capacity) {
    state.buffer = new Float32Array(capacity);
    state.capacity = capacity;
    state.writeIndex = 0;
    state.filled = 0;
  }
  return capacity;
};

NodeLiveAudioProcessor.prototype.sampleDelaySampleJs = function sampleDelaySampleJs(
  state,
  input,
  timeSeconds,
  samplesParam,
  rate = sampleRate,
) {
  // Pure math: sample-delay-math.js (same Blob).
  const raw = this.safeFilterNumber(input, state);
  const out = nodeGraphSampleDelayRingSample(
    state,
    raw,
    this.safeFilterNumber(timeSeconds, state),
    this.safeFilterNumber(samplesParam, state),
    rate,
  );
  return {
    // Dry (Thru) before wet (Delayed).
    Thru: out.raw,
    Delayed: this.safeFilterNumber(out.delayed, state),
  };
};

NodeLiveAudioProcessor.prototype.sampleDelaySample = function sampleDelaySample(
  state,
  input,
  timeSeconds,
  samplesParam,
  rate = sampleRate,
) {
  if (this.nativeSampleDelayReady && this.nativeSampleDelay) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeSampleDelay.soemdsp_sample_delay_create();
      }
      if (state.nativeHandle) {
        const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
        const delayed = this.safeFilterNumber(
          this.nativeSampleDelay.soemdsp_sample_delay_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            Math.max(0, this.safeFilterNumber(timeSeconds, state)),
            Math.max(0, this.safeFilterNumber(samplesParam, state)),
            safeRate,
          ),
          state,
        );
        return {
          Thru: this.safeFilterNumber(input, state),
          Delayed: delayed,
        };
      }
    } catch (error) {
      this.nativeSampleDelayReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sample_delay",
        status: "disabled",
        message: String(error?.message || error || "native Sample Delay failed"),
      });
    }
  }
  return this.sampleDelaySampleJs(state, input, timeSeconds, samplesParam, rate);
};
