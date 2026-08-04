// Registers the offline/render-time dispatch handler for wirdoSpiral into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.wirdoSpiral = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.wirdoSpiralStates.get(nodeId) || createNodeGraphWirdoSpiralState();
  runtime.wirdoSpiralStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const wirdo = nodeGraphWirdoSpiralSample({
    cross: read("cross", 0),
    cut: read("cut", 1000),
    density: read("density", 0.8),
    frequency: read("frequency", 8),
    length: read("length", 1),
    reset: mixInput(nodeId, "Reset"),
    ringCut: read("ringCut", 10),
    rotate: read("rotate", 0),
    sampleRate,
    scrap: read("scrap", 1),
    sharp: read("sharp", 0),
    splashDensity: read("splashDensity", 0),
    splashDepth: read("splashDepth", 0),
    splashSpeed: read("splashSpeed", 0),
    state,
    syncCut: read("syncCut", 1),
  });
  const wirdoLevel = read("amplitude", 1);
  return {
    X: wirdo.x * wirdoLevel,
    Y: wirdo.y * wirdoLevel,
  };
};
