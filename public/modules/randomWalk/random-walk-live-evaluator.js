// Random Walk — offline/render. Pure math: random-walk-math.js. Stereo L/R.

nodeGraphLiveModuleEvaluators.randomWalk = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  let bundle = runtime.randomWalkStates.get(nodeId);
  if (!bundle || !bundle.left || !bundle.right) {
    bundle = {
      left: createNodeGraphRandomWalkState(),
      right: createNodeGraphRandomWalkState(),
    };
    runtime.randomWalkStates.set(nodeId, bundle);
  }
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const seed = read("seed", 1);
  const params = {
    frequency: read("frequency", 2),
    jitter: read("jitter", 0),
    level: read("amplitude", 1),
    method: read("method", 2),
    seed,
  };
  const left = nodeGraphRandomWalkCore(bundle.left, params, sampleRate, `${nodeId}:L`);
  const rightSeed = ((Number(seed) >>> 0) ^ 0x9E3779B9) >>> 0 || 1;
  const right = nodeGraphRandomWalkCore(
    bundle.right,
    { ...params, seed: rightSeed },
    sampleRate,
    `${nodeId}:R`,
  );
  return {
    Left: nodeGraphSafeFilterNumber(left, runtime, nodeId, null, "random walk left"),
    Right: nodeGraphSafeFilterNumber(right, runtime, nodeId, null, "random walk right"),
  };
};
