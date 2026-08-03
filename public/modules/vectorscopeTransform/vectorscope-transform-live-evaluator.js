// Offline / render-time dispatch for vectorscopeTransform.
// Pure math: vectorscope-transform-math.js (must load first).

nodeGraphLiveModuleEvaluators.vectorscopeTransform = ({ runtime, nodeId, mixInput }) => {
  const left = nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, "vectorscope L/X input");
  const right = nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, "vectorscope R/Y input");
  const out = nodeGraphVectorscopeTransform(left, right);
  return {
    X: nodeGraphSafeFilterNumber(out.X, runtime, nodeId, null, "vectorscope X out"),
    Y: nodeGraphSafeFilterNumber(out.Y, runtime, nodeId, null, "vectorscope Y out"),
  };
};
