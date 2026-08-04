// Registers the offline/render-time dispatch handler for henonMap into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.henonMap = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  // Prefer pure JS map when available (henon-map-math.js); else wasm offline glue.
  if (!runtime.henonMapJsStates) {
    runtime.henonMapJsStates = new Map();
  }
  let jsState = runtime.henonMapJsStates.get(nodeId);
  if (!jsState && typeof createNodeGraphHenonMapJsState === "function") {
    jsState = createNodeGraphHenonMapJsState();
    runtime.henonMapJsStates.set(nodeId, jsState);
  }
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const opts = {
    a: read("a", 1.4),
    b: read("b", 0.3),
    rate: read("rate", 8),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
    seedX: read("seedX", 0.1),
    seedY: read("seedY", 0.1),
  };
  let henon;
  if (jsState && typeof nodeGraphHenonMapCore === "function") {
    henon = nodeGraphHenonMapCore(jsState, opts);
  } else {
    const state = runtime.henonMapStates.get(nodeId) || createNodeGraphHenonMapState();
    runtime.henonMapStates.set(nodeId, state);
    henon = nodeGraphHenonMapSample({ ...opts, state });
  }
  const henonLevel = read("amplitude", 1);
  return {
    X: henon.x * henonLevel,
    Y: henon.y * henonLevel,
  };
};
