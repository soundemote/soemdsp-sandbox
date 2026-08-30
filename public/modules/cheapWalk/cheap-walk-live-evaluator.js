nodeGraphLiveModuleEvaluators.cheapWalk = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  if (!runtime.cheapWalkStates) runtime.cheapWalkStates = new Map();
  const state = runtime.cheapWalkStates.get(nodeId) || createNodeGraphCheapWalkState(1);
  runtime.cheapWalkStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const y = nodeGraphCheapWalkCore(
    state,
    {
      rate: read("rate", 8),
      amplitude: read("amplitude", 1),
      seed: read("seed", 1),
    },
    sampleRate,
  );
  return {
    Out: typeof nodeGraphSafeFilterNumber === "function"
      ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "cheap walk")
      : y,
  };
};
