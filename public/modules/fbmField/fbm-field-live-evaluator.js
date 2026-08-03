// Offline / render-time dispatch for fbmField — native WASM only (no JS DSP).
// Silent zeros until fbm_field.wasm is ready (same pattern as rayBouncer / logistic offline glue).
nodeGraphLiveModuleEvaluators.fbmField = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.fbmFieldStates) {
    runtime.fbmFieldStates = new Map();
  }
  const state = runtime.fbmFieldStates.get(nodeId) || createNodeGraphFbmFieldState();
  runtime.fbmFieldStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const evolve = Math.max(0, read("speed", 1));
  const frequency = Math.max(0, read("frequency", 0.5)) * evolve;
  const out = nodeGraphFbmFieldSample({
    frequency,
    lacunarity: read("lacunarity", 2),
    level: read("level", 1),
    octaves: read("octaves", 4),
    panX: read("panX", 0),
    panY: read("panY", 0),
    persistence: read("persistence", 0.5),
    scale: read("scale", 1),
    seed: read("seed", 1),
    smoothness: read("smoothness", 0.55),
    zoom: read("zoom", 1),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
    state,
  });
  return out || { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
};
