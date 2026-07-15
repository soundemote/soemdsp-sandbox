// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

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
  if (state.out <= 0.000001) {
    state.out = 0;
    state.secondsPassed = 0;
  }
  state.state = "delay";
}


function createNodeGraphLinearEnvelopeState() {
  return {
    lastGate: 0,
    out: 0,
    releaseDecrement: 0,
    secondsPassed: 0,
    state: "off",
  };
}

function nodeGraphLinearEnvelopeSample(state, gate, params, sampleRate, runtime = null, nodeId = "") {
  const safeGate = nodeGraphSafeFilterNumber(gate, runtime, nodeId, null, "linear envelope gate");
  const delay = Math.max(0, nodeGraphSafeFilterNumber(params.delay, runtime, nodeId, null, "linear envelope delay"));
  const attack = Math.max(0, nodeGraphSafeFilterNumber(params.attack, runtime, nodeId, null, "linear envelope attack"));
  const decay = Math.max(0, nodeGraphSafeFilterNumber(params.decay, runtime, nodeId, null, "linear envelope decay"));
  const sustain = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.sustain, runtime, nodeId, null, "linear envelope sustain"), 0, 1);
  const release = Math.max(0, nodeGraphSafeFilterNumber(params.release, runtime, nodeId, null, "linear envelope release"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "linear envelope level");
  const looping = nodeGraphSafeFilterNumber(params.loop, runtime, nodeId, null, "linear envelope loop") >= 0.5;
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const period = 1 / rate;

  if (state.lastGate <= 0 && safeGate > 0) {
    nodeGraphLinearEnvelopeTriggerAttack(state, delay, attack, rate);
  } else if (state.lastGate > 0 && safeGate <= 0) {
    state.state = "release";
    state.releaseDecrement = state.out * period / Math.max(release, period);
  }
  state.lastGate = safeGate;

  const attackIncrement = Math.min(period / Math.max(attack, period), 1);
  const decayDecrement = (1 - sustain) * period / Math.max(decay, period);

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

  return nodeGraphSafeFilterNumber(clampNodeSliderValue(state.out, 0, 1) * level, runtime, nodeId, null, "linear envelope output");
}


// Registers the offline/render-time dispatch handler for linearEnvelope into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.linearEnvelope = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.linearEnvelopeStates.get(nodeId) || createNodeGraphLinearEnvelopeState();
  runtime.linearEnvelopeStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphLinearEnvelopeSample(
    state,
    mixInput(nodeId, "Gate"),
    {
      attack: read("attack", 0.08),
      decay: read("decay", 0.22),
      delay: read("delay", 0),
      level: read("level", 1),
      loop: read("loop", 0),
      release: read("release", 0.45),
      sustain: read("sustain", 0.55),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
