// Registers the offline/render-time dispatch handler for torus into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.torus = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.torusStates.get(nodeId) || createNodeGraphTorusState();
  runtime.torusStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const torus = nodeGraphTorusSample({
    balance: read("balance", 0),
    darkAngle: read("darkAngle", 0),
    darkIntensity: read("darkIntensity", 0),
    density: read("density", 1),
    frequency: read("frequency", 8),
    length: read("length", 0),
    quantizeDensity: read("quantizeDensity", 1),
    quantizeSubDensity: read("quantizeSubDensity", 1),
    reset: mixInput(nodeId, "Reset"),
    rotX: read("rotX", 0),
    rotY: read("rotY", 0),
    rotZ: read("rotZ", 0),
    sampleRate,
    sharp: read("sharp", 0.5),
    size: read("size", 1),
    state,
    subdensity: read("subdensity", 0),
    wander: read("wander", 0),
    zAngleX: read("zAngleX", 0),
    zAngleY: read("zAngleY", 0),
    zDepth: read("zDepth", 0),
  });
  const torusLevel = read("amplitude", 1);
  return {
    X: torus.x * torusLevel,
    Y: torus.y * torusLevel,
  };
};
