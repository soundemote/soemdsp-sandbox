// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

const nodeGraphPluckEnvelopeMinValue = 1e-8;
const nodeGraphPluckEnvelopeMaxFeedback = 1 - 1e-6;

function nodeGraphExponentialCurve(value, skew) {
  const safeValue = clampNodeSliderValue(Number(value) || 0, 0, 1);
  const safeSkew = clampNodeSliderValue(Number(skew) || 0, -0.99, 0.99);
  if (safeSkew === 0) {
    return safeValue;
  }
  const c = 0.5 * (safeSkew + 1);
  const a = 2 * Math.log10((1 - c) / c);
  const denom = 1 - Math.exp(a);
  return denom === 0 ? safeValue : (1 - Math.exp(safeValue * a)) / denom;
}


function nodeGraphPluckPrepareForDecay(state, rate, peak) {
  state.phasor = 0;
  state.autoReleasePhasor = 0;
  state.currentValue = peak;
  state.decayIncrement = (state.currentValue - 1) / Math.max(1, rate) / 50;
}

function nodeGraphPluckTriggerAttack(state, params, rate) {
  const period = 1 / Math.max(1, rate);
  const velocity = clampNodeSliderValue(params.velocity, 0, 1);
  const sensitivity = clampNodeSliderValue(params.velocitySensitivity, 0, 1);
  const peak = (1 - sensitivity) + velocity * sensitivity;
  state.secondsPassed = 0;
  state.state = "delay";
  if (params.delayTime < period) {
    if (params.attackFeedback <= nodeGraphPluckEnvelopeMinValue) {
      state.state = "decay";
      nodeGraphPluckPrepareForDecay(state, rate, peak);
    } else {
      state.state = "attack";
    }
  }
  state.peak = peak;
}

function nodeGraphPluckTriggerRelease(state, rate) {
  if (state.state !== "release") {
    state.state = "release";
    state.releaseIncrement = state.currentValue / Math.max(1, rate) / 50;
  }
}

function nodeGraphPluckDecayFeedback(state, params) {
  let finalDecayMod = params.endingDecay;
  if (state.phasor < 1) {
    const shaped = nodeGraphExponentialCurve(state.phasor, params.decayModCurve || -1e-8);
    finalDecayMod = params.decay + params.decayModStart + shaped * (params.decayModEnd - params.decayModStart);
  }
  return Math.min(nodeGraphPluckEnvelopeMaxFeedback, Math.exp(-finalDecayMod * 10));
}


function createNodeGraphPluckEnvelopeState() {
  return {
    autoReleasePhasor: 0,
    currentValue: 0,
    decayIncrement: 0,
    lastRelease: 0,
    lastTrigger: 0,
    phasor: 0,
    releaseIncrement: 0,
    secondsPassed: 0,
    state: "off",
  };
}

function nodeGraphPluckEnvelopeSample(state, trigger, release, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const period = 1 / rate;
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "pluck trigger");
  const safeRelease = nodeGraphSafeFilterNumber(release, runtime, nodeId, null, "pluck release");
  const read = (key, fallback, min = -Infinity, max = Infinity) => clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params[key] ?? fallback, runtime, nodeId, null, `pluck ${key}`),
    min,
    max,
  );
  const values = {
    attackFeedback: read("attackFeedback", 0.002, 0),
    autoReleaseTime: read("autoReleaseTime", 0.08, 0),
    decay: read("decay", 0.35, 0.1, 1),
    decayModCurve: read("decayModCurve", 0, -1, 1),
    decayModEnd: read("decayModEnd", 0.55, 0.01, 3),
    decayModFrequency: read("decayModFrequency", 1.5, 0, 100),
    decayModStart: read("decayModStart", 0.08, 0.001, 1.8),
    delayTime: read("delayTime", 0, 0),
    endingDecay: read("endingDecay", 0.8, 0, 1.4),
    level: read("level", 1, 0, 1),
    releaseFeedback: read("releaseFeedback", 0.35, 0, 1),
    velocity: read("velocity", 1, 0, 1),
    velocitySensitivity: read("velocitySensitivity", 0, 0, 1),
  };

  if (state.lastTrigger <= 0 && safeTrigger > 0) {
    nodeGraphPluckTriggerAttack(state, values, rate);
  }
  if (state.lastRelease <= 0 && safeRelease > 0) {
    nodeGraphPluckTriggerRelease(state, rate);
  }
  state.lastTrigger = safeTrigger;
  state.lastRelease = safeRelease;

  const attackFeedbackAmp = 1 / (Math.max(values.attackFeedback, nodeGraphPluckEnvelopeMinValue) * rate);
  const releaseFeedbackAmp = Math.min(nodeGraphPluckEnvelopeMaxFeedback, Math.exp(-values.releaseFeedback * 10));
  const autoReleaseIncrement = values.autoReleaseTime <= nodeGraphPluckEnvelopeMinValue
    ? 0
    : 1 / (Math.max(values.autoReleaseTime, nodeGraphPluckEnvelopeMinValue) * rate);
  const phasorIncrement = values.decayModFrequency / rate;

  switch (state.state) {
    case "delay":
      state.secondsPassed += period;
      if (state.secondsPassed >= values.delayTime) {
        state.state = "attack";
      }
      break;
    case "attack":
      state.currentValue += period + state.currentValue * attackFeedbackAmp;
      if (state.currentValue >= state.peak) {
        state.state = "decay";
        nodeGraphPluckPrepareForDecay(state, rate, state.peak);
      }
      break;
    case "decay":
      state.currentValue -= state.decayIncrement + state.currentValue * state.currentValue * nodeGraphPluckDecayFeedback(state, values);
      state.phasor += phasorIncrement;
      state.autoReleasePhasor += autoReleaseIncrement;
      if (autoReleaseIncrement > 0 && state.autoReleasePhasor >= 1) {
        nodeGraphPluckTriggerRelease(state, rate);
      }
      if (state.currentValue < 0) {
        state.currentValue = 0;
        state.secondsPassed = 0;
        state.phasor = 0;
        state.autoReleasePhasor = 0;
        state.state = "off";
      }
      break;
    case "release":
      state.currentValue -= state.releaseIncrement + state.currentValue * state.currentValue * releaseFeedbackAmp;
      if (state.currentValue <= 0) {
        state.currentValue = 0;
        state.secondsPassed = 0;
        state.phasor = 0;
        state.autoReleasePhasor = 0;
        state.state = "off";
      }
      break;
    case "off":
    default:
      break;
  }
  return nodeGraphSafeFilterNumber(state.currentValue * values.level, runtime, nodeId, null, "pluck output");
}


// Registers the offline/render-time dispatch handler for pluckEnvelope into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pluckEnvelope = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.pluckEnvelopeStates.get(nodeId) || createNodeGraphPluckEnvelopeState();
  runtime.pluckEnvelopeStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPluckEnvelopeSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Release"),
    {
      attackFeedback: read("attackFeedback", 0.002),
      autoReleaseTime: read("autoReleaseTime", 0.08),
      decay: read("decay", 0.35),
      decayModCurve: read("decayModCurve", 0),
      decayModEnd: read("decayModEnd", 0.55),
      decayModFrequency: read("decayModFrequency", 1.5),
      decayModStart: read("decayModStart", 0.08),
      delayTime: read("delayTime", 0),
      endingDecay: read("endingDecay", 0.8),
      level: read("level", 1),
      releaseFeedback: read("releaseFeedback", 0.35),
      velocity: read("velocity", 1),
      velocitySensitivity: read("velocitySensitivity", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
