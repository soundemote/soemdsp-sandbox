// Random Walk — offline/render. Pure math: random-walk-math.js.

nodeGraphLiveModuleEvaluators.randomWalk = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  const state = runtime.randomWalkStates.get(nodeId) || createNodeGraphRandomWalkState();
  runtime.randomWalkStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const raw = nodeGraphRandomWalkCore(
    state,
    {
      frequency: read("frequency", 2),
      jitter: read("jitter", 0),
      level: read("level", 1),
      method: read("method", 2),
      seed: read("seed", 1),
    },
    sampleRate,
    nodeId,
  );
  return nodeGraphSafeFilterNumber(raw, runtime, nodeId, null, "random walk output");
};
