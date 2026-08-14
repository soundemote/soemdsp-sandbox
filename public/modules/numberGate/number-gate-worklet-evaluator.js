NodeLiveAudioProcessor.prototype.numberGateSample = function numberGateSample(options) {
  return typeof nodeGraphNumberGateSample === "function"
    ? nodeGraphNumberGateSample(options)
    : {};
};

NodeLiveAudioProcessor.prototype.nGateEvaluate = function nGateEvaluate(node, nodeId, mixInput, hasInput) {
  const type = node?.type || "gate12";
  return this.numberGateSample({
    analog: mixInput(nodeId, "Analog"),
    digital: mixInput(nodeId, "Digital"),
    hasAnalog: hasInput(nodeId, "Analog"),
    hasDigital: hasInput(nodeId, "Digital"),
    lastIndex: typeof nodeGraphNGateLastIndexForType === "function"
      ? nodeGraphNGateLastIndexForType(type)
      : 12,
    type,
  });
};
