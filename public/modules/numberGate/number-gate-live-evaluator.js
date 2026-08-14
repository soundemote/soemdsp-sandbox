(function registerNodeGraphNGateLiveEvaluators() {
  const types = ["gate12", "gate8", "gate6", "gate4", "gate3", "gate2", "numberGate"];
  for (const type of types) {
    nodeGraphLiveModuleEvaluators[type] = ({
      node,
      nodeId,
      mixInput,
      hasInput,
    }) => nodeGraphNumberGateSample({
      analog: mixInput(nodeId, "Analog"),
      digital: mixInput(nodeId, "Digital"),
      hasAnalog: hasInput(nodeId, "Analog"),
      hasDigital: hasInput(nodeId, "Digital"),
      lastIndex: typeof nodeGraphNGateLastIndexForType === "function"
        ? nodeGraphNGateLastIndexForType(node?.type || type)
        : 12,
      type: node?.type || type,
    });
  }
}());
