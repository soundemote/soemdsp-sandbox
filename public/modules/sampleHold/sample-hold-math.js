// Sample & Hold — hold / clock / optional glide between holds (main-thread JS).
// Noise fallback when a channel In is unwired uses shared seeded noise helpers.

function createNodeGraphSampleHoldState() {
  return {
    clockPhase: 0,
    held: 0, // target after last fire
    from: 0, // value at start of current segment
    out: 0, // last output
    samplesInSegment: 0,
    segmentSamples: 1,
    lastIntervalSamples: 0,
    samplesSinceFire: 0,
    lastTrigger: 0,
    noise: typeof createNodeGraphNoiseGeneratorChannelState === "function"
      ? createNodeGraphNoiseGeneratorChannelState()
      : { seed: 1 },
  };
}

function createNodeGraphStereoSampleHoldState() {
  return {
    ext: createNodeGraphSampleHoldState(),
    left: createNodeGraphSampleHoldState(),
    right: createNodeGraphSampleHoldState(),
  };
}

/** 0 Off, 1 Linear, 2 Smoothstep */
function nodeGraphSampleHoldNormalizeInterpolate(mode) {
  const n = Math.round(Number(mode));
  if (n === 1 || n === 2) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "linear" || s === "lin") return 1;
  if (s === "2" || s === "smoothstep" || s === "smooth") return 2;
  return 0;
}

function nodeGraphSampleHoldSmoothstep(t) {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * @returns {number} output sample
 */
function nodeGraphSampleHoldCore(
  state,
  input,
  clock,
  threshold,
  sampleFrequency,
  sampleRate,
  hasInConnected,
  seedKey = "sampleHold",
  interpolate = 0,
) {
  if (typeof nodeGraphResetSeededState === "function") {
    nodeGraphResetSeededState(state.noise, seedKey, 0, "sampleHoldNoise");
  }
  const safeInput = hasInConnected
    ? (nodeGraphFiniteNumber(input))
    : (typeof nodeGraphNextSeededBipolar === "function"
      ? nodeGraphNextSeededBipolar(state.noise)
      : 0);
  const safeClock = nodeGraphFiniteNumber(clock);
  const safeThreshold = nodeGraphFiniteNumber(threshold);
  const safeFreq = Math.max(0, nodeGraphFiniteNumber(sampleFrequency));
  const safeRate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const interp = nodeGraphSampleHoldNormalizeInterpolate(interpolate);

  let internalFire = false;
  if (safeFreq > 0) {
    state.clockPhase += safeFreq / safeRate;
    if (state.clockPhase >= 1) {
      state.clockPhase -= Math.floor(state.clockPhase);
      internalFire = true;
    }
  }

  const risingEdge = state.lastTrigger <= safeThreshold && safeClock > safeThreshold;
  const fire = risingEdge || internalFire;
  state.samplesSinceFire = (nodeGraphFiniteNumber(state.samplesSinceFire)) + 1;

  if (fire) {
    const interval = Math.max(1, nodeGraphFiniteNumber(state.samplesSinceFire, 1));
    state.lastIntervalSamples = interval;
    state.samplesSinceFire = 0;
    // Segment length: internal clock period, else last measured Clock interval.
    let seg = safeFreq > 0
      ? Math.max(1, Math.round(safeRate / safeFreq))
      : Math.max(1, nodeGraphFiniteNumber(state.lastIntervalSamples, 1));
    state.segmentSamples = seg;
    state.samplesInSegment = 0;
    state.from = nodeGraphFiniteNumber(state.out);
    state.held = safeInput;
    if (interp === 0) {
      state.out = safeInput;
      state.from = safeInput;
    }
  }

  state.lastTrigger = safeClock;

  if (interp === 0) {
    state.out = nodeGraphFiniteNumber(state.held);
    return state.out;
  }

  state.samplesInSegment = (nodeGraphFiniteNumber(state.samplesInSegment)) + 1;
  const seg = Math.max(1, nodeGraphFiniteNumber(state.segmentSamples, 1));
  let t = state.samplesInSegment / seg;
  if (t > 1) t = 1;
  if (interp === 2) t = nodeGraphSampleHoldSmoothstep(t);
  const from = nodeGraphFiniteNumber(state.from);
  const to = nodeGraphFiniteNumber(state.held);
  state.out = from + (to - from) * t;
  return state.out;
}
