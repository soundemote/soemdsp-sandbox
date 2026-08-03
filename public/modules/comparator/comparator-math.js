// Comparator — pure edge detector math (main thread + worklet JS path).

function createNodeGraphComparatorState() {
  return {
    hasPrev: false,
    prev: 0,
  };
}

/**
 * @returns {{ Up: number, Down: number, Change: number, Steady: number, Sign: number, Thru: number }}
 */
function nodeGraphComparatorSample(state, signalIn) {
  const raw = Number(signalIn) || 0;
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
