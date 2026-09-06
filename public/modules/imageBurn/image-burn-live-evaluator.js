// Image Ghost: In → Thru passthrough (face reads buffered In for energy).
globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.imageBurn = ({ runtime, nodeId, mixInput }) => ({
  Thru: nodeGraphSafeFilterNumber(mixInput(nodeId, "In"), runtime, nodeId, null, "imageBurn in"),
});
