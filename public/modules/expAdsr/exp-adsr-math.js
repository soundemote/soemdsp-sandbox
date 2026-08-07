// Exp ADSR — pure exponential envelope (main + worklet JS path).
// Coefficient form matches classic analog-style exp segments.

function nodeGraphExpAdsrCalcCoef(rate, targetRatio) {
  const safeRate = Math.max(0, Number(rate) || 0);
  const safeRatio = Math.max(0.000000001, Number(targetRatio) || 0.000000001);
  return safeRate <= 0 ? 0 : Math.exp(-Math.log((1 + safeRatio) / safeRatio) / safeRate);
}

function createNodeGraphExpAdsrState() {
  return {
    lastGate: 0,
    out: 0,
    secondsPassed: 0,
    state: "off",
  };
}

function nodeGraphExpAdsrTriggerAttack(state, delay, attack, sampleRate) {
  const period = 1 / Math.max(1, sampleRate);
  if (delay < period) {
    if (attack <= period) {
      state.state = "decay";
      state.out = 1;
    } else {
      state.state = "attack";
    }
    return;
  }
  if (state.out <= 0.000001) {
    state.out = 0;
    state.secondsPassed = 0;
  }
  state.state = "delay";
}

/**
 * @param {object} state
 * @param {number} gate
 * @param {object} params delay, attack, attackShape, decay, sustain, release, releaseShape, level, loop
 * @param {number} sampleRate
 * @returns {number}
 */
function nodeGraphExpAdsrCore(state, gate, params, sampleRate) {
  const safeGate = Number(gate) || 0;
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const attackShape = Math.max(0.000000001, Number(params.attackShape) || 0.000000001);
  const releaseShape = Math.max(0.000000001, Number(params.releaseShape) || 0.000000001);
  const level = Number(params.level) || 0;
  const looping = (Number(params.loop) || 0) >= 0.5;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const period = 1 / rate;

  if (state.lastGate <= 0 && safeGate > 0) {
    nodeGraphExpAdsrTriggerAttack(state, delay, attack, rate);
  } else if (state.lastGate > 0 && safeGate <= 0) {
    state.state = "release";
  }
  state.lastGate = safeGate;

  const attackCoef = nodeGraphExpAdsrCalcCoef(attack * rate, attackShape);
  const decayCoef = nodeGraphExpAdsrCalcCoef(decay * rate, releaseShape);
  const releaseCoef = nodeGraphExpAdsrCalcCoef(release * rate, releaseShape);
  const attackBase = (1 + attackShape) * (1 - attackCoef);
  const decayBase = (sustain - releaseShape) * (1 - decayCoef);
  const releaseBase = -releaseShape * (1 - releaseCoef);

  switch (state.state) {
    case "delay":
      state.secondsPassed += period;
      if (state.secondsPassed >= delay) {
        state.state = attack <= period ? "decay" : "attack";
        state.secondsPassed = 0;
        if (attack <= period) {
          state.out = 1;
        }
      }
      break;
    case "attack":
      state.out = attackBase + state.out * attackCoef;
      if (state.out >= 1) {
        state.out = 1;
        state.state = "decay";
      }
      break;
    case "decay":
      state.out = decayBase + state.out * decayCoef;
      if (state.out <= sustain) {
        state.out = sustain;
        state.state = "sustain";
      }
      break;
    case "sustain":
      state.out = sustain;
      if (looping) {
        nodeGraphExpAdsrTriggerAttack(state, delay, attack, rate);
      }
      break;
    case "release":
      state.out = releaseBase + state.out * releaseCoef;
      if (state.out <= 0) {
        state.out = 0;
        state.state = "off";
      }
      break;
    case "off":
    default:
      state.out = 0;
      break;
  }

  const shaped = state.out * level;
  return Number.isFinite(shaped) ? shaped : 0;
}

/** @deprecated use nodeGraphExpAdsrCore — kept name for older callers */
function nodeGraphExpAdsrSample(state, gate, params, sampleRate, runtime = null, nodeId = "") {
  const out = nodeGraphExpAdsrCore(state, gate, params, sampleRate);
  if (runtime && typeof nodeGraphSafeFilterNumber === "function") {
    return nodeGraphSafeFilterNumber(out, runtime, nodeId, null, "exp adsr output");
  }
  return out;
}

/**
 * Face preview: one gated note (gate high through A+D+sustain hold, then release).
 * Points are 0..1 time and 0..1 level (pre-level knob).
 */
function nodeGraphExpAdsrPreviewCurve(params = {}, sampleRate = 2000, points = 160) {
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const attackShape = Math.max(1e-9, Number(params.attackShape) || 0.3);
  const releaseShape = Math.max(1e-9, Number(params.releaseShape) || 0.0001);
  // Brief sustain plateau so the knee is visible
  const sustainHold = Math.max(0.05, Math.min(0.4, (attack + decay + release) * 0.15 || 0.08));
  const gateHigh = delay + Math.max(attack + decay + sustainHold, 0.02);
  const total = Math.max(gateHigh + Math.max(release * 1.2, release + 0.02, 0.05), 0.08);
  const rate = Math.max(200, Number(sampleRate) || 2000);
  const n = Math.max(32, Math.round(Number(points) || 160));
  const state = createNodeGraphExpAdsrState();
  const out = [];
  const totalSamples = Math.max(n, Math.ceil(total * rate));
  const step = Math.max(1, Math.floor(totalSamples / n));
  let t = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const gate = t < gateHigh ? 1 : 0;
    const y = nodeGraphExpAdsrCore(state, gate, {
      delay,
      attack,
      attackShape,
      decay,
      sustain,
      release,
      releaseShape,
      level: 1,
      loop: 0,
    }, rate);
    if (i % step === 0 || i === totalSamples - 1) {
      out.push({ t: t / total, y: Math.max(0, Math.min(1, Math.abs(y))) });
    }
    t += 1 / rate;
  }
  if (out.length && out[out.length - 1].t < 1) {
    out.push({ t: 1, y: out[out.length - 1].y });
  }
  return {
    points: out,
    total,
    gateHigh,
    labels: { left: "A", mid: "S", right: "R" },
  };
}
