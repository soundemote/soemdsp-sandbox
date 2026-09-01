// Offline/render: Bubble — logarithmic phase cascade + Cutoff.

const nodeGraphAdditiveBubbleStates = new Map();

function nodeGraphAdditiveBubbleLiveEvaluator({ node, nodeId, runtime, frame, frames, frameValues }) {
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
  if (frame !== 0 && frame != null) {
    const held = nodeGraphAdditiveBubbleStates.get(String(nodeId))?.graph;
    if (held && typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", held);
    }
    return {};
  }
  const out = additiveGraphClonePayload(incoming);
  const id = String(nodeId);
  let state = nodeGraphAdditiveBubbleStates.get(id) || {};
  const cutoff = read("cutoff", 1);
  const phaseSkew = additiveGraphBubbleEffectivePhaseSkew(
    read("phaseSkew", 0),
    read("unskew", 481.53),
    cutoff,
  );
  let bubble = Math.max(0, Math.min(1, Number(read("bubble", 0)) || 0));
  const invert = Number(read("invertBubble", 0)) >= 0.5;
  let curveAmt = invert ? -bubble : bubble;
  if (curveAmt > 0.9999) curveAmt = 0.9999;
  if (curveAmt < -0.9999) curveAmt = -0.9999;
  const applied = additiveGraphApplyGrowl(
    out,
    0,
    phaseSkew,
    curveAmt,
    2, // Logarithmic
    cutoff,
    0,
    state.lerpFrom || null,
  );
  const graph = applied?.graph || out;
  nodeGraphAdditiveBubbleStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    graph,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  return {};
}

if (typeof nodeGraphLiveModuleEvaluators !== "undefined" && nodeGraphLiveModuleEvaluators) {
  nodeGraphLiveModuleEvaluators.additiveBubble = nodeGraphAdditiveBubbleLiveEvaluator;
}
