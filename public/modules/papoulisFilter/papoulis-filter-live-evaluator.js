// Offline/render papoulisFilter: dry pass-through.
// Papoulis filtering is native wasm on the audio worklet only (no JS filter).

nodeGraphLiveModuleEvaluators.papoulisFilter = ({ nodeId, mixInput }) => {
  return mixInput(nodeId);
};
