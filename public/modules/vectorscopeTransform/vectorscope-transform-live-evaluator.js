// Offline / render-time dispatch for vectorscopeTransform (Vectorscope Rotation).
// Pure math: vectorscope-transform-math.js (must load first).

nodeGraphLiveModuleEvaluators.vectorscopeTransform = ({ runtime, nodeId, mixInput }) => {
  const left = nodeGraphSafeFilterNumber(mixInput(nodeId, "L"), runtime, nodeId, null, "vectorscope L input");
  const right = nodeGraphSafeFilterNumber(mixInput(nodeId, "R"), runtime, nodeId, null, "vectorscope R input");
  const out = nodeGraphVectorscopeTransform(left, right);
  return {
    X: nodeGraphSafeFilterNumber(out.X, runtime, nodeId, null, "vectorscope X out"),
    Y: nodeGraphSafeFilterNumber(out.Y, runtime, nodeId, null, "vectorscope Y out"),
  };
};
