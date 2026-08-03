// Registers the offline/render-time dispatch handler for rotate3dTo2d into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Pure math: rotate-3d-to-2d-math.js (must load first).

nodeGraphLiveModuleEvaluators.rotate3dTo2d = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const rotateX = readNodeGraphLiveEffectiveParam(runtime, node, "rotateX", 0, frame, frames, frameValues);
  const rotateY = readNodeGraphLiveEffectiveParam(runtime, node, "rotateY", 0, frame, frames, frameValues);
  const rotateZ = readNodeGraphLiveEffectiveParam(runtime, node, "rotateZ", 0, frame, frames, frameValues);
  const x = nodeGraphSafeFilterNumber(mixInput(nodeId, "X"), runtime, nodeId, null, "rotation 3d x input");
  const y = nodeGraphSafeFilterNumber(mixInput(nodeId, "Y"), runtime, nodeId, null, "rotation 3d y input");
  const z = nodeGraphSafeFilterNumber(mixInput(nodeId, "Z"), runtime, nodeId, null, "rotation 3d z input");
  const out = nodeGraphRotate3dTo2d(x, y, z, rotateX, rotateY, rotateZ);
  return {
    X: nodeGraphSafeFilterNumber(out.X, runtime, nodeId, null, "rotation 3d x output"),
    Y: nodeGraphSafeFilterNumber(out.Y, runtime, nodeId, null, "rotation 3d y output"),
  };
};
