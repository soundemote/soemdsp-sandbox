// Offline/render: NoisyFreq — ratio Add jitter (CheapWalk / Filtered / White).

const nodeGraphAdditiveNoisyFreqStates = new Map();

function nodeGraphAdditiveNoisyFreqReadAdd(params) {
  const p = params || {};
  if (p.add != null && Number.isFinite(Number(p.add))) return Number(p.add);
  // Legacy Amount 0…1 with hidden ×0.5.
  const legacy = Number(p.amount);
  return Number.isFinite(legacy) ? legacy * 0.5 : 0.5;
}

function nodeGraphAdditiveNoisyFreqLiveEvaluator({ node, nodeId, sampleRate, frames }) {
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
  let state = nodeGraphAdditiveNoisyFreqStates.get(String(nodeId)) || {};
  const applied = additiveGraphApplyNoisyFreq(
    additiveGraphClonePayload(incoming),
    nodeGraphAdditiveNoisyFreqReadAdd(p),
    num(p.speed, 35),
    state.walks,
    sampleRate,
    frames,
    num(p.noise, 0),
    state.lerpFrom,
    num(p.seed, 1),
  );
  nodeGraphAdditiveNoisyFreqStates.set(String(nodeId), {
    walks: applied.walks,
    lerpFrom: applied.lerpFrom,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", applied.graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveNoisyFreq = nodeGraphAdditiveNoisyFreqLiveEvaluator;
