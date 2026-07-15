// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphDelayedTriggerState() {
  return {
    hasTriggered: true,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
    running: false,
    waitSamples: 0,
  };
}

function nodeGraphDelayedTriggerSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = "") {
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "delayed trigger trigger");
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "delayed trigger reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "delayed trigger threshold");
  const delay = Math.max(0, nodeGraphSafeFilterNumber(params.delay, runtime, nodeId, null, "delayed trigger delay"));
  const pulseTime = Math.max(0, nodeGraphSafeFilterNumber(params.pulseTime, runtime, nodeId, null, "delayed trigger pulse"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "delayed trigger level");
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);

  if (state.lastReset <= threshold && safeReset > threshold) {
    state.hasTriggered = true;
    state.remainingSamples = 0;
    state.running = false;
    state.waitSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.hasTriggered = false;
    state.remainingSamples = 0;
    state.running = true;
    state.waitSamples = Math.max(0, Math.round(delay * rate));
  }

  if (state.running && !state.hasTriggered) {
    if (state.waitSamples <= 0) {
      state.hasTriggered = true;
      state.running = false;
      state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
    } else {
      state.waitSamples -= 1;
    }
  }

  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const output = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  return nodeGraphSafeFilterNumber(output, runtime, nodeId, null, "delayed trigger output");
}


// Registers the offline/render-time dispatch handler for delayedTrigger into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.delayedTrigger = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.delayedTriggerStates.get(nodeId) || createNodeGraphDelayedTriggerState();
  runtime.delayedTriggerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphDelayedTriggerSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Reset"),
    {
      delay: read("delay", 0.1),
      level: read("level", 1),
      pulseTime: read("pulseTime", 0.01),
      threshold: read("threshold", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
