// Comparator — offline/render-time twin of the worklet edge detector.

function createNodeGraphComparatorState() {
  return {
    hasPrev: false,
    prev: 0,
  };
}

function nodeGraphComparatorSample(state, signalIn, runtime = null, nodeId = "") {
  const raw = nodeGraphSafeFilterNumber(signalIn, runtime, nodeId, null, "comparator in");
  const sign = raw > 0 ? 1 : 0;
  if (!state.hasPrev) {
    state.prev = raw;
    state.hasPrev = true;
    return { Up: 0, Down: 0, Change: 0, Steady: 0, Sign: sign, Thru: raw };
  }
  const rose = raw > state.prev;
  const fell = raw < state.prev;
  state.prev = raw;
  const changed = rose || fell;
  return {
    Up: rose ? 1 : 0,
    Down: fell ? 1 : 0,
    Change: changed ? 1 : 0,
    Steady: changed ? 0 : 1,
    Sign: sign,
    Thru: raw,
  };
}

nodeGraphLiveModuleEvaluators.comparator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.comparatorStates.get(nodeId) || createNodeGraphComparatorState();
  runtime.comparatorStates.set(nodeId, state);
  return nodeGraphComparatorSample(
    state,
    mixInput(nodeId, "In"),
    runtime,
    nodeId,
  );
};
