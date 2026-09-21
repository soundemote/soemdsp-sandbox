(function registerNodeGraphTSeriesLiveEvaluators() {
  const demux = typeof NODE_GRAPH_T_SERIES_TYPES === "object"
    ? NODE_GRAPH_T_SERIES_TYPES
    : ["t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"];
  for (const type of demux) {
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
  const mux = typeof NODE_GRAPH_T_SERIES_MUX_TYPES === "object"
    ? NODE_GRAPH_T_SERIES_MUX_TYPES
    : ["1t", "2t", "3t", "4t", "5t", "6t", "7t", "8t", "9t", "10t"];
  for (const type of mux) {
    nodeGraphLiveModuleEvaluators[type] = ({ node, nodeId, mixInput, hasInput }) => {
      const last = typeof nodeGraphTSeriesLastIndexForType === "function"
        ? nodeGraphTSeriesLastIndexForType(node?.type || type)
        : Number(String(type).replace(/t$/, ""));
      const inputs = [];
      for (let i = 0; i <= last; i += 1) {
        inputs[i] = mixInput(nodeId, String(i));
      }
      return nodeGraphTSeriesMuxSample({
        analog: mixInput(nodeId, "Analog"),
        digital: mixInput(nodeId, "Digital"),
        hasAnalog: hasInput(nodeId, "Analog"),
        hasDigital: hasInput(nodeId, "Digital"),
        inputs,
        lastIndex: last,
        type: node?.type || type,
      });
    };
  }
}());
