// Phase Disperse — offline/render.

nodeGraphLiveModuleEvaluators.phaseDisperse = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.phaseDisperseStates) runtime.phaseDisperseStates = new Map();
  let state = runtime.phaseDisperseStates.get(nodeId);
  if (!state) {
    state = createNodeGraphPhaseDisperseState();
    runtime.phaseDisperseStates.set(nodeId, state);
  }

  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 100, frame, frames, frameValues);
  const amount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 0.5, frame, frames, frameValues);
  const pinch = readNodeGraphLiveEffectiveParam(runtime, node, "pinch", 0.5, frame, frames, frameValues);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const x = Number(mixInput(nodeId)) || 0;
  const y = nodeGraphPhaseDisperseSample(state, x, frequency, amount, pinch, rate);
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "phase disperse")
    : y;
};
