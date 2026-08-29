// Offline/render-time dispatch for range. Pure math: range-math.js.

nodeGraphLiveModuleEvaluators.range = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const inLow = readNodeGraphLiveEffectiveParam(runtime, node, "inLow", -1, frame, frames, frameValues);
  const inHigh = readNodeGraphLiveEffectiveParam(runtime, node, "inHigh", 1, frame, frames, frameValues);
  const outLow = readNodeGraphLiveEffectiveParam(runtime, node, "outLow", 0, frame, frames, frameValues);
  const outHigh = readNodeGraphLiveEffectiveParam(runtime, node, "outHigh", 1000, frame, frames, frameValues);
  return nodeGraphRangeFrame(mixInput(nodeId), inLow, inHigh, outLow, outHigh);
};
