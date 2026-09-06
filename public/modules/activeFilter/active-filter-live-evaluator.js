// Dual Ladder Filter — offline/render. Pure math: active-filter-math.js.

nodeGraphLiveModuleEvaluators.activeFilter = ({
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
  if (!runtime.activeFilterStates) {
    runtime.activeFilterStates = new Map();
  }
  const state = runtime.activeFilterStates.get(nodeId)
    || (typeof createNodeGraphStereoActiveFilterState === "function"
      ? createNodeGraphStereoActiveFilterState()
      : createNodeGraphStereoFilterState(createNodeGraphActiveFilterState));
  runtime.activeFilterStates.set(nodeId, state);
  const freqJack = typeof nodeGraphResolveAbsHzJack === "function"
    ? nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId)
    : null;
  const freqWired = freqJack != null;
  const params = {
    feedbackCircuit: readNodeGraphLiveEffectiveParam(runtime, node, "feedbackCircuit", 3, frame, frames, frameValues),
    centerFrequency: freqWired ? freqJack : undefined,
    gainCompensation: readNodeGraphLiveEffectiveParam(runtime, node, "gainCompensation", 1, frame, frames, frameValues),
    highFrequency: readNodeGraphLiveEffectiveParam(runtime, node, "highFrequency", 1000, frame, frames, frameValues),
    hpSlope: readNodeGraphLiveEffectiveParam(runtime, node, "hpSlope", 0, frame, frames, frameValues),
    lowFrequency: readNodeGraphLiveEffectiveParam(runtime, node, "lowFrequency", 200, frame, frames, frameValues),
    lpSlope: readNodeGraphLiveEffectiveParam(runtime, node, "lpSlope", 4, frame, frames, frameValues),
    // Legacy patches may still carry mode — resolve migrates to slopes.
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 3, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
    sweep: readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 0, frame, frames, frameValues),
  };
  const mono = mixInput(nodeId);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const run = (ch, x, tag) => {
    const y = nodeGraphActiveFilterProcess(ch, x, params, rate);
    return typeof nodeGraphSafeFilterNumber === "function"
      ? nodeGraphSafeFilterNumber(y, runtime, nodeId, ch, tag)
      : y;
  };
  return {
    Out: run(state.mono, mono, "dual ladder mono"),
    Left: run(state.left, mixInput(nodeId, "Left") + mono, "dual ladder left"),
    Right: run(state.right, mixInput(nodeId, "Right") + mono, "dual ladder right"),
  };
};
