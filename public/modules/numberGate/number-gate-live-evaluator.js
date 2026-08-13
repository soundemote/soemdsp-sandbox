nodeGraphLiveModuleEvaluators.numberGate = ({
  nodeId,
  mixInput,
  hasInput,
}) => nodeGraphNumberGateSample({
  analog: mixInput(nodeId, "Analog"),
  digital: mixInput(nodeId, "Digital"),
  hasAnalog: hasInput(nodeId, "Analog"),
  hasDigital: hasInput(nodeId, "Digital"),
});
