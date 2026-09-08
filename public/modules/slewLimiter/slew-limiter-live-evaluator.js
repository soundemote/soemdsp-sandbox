// Slew Limiter — offline/render-time. Pure math: slew-limiter-math.js.
// Mono gold In→Out only.

nodeGraphLiveModuleEvaluators.slewLimiter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.slewLimiterStates.get(nodeId) || createNodeGraphSlewLimiterState();
  runtime.slewLimiterStates.set(nodeId, state);
  const slewUpTime = readNodeGraphLiveEffectiveParam(runtime, node, "upTime", 0.05, frame, frames, frameValues);
  const slewDownTime = readNodeGraphLiveEffectiveParam(runtime, node, "downTime", 0.05, frame, frames, frameValues);
  // Legacy single `shape` copies to both when up/down keys are absent.
  const legacyShape = readNodeGraphLiveEffectiveParam(runtime, node, "shape", 0, frame, frames, frameValues);
  const slewUpShape = readNodeGraphLiveEffectiveParam(runtime, node, "upShape", legacyShape, frame, frames, frameValues);
  const slewDownShape = readNodeGraphLiveEffectiveParam(runtime, node, "downShape", legacyShape, frame, frames, frameValues);
  const slewBias = readNodeGraphLiveEffectiveParam(runtime, node, "bias", 0, frame, frames, frameValues);
  const slewIn = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "In") + mixInput(nodeId) + slewBias,
    runtime,
    nodeId,
    state,
    "slew input",
  );
  const out = nodeGraphSafeFilterNumber(
    nodeGraphSlewLimiterSample(state, slewIn, slewUpTime, slewDownTime, sampleRate, slewUpShape, slewDownShape),
    runtime,
    nodeId,
    state,
    "slew output",
  );
  return { Out: out, Mono: out };
};
