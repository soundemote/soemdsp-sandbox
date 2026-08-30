// Logistic Map — pure discrete iteration (main + worklet JS path).
// x' = r x (1 − x), stepped at `rate` Hz. Output bipolar: (2x − 1) * level.
// Mirrors native_modules/logistic_map/logistic_map.cpp.

function createNodeGraphLogisticMapJsState() {
  return {
    hasStarted: false,
    phase: 0,
    x: 0.5,
  };
}

/**
 * @returns {number} bipolar scaled sample
 */
function nodeGraphLogisticMapCore(state, options = {}) {
  const reset = Number(options.reset) > 0;
  const rate = Math.max(0, Number(options.rate) || 0);
  const r = Math.max(0, Math.min(4, Number(options.r) || 0));
  const seed = Math.max(0.0001, Math.min(0.9999, nodeGraphFiniteNumber(options.seed, 0.5)));
  const level = Number(options.level) || 0;
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);

  if (reset || !state.hasStarted) {
    state.x = seed;
    state.phase = 0;
    state.hasStarted = true;
  }

  if (!reset && rate > 0) {
    state.phase += rate / sampleRate;
    // Cap steps so pathological rates cannot freeze the frame.
    let steps = 0;
    while (state.phase >= 1 && steps < 64) {
      state.phase -= 1;
      steps += 1;
      const nx = r * state.x * (1 - state.x);
      state.x = Number.isFinite(nx) ? Math.max(0, Math.min(1, nx)) : 0;
    }
    if (state.phase >= 1) {
      // Match native: drop remainder when rate is absurdly high.
      state.phase = 0;
    }
  }

  const x = Number.isFinite(state.x) ? state.x : 0;
  const bipolar = x * 2 - 1;
  const out = bipolar * level;
  return Number.isFinite(out) ? out : 0;
}
