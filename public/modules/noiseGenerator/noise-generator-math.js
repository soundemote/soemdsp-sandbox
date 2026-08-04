// Noise Generator — pure channel math (main thread; worklet keeps native path).
// Depends on seeded-rng helpers: createNodeGraphNoiseGeneratorChannelState,
// nodeGraphNextSeededBipolar, nodeGraphNextSeededGaussian, nodeGraphResetSeededState.

function createNodeGraphNoiseGeneratorState() {
  return {
    left: createNodeGraphNoiseGeneratorChannelState(),
    right: createNodeGraphNoiseGeneratorChannelState(),
  };
}

// 0 = even bipolar U(−1,1), 1 = Gaussian ~N(0,1). Smoothstep-blended.
function nodeGraphNoiseGeneratorShapedBipolar(state, shape) {
  const t = Math.max(0, Math.min(1, Number(shape) || 0));
  if (t <= 1e-12) {
    return nodeGraphNextSeededBipolar(state);
  }
  if (t >= 1 - 1e-12) {
    return nodeGraphNextSeededGaussian(state);
  }
  const s = t * t * (3 - 2 * t);
  const u = nodeGraphNextSeededBipolar(state);
  const g = nodeGraphNextSeededGaussian(state);
  return u * (1 - s) + g * s;
}

function nodeGraphNoiseGeneratorChannelSample(state, mode, mean, deviation, shape = 0) {
  const white = nodeGraphNextSeededBipolar(state);
  if (mode === 1) {
    // Pure Gaussian (legacy Mode = Gaussian).
    return mean + nodeGraphNextSeededGaussian(state) * deviation;
  }
  if (mode === 2) {
    const step = white * Math.max(0.001, deviation) * 0.05;
    state.brown = Math.max(-1, Math.min(1, (Number(state.brown) || 0) + step));
    return mean + state.brown;
  }
  if (mode === 3) {
    state.pink[0] = 0.99886 * state.pink[0] + white * 0.0555179;
    state.pink[1] = 0.99332 * state.pink[1] + white * 0.0750759;
    state.pink[2] = 0.969 * state.pink[2] + white * 0.153852;
    state.pink[3] = 0.8665 * state.pink[3] + white * 0.3104856;
    state.pink[4] = 0.55 * state.pink[4] + white * 0.5329522;
    state.pink[5] = -0.7616 * state.pink[5] - white * 0.016898;
    const out = mean
      + (state.pink[0] + state.pink[1] + state.pink[2] + state.pink[3]
        + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
    state.pink[6] = white * 0.115926;
    return out;
  }
  if (mode === 4) {
    return Math.abs(white) > 0.94 ? mean + Math.sign(white) * deviation : mean;
  }
  // Mode 0 Uniform: continuous Uniform → Gaussian morph.
  return mean + nodeGraphNoiseGeneratorShapedBipolar(state, shape) * deviation;
}

/**
 * @returns {{ "Left Out": number, "Right Out": number }}
 */
function nodeGraphNoiseGeneratorCore(state, params, nodeId) {
  const mode = Math.max(0, Math.min(4, Math.round(Number(params?.mode) || 0)));
  const mean = Number(params?.mean) || 0;
  const deviation = Math.max(0, Number(params?.deviation) || 0);
  const shape = Math.max(0, Math.min(1, Number(params?.shape) || 0));
  const level = Number(params?.level) || 0;
  const seed = Number(params?.seed) || 0;
  if (typeof nodeGraphResetSeededState === "function") {
    nodeGraphResetSeededState(state.left, `${nodeId}:left`, seed, "noiseGenerator");
    nodeGraphResetSeededState(state.right, `${nodeId}:right`, seed, "noiseGenerator");
  }
  const left = Math.max(-1, Math.min(1, nodeGraphNoiseGeneratorChannelSample(state.left, mode, mean, deviation, shape))) * level;
  const right = Math.max(-1, Math.min(1, nodeGraphNoiseGeneratorChannelSample(state.right, mode, mean, deviation, shape))) * level;
  return {
    "Left Out": left,
    "Right Out": right,
  };
}
