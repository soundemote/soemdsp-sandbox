// Random Walk — pure math (main thread; worklet prefers native).

function createNodeGraphLowpassState() {
  return { outputBuffer: 0 };
}

function createNodeGraphRandomWalkState() {
  return {
    lowpass: createNodeGraphLowpassState(),
    out: 0,
    seed: 0,
    seedKey: "",
  };
}

function nodeGraphRandomWalkClamp01(v) {
  const x = Number(v) || 0;
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

function nodeGraphRandomWalkClamp11(v) {
  const x = Number(v) || 0;
  return x < -1 ? -1 : (x > 1 ? 1 : x);
}

function nodeGraphRandomWalkRationalCurve(value, skew) {
  const t = nodeGraphRandomWalkClamp01(value);
  const safeSkew = Math.max(-0.999, Math.min(0.999, Number(skew) || 0));
  return ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t);
}

function nodeGraphRandomWalkOnePole(state, input, frequency, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const frequencyValue = Math.max(0, Number(frequency) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  state.outputBuffer = b0 * (Number(input) || 0) + a1 * (Number(state.outputBuffer) || 0);
  return state.outputBuffer;
}

/**
 * @returns {number}
 */
function nodeGraphRandomWalkCore(state, params, sampleRate, nodeId) {
  if (typeof nodeGraphResetSeededState === "function") {
    nodeGraphResetSeededState(state, nodeId, params?.seed, "randomWalk");
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const method = Math.max(0, Math.min(3, Math.round(Number(params?.method) || 0)));
  const frequency = Math.max(0, Number(params?.frequency) || 0);
  const jitter = Math.max(0, Number(params?.jitter) || 0);
  const level = Number(params?.level) || 0;
  const noise = typeof nodeGraphNextSeededBipolar === "function"
    ? nodeGraphNextSeededBipolar(state)
    : 0;
  const increment = nodeGraphRandomWalkClamp01(frequency / rate);
  const jitterInc = nodeGraphRandomWalkClamp01(jitter / rate);
  const stepSize = nodeGraphRandomWalkClamp01(increment + nodeGraphRandomWalkRationalCurve(jitterInc, 0.99));
  const averageIncrement = (jitterInc + increment) * 0.5;
  const whiteNoiseMix = averageIncrement >= 0.9
    ? nodeGraphRandomWalkRationalCurve((averageIncrement - 0.9) / 0.1, -0.7)
    : 0;
  const randomMix = 1 - whiteNoiseMix;

  if (method === 0) {
    return noise * level;
  }
  if (method === 1) {
    return nodeGraphRandomWalkOnePole(state.lowpass, noise, frequency, rate) * level;
  }
  const step = method === 3 ? (noise > 0 ? stepSize : -stepSize) : noise * stepSize;
  state.out = nodeGraphRandomWalkClamp11((Number(state.out) || 0) + step);
  const mixed = state.out * randomMix + noise * whiteNoiseMix;
  return nodeGraphRandomWalkOnePole(state.lowpass, mixed, frequency, rate) * level;
}
