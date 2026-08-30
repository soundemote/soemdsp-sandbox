// Offline/render: AdditiveImage — under construction. Graph passthrough only.

function nodeGraphAdditiveImageLiveEvaluator({ nodeId }) {
  const incoming = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(
      String(nodeId),
      "Graph",
      incoming && incoming.ratio && typeof additiveGraphClonePayload === "function"
        ? additiveGraphClonePayload(incoming)
        : null,
    );
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveImage = nodeGraphAdditiveImageLiveEvaluator;
