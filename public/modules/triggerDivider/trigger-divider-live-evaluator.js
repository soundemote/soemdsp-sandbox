// Trigger Divider — offline/render. Pure math: trigger-divider-math.js.
// Prefer pure core; fall back to stdlib helper if math not loaded.

nodeGraphLiveModuleEvaluators.triggerDivider = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  const state = runtime.triggerDividerStates.get(nodeId)
    || (typeof createNodeGraphTriggerDividerState === "function"
      ? createNodeGraphTriggerDividerState()
      : { count: 0, lastReset: 0, lastTrigger: 0, remainingSamples: 0 });
  runtime.triggerDividerStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const params = {
    division: read("division", 2),
    level: read("level", 1),
    pulseTime: read("pulseTime", 0.01),
    threshold: read("threshold", 0),
  };
  if (typeof nodeGraphTriggerDividerCore === "function") {
    const raw = nodeGraphTriggerDividerCore(
      state,
      nodeGraphSafeFilterNumber(mixInput(nodeId, "Trigger"), runtime, nodeId, null, "trigger divider trigger"),
      nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "trigger divider reset"),
      {
        division: nodeGraphSafeFilterNumber(params.division, runtime, nodeId, null, "trigger divider division"),
        level: nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "trigger divider level"),
        pulseTime: nodeGraphSafeFilterNumber(params.pulseTime, runtime, nodeId, null, "trigger divider pulse"),
        threshold: nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "trigger divider threshold"),
      },
      sampleRate,
    );
    return nodeGraphSafeFilterNumber(raw, runtime, nodeId, null, "trigger divider output");
  }
  return nodeGraphTriggerDividerSample(
    state,
    mixInput(nodeId, "Trigger"),
    mixInput(nodeId, "Reset"),
    params,
    sampleRate,
    runtime,
    nodeId,
  );
};
