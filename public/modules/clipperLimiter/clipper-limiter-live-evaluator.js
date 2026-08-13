// Offline/render-time dispatch for clipperLimiter. Math: clipper-limiter-math.js.
// Knee ADAA state is the shared Soft Clipper factory.

nodeGraphLiveModuleEvaluators.clipperLimiter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  if (!runtime.clipperLimiterStates) {
    runtime.clipperLimiterStates = new Map();
  }
  const state = runtime.clipperLimiterStates.get(nodeId)
    || (typeof createNodeGraphSoftClipperState === "function"
      ? createNodeGraphSoftClipperState()
      : null);
  if (state) runtime.clipperLimiterStates.set(nodeId, state);
  const antialias = readNodeGraphLiveEffectiveParam(runtime, node, "antialias", 1, frame, frames, frameValues);
  const minDb = readNodeGraphLiveEffectiveParam(runtime, node, "minDb", -12, frame, frames, frameValues);
  const maxDb = readNodeGraphLiveEffectiveParam(runtime, node, "maxDb", 0, frame, frames, frameValues);
  const gainDb = readNodeGraphLiveEffectiveParam(runtime, node, "gainDb", 0, frame, frames, frameValues);
  return nodeGraphClipperLimiterFrame(
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    minDb,
    maxDb,
    gainDb,
    state,
    antialias,
  );
};
