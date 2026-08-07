// EQ Filter — offline/render. Pure math: eq-filter-math.js.
// Credit: Robin Schmidt / RS-MET rsStateVariableFilter (ZDF SVF).

nodeGraphLiveModuleEvaluators.eqFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.eqFilterStates) {
    runtime.eqFilterStates = new Map();
  }
  const state = runtime.eqFilterStates.get(nodeId) || createNodeGraphStereoEqFilterState();
  runtime.eqFilterStates.set(nodeId, state);
  const mode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 1, frame, frames, frameValues);
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues);
  const q = readNodeGraphLiveEffectiveParam(runtime, node, "q", 0.707, frame, frames, frameValues);
  const gain = readNodeGraphLiveEffectiveParam(runtime, node, "gain", 0, frame, frames, frameValues);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const mono = mixInput(nodeId);
  return {
    Out: nodeGraphSafeFilterNumber(
      nodeGraphEqFilterSample(state.mono, mono, mode, frequency, q, gain, rate),
      runtime,
      nodeId,
      state.mono,
      "eq mono",
    ),
    Left: nodeGraphSafeFilterNumber(
      nodeGraphEqFilterSample(state.left, mixInput(nodeId, "Left") + mono, mode, frequency, q, gain, rate),
      runtime,
      nodeId,
      state.left,
      "eq left",
    ),
    Right: nodeGraphSafeFilterNumber(
      nodeGraphEqFilterSample(state.right, mixInput(nodeId, "Right") + mono, mode, frequency, q, gain, rate),
      runtime,
      nodeId,
      state.right,
      "eq right",
    ),
  };
};
