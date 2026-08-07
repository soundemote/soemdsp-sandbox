// Worklet methods for crossover2 … crossover6 (dispatch lives in evaluators-processors.js).

NodeLiveAudioProcessor.prototype.createCrossoverStereoState = function createCrossoverStereoState(bandCount) {
  if (typeof createNodeGraphCrossoverStereoState === "function") {
    return createNodeGraphCrossoverStereoState(bandCount);
  }
  return { left: { bandCount }, right: { bandCount } };
};

NodeLiveAudioProcessor.prototype.crossoverSample = function crossoverSample(
  state,
  mono,
  left,
  right,
  freqs,
  lrOrder,
  rate,
  bandCount,
) {
  if (typeof nodeGraphCrossoverSample === "function") {
    return nodeGraphCrossoverSample(state, mono, left, right, freqs, lrOrder, rate, bandCount);
  }
  return {};
};

NodeLiveAudioProcessor.prototype.crossoverEvaluator = function crossoverEvaluator(
  bandCount,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  safeRate,
) {
  const type = `crossover${bandCount}`;
  const mapName = `${type}States`;
  if (!this[mapName]) this[mapName] = new Map();
  let state = this[mapName].get(nodeId);
  if (!state || state.left?.bandCount !== bandCount) {
    state = this.createCrossoverStereoState(bandCount);
    this[mapName].set(nodeId, state);
  }
  const lrOrder = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
  const splitCount = bandCount - 1;
  const defaults = typeof nodeGraphCrossoverDefaultFreqs === "function"
    ? nodeGraphCrossoverDefaultFreqs(bandCount)
    : [];
  const freqs = [];
  for (let i = 0; i < splitCount; i += 1) {
    const key = splitCount === 1 ? "frequency" : `frequency${i + 1}`;
    freqs.push(this.readEffectiveParameter(node, key, defaults[i] ?? 1000, frame, frames, frameValues));
  }
  return this.crossoverSample(
    state,
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    freqs,
    lrOrder,
    safeRate,
    bandCount,
  );
};
