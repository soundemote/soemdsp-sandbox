// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphTriggerCounterState() {
  return {
    count: 0,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
  };
}

function nodeGraphTriggerCounterSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = "") {
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "trigger counter trigger");
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "trigger counter reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "trigger counter threshold");
  const countMax = Math.max(1, nodeGraphSafeFilterNumber(params.countMax, runtime, nodeId, null, "trigger counter max"));
  const increment = Math.max(0, nodeGraphSafeFilterNumber(params.increment, runtime, nodeId, null, "trigger counter increment"));
  const pulseTime = Math.max(0, nodeGraphSafeFilterNumber(params.pulseTime, runtime, nodeId, null, "trigger counter pulse"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "trigger counter level");
  if (state.lastReset <= threshold && safeReset > threshold) {
    state.count = 0;
    state.remainingSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.count += increment;
    if (state.count >= countMax) {
      state.count = countMax > 0 ? state.count % countMax : 0;
      state.remainingSamples = Math.max(1, Math.round(pulseTime * Math.max(1, sampleRate)));
    }
  }
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const pulse = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  return {
    Count: nodeGraphSafeFilterNumber(clampNodeSliderValue(state.count / countMax, 0, 1) * level, runtime, nodeId, null, "trigger counter count"),
    Pulse: nodeGraphSafeFilterNumber(pulse, runtime, nodeId, null, "trigger counter pulse output"),
  };
}


// Registers the offline/render-time dispatch handler for triggerCounter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.triggerCounter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.triggerCounterStates.get(nodeId) || createNodeGraphTriggerCounterState();
  runtime.triggerCounterStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphTriggerCounterSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Reset"),
    {
      countMax: read("countMax", 8),
      increment: read("increment", 1),
      level: read("level", 1),
      pulseTime: read("pulseTime", 0.01),
      threshold: read("threshold", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
