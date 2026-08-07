// Offline/render: crossover2 … crossover6

function nodeGraphCrossoverLiveReadFreqs(runtime, node, bandCount, frame, frames, frameValues) {
  const splitCount = bandCount - 1;
  const defaults = nodeGraphCrossoverDefaultFreqs(bandCount);
  const freqs = [];
  for (let i = 0; i < splitCount; i += 1) {
    const key = splitCount === 1 ? "frequency" : `frequency${i + 1}`;
    const fallback = defaults[i] ?? 1000;
    freqs.push(readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues));
  }
  return freqs;
}

function nodeGraphCrossoverRegisterLive(bandCount) {
  const type = `crossover${bandCount}`;
  nodeGraphLiveModuleEvaluators[type] = ({
    runtime,
    node,
    nodeId,
    frame,
    frames,
    frameValues,
    mixInput,
    sampleRate,
  }) => {
    const mapName = `${type}States`;
    if (!runtime[mapName]) runtime[mapName] = new Map();
    let state = runtime[mapName].get(nodeId);
    if (!state || state.left?.bandCount !== bandCount) {
      state = createNodeGraphCrossoverStereoState(bandCount);
      runtime[mapName].set(nodeId, state);
    }
    const lrOrder = readNodeGraphLiveEffectiveParam(runtime, node, "order", 4, frame, frames, frameValues);
    const freqs = nodeGraphCrossoverLiveReadFreqs(runtime, node, bandCount, frame, frames, frameValues);
    const out = nodeGraphCrossoverSample(
      state,
      mixInput(nodeId),
      mixInput(nodeId, "Left"),
      mixInput(nodeId, "Right"),
      freqs,
      lrOrder,
      sampleRate,
      bandCount,
    );
    const safe = {};
    for (const [k, v] of Object.entries(out)) {
      safe[k] = typeof nodeGraphSafeFilterNumber === "function"
        ? nodeGraphSafeFilterNumber(v, runtime, nodeId, null, `crossover ${k}`)
        : v;
    }
    return safe;
  };
}

for (let n = 2; n <= 6; n += 1) {
  nodeGraphCrossoverRegisterLive(n);
}
