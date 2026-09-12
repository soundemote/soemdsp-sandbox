// Metamodule boundary thrus + shell stub. Voice bus values come from native feeders.
globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.metamoduleIn = ({ mixInput, nodeId }) => ({
  Out: mixInput(nodeId, "In"),
});

nodeGraphLiveModuleEvaluators.metamoduleOut = ({ mixInput, nodeId }) => ({
  Out: mixInput(nodeId, "In"),
});

// Live stubs — real Voice* CV is written by native per-lane Bias feeders.
nodeGraphLiveModuleEvaluators.voiceFrequency = () => ({ Frequency: 0, Out: 0 });
nodeGraphLiveModuleEvaluators.voiceGate = () => ({ Gate: 0, Out: 0 });
nodeGraphLiveModuleEvaluators.voiceTrigger = () => ({ Trigger: 0, Out: 0 });

// Shell is chrome-only; voice runner lives in native-graph.
nodeGraphLiveModuleEvaluators.metamodule = () => ({});
nodeGraphLiveModuleEvaluators.group = () => ({});
