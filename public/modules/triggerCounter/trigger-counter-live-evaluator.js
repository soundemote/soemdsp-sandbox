// Trigger Counter — offline/render. Pure math: trigger-counter-math.js.

nodeGraphLiveModuleEvaluators.triggerCounter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  const state = runtime.triggerCounterStates.get(nodeId) || createNodeGraphTriggerCounterState();
  runtime.triggerCounterStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const out = nodeGraphTriggerCounterCore(
    state,
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Trigger"), runtime, nodeId, null, "trigger counter trigger"),
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "trigger counter reset"),
    {
      countMax: nodeGraphSafeFilterNumber(read("countMax", 8), runtime, nodeId, null, "trigger counter max"),
      increment: nodeGraphSafeFilterNumber(read("increment", 1), runtime, nodeId, null, "trigger counter increment"),
      level: nodeGraphSafeFilterNumber(read("level", 1), runtime, nodeId, null, "trigger counter level"),
      pulseTime: nodeGraphSafeFilterNumber(read("pulseTime", 0.01), runtime, nodeId, null, "trigger counter pulse"),
      threshold: nodeGraphSafeFilterNumber(read("threshold", 0), runtime, nodeId, null, "trigger counter threshold"),
    },
    sampleRate,
  );
  return {
    Count: nodeGraphSafeFilterNumber(out.Count, runtime, nodeId, null, "trigger counter count"),
    Pulse: nodeGraphSafeFilterNumber(out.Pulse, runtime, nodeId, null, "trigger counter pulse output"),
  };
};
