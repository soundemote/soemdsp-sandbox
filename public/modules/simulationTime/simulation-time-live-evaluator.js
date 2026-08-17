nodeGraphLiveModuleEvaluators.simulationTime = ({
  runtime,
  frame,
  sampleRate,
}) => {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const samples = Math.max(0, Number(runtime?.absoluteFrame) || Number(frame) || 0);
  if (typeof nodeGraphSimulationTimeCore === "function") {
    return nodeGraphSimulationTimeCore(samples, sr);
  }
  const q = 1e-7;
  const time = Math.round((samples / sr) / q) * q;
  return { Time: time, A: 1 };
};
