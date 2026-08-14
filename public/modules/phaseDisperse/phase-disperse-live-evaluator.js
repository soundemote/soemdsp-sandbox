// Phase Disperse — offline/render.

nodeGraphLiveModuleEvaluators.phaseDisperse = ({
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
  if (!runtime.phaseDisperseStates) runtime.phaseDisperseStates = new Map();
  let state = runtime.phaseDisperseStates.get(nodeId);
  if (!state) {
    state = createNodeGraphPhaseDisperseState();
    runtime.phaseDisperseStates.set(nodeId, state);
  }

  const knobHz = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 100, frame, frames, frameValues);
  const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
    ? mixInput(nodeId, "f")
    : knobHz;
  // Filters = stage count (CPU). Fall back to legacy Amount 0…1 if Filters absent.
  let filters = readNodeGraphLiveEffectiveParam(runtime, node, "filters", NaN, frame, frames, frameValues);
  if (!Number.isFinite(Number(filters))) {
    filters = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 0.5, frame, frames, frameValues);
  }
  const pinch = readNodeGraphLiveEffectiveParam(runtime, node, "pinch", 0.5, frame, frames, frameValues);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const x = Number(mixInput(nodeId)) || 0;
  const y = nodeGraphPhaseDisperseSample(state, x, frequency, filters, pinch, rate);
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "phase disperse")
    : y;
};
