// Offline/render: Additive Analog Filter — nonlinear slope→brickwall LP/BP/HP.

function nodeGraphAdditiveAnalogFilterLiveEvaluator({ node, nodeId }) {
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
  additiveGraphApplyAnalogFilter(
    out,
    num(p.filter, 0),
    num(p.cutoff, 0.5),
    num(p.slope, 0.25),
    num(p.skew, 0),
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", out);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveAnalogFilter = nodeGraphAdditiveAnalogFilterLiveEvaluator;
