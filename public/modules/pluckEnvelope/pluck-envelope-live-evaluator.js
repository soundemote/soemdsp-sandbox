// Pluck Envelope — SoEmPluck / soemdsp::PluckEnvelope offline path.
// Efficient Live uses native soemdsp_pluck_envelope_* (see worklet evaluator).

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
  const velocity = clampNodeSliderValue(params.velocity, 0, 1);
  const sensitivity = clampNodeSliderValue(params.velocitySensitivity, 0, 1);
  const peak = (1 - sensitivity) + velocity * sensitivity;
  state.secondsPassed = 0;
  state.peak = peak;
  if (params.attack <= nodeGraphPluckEnvelopeMinValue) {
    state.state = "decay";
    nodeGraphPluckPrepareForDecay(state, rate, peak);
  } else {
    state.state = "attack";
    state.currentValue = 0;
  }
}

function nodeGraphPluckTriggerRelease(state, rate) {
  if (state.state !== "release") {
    state.state = "release";
    state.releaseIncrement = state.currentValue / Math.max(1, rate) / 50;
  }
}

function nodeGraphPluckDecayFeedback(state, params) {
  let finalDecayMod = params.sustain;
  if (state.phasor < 1) {
    const shaped = nodeGraphExponentialCurve(state.phasor, params.envelopeCurve || -1e-8);
    finalDecayMod = params.decaySlopeMid
      + params.decaySlopeTop
      + shaped * (params.decaySlopeBottom - params.decaySlopeTop);
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

function nodeGraphPluckReadParam(params, primary, legacy, fallback, min = -Infinity, max = Infinity, runtime = null, nodeId = "") {
  const raw = params[primary] ?? params[legacy] ?? fallback;
  return clampNodeSliderValue(
    nodeGraphSafeFilterNumber(raw, runtime, nodeId, null, `pluck ${primary}`),
    min,
    max,
  );
}

function nodeGraphPluckEnvelopeSample(state, trigger, release, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const period = 1 / rate;
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "pluck trigger");
  const safeRelease = nodeGraphSafeFilterNumber(release, runtime, nodeId, null, "pluck release");
  const values = {
    attack: nodeGraphPluckReadParam(params, "attack", "attackFeedback", 0, 0, Infinity, runtime, nodeId),
    autoReleaseTime: nodeGraphPluckReadParam(params, "autoReleaseTime", "autoReleaseTime", 0, 0, Infinity, runtime, nodeId),
    decaySlopeBottom: nodeGraphPluckReadParam(params, "decaySlopeBottom", "decayModEnd", 4.8, 0.01, 6, runtime, nodeId),
    decaySlopeMid: nodeGraphPluckReadParam(params, "decaySlopeMid", "decay", 0.7, 0.1, 1, runtime, nodeId),
    decaySlopeTop: nodeGraphPluckReadParam(params, "decaySlopeTop", "decayModStart", 0.9, 0.001, 1.8, runtime, nodeId),
    envelopeCurve: nodeGraphPluckReadParam(params, "envelopeCurve", "decayModCurve", -0.5, -1, 1, runtime, nodeId),
    envelopeDamping: nodeGraphPluckReadParam(params, "envelopeDamping", "decayModFrequency", 15, 0, 100, runtime, nodeId),
    level: nodeGraphPluckReadParam(params, "level", "level", 1, 0, 1, runtime, nodeId),
    release: nodeGraphPluckReadParam(params, "release", "releaseFeedback", 0.86, 0, 1, runtime, nodeId),
    sustain: nodeGraphPluckReadParam(params, "sustain", "endingDecay", 1.2, 0, 1.4, runtime, nodeId),
    velocity: nodeGraphPluckReadParam(params, "velocity", "velocity", 1, 0, 1, runtime, nodeId),
    velocitySensitivity: nodeGraphPluckReadParam(params, "velocitySensitivity", "velocitySensitivity", 0.5, 0, 1, runtime, nodeId),
  };

  if (state.lastTrigger <= 0 && safeTrigger > 0) {
    nodeGraphPluckTriggerAttack(state, values, rate);
  }
  if (state.lastRelease <= 0 && safeRelease > 0) {
    nodeGraphPluckTriggerRelease(state, rate);
  }
  state.lastTrigger = safeTrigger;
  state.lastRelease = safeRelease;

  const attackFeedbackAmp = 1 / (Math.max(values.attack, nodeGraphPluckEnvelopeMinValue) * rate);
  const releaseFeedbackAmp = Math.min(nodeGraphPluckEnvelopeMaxFeedback, Math.exp(-values.release * 10));
  // Param is ms (SoEm display); convert to seconds for the phasor.
  const autoRelSec = Math.max(0, Math.min(500, values.autoReleaseTime)) / 1000;
  const autoReleaseIncrement = autoRelSec <= nodeGraphPluckEnvelopeMinValue
    ? 0
    : 1 / (Math.max(autoRelSec, nodeGraphPluckEnvelopeMinValue) * rate);
  const phasorIncrement = values.envelopeDamping / rate;

  switch (state.state) {
    case "attack":
      state.currentValue += period + state.currentValue * attackFeedbackAmp;
      if (state.currentValue >= state.peak) {
        state.state = "decay";
        nodeGraphPluckPrepareForDecay(state, rate, state.peak);
      }
      break;
    case "decay":
      state.currentValue -= state.decayIncrement
        + state.currentValue * state.currentValue * nodeGraphPluckDecayFeedback(state, values);
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
      state.currentValue -= state.releaseIncrement
        + state.currentValue * state.currentValue * releaseFeedbackAmp;
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

if (typeof nodeGraphLiveModuleEvaluators !== "undefined" && nodeGraphLiveModuleEvaluators) {
  const nodeGraphPluckEnvelopeLiveEvaluate = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
    const state = runtime.pluckEnvelopeStates.get(nodeId) || createNodeGraphPluckEnvelopeState();
    runtime.pluckEnvelopeStates.set(nodeId, state);
    const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    return nodeGraphPluckEnvelopeSample(
      state,
      mixInput(nodeId, "Trigger"),
      mixInput(nodeId, "Release"),
      {
        attack: read("attack", read("attackFeedback", 0)),
        autoReleaseTime: read("autoReleaseTime", 0),
        decaySlopeBottom: read("decaySlopeBottom", read("decayModEnd", 4.8)),
        decaySlopeMid: read("decaySlopeMid", read("decay", 0.7)),
        decaySlopeTop: read("decaySlopeTop", read("decayModStart", 0.9)),
        envelopeCurve: read("envelopeCurve", read("decayModCurve", -0.5)),
        envelopeDamping: read("envelopeDamping", read("decayModFrequency", 15)),
        level: read("level", 1),
        release: read("release", read("releaseFeedback", 0.86)),
        sustain: read("sustain", read("endingDecay", 1.2)),
        velocity: read("velocity", 1),
        velocitySensitivity: read("velocitySensitivity", 0.5),
      },
      sampleRate,
      runtime,
      nodeId,
    );
  };
  nodeGraphLiveModuleEvaluators.pluckEnvelope = nodeGraphPluckEnvelopeLiveEvaluate;
  nodeGraphLiveModuleEvaluators.pluckEnvelopeMod = nodeGraphPluckEnvelopeLiveEvaluate;
  nodeGraphLiveModuleEvaluators.additivePluckEnvelope = nodeGraphPluckEnvelopeLiveEvaluate;
}
