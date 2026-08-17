// Ping Pong Delay — tempo-synced base time + independent L/R LFO drift
// (Parabol / Random Walk / FBM), passive HPF/LPF in the feedback loop,
// and SoEm-style soft clip for tape grunge.

function nodeGraphPingPongDelayTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
  if (rounded === 1) {
    return 1.5; // Dotted
  }
  if (rounded === 2) {
    return 2 / 3; // Triplet
  }
  return 1; // Normal
}

/** Tap fraction of a whole note: Numer/Denom (e.g. 1/16 → sixteenth note). */
function nodeGraphPingPongDelayFraction(numerator, denominator) {
  const effectiveNumerator = Math.max(0, Number(numerator) || 0);
  if (effectiveNumerator === 0) {
    return 0;
  }
  const effectiveDenominator = Math.max(1, Math.round(Number(denominator) || 0) || 1);
  return effectiveNumerator / effectiveDenominator;
}

/** Base delay seconds from tempo + Numer/Denom/Sync only (no LFO offset). */
function nodeGraphPingPongDelayBaseSeconds(params, runtime) {
  const timing = typeof normalizeNodeGraphPatchTiming === "function"
    ? normalizeNodeGraphPatchTiming(runtime?.timing)
    : (runtime?.timing || {});
  const bpm = Math.max(1, Number(timing.tempoBpm) || 120);
  const secondsPerWholeNote = 240 / bpm;
  const fraction = nodeGraphPingPongDelayFraction(params.timeNumerator, params.timeDenominator);
  return secondsPerWholeNote * fraction * nodeGraphPingPongDelayTimingModeMultiplier(params.timingMode);
}

function nodeGraphPingPongHashBipolar(index, seed) {
  let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
}

function nodeGraphPingPongSmoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = nodeGraphPingPongHashBipolar(left, seed);
  const b = nodeGraphPingPongHashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
}

function nodeGraphPingPongFbmUnipolar(time, seed, octaves = 4, persistence = 0.5) {
  let total = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;
  const n = Math.max(1, Math.min(8, octaves | 0));
  const pers = Math.max(0, Math.min(0.999, persistence));
  for (let i = 0; i < n; i += 1) {
    total += nodeGraphPingPongSmoothNoise1d(time * freq, (seed + i * 1013) >>> 0) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2;
  }
  if (!(maxValue > 0)) {
    return 0.5;
  }
  return (total / maxValue) * 0.5 + 0.5;
}

function nodeGraphPingPongParabolBipolar(phase01) {
  let fit = (phase01 * 2) % 2;
  if (fit < 0) fit += 2;
  fit -= 1;
  return 4 * fit * (1 - Math.abs(fit));
}

function nodeGraphPingPongRationalCurve01(x, k) {
  const v = Math.max(0, Math.min(1, Number(x) || 0));
  const kk = Math.max(-0.999, Math.min(0.999, Number(k) || 0));
  const denom = 2 * kk * v - kk - 1;
  if (Math.abs(denom) < 1e-12) {
    return v;
  }
  return (kk * v - v) / denom;
}

/** One channel of independent LFO (Parabol / Random Walk / FBM) → bipolar −1…+1. */
function nodeGraphPingPongRunLfoChannel(ch, style, rateHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const hz = Math.max(0, Number(rateHz) || 0);
  const st = Math.round(Number(style) || 0);

  if (st === 1) {
    // Random Walk (filtered bipolar), same family as SoEmReverb.
    const noise = nodeGraphPingPongHashBipolar(
      (ch.walkTick = (ch.walkTick + 1) | 0),
      ch.seed,
    );
    const increment = Math.max(0, Math.min(1, hz / rate));
    const jitterInc = Math.max(0, Math.min(1, (hz * 0.37) / rate));
    const stepSize = Math.max(0, Math.min(1, increment + nodeGraphPingPongRationalCurve01(jitterInc, 0.99)));
    const averageIncrement = (jitterInc + increment) * 0.5;
    const whiteNoiseMix = averageIncrement >= 0.9
      ? nodeGraphPingPongRationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
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
    // FBM free-running time → unipolar → bipolar.
    ch.fbmTime = (ch.fbmTime || 0) + hz / rate;
    const uni = nodeGraphPingPongFbmUnipolar(ch.fbmTime, ch.seed, 4, 0.5);
    return Math.max(-1, Math.min(1, uni * 2 - 1));
  }

  // Parabol (smooth cyclic), free-running phase.
  ch.phase = ((ch.phase || 0) + hz / rate) % 1;
  if (ch.phase < 0) ch.phase += 1;
  return nodeGraphPingPongParabolBipolar(ch.phase);
}

