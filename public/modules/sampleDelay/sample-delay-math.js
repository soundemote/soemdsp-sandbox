// Sample Delay — pure ring-buffer math (main thread + worklet JS path).
// Write first, then read. Delay 0 (and 0…1) mixes the current input.

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
  let delaySamples = (Number(timeSeconds) || 0) * rate + (Number(samplesParam) || 0);
  if (!(delaySamples >= 0)) {
    delaySamples = 0;
  }
  if (delaySamples > capacity - 1) {
    delaySamples = capacity - 1;
  }

  const write = state.writeIndex;
  state.buffer[write] = raw;

  const readPos = write - delaySamples;
  let i0 = Math.floor(readPos);
  const frac = readPos - i0;
  i0 %= capacity;
  if (i0 < 0) i0 += capacity;
  const i1 = i0 + 1 >= capacity ? 0 : i0 + 1;
  const a = i0 === write ? raw : (state.buffer[i0] || 0);
  const b = i1 === write ? raw : (state.buffer[i1] || 0);
  const delayed = a + (b - a) * frac;

  state.writeIndex = (write + 1) % capacity;
  if (state.filled < capacity) {
    state.filled += 1;
  }

  return { Out: delayed, delayed, raw };
}
