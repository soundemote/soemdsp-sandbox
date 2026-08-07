// Offline/render-time dispatch for gain. Pure math: gain-math.js.

nodeGraphLiveModuleEvaluators.gain = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const amount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 1, frame, frames, frameValues);
  const offset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  return nodeGraphGainFrame(
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    amount,
    offset,
  );
};

// Legacy type id: old patches may still say gainBias until next save.
nodeGraphLiveModuleEvaluators.gainBias = nodeGraphLiveModuleEvaluators.gain;
