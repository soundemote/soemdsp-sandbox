// Registers the offline/render-time dispatch handler for boing into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.boing = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.boingStates.get(nodeId) || createNodeGraphBoingState();
  runtime.boingStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const boing = nodeGraphBoingSample({
    boing: read("boing", 0),
    boingStrength: read("boingStrength", 0),
    density: read("density", 1),
    dir: read("dir", 0),
    ends: read("ends", 0),
    frequency: read("frequency", 8),
    reset: mixInput(nodeId, "Reset"),
    rotX: read("rotX", 0),
    rotY: read("rotY", 0),
    sampleRate,
    shape: read("shape", 0),
    sharpness: read("sharpness", 0),
    state,
    volume: read("volume", 1),
    volumePreJump: read("volumePreJump", 0),
    zAmount: read("zAmount", 0),
    zDepth: read("zDepth", 0),
  });
  const boingLevel = read("amplitude", 1);
  return {
    X: boing.x * boingLevel,
    Y: boing.y * boingLevel,
  };
};
