// Offline/render: Additive Pan — Pan + Width across harmonics.

const nodeGraphAdditivePanStates = new Map();

function nodeGraphAdditivePanLiveEvaluator({ node, nodeId }) {
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
  const p = node?.params || node?.parameters || {};
  const out = additiveGraphClonePayload(incoming);
  const id = String(nodeId);
  let state = nodeGraphAdditivePanStates.get(id) || {};
  const applied = additiveGraphApplyPan(
    out,
    num(p.pan, 0),
    num(p.width, 0),
    state.lerpFrom || null,
  );
  const graph = applied?.graph || out;
  nodeGraphAdditivePanStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additivePan = nodeGraphAdditivePanLiveEvaluator;
