// Delayed Trigger — offline/render. Pure math: delayed-trigger-math.js.

nodeGraphLiveModuleEvaluators.delayedTrigger = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  const state = runtime.delayedTriggerStates.get(nodeId) || createNodeGraphDelayedTriggerState();
  runtime.delayedTriggerStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const raw = nodeGraphDelayedTriggerCore(
    state,
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Trigger"), runtime, nodeId, null, "delayed trigger trigger"),
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "delayed trigger reset"),
    {
      delay: nodeGraphSafeFilterNumber(read("delay", 0.1), runtime, nodeId, null, "delayed trigger delay"),
      level: nodeGraphSafeFilterNumber(read("level", 1), runtime, nodeId, null, "delayed trigger level"),
      pulseTime: nodeGraphSafeFilterNumber(read("pulseTime", 0.01), runtime, nodeId, null, "delayed trigger pulse"),
      threshold: nodeGraphSafeFilterNumber(read("threshold", 0), runtime, nodeId, null, "delayed trigger threshold"),
    },
    sampleRate,
  );
  return nodeGraphSafeFilterNumber(raw, runtime, nodeId, null, "delayed trigger output");
};
