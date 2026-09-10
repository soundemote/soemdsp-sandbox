const NODE_GRAPH_SIMULATION_TIME_PLANCK = 1e-7;

function nodeGraphSimulationTimeFromSamples(sampleIndex, sampleRate) {
  const sr = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const n = Math.max(0, nodeGraphFiniteNumber(sampleIndex));
  const seconds = n / sr;
  const q = NODE_GRAPH_SIMULATION_TIME_PLANCK;
  return Math.round(seconds / q) * q;
}

function nodeGraphSimulationTimeCore(sampleIndex, sampleRate) {
  const time = nodeGraphSimulationTimeFromSamples(sampleIndex, sampleRate);
  return {
    Time: time,
    A: 1,
  };
}
