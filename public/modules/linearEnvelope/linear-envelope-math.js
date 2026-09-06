// Linear Envelope — pure ADSR-style state machine (main + worklet JS path).
// Delay → Attack → Decay → Sustain → Release, optional loop at sustain.

function createNodeGraphLinearEnvelopeState() {
  return {
    lastGate: 0,
    out: 0,
    releaseDecrement: 0,
    secondsPassed: 0,
    state: "off",
  };
}

function nodeGraphLinearEnvelopeTriggerAttack(state, delay, attack, sampleRate) {
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
  if (state.out <= (typeof nodeGraphPlanck === "function" ? nodeGraphPlanck() : 1e-7)) {
    state.out = 0;
    state.secondsPassed = 0;
  }
  state.state = "delay";
}

/**
 * @param {object} state
 * @param {number} gate
 * @param {object} params delay, attack, decay, sustain, release, level, loop
 * @param {number} sampleRate
 * @returns {number}
 */
function nodeGraphLinearEnvelopeCore(state, gate, params, sampleRate) {
  const safeGate = Number(gate) || 0;
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const level = Number(params.level) || 0;
  const looping = (Number(params.loop) || 0) >= 0.5;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const period = 1 / rate;

  if (state.lastGate <= 0 && safeGate > 0) {
    nodeGraphLinearEnvelopeTriggerAttack(state, delay, attack, rate);
  } else if (state.lastGate > 0 && safeGate <= 0) {
    state.state = "release";
    state.releaseDecrement = (state.out * period) / Math.max(release, period);
  }
  state.lastGate = safeGate;

  const attackIncrement = Math.min(period / Math.max(attack, period), 1);
  const decayDecrement = ((1 - sustain) * period) / Math.max(decay, period);

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
      state.out += attackIncrement;
      if (state.out >= 1) {
        state.out = 1;
        state.state = "decay";
      }
      break;
    case "decay":
      state.out -= decayDecrement;
      if (state.out <= sustain) {
        state.out = sustain;
        state.state = "sustain";
      }
      break;
    case "sustain":
      if (looping) {
        state.state = "attack";
      }
      state.out = sustain;
      break;
    case "release":
      state.out -= state.releaseDecrement;
      if (state.out <= 0) {
        state.out = 0;
        state.state = "off";
        state.secondsPassed = 0;
      }
      break;
    case "off":
    default:
      break;
  }

  const shaped = Math.max(0, Math.min(1, state.out)) * level;
  return Number.isFinite(shaped) ? shaped : 0;
}

/** @deprecated use nodeGraphLinearEnvelopeCore — kept name for older callers */
function nodeGraphLinearEnvelopeSample(state, gate, params, sampleRate, runtime = null, nodeId = "") {
  const out = nodeGraphLinearEnvelopeCore(state, gate, params, sampleRate);
  if (runtime && typeof nodeGraphSafeFilterNumber === "function") {
    return nodeGraphSafeFilterNumber(out, runtime, nodeId, null, "linear envelope output");
  }
  return out;
}

/**
 * Face preview: basic linear DADSR polyline (pre-level knob).
 * Delay → Attack → Decay → Sustain hold → Release.
 */
function nodeGraphLinearEnvelopePreviewCurve(params = {}, points = 160) {
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const sustainHold = Math.max(0.05, Math.min(0.4, (attack + decay + release) * 0.15 || 0.08));
  const gateHigh = delay + Math.max(attack + decay + sustainHold, 0.02);
  const total = Math.max(gateHigh + Math.max(release, 0.02), 0.08);
  const corners = [
    { t: 0, y: 0 },
    { t: delay / total, y: 0 },
    { t: (delay + attack) / total, y: 1 },
    { t: (delay + attack + decay) / total, y: sustain },
    { t: gateHigh / total, y: sustain },
    { t: Math.min(1, (gateHigh + release) / total), y: 0 },
    { t: 1, y: 0 },
  ];
  // Dedupe near-identical times so zero-length stages do not spike the path.
  const keyframes = [];
  for (const p of corners) {
    const pt = { t: Math.max(0, Math.min(1, p.t)), y: Math.max(0, Math.min(1, p.y)) };
    const prev = keyframes[keyframes.length - 1];
    if (prev && Math.abs(prev.t - pt.t) < 1e-9) {
      prev.y = pt.y;
      continue;
    }
    keyframes.push(pt);
  }
  const n = Math.max(32, Math.round(Number(points) || 160));
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / Math.max(1, n - 1);
    while (k + 1 < keyframes.length && keyframes[k + 1].t < t) k += 1;
    const a = keyframes[k];
    const b = keyframes[Math.min(keyframes.length - 1, k + 1)];
    const span = Math.max(1e-12, b.t - a.t);
    const u = Math.max(0, Math.min(1, (t - a.t) / span));
    out.push({ t, y: a.y + (b.y - a.y) * u });
  }
  return {
    points: out,
    total,
    gateHigh,
    labels: { left: "A", mid: "S", right: "R" },
  };
}
