// Sample & Hold — hold / clock / optional glide between holds (main-thread JS).
// Noise fallback when a channel In is unwired uses shared seeded noise helpers.
// phaseOffset (cycles mod 1) desyncs this lane vs offset 0 (Right uses it).

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
    pendingFireSamples: 0,
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

function nodeGraphSampleHoldWrap01(x) {
  let y = Number(x);
  if (!Number.isFinite(y)) return 0;
  y = y - Math.floor(y);
  if (y < 0) y += 1;
  if (y >= 1) y = 0;
  return y;
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
  phaseOffset = 0,
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
  const offset = nodeGraphSampleHoldWrap01(phaseOffset);

  let internalFire = false;
  if (safeFreq > 0) {
    const prev = state.clockPhase;
    state.clockPhase += safeFreq / safeRate;
    let wrapped = false;
    if (state.clockPhase >= 1) {
      state.clockPhase -= Math.floor(state.clockPhase);
      wrapped = true;
    }
    if (offset <= 1e-12 || offset >= 1 - 1e-12) {
      internalFire = wrapped;
    } else if (wrapped) {
      internalFire = prev < offset || state.clockPhase >= offset;
    } else {
      internalFire = prev < offset && state.clockPhase >= offset;
    }
  }

  const risingEdge = state.lastTrigger <= safeThreshold && safeClock > safeThreshold;
  let fire = internalFire;

  if (risingEdge) {
    if (offset <= 1e-12 || offset >= 1 - 1e-12) {
      fire = true;
      state.pendingFireSamples = 0;
    } else {
      const period = safeFreq > 0
        ? (safeRate / safeFreq)
        : Math.max(1, nodeGraphFiniteNumber(state.lastIntervalSamples, safeRate / 10));
      const delay = Math.round(offset * period);
      if (delay < 1) {
        fire = true;
        state.pendingFireSamples = 0;
      } else {
        state.pendingFireSamples = delay;
      }
    }
  }

  if ((nodeGraphFiniteNumber(state.pendingFireSamples)) > 0) {
    state.pendingFireSamples = (nodeGraphFiniteNumber(state.pendingFireSamples)) - 1;
    if (state.pendingFireSamples <= 0) {
      state.pendingFireSamples = 0;
      fire = true;
    }
  }

  state.samplesSinceFire = (nodeGraphFiniteNumber(state.samplesSinceFire)) + 1;

  if (fire) {
    const interval = Math.max(1, nodeGraphFiniteNumber(state.samplesSinceFire, 1));
    state.lastIntervalSamples = interval;
    state.samplesSinceFire = 0;
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