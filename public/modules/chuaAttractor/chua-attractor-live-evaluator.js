// Offline/render-time dispatch for chuaAttractor.
// Prefer pure JS (chua-attractor-math.js); else wasm offline glue.
nodeGraphLiveModuleEvaluators.chuaAttractor = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.chuaAttractorJsStates) {
    runtime.chuaAttractorJsStates = new Map();
  }
  let jsState = runtime.chuaAttractorJsStates.get(nodeId);
  if (!jsState && typeof createNodeGraphChuaAttractorJsState === "function") {
    jsState = createNodeGraphChuaAttractorJsState();
    runtime.chuaAttractorJsStates.set(nodeId, jsState);
  }
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const opts = {
    alpha: read("alpha", 15.6),
    beta: read("beta", 28),
    m0: read("m0", -1.143),
    m1: read("m1", -0.714),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
    speed: read("speed", 1),
  };
  let chua;
  if (jsState && typeof nodeGraphChuaAttractorCore === "function") {
    chua = nodeGraphChuaAttractorCore(jsState, opts);
  } else {
    const state = runtime.chuaAttractorStates.get(nodeId) || createNodeGraphChuaAttractorState();
    runtime.chuaAttractorStates.set(nodeId, state);
    chua = nodeGraphChuaAttractorSample({ ...opts, state });
  }
  const chuaLevel = read("level", 1);
  return {
    X: chua.x * chuaLevel,
    Y: chua.y * chuaLevel,
    Z: chua.z * chuaLevel,
  };
};
