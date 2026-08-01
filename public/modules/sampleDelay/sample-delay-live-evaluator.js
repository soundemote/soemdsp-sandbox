// Sample Delay — offline/render-time twin of the worklet sample delay.

function createNodeGraphSampleDelayState() {
  return {
    buffer: null,
    writeIndex: 0,
    filled: 0,
    capacity: 0,
  };
}

function nodeGraphSampleDelayEnsureBuffer(state, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const capacity = Math.max(2, Math.min(768000, Math.ceil(rate * 4) + 2));
  if (!(state.buffer instanceof Float32Array) || state.capacity !== capacity) {
    state.buffer = new Float32Array(capacity);
    state.capacity = capacity;
    state.writeIndex = 0;
    state.filled = 0;
  }
  return { capacity, rate };
}

function nodeGraphSampleDelaySample(state, signalIn, params, sampleRate, runtime = null, nodeId = "") {
  const raw = nodeGraphSafeFilterNumber(signalIn, runtime, nodeId, null, "sample delay in");
  const timeSeconds = Math.max(0, nodeGraphSafeFilterNumber(params.time, runtime, nodeId, null, "sample delay time"));
  const samplesParam = Math.max(0, nodeGraphSafeFilterNumber(params.samples, runtime, nodeId, null, "sample delay samples"));
  const { capacity, rate } = nodeGraphSampleDelayEnsureBuffer(state, sampleRate);

  let delaySamples = timeSeconds * rate + samplesParam;
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
    Delayed: nodeGraphSafeFilterNumber(delayed, runtime, nodeId, null, "sample delay delayed"),
    Thru: raw,
  };
}

nodeGraphLiveModuleEvaluators.sampleDelay = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.sampleDelayStates.get(nodeId) || createNodeGraphSampleDelayState();
  runtime.sampleDelayStates.set(nodeId, state);
  return nodeGraphSampleDelaySample(
    state,
    mixInput(nodeId, "In"),
    {
      time: readNodeGraphLiveEffectiveParam(runtime, node, "time", 0, frame, frames, frameValues),
      samples: readNodeGraphLiveEffectiveParam(runtime, node, "samples", 0, frame, frames, frameValues),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
