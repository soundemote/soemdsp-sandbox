// Registers the offline/render-time dispatch handler for blubb into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.blubb = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.blubbStates.get(nodeId) || createNodeGraphBlubbState();
  runtime.blubbStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const blubb = nodeGraphBlubbSample({
    frequency: read("frequency", 8),
    reset: mixInput(nodeId, "Reset"),
    rotX: read("rotX", 0),
    rotY: read("rotY", 0),
    sampleRate,
    shape: read("shape", 0),
    state,
    zDepth: read("zDepth", 0),
  });
  const blubbLevel = read("amplitude", 1);
  return {
    X: blubb.x * blubbLevel,
    Y: blubb.y * blubbLevel,
  };
};
