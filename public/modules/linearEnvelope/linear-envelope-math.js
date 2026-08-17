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
