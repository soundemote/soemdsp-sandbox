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
  const safeTrigger = Number(trigger) || 0;
  const safeReset = Number(reset) || 0;
  const threshold = Number(params?.threshold) || 0;
  const countMax = Math.max(1, nodeGraphFiniteNumber(params?.countMax, 1));
  const increment = Math.max(0, Number(params?.increment) || 0);
  const pulseTime = Math.max(0, Number(params?.pulseTime) || 0);
  const level = Number(params?.level) || 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);

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
