// Offline/render: Additive Generator publishes Yellow Graph (no audio).
// Harmonics slot-count change stamps phaseReset so Out clears phaseAcc.

const nodeGraphAdditiveGeneratorStates = new Map();

function nodeGraphAdditiveGeneratorLiveEvaluator({ node, nodeId }) {
  const read = (key, fallback) => {
    const raw = node?.parameters?.[key];
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const pwm = (() => {
    const p = node?.params || node?.parameters || {};
    if (p.pwm != null && Number.isFinite(Number(p.pwm))) return read("pwm", 0);
    return read("morph", 0); // legacy
  })();
  const graph = additiveGraphBuildFromWaveform(
    read("waveform", 0),
    pwm,
    read("harmonics", 32),
    read("phaseRotation", 0),
  );
  const id = String(nodeId);
  let genState = nodeGraphAdditiveGeneratorStates.get(id);
  if (!genState) {
    genState = { lastH: -1 };
    nodeGraphAdditiveGeneratorStates.set(id, genState);
  }
  const H = graph.harmonics | 0;
  if (genState.lastH >= 0 && genState.lastH !== H) {
    graph.phaseReset = true;
  }
  genState.lastH = H;
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  // No audio outs — face reads Graph / harmonics via data bus.
  return {};
}

nodeGraphLiveModuleEvaluators.additiveGenerator = nodeGraphAdditiveGeneratorLiveEvaluator;
