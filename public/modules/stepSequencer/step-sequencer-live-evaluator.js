// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphStepSequencerState() {
  return {
    gate: 0,
    index: 0,
    lastReset: 0,
    lastTrigger: 0,
    out: 0,
  };
}

function nodeGraphStepSequencerSample(state, trigger, reset, params, runtime = null, nodeId = "") {
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "step sequencer trigger");
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "step sequencer reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "step sequencer threshold");
  const stepCount = Math.max(1, Math.min(8, Math.round(nodeGraphSafeFilterNumber(params.steps, runtime, nodeId, null, "step sequencer steps"))));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "step sequencer level");
  const values = params.values.map((value) => nodeGraphSafeFilterNumber(value, runtime, nodeId, null, "step sequencer value"));
  if (state.index >= stepCount) {
    state.index %= stepCount;
  }
  if (state.lastReset <= threshold && safeReset > threshold) {
    state.index = 0;
    state.out = values[0] || 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.out = values[state.index] || 0;
    state.index = (state.index + 1) % stepCount;
  }
  state.gate = safeTrigger > threshold ? 1 : 0;
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  return {
    Gate: state.gate,
    Out: nodeGraphSafeFilterNumber(state.out * level, runtime, nodeId, null, "step sequencer output"),
  };
}


// Registers the offline/render-time dispatch handler for stepSequencer into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.stepSequencer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.stepSequencerStates.get(nodeId) || createNodeGraphStepSequencerState();
  runtime.stepSequencerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphStepSequencerSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Reset"),
    {
      level: read("level", 1),
      steps: read("steps", 8),
      threshold: read("threshold", 0),
      values: [
        read("step1", 0),
        read("step2", 0.25),
        read("step3", 0.5),
        read("step4", 0.75),
        read("step5", 1),
        read("step6", 0.75),
        read("step7", 0.5),
        read("step8", 0.25),
      ],
    },
    runtime,
    nodeId,
  );
};
