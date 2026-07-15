// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphFlowerChildSecondsToSamples(seconds, sampleRate) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, value * Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100));
}


function createNodeGraphFlowerChildEnvelopeFollowerState() {
  return {
    currentSlewedValue: 0,
    holdCounter: 0,
    out: 0,
  };
}

function nodeGraphFlowerChildEnvelopeFollowerSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const target = clampNodeSliderValue(
    Math.abs(nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "flowerchild envelope input")),
    0,
    1,
  );
  const attackSamples = nodeGraphFlowerChildSecondsToSamples(
    nodeGraphSafeFilterNumber(params.attack, runtime, nodeId, state, "flowerchild envelope attack"),
    sampleRate,
  );
  const holdSamples = nodeGraphFlowerChildSecondsToSamples(
    nodeGraphSafeFilterNumber(params.hold, runtime, nodeId, state, "flowerchild envelope hold"),
    sampleRate,
  );
  const decaySamples = nodeGraphFlowerChildSecondsToSamples(
    nodeGraphSafeFilterNumber(params.decay, runtime, nodeId, state, "flowerchild envelope decay"),
    sampleRate,
  );
  const attackStep = 1 / attackSamples;
  const decayStep = 1 / decaySamples;
  const current = clampNodeSliderValue(Number(state.currentSlewedValue) || 0, 0, 1);
  if (target >= current) {
    state.currentSlewedValue = Math.min(target, current + attackStep);
    state.holdCounter = holdSamples;
  } else if ((Number(state.holdCounter) || 0) > 0) {
    state.holdCounter = Math.max(0, (Number(state.holdCounter) || 0) - 1);
    state.currentSlewedValue = current;
  } else {
    state.currentSlewedValue = Math.max(target, current - decayStep);
  }
  state.out = nodeGraphSafeFilterNumber(
    clampNodeSliderValue(state.currentSlewedValue, 0, 1),
    runtime,
    nodeId,
    state,
    "flowerchild envelope output",
  );
  return state.out;
}


// Registers the offline/render-time dispatch handler for flowerChildEnvelopeFollower
// into nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.flowerChildEnvelopeFollower = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.flowerChildEnvelopeFollowerStates.get(nodeId) || createNodeGraphFlowerChildEnvelopeFollowerState();
  runtime.flowerChildEnvelopeFollowerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphFlowerChildEnvelopeFollowerSample(
    state,
    mixInput(nodeId),
    {
      attack: read("attack", 0.001),
      decay: read("decay", 0.001),
      hold: read("hold", 0.001),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
