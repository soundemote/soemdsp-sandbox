// Offline/render-time dispatch for gainBias.
// Pure math: gain-bias-math.js (must load first).

nodeGraphLiveModuleEvaluators.gainBias = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const gainAmount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 1, frame, frames, frameValues);
  const biasOffset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  const mono = mixInput(nodeId);
  return nodeGraphGainBiasFrame(mono, mixInput(nodeId, "Left"), mixInput(nodeId, "Right"), gainAmount, biasOffset);
};
