// Trigger Counter — pure math (main thread + worklet JS path).

function createNodeGraphTriggerCounterState() {
  return {
    count: 0,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
  };
}

/**
 * @returns {{ Count: number, Pulse: number }}
 */
function nodeGraphTriggerCounterCore(state, trigger, reset, params, sampleRate) {
  const safeTrigger = nodeGraphFiniteNumber(trigger);
  const safeReset = nodeGraphFiniteNumber(reset);
  const threshold = nodeGraphFiniteNumber(params?.threshold);
  const countMax = Math.max(1, nodeGraphFiniteNumber(params?.countMax, 1));
  const increment = Math.max(0, nodeGraphFiniteNumber(params?.increment));
  const pulseTime = Math.max(0, nodeGraphFiniteNumber(params?.pulseTime));
  const level = nodeGraphFiniteNumber(params?.level);
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));

  if (state.lastReset <= threshold && safeReset > threshold) {
    state.count = 0;
    state.remainingSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.count += increment;
    if (state.count >= countMax) {
      state.count = countMax > 0 ? state.count % countMax : 0;
      state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
    }
  }
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const pulse = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  const countNorm = Math.max(0, Math.min(1, state.count / countMax)) * level;
  return {
    Count: countNorm,
    Pulse: pulse,
  };
}
