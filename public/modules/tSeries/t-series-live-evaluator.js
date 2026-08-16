(function registerNodeGraphTSeriesLiveEvaluators() {
  const types = typeof NODE_GRAPH_T_SERIES_TYPES === "object"
    ? NODE_GRAPH_T_SERIES_TYPES
    : ["t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"];
  for (const type of types) {
    nodeGraphLiveModuleEvaluators[type] = ({ node, nodeId, mixInput, hasInput }) =>
      nodeGraphTSeriesSample({
        analog: mixInput(nodeId, "Analog"),
        digital: mixInput(nodeId, "Digital"),
        input: mixInput(nodeId, "In"),
        hasAnalog: hasInput(nodeId, "Analog"),
        hasDigital: hasInput(nodeId, "Digital"),
        hasIn: hasInput(nodeId, "In"),
        type: node?.type || type,
      });
  }
}());
