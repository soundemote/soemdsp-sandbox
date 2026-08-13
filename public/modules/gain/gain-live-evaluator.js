// Offline/render-time dispatch for gain. Pure math: gain-math.js.

nodeGraphLiveModuleEvaluators.gain = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const amount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 1, frame, frames, frameValues);
  const gainDb = readNodeGraphLiveEffectiveParam(runtime, node, "gainDb", 0, frame, frames, frameValues);
  const leftDb = readNodeGraphLiveEffectiveParam(runtime, node, "leftDb", 0, frame, frames, frameValues);
  const rightDb = readNodeGraphLiveEffectiveParam(runtime, node, "rightDb", 0, frame, frames, frameValues);
  const monoSum = readNodeGraphLiveEffectiveParam(runtime, node, "monoSum", 0, frame, frames, frameValues);
  const offset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  return nodeGraphGainFrameDb(
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    {
      masterDb: nodeGraphGainResolveMasterDb(node?.params, amount, gainDb),
      leftDb,
      rightDb,
      monoSum,
      offset,
    },
  );
};

// Legacy type id: old patches may still say gainBias until next save.
nodeGraphLiveModuleEvaluators.gainBias = nodeGraphLiveModuleEvaluators.gain;
