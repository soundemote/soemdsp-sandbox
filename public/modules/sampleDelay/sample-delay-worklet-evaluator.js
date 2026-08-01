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
  const raw = this.safeFilterNumber(input, state);
  const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
  const capacity = this.sampleDelayEnsureJsBuffer(state, safeRate);
  const timePart = Math.max(0, this.safeFilterNumber(timeSeconds, state)) * safeRate;
  const samplePart = Math.max(0, this.safeFilterNumber(samplesParam, state));
  let delaySamples = timePart + samplePart;
  if (delaySamples > capacity - 1) {
    delaySamples = capacity - 1;
  }
  if (delaySamples < 0) {
    delaySamples = 0;
  }

  let delayed = raw;
  if (delaySamples >= 1e-9) {
    const readPos = state.writeIndex - delaySamples;
    let i0 = Math.floor(readPos);
    const frac = readPos - i0;
    i0 %= capacity;
    if (i0 < 0) i0 += capacity;
    const i1 = i0 + 1 >= capacity ? 0 : i0 + 1;
    const a = state.buffer[i0] || 0;
    const b = state.buffer[i1] || 0;
    delayed = a + (b - a) * frac;
    if (state.filled <= 0) {
      delayed = 0;
    }
  }

  state.buffer[state.writeIndex] = raw;
  state.writeIndex = (state.writeIndex + 1) % capacity;
  if (state.filled < capacity) {
    state.filled += 1;
  }
  return {
    Delayed: this.safeFilterNumber(delayed, state),
    Thru: raw,
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
          Delayed: delayed,
          Thru: this.safeFilterNumber(input, state),
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
