// Comparator — offline/render-time. Pure math: comparator-math.js.

nodeGraphLiveModuleEvaluators.comparator = ({ runtime, nodeId, mixInput }) => {
  const state = runtime.comparatorStates.get(nodeId) || createNodeGraphComparatorState();
  runtime.comparatorStates.set(nodeId, state);
  const raw = nodeGraphSafeFilterNumber(mixInput(nodeId, "In"), runtime, nodeId, null, "comparator in");
  return nodeGraphComparatorSample(state, raw);
};
