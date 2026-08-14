// Offline/render-time dispatch for lorenzAttractor.
// Prefer pure JS (lorenz-attractor-math.js); else wasm offline glue.
nodeGraphLiveModuleEvaluators.lorenzAttractor = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.lorenzAttractorJsStates) {
    runtime.lorenzAttractorJsStates = new Map();
  }
  let jsState = runtime.lorenzAttractorJsStates.get(nodeId);
  if (!jsState && typeof createNodeGraphLorenzAttractorJsState === "function") {
    jsState = createNodeGraphLorenzAttractorJsState();
    runtime.lorenzAttractorJsStates.set(nodeId, jsState);
  }
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const opts = {
    beta: read("beta", 8 / 3),
    reset: mixInput(nodeId, "Reset"),
    rho: read("rho", 28),
    rotate: read("rotate", 0),
    sampleRate,
    scale: read("scale", 1),
    sigma: read("sigma", 10),
    speed: read("speed", 1),
    zDepth: read("zDepth", 0.4),
  };
  let lorenz;
  if (jsState && typeof nodeGraphLorenzAttractorCore === "function") {
    lorenz = nodeGraphLorenzAttractorCore(jsState, opts);
  } else {
    const state = runtime.lorenzAttractorStates.get(nodeId) || createNodeGraphLorenzAttractorState();
    runtime.lorenzAttractorStates.set(nodeId, state);
    lorenz = nodeGraphLorenzAttractorSample({ ...opts, state });
  }
  const level = read("amplitude", 1);
  return {
    DisplayX: lorenz.x,
    DisplayY: lorenz.y,
    X: lorenz.x * level,
    Y: lorenz.y * level,
    Z: lorenz.z * level,
  };
};
