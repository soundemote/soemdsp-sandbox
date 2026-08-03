// Lorenz Attractor — pure Euler integration (main + worklet JS path).
// Mirrors native_modules/lorenz_attractor/lorenz_attractor.cpp.

function createNodeGraphLorenzAttractorJsState() {
  return {
    resetWasHigh: false,
    x: 0.1,
    y: 0,
    z: 0,
  };
}

function nodeGraphLorenzAttractorResetState(state) {
  state.x = 0.1;
  state.y = 0;
  state.z = 0;
}

/**
 * @returns {{ x: number, y: number, z: number }} normalized / rotated outputs in [-1, 1]
 */
function nodeGraphLorenzAttractorCore(state, options = {}) {
  const resetHigh = (Number(options.reset) || 0) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    nodeGraphLorenzAttractorResetState(state);
  }
  state.resetWasHigh = resetHigh;

  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const speed = Math.max(0, Number(options.speed) || 0);
  const sigma = Math.max(0, Number(options.sigma) || 10);
  const rho = Number.isFinite(Number(options.rho)) ? Number(options.rho) : 28;
  const beta = Math.max(0, Number(options.beta) || 8 / 3);
  const rotate = Number(options.rotate) || 0;
  const scale = Math.max(0, Number(options.scale) || 1);
  const zDepth = Math.max(0, Math.min(1, Number(options.zDepth) || 0));

  const dt = (0.75 * speed) / sampleRate;
  // Match native ceil(dt/0.0007) with floor of 1 (dt is always >= 0).
  let steps = Math.max(1, Math.ceil(dt / 0.0007));
  if (steps > 512) steps = 512; // pathological speed/rate safety
  const stepDt = steps > 0 ? dt / steps : 0;

  for (let i = 0; i < steps; i++) {
    const dx = sigma * (state.y - state.x);
    const dy = state.x * (rho - state.z) - state.y;
    const dz = state.x * state.y - beta * state.z;
    state.x += dx * stepDt;
    state.y += dy * stepDt;
    state.z += dz * stepDt;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.z)) {
      nodeGraphLorenzAttractorResetState(state);
      break;
    }
  }

  const rotateRad = rotate * Math.PI * 2;
  const cosRotate = Math.cos(rotateRad);
  const sinRotate = Math.sin(rotateRad);
  const normalizedX = state.x / 24;
  const normalizedY = state.y / 32;
  const normalizedZ = (state.z - 25) / 30;
  const depthScale = 1 + normalizedZ * zDepth * 0.35;
  const finalScale = scale * depthScale;
  const outX = (normalizedX * cosRotate - normalizedY * sinRotate) * finalScale;
  const outY = (normalizedX * sinRotate + normalizedY * cosRotate) * finalScale;
  const outZ = normalizedZ * finalScale;

  const clamp1 = (v) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  return {
    x: clamp1(outX),
    y: clamp1(outY),
    z: clamp1(outZ),
  };
}
