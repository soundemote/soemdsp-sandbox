NodeLiveAudioProcessor.prototype.tSeriesEvaluate = function tSeriesEvaluate(node, nodeId, mixInput, hasInput) {
  return typeof nodeGraphTSeriesSample === "function"
    ? nodeGraphTSeriesSample({
      analog: mixInput(nodeId, "Analog"),
      digital: mixInput(nodeId, "Digital"),
      input: mixInput(nodeId, "In"),
      hasAnalog: hasInput(nodeId, "Analog"),
      hasDigital: hasInput(nodeId, "Digital"),
      hasIn: hasInput(nodeId, "In"),
      type: node?.type || "t",
    })
    : {};
};
