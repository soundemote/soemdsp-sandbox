NodeLiveAudioProcessor.prototype.simulationTimeWorkletEvaluate = function simulationTimeWorkletEvaluate(
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  safeRate,
) {
  void node;
  void nodeId;
  void frame;
  void frames;
  void frameValues;
  void mixInput;
  const sr = Math.max(1, nodeGraphFiniteNumber(safeRate, 44100));
  const samples = Math.max(0, Number(this.absoluteFrame) || 0);
  if (typeof nodeGraphSimulationTimeCore === "function") {
    return nodeGraphSimulationTimeCore(samples, sr);
  }
  const q = 1e-7;
  const time = Math.round((samples / sr) / q) * q;
  return { Time: time, A: 1 };
};
