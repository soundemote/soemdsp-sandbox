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
  // Once per offline block (frame 0) — match worklet quantum behavior.
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
  let cutoff = read("cutoff", NaN);
  if (!(cutoff === cutoff)) {
    const legacy = read("harmonicReduce", NaN);
    cutoff = legacy === legacy ? 1 - legacy : 1;
  }
  const phaseSkew = additiveGraphBubbleEffectivePhaseSkew(
    read("phaseSkew", 0),
    read("unskew", 0),
    cutoff,
  );
  const applied = additiveGraphApplyGrowl(
    out,
    0, // phase rotation removed
    phaseSkew,
    read("phaseSkewCurve", 0),
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

nodeGraphLiveModuleEvaluators.additiveBubble = nodeGraphAdditiveBubbleLiveEvaluator;
// Patches may still resolve the old type briefly before migration.
nodeGraphLiveModuleEvaluators.additiveGrowl = nodeGraphAdditiveBubbleLiveEvaluator;
