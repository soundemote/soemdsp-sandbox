// Offline/render: Additive Out sums Yellow Graph → Mono / Left / Right.
// Phase Rotation is on Additive Generator (baked into Graph phases).

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
    return { Mono: 0, Left: 0, Right: 0 };
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

  // Generator Harmonics slot-count change → wipe free-running phases.
  if (graph.phaseReset) state.phaseAcc = null;

  if (hasInput?.(nodeId, "Reset")) {
    const rv = Number(mixInput(nodeId, "Reset")) || 0;
    if (state.lastReset <= 0 && rv > 0) {
      state.phaseAcc = null;
    }
    state.lastReset = rv;
  }

  const masterAmp = read("amplitude", 0.35);
  const masterPhase = 0;
  const optimizeMode = read("optimize", 0);
  const summed = additiveGraphSumSample(
    graph,
    state.phaseAcc,
    frequencyHz,
    masterPhase,
    masterAmp,
    sampleRate,
    frame,
    frames,
    optimizeMode,
  );
  state.phaseAcc = summed.phaseAcc;

  if (typeof writeNodeGraphDataOutput === "function" && frame === frames - 1) {
    writeNodeGraphDataOutput(String(nodeId), "GraphView", {
      ...graph,
      frequencyHz,
      masterAmp,
    });
  }

  if (hasInput?.(nodeId, "Increment")) {
    const inc = Number(mixInput(nodeId, "Increment")) || 0;
    if (state.phaseAcc) {
      for (let i = 0; i < state.phaseAcc.length; i += 1) {
        state.phaseAcc[i] = additiveGraphWrap01(state.phaseAcc[i] + inc);
      }
    }
  }

  return {
    Mono: summed.mono,
    Left: summed.left,
    Right: summed.right,
  };
}

nodeGraphLiveModuleEvaluators.additiveOut = nodeGraphAdditiveOutLiveEvaluator;
