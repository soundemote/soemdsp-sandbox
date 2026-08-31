// Offline/render: NoisyAmp — CheapWalk / Filtered / WhiteNoise.

const nodeGraphAdditiveNoisyAmpStates = new Map();

function nodeGraphAdditiveNoisyAmpLiveEvaluator({ node, nodeId, sampleRate, frames }) {
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
  let state = nodeGraphAdditiveNoisyAmpStates.get(String(nodeId)) || {};
  const applied = additiveGraphApplyNoisyAmp(
    additiveGraphClonePayload(incoming),
    num(p.amount, 0.25),
    num(p.speed, 35),
    state.walks,
    sampleRate,
    frames,
    num(p.noise, 0),
    state.lerpFrom,
    num(p.seed, 1),
  );
  nodeGraphAdditiveNoisyAmpStates.set(String(nodeId), {
    walks: applied.walks,
    lerpFrom: applied.lerpFrom,
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", applied.graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveNoisyAmp = nodeGraphAdditiveNoisyAmpLiveEvaluator;
