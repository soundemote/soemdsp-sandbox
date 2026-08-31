// Offline/render: Ladder Filter — warm spectral LP/BP/HP + Resonance.

function nodeGraphAdditiveLadderFilterLiveEvaluator({
  node, nodeId, runtime, frame, frames, frameValues, sampleRate,
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
  const read = (key, fallback) => (typeof nodeGraphAdditiveReadParam === "function"
    ? nodeGraphAdditiveReadParam(node, key, fallback, runtime, frame, frames, frameValues)
    : num(p[key], fallback));
  const sr = Math.max(1, Number(sampleRate) || Number(runtime?.sampleRate) || 44100);
  const cutoffHz = read("cutoff", 2000);
  const fundHz = typeof additiveGraphResolveFundamentalHz === "function"
    ? additiveGraphResolveFundamentalHz({
      graph: incoming,
      fallback: 100,
    })
    : 100;
  const out = additiveGraphClonePayload(incoming);
  additiveGraphApplyLadderFilter(
    out,
    num(p.filter, 0),
    cutoffHz,
    read("slope", 12),
    read("resonance", 0),
    fundHz,
    sr,
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", out);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveLadderFilter = nodeGraphAdditiveLadderFilterLiveEvaluator;
