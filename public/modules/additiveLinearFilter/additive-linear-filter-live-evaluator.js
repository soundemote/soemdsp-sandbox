// Offline/render: Additive Linear Filter — Yellow Graph LP/BP/HP slope→brickwall.

function nodeGraphAdditiveLinearFilterLiveEvaluator({ node, nodeId }) {
  const incoming = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (!incoming || !incoming.ratio) {
    if (typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", null);
    }
    return {};
  }
  const num = typeof nodeGraphFiniteNumber === "function"
    ? nodeGraphFiniteNumber
    : (v, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
  const p = node?.parameters || {};
  const out = additiveGraphClonePayload(incoming);
  additiveGraphApplyLinearFilter(
    out,
    num(p.filter, 0),
    num(p.cutoff, 0.5),
    num(p.slope, 0.25),
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", out);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveLinearFilter = nodeGraphAdditiveLinearFilterLiveEvaluator;
