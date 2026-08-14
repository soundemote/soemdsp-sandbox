// Offline/render-time dispatch for robinSinusoid. Math: robin-sinusoid-math.js.

nodeGraphLiveModuleEvaluators.robinSinusoid = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  if (!runtime.robinSinusoidStates) {
    runtime.robinSinusoidStates = new Map();
  }
  const state = runtime.robinSinusoidStates.get(nodeId) || createNodeGraphRobinSinusoidState();
  runtime.robinSinusoidStates.set(nodeId, state);

  const freqKnob = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 440, frame, frames, frameValues);
  const amp = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);
  const phaseCycle = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
  const startPhase = (Number(phaseCycle) || 0) * Math.PI * 2;
  const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
    ? mixInput(nodeId, "f")
    : freqKnob;

  const resetIn = hasInput?.(nodeId, "Reset")
    ? (Number(mixInput(nodeId, "Reset")) || 0)
    : 0;
  const resetEdge = resetIn >= 0.5 && state.resetPrev < 0.5;
  state.resetPrev = resetIn;

  const out = nodeGraphRobinSinusoidSample(
    state,
    frequency,
    amp,
    sampleRate,
    startPhase,
    resetEdge,
  );
  return { Out: out };
};
