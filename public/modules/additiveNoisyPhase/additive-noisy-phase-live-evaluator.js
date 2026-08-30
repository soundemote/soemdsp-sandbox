// Offline/render: NoisyPhase — CheapWalk jitter on Magenta Graph phase.

const nodeGraphAdditiveNoisyPhaseStates = new Map();

function nodeGraphAdditiveNoisyPhaseLiveEvaluator({ node, nodeId, sampleRate, frames }) {
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
  const p = node?.parameters || {};
  let state = nodeGraphAdditiveNoisyPhaseStates.get(String(nodeId)) || {};
  const applied = additiveGraphApplyNoisyPhase(
    additiveGraphClonePayload(incoming),
    num(p.amount, 0.25),
    num(p.speed, 35),
    state.walks,
    sampleRate,
    frames,
  );
  nodeGraphAdditiveNoisyPhaseStates.set(String(nodeId), { walks: applied.walks });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", applied.graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveNoisyPhase = nodeGraphAdditiveNoisyPhaseLiveEvaluator;
