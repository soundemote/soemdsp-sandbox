// Hilbert — offline/render. Math: hilbert-math.js (quadrature Q).

nodeGraphLiveModuleEvaluators.hilbert = ({
  runtime,
  node,
  nodeId,
  mixInput,
  frame,
  frames,
  frameValues,
}) => {
  if (!runtime.hilbertStates) {
    runtime.hilbertStates = new Map();
  }
  const state = runtime.hilbertStates.get(nodeId) || createNodeGraphHilbertState();
  runtime.hilbertStates.set(nodeId, state);
  const shift = readNodeGraphLiveEffectiveParam(runtime, node, "shift", 0, frame, frames, frameValues);
  const out = nodeGraphHilbertFrame(state, mixInput(nodeId), shift);
  return {
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, state.net, "hilbert Out"),
  };
};
