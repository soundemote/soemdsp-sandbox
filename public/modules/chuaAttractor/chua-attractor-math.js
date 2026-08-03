// Chua Attractor — pure Euler integration (main + worklet JS path).
// Mirrors native_modules/chua_attractor/chua_attractor.cpp.

function createNodeGraphChuaAttractorJsState() {
  return {
    resetWasHigh: false,
    x: 0.1,
    y: 0,
    z: 0,
  };
}

function nodeGraphChuaAttractorResetState(state) {
  state.x = 0.1;
  state.y = 0;
  state.z = 0;
}

/** Chua diode piecewise-linear nonlinearity. */
function nodeGraphChuaDiode(x, m0, m1) {
  const ax1 = Math.abs(x + 1);
  const ax2 = Math.abs(x - 1);
  return m1 * x + 0.5 * (m0 - m1) * (ax1 - ax2);
}

/**
 * @returns {{ x: number, y: number, z: number }} scaled outputs in [-1, 1]
 */
function nodeGraphChuaAttractorCore(state, options = {}) {
  const resetHigh = (Number(options.reset) || 0) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    nodeGraphChuaAttractorResetState(state);
  }
  state.resetWasHigh = resetHigh;

  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const speed = Math.max(0, Number(options.speed) || 0);
  const alpha = Number(options.alpha) || 0;
  const beta = Number(options.beta) || 0;
  const m0 = Number(options.m0) || 0;
  const m1 = Number(options.m1) || 0;

  const dt = (0.6 * speed) / sampleRate;
  let steps = Math.floor(dt / 0.0004);
  if (steps < 1) steps = 1;
  if (steps > 512) steps = 512;
  const stepDt = steps > 0 ? dt / steps : 0;

  for (let i = 0; i < steps; i++) {
    const fx = nodeGraphChuaDiode(state.x, m0, m1);
    const dx = alpha * (state.y - state.x - fx);
    const dy = state.x - state.y + state.z;
    const dz = -beta * state.y;
    state.x += dx * stepDt;
    state.y += dy * stepDt;
    state.z += dz * stepDt;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.z)) {
      nodeGraphChuaAttractorResetState(state);
      break;
    }
  }

  const clamp20 = (v) => Math.max(-20, Math.min(20, Number.isFinite(v) ? v : 0));
  state.x = clamp20(state.x);
  state.y = clamp20(state.y);
  state.z = clamp20(state.z);

  const clamp1 = (v) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return {
    x: clamp1(state.x / 2),
    y: clamp1(state.y / 0.5),
    z: clamp1(state.z / 3.5),
  };
}
