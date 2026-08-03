// Trigger Divider — pure math (main thread + worklet JS path).
// clockDivider offline path shares createNodeGraphTriggerDividerState via stdlib
// name alias — keep create* here and re-export compatible shape.

function createNodeGraphTriggerDividerState() {
  return {
    count: 0,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
  };
}

/**
 * @returns {number} pulse level or 0
 */
function nodeGraphTriggerDividerCore(state, trigger, reset, params, sampleRate) {
  const safeTrigger = Number(trigger) || 0;
  const safeReset = Number(reset) || 0;
  const threshold = Number(params?.threshold) || 0;
  const division = Math.max(1, Math.min(64, Math.round(Number(params?.division) || 1)));
  const pulseTime = Math.max(0, Number(params?.pulseTime) || 0);
  const level = Number(params?.level) || 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);

  if (state.lastReset <= threshold && safeReset > threshold) {
    state.count = 0;
    state.remainingSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.count = (state.count + 1) % division;
    if (state.count === 0) {
      state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
    }
  }
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const output = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  return output;
}