function nodeGraphPingPongSoftClip(v, saturate) {
  // SoEmReverb: width = saturate * 2, center = 0.
  const thr = Math.max(0.01, Number(saturate) || 1);
  if (typeof nodeGraphSoftClipperSample === "function") {
    return nodeGraphSoftClipperSample(v, 0, thr * 2);
  }
  const width = Math.max(1e-6, thr * 2);
  const scaleX = 2 / width;
  const shiftX = -1 - scaleX * (0 - 0.5 * width);
  const scaleY = 1 / scaleX;
  const shiftY = -shiftX * scaleY;
  return shiftY + scaleY * Math.tanh(scaleX * (Number(v) || 0) + shiftX);
}

function nodeGraphPingPongOnePoleLp(state, input, freqHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const f = Math.max(0, Number(freqHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * f;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  state.z = b0 * input + a1 * (state.z || 0);
  return state.z;
}

function nodeGraphPingPongOnePoleHp(state, input, freqHz, sampleRate) {
  // SoEm OnePoleHP (IIT-style).
  const rate = Math.max(1, sampleRate);
  const f = Math.max(0, Number(freqHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * f;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  const b1 = -b0;
  const x0 = state.x0 || 0;
  const y0 = state.y0 || 0;
  const y = b0 * input + b1 * x0 + a1 * y0;
  state.x0 = input;
  state.y0 = y;
  return y;
}

function createNodeGraphPingPongDelayState() {
  return {
    bufferL: new Float32Array(1),
    bufferR: new Float32Array(1),
    bufferSize: 1,
    position: 0,
    wetL: 0,
    wetR: 0,
    lfoL: { phase: 0, fbmTime: 0, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xA11CE },
    lfoR: { phase: 0.37, fbmTime: 0.17, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xB0B5 },
    lpL: { z: 0 },
    lpR: { z: 0 },
    hpL: { x0: 0, y0: 0 },
    hpR: { x0: 0, y0: 0 },
  };
}

function nodeGraphPingPongDelaySample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const maxDelaySeconds = 8;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.bufferL || state.bufferSize !== requiredSize) {
    state.bufferL = new Float32Array(requiredSize);
    state.bufferR = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.wetL = 0;
    state.wetR = 0;
  }
  if (!state.lfoL) {
    Object.assign(state, createNodeGraphPingPongDelayState(), {
      bufferL: state.bufferL,
      bufferR: state.bufferR,
      bufferSize: state.bufferSize,
      position: state.position,
    });
  }

  const dry = nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "ping pong delay input");
  const feedback = Math.max(0, Math.min(0.95, nodeGraphSafeFilterNumber(params.feedback, runtime, nodeId, null, "ping pong delay feedback")));
  const mix = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, null, "ping pong delay mix")));
  const level = Math.max(0, Math.min(2, nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "ping pong delay level")));
  const offsetMs = Math.max(0, nodeGraphSafeFilterNumber(params.offsetMs, runtime, nodeId, null, "ping pong delay offset"));
  const lfoStyle = Math.round(nodeGraphSafeFilterNumber(params.lfoStyle, runtime, nodeId, null, "ping pong lfo style") || 0);
  const lfoRate = Math.max(0, Math.min(40, nodeGraphSafeFilterNumber(params.lfoRate, runtime, nodeId, null, "ping pong lfo rate")));
  const lfoVariation = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.lfoVariation, runtime, nodeId, null, "ping pong lfo vary")));
  const saturate = Math.max(0.01, Math.min(4, nodeGraphSafeFilterNumber(params.saturate, runtime, nodeId, null, "ping pong saturate")));
  const lpfHz = Math.max(20, Math.min(20000, nodeGraphSafeFilterNumber(params.lpfFrequency, runtime, nodeId, null, "ping pong lpf")));
  const hpfHz = Math.max(1, Math.min(2000, nodeGraphSafeFilterNumber(params.hpfFrequency, runtime, nodeId, null, "ping pong hpf")));

  const baseSeconds = nodeGraphPingPongDelayBaseSeconds(params, runtime);
  const safeBase = Number.isFinite(baseSeconds) ? Math.max(0, baseSeconds) : 0;
  // Offset = max |drift| in ms, centered on base: L/R each get independent bipolar LFO.
  const driftSec = (Number.isFinite(offsetMs) ? offsetMs : 0) / 1000;
  const rateL = lfoRate * (1 + lfoVariation * 0.31);
  const rateR = lfoRate * (1 - lfoVariation * 0.27);
  const modL = driftSec > 1e-9
    ? nodeGraphPingPongRunLfoChannel(state.lfoL, lfoStyle, rateL, safeRate)
    : 0;
  const modR = driftSec > 1e-9
    ? nodeGraphPingPongRunLfoChannel(state.lfoR, lfoStyle, rateR, safeRate)
    : 0;

  const delaySecL = Math.max(0, safeBase + driftSec * modL);
  const delaySecR = Math.max(0, safeBase + driftSec * modR);
  const delaySamplesL = Math.min(state.bufferSize - 2, Math.max(1, delaySecL * safeRate));
  const delaySamplesR = Math.min(state.bufferSize - 2, Math.max(1, delaySecR * safeRate));

  state.position = (state.position + 1) % state.bufferSize;
  const readPosL = (state.position + state.bufferSize - delaySamplesL) % state.bufferSize;
  const readPosR = (state.position + state.bufferSize - delaySamplesR) % state.bufferSize;
  const interpMode = 0;
  const readL = typeof nodeGraphDelayInterpolate === "function"
    ? nodeGraphDelayInterpolate(state.bufferL, readPosL, interpMode)
    : (typeof nodeGraphDelayInterpolateLinear === "function"
      ? nodeGraphDelayInterpolateLinear(state.bufferL, readPosL)
      : 0);
  const readR = typeof nodeGraphDelayInterpolate === "function"
    ? nodeGraphDelayInterpolate(state.bufferR, readPosR, interpMode)
    : (typeof nodeGraphDelayInterpolateLinear === "function"
      ? nodeGraphDelayInterpolateLinear(state.bufferR, readPosR)
      : 0);

  // Feedback path: other channel → soft clip → HPF → LPF (tape darkening + grunge).
  const fbInL = dry + readR * feedback;
  const fbInR = readL * feedback;
  const clippedL = nodeGraphPingPongSoftClip(fbInL, saturate);
  const clippedR = nodeGraphPingPongSoftClip(fbInR, saturate);
  const hpL = nodeGraphPingPongOnePoleHp(state.hpL, clippedL, hpfHz, safeRate);
  const hpR = nodeGraphPingPongOnePoleHp(state.hpR, clippedR, hpfHz, safeRate);
  const writeL = nodeGraphPingPongOnePoleLp(state.lpL, hpL, lpfHz, safeRate);
  const writeR = nodeGraphPingPongOnePoleLp(state.lpR, hpR, lpfHz, safeRate);

  state.bufferL[state.position] = Math.max(-8, Math.min(8, writeL));
  state.bufferR[state.position] = Math.max(-8, Math.min(8, writeR));
  state.wetL = readL;
  state.wetR = readR;

  return {
    Left: (dry * (1 - mix) + state.wetL * mix) * level,
    Right: (dry * (1 - mix) + state.wetR * mix) * level,
  };
}

nodeGraphLiveModuleEvaluators.pingPongDelay = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.pingPongDelayStates.get(nodeId) || createNodeGraphPingPongDelayState();
  runtime.pingPongDelayStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPingPongDelaySample(
    state,
    mixInput(nodeId) + mixInput(nodeId, "Left") + mixInput(nodeId, "Right"),
    {
      feedback: read("feedback", 0.35),
      hpfFrequency: read("hpfFrequency", 20),
      // 0 = linear, 1 = hermite (default hermite).
      interpolation: read("interpolation", 0),
      level: read("level", 1),
      lfoRate: read("lfoRate", 0.35),
      lfoStyle: read("lfoStyle", 0),
      lfoVariation: read("lfoVariation", 0.25),
      lpfFrequency: read("lpfFrequency", 8000),
      mix: read("mix", 0.35),
      offsetMs: read("offsetMs", 0),
      saturate: read("saturate", 1),
      timeDenominator: read("timeDenominator", 4),
      timeNumerator: read("timeNumerator", 1),
      timingMode: read("timingMode", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
