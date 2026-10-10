// Registers the offline/render-time dispatch handler for logisticMap into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.logisticMap = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.logisticMapStates.get(nodeId) || createNodeGraphLogisticMapState();
  runtime.logisticMapStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return {
    Out: nodeGraphLogisticMapSample({
      level: read("level", 1),
      r: read("r", 3.9),
      rate: read("rate", 8),
      reset: mixInput(nodeId, "Reset"),
      sampleRate,
      seed: read("seed", 0),
      antialias: read("antialias", 0),
      state,
    }),
  };
};
