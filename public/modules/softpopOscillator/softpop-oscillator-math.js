// Softpop Oscillator — pure math (main thread + worklet Blob).
// Gaussian white / pink / brown → EQ ZDF SVF Bandpass Peak (mode 4) × amplitude.
// Independent L/R noise; Reset rising edge restarts the seeded sequence.

// Worklet Blob may not have main-thread globals; provide minimal polyfills.
if (typeof nodeGraphTau === "undefined") {
  // eslint-disable-next-line no-var
  var nodeGraphTau = Math.PI * 2;
}
if (typeof nodeGraphStableSeed !== "function") {
  // eslint-disable-next-line no-var
  var nodeGraphStableSeed = function nodeGraphStableSeedPolyfill(text) {
    let h = 2166136261 >>> 0;
    const s = String(text || "");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 0x12345678;
  };
}

function createNodeGraphSoftpopNoiseChannel() {
  if (typeof createNodeGraphNoiseGeneratorChannelState === "function") {
    return createNodeGraphNoiseGeneratorChannelState();
  }
  return { brown: 0, gaussianSpare: null, pink: [0, 0, 0, 0, 0, 0, 0], seed: 0, seedKey: "" };
}

function createNodeGraphSoftpopChannelState() {
  return {
    noise: createNodeGraphSoftpopNoiseChannel(),
    filter: typeof createNodeGraphEqFilterState === "function"
      ? createNodeGraphEqFilterState()
      : { z1: 0, z2: 0, lastMode: -1, lastOmega: NaN, lastQ: NaN, lastA: NaN, g: 0, c: 0, s: 1, aL: 0, aB: 0, aH: 1 },
  };
}

function createNodeGraphSoftpopOscillatorState() {
  return {
    left: createNodeGraphSoftpopChannelState(),
    right: createNodeGraphSoftpopChannelState(),
    lastReset: false,
    generation: 0,
    lastSeed: NaN,
  };
}

/**
 * Map Softpop color UI → Noise Generator mode:
 * 0 White → Gaussian (mode 1), 1 Pink → mode 3, 2 Brown → mode 2.
 */
function nodeGraphSoftpopColorToNoiseMode(color) {
  const c = Math.max(0, Math.min(2, Math.round(Number(color) || 0)));
  if (c === 1) return 3; // pink
  if (c === 2) return 2; // brown
  return 1; // gaussian white
}

function nodeGraphSoftpopForceReseed(state, nodeId, seed) {
  const gen = Number(state.generation) || 0;
  const s = Math.max(0, Math.round(Number(seed) || 0));
  if (typeof nodeGraphResetSeededState === "function") {
    // Clear key so salt change always restarts, even same seed.
    state.left.noise.seedKey = "";
    state.right.noise.seedKey = "";
    nodeGraphResetSeededState(state.left.noise, `${nodeId}:L:g${gen}`, s, "softpop");
    nodeGraphResetSeededState(state.right.noise, `${nodeId}:R:g${gen}`, s, "softpop");
  } else {
    state.left.noise.seed = (s * 1103515245 + 12345 + gen * 9973) >>> 0;
    state.right.noise.seed = (s * 1664525 + 1013904223 + gen * 7919) >>> 0;
    state.left.noise.gaussianSpare = null;
    state.right.noise.gaussianSpare = null;
    state.left.noise.brown = 0;
    state.right.noise.brown = 0;
    state.left.noise.pink = [0, 0, 0, 0, 0, 0, 0];
    state.right.noise.pink = [0, 0, 0, 0, 0, 0, 0];
  }
  // Clear BP state so reset is fully deterministic from the noise path too.
  if (typeof createNodeGraphEqFilterState === "function") {
    state.left.filter = createNodeGraphEqFilterState();
    state.right.filter = createNodeGraphEqFilterState();
  } else {
    state.left.filter.z1 = 0;
    state.left.filter.z2 = 0;
    state.right.filter.z1 = 0;
    state.right.filter.z2 = 0;
  }
}

/**
 * One sample of Softpop.
 * @returns {{ Left: number, Right: number, Out: number }}
 */
