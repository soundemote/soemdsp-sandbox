// Offline/render-time dispatch for softClipper. Pure math: soft-clipper-math.js.

nodeGraphLiveModuleEvaluators.softClipper = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const softClipperCenter = readNodeGraphLiveEffectiveParam(runtime, node, "center", 0, frame, frames, frameValues);
  const softClipperWidth = readNodeGraphLiveEffectiveParam(runtime, node, "width", 2, frame, frames, frameValues);
  return nodeGraphSoftClipperFrame(
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    softClipperCenter,
    softClipperWidth,
  );
};
