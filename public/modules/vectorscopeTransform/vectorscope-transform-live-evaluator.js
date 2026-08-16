// Offline / render-time dispatch for vectorscopeTransform (Vectorscope Rotation).
// Pure math: vectorscope-transform-math.js (must load first).

nodeGraphLiveModuleEvaluators.vectorscopeTransform = ({ runtime, node, nodeId, mixInput, frame, frames, frameValues }) => {
  const left = nodeGraphSafeFilterNumber(mixInput(nodeId, "L"), runtime, nodeId, null, "vectorscope L input");
  const right = nodeGraphSafeFilterNumber(mixInput(nodeId, "R"), runtime, nodeId, null, "vectorscope R input");
  const rotate = typeof readNodeGraphLiveEffectiveParam === "function"
    ? readNodeGraphLiveEffectiveParam(runtime, node, "rotate", 0, frame, frames, frameValues)
    : Number(node?.params?.rotate) || 0;
  const out = nodeGraphVectorscopeTransform(left, right, rotate);
  return {
    X: nodeGraphSafeFilterNumber(out.X, runtime, nodeId, null, "vectorscope X out"),
    Y: nodeGraphSafeFilterNumber(out.Y, runtime, nodeId, null, "vectorscope Y out"),
  };
};
