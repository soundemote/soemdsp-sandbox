// Offline/render: QuantizeFreq — fund-relative ratio snap, then random offset.

const nodeGraphAdditiveQuantizeFreqStates = new Map();

function nodeGraphAdditiveQuantizeFreqLiveEvaluator({
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
    const held = nodeGraphAdditiveQuantizeFreqStates.get(String(nodeId))?.graph;
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
  let state = nodeGraphAdditiveQuantizeFreqStates.get(id) || {};
  const applied = additiveGraphApplyQuantizeFreq(
    out,
    read("quantizeFreq", 0),
    read("randomFreqAmount", 0),
    read("seed", 1),
    state.lerpFrom || null,
  );
  const graph = applied?.graph || out;
  nodeGraphAdditiveQuantizeFreqStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    graph,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveQuantizeFreq = nodeGraphAdditiveQuantizeFreqLiveEvaluator;
nodeGraphLiveModuleEvaluators.additiveHarmonicMath = nodeGraphAdditiveQuantizeFreqLiveEvaluator;
nodeGraphLiveModuleEvaluators.additiveFrequencyMath = nodeGraphAdditiveQuantizeFreqLiveEvaluator;
