// Offline/render: Additive Out sums Magenta Graph → Out. Silence if unwired.

const nodeGraphAdditiveOutStates = new Map();

function nodeGraphAdditiveOutLiveEvaluator({
  node,
  nodeId,
  frame,
  frames,
  mixInput,
  hasInput,
  sampleRate,
}) {
  const graph = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (!graph || !graph.ratio || !graph.harmonics) {
    return { Out: 0 };
  }

  const read = (key, fallback) => {
    const n = Number(node?.parameters?.[key]);
    return Number.isFinite(n) ? n : fallback;
  };

  let state = nodeGraphAdditiveOutStates.get(String(nodeId));
  if (!state) {
    state = { phaseAcc: null, lastReset: 0 };
    nodeGraphAdditiveOutStates.set(String(nodeId), state);
  }

  const referenceVoltage = 48 / 120;
  const baseFrequency = read("frequency", 100);
  const pitchCv = hasInput?.(nodeId, "0.1V/Oct")
    ? Number(mixInput(nodeId, "0.1V/Oct")) || 0
    : referenceVoltage;
  let frequencyHz = typeof nodeGraphPitchedFrequency === "function"
    ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
    : baseFrequency;
  if (hasInput?.(nodeId, "f")) {
    const fAbs = Number(mixInput(nodeId, "f"));
    if (Number.isFinite(fAbs)) frequencyHz = fAbs;
  }

  if (hasInput?.(nodeId, "Reset")) {
    const rv = Number(mixInput(nodeId, "Reset")) || 0;
    if (state.lastReset <= 0 && rv > 0) {
      state.phaseAcc = null;
    }
    state.lastReset = rv;
  }

  const masterPhase = read("phase", 0);
  const masterAmp = read("amplitude", 0.35);
  // Publish Graph mirror for harmonicLines face (post-frequency placement hint).
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "GraphView", {
      ...graph,
      frequencyHz,
      masterPhase,
      masterAmp,
    });
  }

  const summed = additiveGraphSumSample(
    graph,
    state.phaseAcc,
    frequencyHz,
    masterPhase,
    masterAmp,
    sampleRate
  );
  state.phaseAcc = summed.phaseAcc;

  if (hasInput?.(nodeId, "Increment")) {
    const inc = Number(mixInput(nodeId, "Increment")) || 0;
    if (state.phaseAcc) {
      for (let i = 0; i < state.phaseAcc.length; i += 1) {
        state.phaseAcc[i] = additiveGraphWrap01(state.phaseAcc[i] + inc);
      }
    }
  }

  return { Out: summed.y };
}

nodeGraphLiveModuleEvaluators.additiveOut = nodeGraphAdditiveOutLiveEvaluator;
