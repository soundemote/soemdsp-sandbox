// Offline/render-time dispatch for attenuverter. Pure math: attenuverter-math.js.

nodeGraphLiveModuleEvaluators.attenuverter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 0.5, frame, frames, frameValues);
  const offset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  return nodeGraphAttenuverterFrame(mixInput(nodeId), amplitude, offset);
};
