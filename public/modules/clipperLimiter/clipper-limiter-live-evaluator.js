// Offline/render-time dispatch for clipperLimiter. Math: clipper-limiter-math.js.

nodeGraphLiveModuleEvaluators.clipperLimiter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
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
  );
};
