// Quadrature — offline/render. Math: quadrature-math.js.

nodeGraphLiveModuleEvaluators.quadrature = ({
  runtime,
  nodeId,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.quadratureStates) {
    runtime.quadratureStates = new Map();
  }
  const state = runtime.quadratureStates.get(nodeId) || createNodeGraphQuadratureState();
  runtime.quadratureStates.set(nodeId, state);
  // Side path: Side port, else mono In (generic single-input use).
  const sideIn = mixInput(nodeId, "Side") + mixInput(nodeId, "In");
  const midIn = mixInput(nodeId, "Mid");
  const out = nodeGraphQuadratureFrame(state, sideIn, midIn);
  void sampleRate;
  return {
    I: nodeGraphSafeFilterNumber(out.I, runtime, nodeId, state.side, "quadrature I"),
    Q: nodeGraphSafeFilterNumber(out.Q, runtime, nodeId, state.side, "quadrature Q"),
    MidI: nodeGraphSafeFilterNumber(out.MidI, runtime, nodeId, state.mid, "quadrature MidI"),
    SideQ: nodeGraphSafeFilterNumber(out.SideQ, runtime, nodeId, state.side, "quadrature SideQ"),
  };
};
