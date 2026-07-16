// Offline/render-time algorithm for stepGrid, mirroring stepSequencer's
// per-module file layout (see step-sequencer-live-evaluator.js).

function createNodeGraphStepGridState() {
  return {
    active: 0,
    gate: 0,
    index: 0,
    lastReset: 0,
    lastTrigger: 0,
  };
}

function nodeGraphStepGridSample(state, trigger, reset, params, runtime = null, nodeId = "") {
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "step grid trigger");
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "step grid reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "step grid threshold");
  const steps = params.steps.map((value) => (nodeGraphSafeFilterNumber(value, runtime, nodeId, null, "step grid step") > 0.5 ? 1 : 0));
  const stepCount = steps.length;
  if (state.index >= stepCount) {
    state.index %= stepCount;
  }
  if (state.lastReset <= threshold && safeReset > threshold) {
    state.index = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.active = steps[state.index];
    state.index = (state.index + 1) % stepCount;
  }
  state.gate = safeTrigger > threshold && state.active ? 1 : 0;
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  return {
    Gate: state.gate,
    Step: stepCount > 1 ? state.index / (stepCount - 1) : 0,
  };
}

// Registers the offline/render-time dispatch handler for stepGrid into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
nodeGraphLiveModuleEvaluators.stepGrid = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.stepGridStates.get(nodeId) || createNodeGraphStepGridState();
  runtime.stepGridStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const stepCount = Math.max(1, Math.min(STEP_GRID_MAX_STEPS, Math.round(read("steps", 8))));
  const steps = [];
  for (let index = 1; index <= stepCount; index += 1) {
    steps.push(read(`step${index}`, 0));
  }
  return nodeGraphStepGridSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Reset"),
    { threshold: read("threshold", 0), steps },
    runtime,
    nodeId,
  );
};
