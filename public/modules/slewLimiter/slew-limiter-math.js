// Slew Limiter — pure math (main thread JS path).
//
// Shape (0 Lin / 1 Log / 2 Exp / 3 Smooth) remaps progress through the
// current up or down segment. Times are still seconds for a full-scale (1.0)
// move. Lin keeps the classic constant |Δ| cap.

const NODE_GRAPH_SLEW_SHAPE_LIN = 0;
const NODE_GRAPH_SLEW_SHAPE_LOG = 1;
const NODE_GRAPH_SLEW_SHAPE_EXP = 2;
const NODE_GRAPH_SLEW_SHAPE_SMOOTH = 3;
const NODE_GRAPH_SLEW_CURVE_K = 3.5;

function createNodeGraphSlewLimiterState() {
  return {
    active: false,
    from: 0,
    initialized: false,
    out: 0,
    rising: true,
  };
}

function createNodeGraphStereoSlewLimiterState() {
  return {
    left: createNodeGraphSlewLimiterState(),
    mono: createNodeGraphSlewLimiterState(),
    right: createNodeGraphSlewLimiterState(),
  };
}

function nodeGraphSlewLimiterNormalizeShape(shape) {
  const n = Math.round(Number(shape));
  if (!Number.isFinite(n)) {
    return NODE_GRAPH_SLEW_SHAPE_LIN;
  }
  return Math.max(NODE_GRAPH_SLEW_SHAPE_LIN, Math.min(NODE_GRAPH_SLEW_SHAPE_SMOOTH, n));
}

/** Map linear progress 0…1 through the selected curve. */
function nodeGraphSlewLimiterApplyShape(t, shape) {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (shape === NODE_GRAPH_SLEW_SHAPE_LOG) {
    // Fast start, eases into the target.
    return 1 - Math.pow(1 - x, NODE_GRAPH_SLEW_CURVE_K);
  }
  if (shape === NODE_GRAPH_SLEW_SHAPE_EXP) {
    // Slow start, finishes quickly.
    return Math.pow(x, NODE_GRAPH_SLEW_CURVE_K);
  }
  if (shape === NODE_GRAPH_SLEW_SHAPE_SMOOTH) {
    // Slow start and end (cosine ease-in-out).
    return 0.5 - 0.5 * Math.cos(Math.PI * x);
  }
  return x;
}

function nodeGraphSlewLimiterInvertShape(u, shape) {
  const y = u <= 0 ? 0 : u >= 1 ? 1 : u;
  if (shape === NODE_GRAPH_SLEW_SHAPE_LOG) {
    return 1 - Math.pow(1 - y, 1 / NODE_GRAPH_SLEW_CURVE_K);
  }
  if (shape === NODE_GRAPH_SLEW_SHAPE_EXP) {
    return Math.pow(y, 1 / NODE_GRAPH_SLEW_CURVE_K);
  }
  if (shape === NODE_GRAPH_SLEW_SHAPE_SMOOTH) {
    return Math.acos(1 - 2 * y) / Math.PI;
  }
  return y;
}

/**
 * Rate-limit a bipolar signal toward target (seconds for full-scale rise/fall).
 * @param {number} [shape] 0 Lin / 1 Log / 2 Exp / 3 Smooth
 */
function nodeGraphSlewLimiterSample(state, input, upTime, downTime, sampleRate, shape) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const target = Number(input) || 0;
  if (!state.initialized) {
    state.initialized = true;
    state.active = false;
    state.from = target;
    state.out = target;
    state.rising = true;
    return target;
  }
  const upSeconds = Math.max(0, Number(upTime) || 0);
  const downSeconds = Math.max(0, Number(downTime) || 0);
  const delta = target - state.out;
  const rising = delta >= 0;
  const seconds = rising ? upSeconds : downSeconds;
  if (seconds <= 0) {
    state.active = false;
    state.from = target;
    state.out = target;
    state.rising = rising;
    return target;
  }

  const mode = nodeGraphSlewLimiterNormalizeShape(shape);
  if (mode === NODE_GRAPH_SLEW_SHAPE_LIN) {
    const maxStep = 1 / Math.max(1, seconds * rate);
    state.out = state.out + Math.max(-maxStep, Math.min(maxStep, delta));
    state.active = Math.abs(target - state.out) > 1e-12;
    state.rising = rising;
    if (!state.active) {
      state.from = state.out;
    }
    return state.out;
  }

  if (!state.active || rising !== state.rising) {
    state.from = state.out;
    state.rising = rising;
    state.active = true;
  }
  const span = target - state.from;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-12) {
    state.active = false;
    state.from = target;
    state.out = target;
    return target;
  }
  const linearU = (state.out - state.from) / span;
  const tau = nodeGraphSlewLimiterInvertShape(linearU, mode);
  const duration = Math.max(1e-9, Math.abs(span) * seconds);
  const nextTau = Math.min(1, tau + 1 / Math.max(1, duration * rate));
  state.out = state.from + span * nodeGraphSlewLimiterApplyShape(nextTau, mode);
  if (nextTau >= 1 - 1e-9 || Math.abs(target - state.out) <= 1e-12) {
    state.out = target;
    state.from = target;
    state.active = false;
  }
  return state.out;
}
