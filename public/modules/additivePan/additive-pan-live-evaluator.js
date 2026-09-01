// Offline/render: Additive AutoPan — Rate/Depth/Spread swirl.

const nodeGraphAdditivePanStates = new Map();

function nodeGraphAdditivePanLiveEvaluator({
  node, nodeId, frames, sampleRate,
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
  const rate = num(p.rate != null ? p.rate : 0.25, 0.25);
  const depth = num(
    p.depth != null ? p.depth : (p.width != null ? Math.abs(Number(p.width)) : 0.85),
    0.85,
  );
  const spread = num(p.spread, 1);
  const bias = num(p.bias != null ? p.bias : p.pan, 0);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const block = Math.max(1, Number(frames) || 128);
  const applied = additiveGraphApplyPan(
    out, rate, depth, spread, bias, state, sr, block, state.lerpFrom || null,
  );
  const graph = applied?.graph || out;
  nodeGraphAdditivePanStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    phase: applied?.phase || 0,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additivePan = nodeGraphAdditivePanLiveEvaluator;
