// Offline/render-time dispatch for softClipper. Pure math: soft-clipper-math.js.

nodeGraphLiveModuleEvaluators.softClipper = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  if (!runtime.softClipperStates) {
    runtime.softClipperStates = new Map();
  }
  const state = runtime.softClipperStates.get(nodeId)
    || (typeof createNodeGraphSoftClipperState === "function"
      ? createNodeGraphSoftClipperState()
      : null);
  if (state) runtime.softClipperStates.set(nodeId, state);
  const antialias = readNodeGraphLiveEffectiveParam(runtime, node, "antialias", 1, frame, frames, frameValues);
  const gainDb = readNodeGraphLiveEffectiveParam(runtime, node, "gainDb", 0, frame, frames, frameValues);
  const center = readNodeGraphLiveEffectiveParam(runtime, node, "center", 0, frame, frames, frameValues);
  const width = readNodeGraphLiveEffectiveParam(runtime, node, "width", 2, frame, frames, frameValues);
  return nodeGraphSoftClipperFrame(
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    center,
    width,
    state,
    antialias,
    gainDb,
  );
};
