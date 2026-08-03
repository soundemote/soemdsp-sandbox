// Offline/render-time dispatch for gain. Pure math: gain-math.js.

nodeGraphLiveModuleEvaluators.gain = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const gainAmount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 1, frame, frames, frameValues);
  return nodeGraphGainFrame(mixInput(nodeId), mixInput(nodeId, "Left"), mixInput(nodeId, "Right"), gainAmount);
};
