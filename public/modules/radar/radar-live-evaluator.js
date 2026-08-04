// Registers the offline/render-time dispatch handler for radar into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.radar = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.radarStates.get(nodeId) || createNodeGraphRadarState();
  runtime.radarStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const radar = nodeGraphRadarSample({
    density: read("density", 1),
    direction: read("direction", 0),
    fade: read("fade", 1),
    frequency: read("frequency", 1),
    frontring: read("frontring", 0),
    inner: read("inner", 0),
    lap: read("lap", 0),
    length: read("length", 1),
    phaseInv: read("phaseInv", 0),
    phaseOffset: read("phaseOffset", 0),
    pow1Down: read("pow1Down", 0),
    pow1Up: read("pow1Up", 0),
    pow2Bend: read("pow2Bend", 0),
    ratio: read("ratio", 0),
    reset: mixInput(nodeId, "Reset"),
    ringcut: read("ringcut", 0),
    rotation: read("rotation", 0),
    sampleRate,
    shade: read("shade", 1),
    sharp: read("sharp", 0),
    spiralReturn: read("spiralReturn", 0),
    state,
    tunnelInv: read("tunnelInv", 0),
    x: read("x", 0),
    y: read("y", 0),
    zDepth: read("zDepth", 0),
    zoom: read("zoom", 0),
  });
  const radarLevel = read("amplitude", 1);
  return {
    X: radar.x * radarLevel,
    Y: radar.y * radarLevel,
  };
};
