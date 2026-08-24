nodeGraphLiveModuleEvaluators.lcdDot = ({ runtime, nodeId, mixInput }) => ({
  Thru: nodeGraphSafeFilterNumber(mixInput(nodeId, "In"), runtime, nodeId, null, "lcdDot in"),
});
