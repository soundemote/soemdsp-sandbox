// Active Filter — offline/render. Pure math: active-filter-math.js.

nodeGraphLiveModuleEvaluators.activeFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
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
  const params = {
    feedbackCircuit: readNodeGraphLiveEffectiveParam(runtime, node, "feedbackCircuit", 3, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues),
    gainCompensation: readNodeGraphLiveEffectiveParam(runtime, node, "gainCompensation", 1, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 3, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const mono = mixInput(nodeId);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const run = (ch, x, tag) => {
    const y = nodeGraphActiveFilterSample(ch, x, params, rate);
    return typeof nodeGraphSafeFilterNumber === "function"
      ? nodeGraphSafeFilterNumber(y, runtime, nodeId, ch, tag)
      : y;
  };
  return {
    Out: run(state.mono, mono, "active mono"),
    Left: run(state.left, mixInput(nodeId, "Left") + mono, "active left"),
    Right: run(state.right, mixInput(nodeId, "Right") + mono, "active right"),
  };
};
