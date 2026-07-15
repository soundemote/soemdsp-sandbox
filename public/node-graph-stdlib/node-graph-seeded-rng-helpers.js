// Node Graph Standard Library -- seeded RNG family.
//
// Shared deterministic-seed noise generation used by noiseGenerator,
// randomWalk, and sampleHold.

function nodeGraphSeedKey(nodeId, seed, salt) {
  return `${nodeId}.${salt}.${Math.max(0, Math.round(Number(seed) || 0))}`;
}

function nodeGraphResetSeededState(state, nodeId, seed, salt) {
  const key = nodeGraphSeedKey(nodeId, seed, salt);
  if (state.seedKey !== key) {
    state.seedKey = key;
    state.seed = nodeGraphStableSeed(key);
    state.gaussianSpare = null;
    state.brown = 0;
    state.pink = [0, 0, 0, 0, 0, 0, 0];
    if (Object.hasOwn(state, "out")) {
      state.out = 0;
    }
    if (state.lowpass) {
      state.lowpass.outputBuffer = 0;
    }
  }
}

function nodeGraphNextSeededUnipolar(state) {
  state.seed = (Math.imul(1664525, state.seed || 0x12345678) + 1013904223) >>> 0;
  return state.seed / 0xffffffff;
}

function nodeGraphNextSeededBipolar(state) {
  return nodeGraphNextSeededUnipolar(state) * 2 - 1;
}

function nodeGraphNextSeededGaussian(state) {
  if (state.gaussianSpare !== null && state.gaussianSpare !== undefined) {
    const spare = state.gaussianSpare;
    state.gaussianSpare = null;
    return spare;
  }
  const u1 = Math.max(1e-12, nodeGraphNextSeededUnipolar(state));
  const u2 = nodeGraphNextSeededUnipolar(state);
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  const angle = nodeGraphTau * u2;
  state.gaussianSpare = magnitude * Math.sin(angle);
  return magnitude * Math.cos(angle);
}
