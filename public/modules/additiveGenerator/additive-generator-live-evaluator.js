// Offline/render: Additive Generator publishes Yellow Graph (no audio).
// HarmonicFade Instant/Smoothed/Decimal; Smoothed uses 1-quantum ampLerp.

const nodeGraphAdditiveGeneratorStates = new Map();

function nodeGraphAdditiveGeneratorLiveEvaluator({ node, nodeId }) {
  const read = (key, fallback) => {
    const raw = node?.parameters?.[key] ?? node?.params?.[key];
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const pwm = (() => {
    const p = node?.params || node?.parameters || {};
    if (p.pwm != null && Number.isFinite(Number(p.pwm))) return read("pwm", 0);
    return read("morph", 0); // legacy
  })();
  const fade = typeof additiveGraphNormalizeHarmonicFade === "function"
    ? additiveGraphNormalizeHarmonicFade(read("harmonicFade", 1))
    : 1;
  const graph = additiveGraphBuildFromWaveform(
    read("waveform", 0),
    pwm,
    read("harmonics", 32),
    read("phaseRotation", 0),
    fade,
  );
  const id = String(nodeId);
  let genState = nodeGraphAdditiveGeneratorStates.get(id);
  if (!genState) {
    genState = { lastH: -1, prevAmp: null, prevRatio: null, prevPhase: null };
    nodeGraphAdditiveGeneratorStates.set(id, genState);
  }
  const prevH = genState.lastH | 0;
  const newH = graph.harmonics | 0;
  if (prevH >= 0 && prevH !== newH) {
    graph.phaseReset = true;
    if (fade === 1 && typeof additiveGraphApplyGeneratorHarmonicsCountLerp === "function") {
      additiveGraphApplyGeneratorHarmonicsCountLerp(
        graph, genState.prevAmp, genState.prevRatio, genState.prevPhase, prevH, newH,
      );
    }
  }
  genState.lastH = newH;
  const storeH = Math.max(0, newH);
  genState.prevAmp = new Float32Array(storeH);
  genState.prevRatio = new Float32Array(storeH);
  genState.prevPhase = new Float32Array(storeH);
  for (let i = 0; i < storeH; i += 1) {
    genState.prevAmp[i] = graph.ampLerp?.to
      ? Number(graph.ampLerp.to[i]) || 0
      : Number(graph.amplitude?.[i]) || 0;
    genState.prevRatio[i] = Number(graph.ratio?.[i]) || 0;
    genState.prevPhase[i] = Number(graph.phase?.[i]) || 0;
  }
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(id, "Graph", graph);
  }
  // No audio outs — face reads Graph / harmonics via data bus.
  return {};
}

nodeGraphLiveModuleEvaluators.additiveGenerator = nodeGraphAdditiveGeneratorLiveEvaluator;
