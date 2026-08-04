// Registers the offline/render-time dispatch handler for keplerBouwkamp into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.keplerBouwkamp = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.keplerBouwkampStates.get(nodeId) || createNodeGraphKeplerBouwkampState();
  runtime.keplerBouwkampStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const kepler = nodeGraphKeplerBouwkampSample({
    circles: read("circles", 0.5),
    frequency: read("frequency", 8),
    length: read("length", 1),
    reset: mixInput(nodeId, "Reset"),
    rotation: read("rotation", 0),
    sampleRate,
    start: read("start", 3),
    state,
    tri: read("tri", 0),
    zoom: read("zoom", 0),
  });
  const keplerLevel = read("amplitude", 1);
  return {
    X: kepler.x * keplerLevel,
    Y: kepler.y * keplerLevel,
  };
};
