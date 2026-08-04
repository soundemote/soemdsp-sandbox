// Registers the offline/render-time dispatch handler for logSpiral into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.logSpiral = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.logSpiralStates.get(nodeId) || createLogSpiralState();
  runtime.logSpiralStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  const logSpiral = logSpiralSample({
    frequency: read("frequency", 1),
    growth: read("growth", 3),
    sampleRate,
    size: read("size", 0.5),
    spin: read("spin", 0.05),
    state,
    turns: read("turns", 4),
  });
  const logSpiralLevel = read("amplitude", 1);
  return {
    X: logSpiral.x * logSpiralLevel,
    Y: logSpiral.y * logSpiralLevel,
    Z: logSpiral.z * logSpiralLevel,
  };
};
