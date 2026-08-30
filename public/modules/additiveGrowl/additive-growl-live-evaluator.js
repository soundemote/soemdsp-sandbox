// Offline/render: Growl — PhaseRotation + PhaseSkew + PhaseSkewCurve on Magenta Graph.

function nodeGraphAdditiveGrowlLiveEvaluator({ node, nodeId }) {
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
  additiveGraphApplyGrowl(
    out,
    num(p.phaseRotation, 0),
    num(p.phaseSkew, 0),
    num(p.phaseSkewCurve, 0),
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", out);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveGrowl = nodeGraphAdditiveGrowlLiveEvaluator;