function nodeGraphSoftpopOscillatorSample(state, params, sampleRate, nodeId = "softpop") {
  if (!state || typeof state !== "object") {
    return { Left: 0, Right: 0, Out: 0 };
  }
  if (!state.left || !state.right) {
    const fresh = createNodeGraphSoftpopOscillatorState();
    Object.assign(state, fresh);
  }

  const color = Math.max(0, Math.min(2, Math.round(Number(params?.color) || 0)));
  const noiseMode = nodeGraphSoftpopColorToNoiseMode(color);
  // 0 Stereo (independent L/R), 1 Mono (shared noise → both channels)
  const stereoMode = Math.max(0, Math.min(1, Math.round(Number(params?.stereoMode) || 0)));
  const frequency = Math.max(0, Number(params?.frequency) || 0);
  const q = Math.max(0.05, Number(params?.q) || 1);
  const amplitude = Number(params?.amplitude);
  const level = Number.isFinite(amplitude) ? amplitude : 1;
  const seed = Math.max(0, Math.round(Number(params?.seed) || 0));
  const rate = Math.max(1, Number(sampleRate) || 44100);

  // Rising-edge Reset → new generation, reseed from Seed param.
  const resetIn = Number(params?.reset) || 0;
  const resetActive = resetIn > 0.5;
  if (resetActive && !state.lastReset) {
    state.generation = (Number(state.generation) || 0) + 1;
    nodeGraphSoftpopForceReseed(state, nodeId, seed);
  }
  state.lastReset = resetActive;

  // Seed param change also restarts sequence (without bumping generation).
  if (state.lastSeed !== seed) {
    state.lastSeed = seed;
    nodeGraphSoftpopForceReseed(state, nodeId, seed);
  } else if (typeof nodeGraphResetSeededState === "function") {
    // Keep running sequence; ensure key still matches generation.
    const gen = Number(state.generation) || 0;
    nodeGraphResetSeededState(state.left.noise, `${nodeId}:L:g${gen}`, seed, "softpop");
    nodeGraphResetSeededState(state.right.noise, `${nodeId}:R:g${gen}`, seed, "softpop");
  }

  const mean = 0;
  const deviation = 1;
  let nL = 0;
  let nR = 0;
  if (typeof nodeGraphNoiseGeneratorChannelSample === "function") {
    nL = nodeGraphNoiseGeneratorChannelSample(state.left.noise, noiseMode, mean, deviation, 1);
    if (stereoMode === 1) {
      nR = nL;
    } else {
      nR = nodeGraphNoiseGeneratorChannelSample(state.right.noise, noiseMode, mean, deviation, 1);
    }
  } else if (typeof nodeGraphNextSeededGaussian === "function") {
    nL = nodeGraphNextSeededGaussian(state.left.noise);
    nR = stereoMode === 1 ? nL : nodeGraphNextSeededGaussian(state.right.noise);
  }

  // Soft soft-clip noise so Peak BP stays well-behaved
  nL = Math.max(-4, Math.min(4, nL));
  nR = Math.max(-4, Math.min(4, nR));

  let yL = nL;
  let yR = nR;
  if (typeof nodeGraphEqFilterSample === "function") {
    yL = nodeGraphEqFilterSample(state.left.filter, nL, 4, frequency, q, 0, rate);
    if (stereoMode === 1) {
      // Shared filter state for true mono (same phase response)
      yR = yL;
      // Keep right filter coeffs warm without double-noise: copy left states lightly
      if (state.right.filter && state.left.filter) {
        state.right.filter.z1 = state.left.filter.z1;
        state.right.filter.z2 = state.left.filter.z2;
      }
    } else {
      yR = nodeGraphEqFilterSample(state.right.filter, nR, 4, frequency, q, 0, rate);
    }
  }

  const left = yL * level;
  const right = yR * level;
  return {
    Left: Number.isFinite(left) ? left : 0,
    Right: Number.isFinite(right) ? right : 0,
    Out: Number.isFinite((left + right) * 0.5) ? (left + right) * 0.5 : 0,
  };
}
