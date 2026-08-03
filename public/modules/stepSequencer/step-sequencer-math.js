// Step Sequencer — pure math (main thread + worklet JS path).

function createNodeGraphStepSequencerState() {
  return {
    gate: 0,
    index: 0,
    lastReset: 0,
    lastTrigger: 0,
    out: 0,
  };
}

/**
 * @returns {{ Gate: number, Out: number }}
 */
function nodeGraphStepSequencerCore(state, trigger, reset, params) {
  const safeTrigger = Number(trigger) || 0;
  const safeReset = Number(reset) || 0;
  const threshold = Number(params?.threshold) || 0;
  const stepCount = Math.max(1, Math.min(8, Math.round(Number(params?.steps) || 1)));
  const level = Number(params?.level) || 0;
  const values = Array.isArray(params?.values)
    ? params.values.map((v) => Number(v) || 0)
    : [0, 0, 0, 0, 0, 0, 0, 0];
  while (values.length < 8) values.push(0);

  if (state.index >= stepCount) {
    state.index %= stepCount;
  }
  if (state.lastReset <= threshold && safeReset > threshold) {
    state.index = 0;
    state.out = values[0] || 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.out = values[state.index] || 0;
    state.index = (state.index + 1) % stepCount;
  }
  state.gate = safeTrigger > threshold ? 1 : 0;
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  return {
    Gate: state.gate,
    Out: (Number(state.out) || 0) * level,
  };
}
