// Delay Effect — offline/render path.
// Classic single-tap feedback delay with delay-time modulation
// (Parabol / Random Walk / FBM — same family as Ping Pong / SoEmReverb).

function nodeGraphDelayHashBipolar(index, seed) {
  let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
}

function nodeGraphDelaySmoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = nodeGraphDelayHashBipolar(left, seed);
  const b = nodeGraphDelayHashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
}

function nodeGraphDelayFbmUnipolar(time, seed, octaves = 4, persistence = 0.5) {
  let total = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;
  const n = Math.max(1, Math.min(8, octaves | 0));
  const pers = Math.max(0, Math.min(0.999, persistence));
  for (let i = 0; i < n; i += 1) {
    total += nodeGraphDelaySmoothNoise1d(time * freq, (seed + i * 1013) >>> 0) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2;
  }
  if (!(maxValue > 0)) {
    return 0.5;
  }
  return (total / maxValue) * 0.5 + 0.5;
}

function nodeGraphDelayParabolBipolar(phase01) {
  let fit = (phase01 * 2) % 2;
  if (fit < 0) fit += 2;
  fit -= 1;
  return 4 * fit * (1 - Math.abs(fit));
}

function nodeGraphDelayRationalCurve01(x, k) {
  const v = Math.max(0, Math.min(1, Number(x) || 0));
  const kk = Math.max(-0.999, Math.min(0.999, Number(k) || 0));
  const denom = 2 * kk * v - kk - 1;
  if (Math.abs(denom) < 1e-12) {
    return v;
  }
  return (kk * v - v) / denom;
}

/** Mod LFO (Parabol / Random Walk / FBM) → bipolar −1…+1. */
function nodeGraphDelayRunModLfo(ch, style, rateHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const hz = Math.max(0, Number(rateHz) || 0);
  const st = Math.round(Number(style) || 0);

  if (st === 1) {
    // Random Walk (filtered bipolar), same family as Ping Pong / SoEmReverb.
    const noise = nodeGraphDelayHashBipolar(
      (ch.walkTick = (ch.walkTick + 1) | 0),
      ch.seed,
    );
    const increment = Math.max(0, Math.min(1, hz / rate));
    const jitterInc = Math.max(0, Math.min(1, (hz * 0.37) / rate));
    const stepSize = Math.max(0, Math.min(1, increment + nodeGraphDelayRationalCurve01(jitterInc, 0.99)));
    const averageIncrement = (jitterInc + increment) * 0.5;
    const whiteNoiseMix = averageIncrement >= 0.9
      ? nodeGraphDelayRationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
      : 0;
    const randomMix = 1 - whiteNoiseMix;
    const step = noise > 0 ? stepSize : -stepSize;
    ch.walkOut = Math.max(-1, Math.min(1, (ch.walkOut || 0) + step));
    const mixed = ch.walkOut * randomMix + noise * whiteNoiseMix;
    const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * Math.max(0, hz);
    const a1 = Math.exp(-w);
    ch.walkLpf = (1 - a1) * mixed + a1 * (ch.walkLpf || 0);
    return Math.max(-1, Math.min(1, ch.walkLpf));
  }

  if (st === 2) {
    ch.fbmTime = (ch.fbmTime || 0) + hz / rate;
    const uni = nodeGraphDelayFbmUnipolar(ch.fbmTime, ch.seed, 4, 0.5);
    return Math.max(-1, Math.min(1, uni * 2 - 1));
  }

  // Parabol (smooth cyclic), free-running phase.
  ch.phase = ((ch.phase || 0) + hz / rate) % 1;
  if (ch.phase < 0) ch.phase += 1;
  return nodeGraphDelayParabolBipolar(ch.phase);
}

function createNodeGraphDelayEffectLfoState(seed = 0xA11CE) {
  return {
    phase: 0,
    fbmTime: 0,
    walkOut: 0,
    walkLpf: 0,
    walkTick: 0,
    seed: seed >>> 0,
  };
}

function createNodeGraphDelayEffectState() {
  return {
    buffer: new Float32Array(1),
    bufferSize: 1,
    lfo: createNodeGraphDelayEffectLfoState(),
    lfoVariationState: 0,
    position: 0,
    wet: 0,
  };
}

function createNodeGraphStereoDelayEffectState() {
  return {
    left: createNodeGraphDelayEffectState(),
    mono: createNodeGraphDelayEffectState(),
    right: createNodeGraphDelayEffectState(),
  };
}

function nodeGraphDelayEffectEnsureLfo(state, nodeId) {
  if (!state.lfo || typeof state.lfo !== "object") {
    state.lfo = createNodeGraphDelayEffectLfoState();
  }
  const seedKey = `${nodeId}:delayMod`;
  if (state.lfo.seedKey !== seedKey) {
    state.lfo.seedKey = seedKey;
    const seed = typeof nodeGraphStableSeed === "function"
      ? nodeGraphStableSeed(seedKey)
      : 0xA11CE;
    state.lfo.seed = seed >>> 0;
  }
}

function nodeGraphDelayEffectSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const maxDelaySeconds = 4.25;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.buffer || state.bufferSize !== requiredSize) {
    state.buffer = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.lfo = createNodeGraphDelayEffectLfoState(state.lfo?.seed);
    state.lfoVariationState = 0;
    state.wet = 0;
  }
  nodeGraphDelayEffectEnsureLfo(state, nodeId);

  const rawIn = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "delay input");
  const inLevel = nodeGraphSafeFilterNumber(params.inLevel, runtime, nodeId, state, "delay inLevel");
  const dry = rawIn * (Number.isFinite(inLevel) ? inLevel : 1);
  const time = Math.max(0.001, Math.min(maxDelaySeconds, nodeGraphSafeFilterNumber(params.time, runtime, nodeId, state, "delay time")));
  // Rare hard clamp: feedback only (UI 0–1). Keeps regen from runaway.
  const feedback = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.feedback, runtime, nodeId, state, "delay feedback")));
  const mix = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, state, "delay mix")));
  // Legacy patches used `level`; new name is outLevel.
  const outLevelRaw = params.outLevel != null ? params.outLevel : params.level;
  const outLevel = nodeGraphSafeFilterNumber(outLevelRaw, runtime, nodeId, state, "delay outLevel");
  const modAmount = Math.max(0, Math.min(0.5, nodeGraphSafeFilterNumber(params.modAmount, runtime, nodeId, state, "delay modulation")));
  const modRate = Math.max(0, Math.min(90, nodeGraphSafeFilterNumber(params.modRate, runtime, nodeId, state, "delay mod rate")));
  const modVariation = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.modVariation, runtime, nodeId, state, "delay variation")));
  const modStyle = Math.round(nodeGraphSafeFilterNumber(params.modStyle, runtime, nodeId, state, "delay mod style") || 0);

  const ch = state.lfo;
  const phaseProxy = Number(ch.phase) || Number(ch.fbmTime) || 0;
  const variationTarget = nodeGraphDelayHashBipolar(
    Math.floor(phaseProxy * 997) + state.position,
    ch.seed,
  );
  state.lfoVariationState += (variationTarget - state.lfoVariationState) * Math.min(1, modRate / safeRate);
  const variedRate = Math.max(0, modRate * (1 + state.lfoVariationState * modVariation));
  // Unipolar 0…1 depth envelope (same mapping as classic parabol path).
  const lfo = (nodeGraphDelayRunModLfo(ch, modStyle, variedRate, safeRate) + 1) * 0.5;

  const delaySamples = Math.max(1, Math.min(state.bufferSize - 2, time * safeRate));
  const bufferOffset = delaySamples - delaySamples * lfo * modAmount + 1;
  state.position = (state.position + 1) % state.bufferSize;
  const readPosition = (state.position + state.bufferSize - bufferOffset) % state.bufferSize;
  const interpMode = 0;
  const wet = typeof nodeGraphDelayInterpolate === "function"
    ? nodeGraphDelayInterpolate(state.buffer, readPosition, interpMode)
    : nodeGraphDelayInterpolateLinear(state.buffer, readPosition);
  // Single classic delay: write dry + feedback * delayed.
  const write = dry + wet * feedback;
  state.buffer[state.position] = Math.max(-8, Math.min(8, write));
  state.wet = wet;
  const level = Number.isFinite(outLevel) ? outLevel : 1;
  const mixOut = (dry * (1 - mix) + state.wet * mix) * level;
  // Mix = dry/wet blend (post OutLevel). Dry no longer exposed as a jack.
  return {
    Mix: mixOut,
    Out: mixOut,
  };
}


// Registers the offline/render-time dispatch handler for delayEffect into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
nodeGraphLiveModuleEvaluators.delayEffect = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.delayEffectStates.get(nodeId) || createNodeGraphStereoDelayEffectState();
  runtime.delayEffectStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const legacyLevel = read("level", 1);
  const delayParams = {
    feedback: read("feedback", 0.25),
    inLevel: read("inLevel", 1),
    // Prefer outLevel; fall back to legacy Level for old patches.
    outLevel: (() => {
      const v = read("outLevel", Number.NaN);
      return Number.isFinite(v) ? v : legacyLevel;
    })(),
    mix: read("mix", 0.35),
    modAmount: read("modAmount", 0.02),
    modRate: read("modRate", 0.1),
    modStyle: read("modStyle", 0),
    modVariation: read("modVariation", 0),
    time: read("time", 0.18),
    // 0 = linear, 1 = hermite (default hermite).
    interpolation: read("interpolation", 0),
  };
  // Mono In sums into both sides (not a third independent delay line).
  // Mix M = (Mix L + Mix R) * 0.5 — house mono-sum convention.
  const delayMono = mixInput(nodeId);
  const leftResult = nodeGraphDelayEffectSample(
    state.left,
    mixInput(nodeId, "Left") + delayMono,
    delayParams,
    sampleRate,
    runtime,
    `${nodeId}:left`,
  );
  const rightResult = nodeGraphDelayEffectSample(
    state.right,
    mixInput(nodeId, "Right") + delayMono,
    delayParams,
    sampleRate,
    runtime,
    `${nodeId}:right`,
  );
  const mixL = leftResult.Mix;
  const mixR = rightResult.Mix;
  const mixM = (mixL + mixR) * 0.5;
  return {
    Mix: mixM,
    Out: mixM,
    Left: mixL,
    Right: mixR,
  };
};
