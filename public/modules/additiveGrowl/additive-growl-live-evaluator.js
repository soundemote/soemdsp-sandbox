// Offline/render: Growl — PhaseRotation + PhaseSkew + PhaseSkewCurve on Yellow Graph.

function nodeGraphAdditiveGrowlLiveEvaluator({ node, nodeId, runtime, frame, frames, frameValues }) {
  const incoming = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (!incoming || !incoming.ratio) {
    if (typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", null);
    }
    return {};
  }
  const read = (key, fallback) => (typeof nodeGraphAdditiveReadParam === "function"
    ? nodeGraphAdditiveReadParam(node, key, fallback, runtime, frame, frames, frameValues)
    : (() => {
      const p = node?.params || node?.parameters || {};
      const n = Number(p[key]);
      return Number.isFinite(n) ? n : fallback;
    })());
  const out = additiveGraphClonePayload(incoming);
  additiveGraphApplyGrowl(
    out,
    read("phaseRotation", 0),
    read("phaseSkew", 0),
    read("phaseSkewCurve", 0),
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", out);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveGrowl = nodeGraphAdditiveGrowlLiveEvaluator;
