// Offline / render-time dispatch for fbmField (2D FBM texture → X/Y noise).
nodeGraphLiveModuleEvaluators.fbmField = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.fbmFieldStates) {
    runtime.fbmFieldStates = new Map();
  }
  const state = runtime.fbmFieldStates.get(nodeId) || createNodeGraphFbmFieldState();
  runtime.fbmFieldStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphFbmFieldVector(
    state,
    {
      contrast: read("contrast", 1),
      frequency: read("frequency", 0.5),
      lacunarity: read("lacunarity", 2),
      level: read("level", 1),
      octaves: read("octaves", 4),
      panX: read("panX", 0),
      panY: read("panY", 0),
      persistence: read("persistence", 0.5),
      rotate: read("rotate", 0),
      scale: read("scale", 1),
      seed: read("seed", 1),
      smoothness: read("smoothness", 0.55),
      speed: read("speed", 0.15),
      zoom: read("zoom", 1),
    },
    sampleRate,
    mixInput(nodeId, "Reset"),
  );
};
