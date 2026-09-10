// Metamodule boundary thrus + shell stub (Playmode Off = no voice runner yet).
globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.metamoduleIn = ({ mixInput, nodeId }) => ({
  Out: mixInput(nodeId, "In"),
});

nodeGraphLiveModuleEvaluators.metamoduleOut = ({ mixInput, nodeId }) => ({
  Out: mixInput(nodeId, "In"),
});

// Shell is chrome-only until the native voice runner (S4).
nodeGraphLiveModuleEvaluators.metamodule = () => ({});
