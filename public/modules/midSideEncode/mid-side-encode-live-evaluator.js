// Mid/Side Encoder — offline/render. Math: mid-side-encode-math.js.

nodeGraphLiveModuleEvaluators.midSideEncode = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const midGain = readNodeGraphLiveEffectiveParam(runtime, node, "midGain", 1, frame, frames, frameValues);
  const sideGain = readNodeGraphLiveEffectiveParam(runtime, node, "sideGain", 1, frame, frames, frameValues);
  const left = mixInput(nodeId, "Left");
  const right = mixInput(nodeId, "Right");
  const out = nodeGraphMidSideEncodeSample(left, right, midGain, sideGain);
  return {
    Mid: nodeGraphSafeFilterNumber(out.Mid, runtime, nodeId, null, "mid/side mid"),
    Side: nodeGraphSafeFilterNumber(out.Side, runtime, nodeId, null, "mid/side side"),
  };
};
