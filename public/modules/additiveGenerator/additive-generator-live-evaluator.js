// Offline/render: Additive Generator publishes Magenta Graph (no audio).

function nodeGraphAdditiveGeneratorLiveEvaluator({ node, nodeId }) {
  const read = (key, fallback) => {
    const raw = node?.parameters?.[key];
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const graph = additiveGraphBuildFromWaveform(
    read("waveform", 0),
    read("morph", 0.5),
    read("harmonics", 32)
  );
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", graph);
  }
  // No audio outs — face reads Graph / harmonics via data bus.
  return {};
}

nodeGraphLiveModuleEvaluators.additiveGenerator = nodeGraphAdditiveGeneratorLiveEvaluator;
