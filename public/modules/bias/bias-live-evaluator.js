// Offline/render-time dispatch for bias. Pure math: bias-math.js.

nodeGraphLiveModuleEvaluators.bias = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const biasOffset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  return nodeGraphBiasFrame(mixInput(nodeId), mixInput(nodeId, "Left"), mixInput(nodeId, "Right"), biasOffset);
};
