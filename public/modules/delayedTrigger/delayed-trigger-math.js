// Delayed Trigger — pure math (main thread + worklet JS path).

function createNodeGraphDelayedTriggerState() {
  return {
    hasTriggered: true,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
    running: false,
    waitSamples: 0,
  };
}

/**
 * @returns {number} pulse level or 0
 */
function nodeGraphDelayedTriggerCore(state, trigger, reset, params, sampleRate) {
  const safeTrigger = Number(trigger) || 0;
  const safeReset = Number(reset) || 0;
  const threshold = Number(params?.threshold) || 0;
  const delay = Math.max(0, Number(params?.delay) || 0);
  const pulseTime = Math.max(0, Number(params?.pulseTime) || 0);
  const level = Number(params?.level) || 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);

  if (state.lastReset <= threshold && safeReset > threshold) {
    state.hasTriggered = true;
    state.remainingSamples = 0;
    state.running = false;
    state.waitSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.hasTriggered = false;
    state.remainingSamples = 0;
    state.running = true;
    state.waitSamples = Math.max(0, Math.round(delay * rate));
  }

  if (state.running && !state.hasTriggered) {
    if (state.waitSamples <= 0) {
      state.hasTriggered = true;
      state.running = false;
      state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
    } else {
      state.waitSamples -= 1;
    }
  }

  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const output = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  return output;
}
