// Offline/render: FrequencySkew — Low/High Stretch + Skew/Curve on ratios.

const nodeGraphAdditiveFrequencySkewStates = new Map();

function nodeGraphAdditiveFrequencySkewLiveEvaluator({
  node, nodeId, runtime, frame, frames, frameValues,
}) {
  const incoming = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (!incoming || !incoming.ratio) {
    if (typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", null);
    }
    return {};
  }
  if (frame !== 0 && frame != null) {
    const held = nodeGraphAdditiveFrequencySkewStates.get(String(nodeId))?.graph;
    if (held && typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", held);
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
  const id = String(nodeId);
  let state = nodeGraphAdditiveFrequencySkewStates.get(id) || {};
  const applied = additiveGraphApplyFrequencySkew(
    out,
    read("lowStretch", 1),
    read("highStretch", 1),
    read("skew", 0),
    read("curve", 0),
    state.lerpFrom || null,
  );
  const graph = applied?.graph || out;
  nodeGraphAdditiveFrequencySkewStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    graph,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveFrequencySkew = nodeGraphAdditiveFrequencySkewLiveEvaluator;
// Legacy type alias (patches migrate Slope → Skew).
nodeGraphLiveModuleEvaluators.additiveFrequencySlope = nodeGraphAdditiveFrequencySkewLiveEvaluator;
