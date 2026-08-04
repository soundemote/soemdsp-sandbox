// Registers the offline/render-time dispatch handler for rayBouncer into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
nodeGraphLiveModuleEvaluators.rayBouncer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.rayBouncerStates.get(nodeId) || createNodeGraphRayBouncerState();
  runtime.rayBouncerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const bounce = nodeGraphRayBouncerSample({
    aspect: read("aspect", 1.5),
    bend: read("bend", 0),
    centerX: read("centerX", 0),
    centerY: read("centerY", 0),
    frequency: read("frequency", 8),
    launchAngle: read("launchAngle", 30),
    maxDistance: read("maxDistance", 0),
    reset: mixInput(nodeId, "Reset"),
    rotate: read("rotate", 0),
    sampleRate,
    size: read("size", 1),
    startX: read("startX", 0),
    startY: read("startY", 0),
    state,
    xToY: read("xToY", 0),
    yToX: read("yToX", 0),
  });
  const level = read("amplitude", 1);
  return {
    X: bounce.x * level,
    Y: bounce.y * level,
  };
};
