// Sample Delay — pure ring-buffer math (main thread + worklet JS path).
// Fixed max ~4s at engine rate; delay = timeSeconds * rate + samplesParam.

function createNodeGraphSampleDelayState() {
  return {
    buffer: null,
    writeIndex: 0,
    filled: 0,
    capacity: 0,
  };
}

function nodeGraphSampleDelayEnsureBuffer(state, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const capacity = Math.max(2, Math.min(768000, Math.ceil(rate * 4) + 2));
  if (!(state.buffer instanceof Float32Array) || state.capacity !== capacity) {
    state.buffer = new Float32Array(capacity);
    state.capacity = capacity;
    state.writeIndex = 0;
    state.filled = 0;
  }
  return { capacity, rate };
}

/**
 * @returns {{ Out: number, delayed: number, raw: number }}
 */
function nodeGraphSampleDelayRingSample(state, input, timeSeconds, samplesParam, sampleRate) {
  const raw = Number(input) || 0;
  const { capacity, rate } = nodeGraphSampleDelayEnsureBuffer(state, sampleRate);
  let delaySamples = Math.max(0, Number(timeSeconds) || 0) * rate + Math.max(0, Number(samplesParam) || 0);
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

  return { Out: delayed, delayed, raw };
}
