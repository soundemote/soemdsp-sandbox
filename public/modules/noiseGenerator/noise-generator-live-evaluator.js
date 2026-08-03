// Noise Generator — offline/render. Pure math: noise-generator-math.js.

nodeGraphLiveModuleEvaluators.noiseGenerator = ({ runtime, node, nodeId, frame, frames, frameValues }) => {
  const state = runtime.noiseGeneratorStates.get(nodeId) || createNodeGraphNoiseGeneratorState();
  runtime.noiseGeneratorStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const out = nodeGraphNoiseGeneratorCore(
    state,
    {
      deviation: read("deviation", 0.5),
      level: read("level", 1),
      mean: read("mean", 0),
      mode: read("mode", 0),
      seed: read("seed", 1),
    },
    nodeId,
  );
  return {
    "Left Out": nodeGraphSafeFilterNumber(out["Left Out"], runtime, nodeId, null, "noise generator left out"),
    "Right Out": nodeGraphSafeFilterNumber(out["Right Out"], runtime, nodeId, null, "noise generator right out"),
  };
};
