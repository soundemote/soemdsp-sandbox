// Registers the offline/render-time dispatch handler for logisticMap into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Prefer pure JS map (logistic-map-math.js); else wasm offline glue.
nodeGraphLiveModuleEvaluators.logisticMap = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.logisticMapJsStates) {
    runtime.logisticMapJsStates = new Map();
  }
  let jsState = runtime.logisticMapJsStates.get(nodeId);
  if (!jsState && typeof createNodeGraphLogisticMapJsState === "function") {
    jsState = createNodeGraphLogisticMapJsState();
    runtime.logisticMapJsStates.set(nodeId, jsState);
  }
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const opts = {
    level: read("amplitude", 1),
    r: read("r", 3.9),
    rate: read("rate", 8),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
    seed: read("seed", 0.5),
  };
  if (jsState && typeof nodeGraphLogisticMapCore === "function") {
    return { Out: nodeGraphLogisticMapCore(jsState, opts) };
  }
  const state = runtime.logisticMapStates.get(nodeId) || createNodeGraphLogisticMapState();
  runtime.logisticMapStates.set(nodeId, state);
  return {
    Out: nodeGraphLogisticMapSample({ ...opts, state }),
  };
};
