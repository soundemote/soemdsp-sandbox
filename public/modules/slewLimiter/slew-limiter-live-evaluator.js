// Slew Limiter — offline/render-time. Pure math: slew-limiter-math.js.

nodeGraphLiveModuleEvaluators.slewLimiter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.slewLimiterStates.get(nodeId) || createNodeGraphStereoSlewLimiterState();
  runtime.slewLimiterStates.set(nodeId, state);
  const slewUpTime = readNodeGraphLiveEffectiveParam(runtime, node, "upTime", 0.05, frame, frames, frameValues);
  const slewDownTime = readNodeGraphLiveEffectiveParam(runtime, node, "downTime", 0.20, frame, frames, frameValues);
  const slewShape = readNodeGraphLiveEffectiveParam(runtime, node, "shape", 0, frame, frames, frameValues);
  const slewBias = readNodeGraphLiveEffectiveParam(runtime, node, "bias", 0, frame, frames, frameValues);
  const slewMono = mixInput(nodeId) + slewBias;
  const rate = sampleRate;
  const monoIn = nodeGraphSafeFilterNumber(slewMono, runtime, nodeId, state.mono, "slew input");
  const leftIn = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Left") + slewMono,
    runtime,
    nodeId,
    state.left,
    "slew input",
  );
  const rightIn = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Right") + slewMono,
    runtime,
    nodeId,
    state.right,
    "slew input",
  );
  return {
    Out: nodeGraphSafeFilterNumber(
      nodeGraphSlewLimiterSample(state.mono, monoIn, slewUpTime, slewDownTime, rate, slewShape),
      runtime,
      nodeId,
      state.mono,
      "slew output",
    ),
    Left: nodeGraphSafeFilterNumber(
      nodeGraphSlewLimiterSample(state.left, leftIn, slewUpTime, slewDownTime, rate, slewShape),
      runtime,
      nodeId,
      state.left,
      "slew output",
    ),
    Right: nodeGraphSafeFilterNumber(
      nodeGraphSlewLimiterSample(state.right, rightIn, slewUpTime, slewDownTime, rate, slewShape),
      runtime,
      nodeId,
      state.right,
      "slew output",
    ),
  };
};
