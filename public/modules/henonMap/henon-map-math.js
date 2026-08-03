// Henon Map — pure discrete iteration (main + worklet JS path).
// x' = 1 − a x² + y;  y' = b x. Steps at `rate` Hz.

function createNodeGraphHenonMapJsState() {
  return {
    hasStarted: false,
    phase: 0,
    x: 0,
    y: 0,
  };
}

/**
 * @returns {{ x: number, y: number }}
 */
function nodeGraphHenonMapCore(state, options = {}) {
  const reset = Number(options.reset) > 0;
  const rate = Math.max(0, Number(options.rate) || 0);
  const a = Math.max(0, Math.min(2, Number(options.a) || 0));
  const b = Math.max(-1, Math.min(1, Number(options.b) || 0));
  const seedX = Number(options.seedX) || 0;
  const seedY = Number(options.seedY) || 0;
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);

  if (reset || !state.hasStarted) {
    state.x = seedX;
    state.y = seedY;
    state.phase = 0;
    state.hasStarted = true;
    if (reset) {
      return { x: state.x, y: state.y };
    }
  }

  if (rate > 0) {
    state.phase += rate / sampleRate;
    // Cap steps so pathological rates cannot freeze the frame.
    let steps = 0;
    while (state.phase >= 1 && steps < 64) {
      state.phase -= 1;
      steps += 1;
      const nx = 1 - a * state.x * state.x + state.y;
      const ny = b * state.x;
      state.x = Number.isFinite(nx) ? nx : 0;
      state.y = Number.isFinite(ny) ? ny : 0;
    }
    if (state.phase >= 1) {
      state.phase = state.phase % 1;
    }
  }

  return {
    x: Number.isFinite(state.x) ? state.x : 0,
    y: Number.isFinite(state.y) ? state.y : 0,
  };
}
