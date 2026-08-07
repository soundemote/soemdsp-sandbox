// Phase Disperse — cascaded 2nd-order allpass group-delay (Disperser-class).
// Flat magnitude: rearranges when frequencies arrive. Amount = stack order,
// Frequency = APF corner, Pinch = Q (concentrates group delay around f).

const NODE_GRAPH_PHASE_DISPERSE_MAX_STAGES = 64;

function createNodeGraphPhaseDisperseState() {
  const stages = [];
  for (let i = 0; i < NODE_GRAPH_PHASE_DISPERSE_MAX_STAGES; i += 1) {
    stages.push({ x1: 0, x2: 0, y1: 0, y2: 0 });
  }
  return {
    stages,
    lastF: NaN,
    lastQ: NaN,
    lastRate: NaN,
    // shared biquad coeffs (all stages identical)
    b0: 1,
    b1: 0,
    b2: 0,
    a1: 0,
    a2: 0,
  };
}

/**
 * RBJ Audio EQ Cookbook APF coeffs, a0-normalized.
 * b0 = (1-α)/(1+α), b1 = -2 cosω/(1+α), b2 = 1, a1 = b1, a2 = b0
 */
function nodeGraphPhaseDisperseEnsure(state, frequencyHz, q, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  // No musical floor — min/max are the parameter system / slider only.
  // Clamp only to (0, Nyquist) so ω/tan(ω/2) stay defined.
  const raw = Number(frequencyHz);
  const f = Math.max(0, Math.min(rate * 0.49, Number.isFinite(raw) ? raw : 100));
  const safeQ = Math.max(0.05, Math.min(40, Number(q) || 0.707));

  if (state.lastF === f && state.lastQ === safeQ && state.lastRate === rate) {
    return;
  }
  state.lastF = f;
  state.lastQ = safeQ;
  state.lastRate = rate;

  const w0 = (2 * Math.PI * f) / rate;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * safeQ);
  const a0 = 1 + alpha;
  const inv = a0 !== 0 ? 1 / a0 : 1;
  // Cookbook APF:
  // b0 = 1 - alpha, b1 = -2*cos, b2 = 1 + alpha
  // a0 = 1 + alpha, a1 = -2*cos, a2 = 1 - alpha
  state.b0 = (1 - alpha) * inv;
  state.b1 = (-2 * cosw) * inv;
  state.b2 = (1 + alpha) * inv;
  state.a1 = state.b1;
  state.a2 = state.b0;
}

function nodeGraphPhaseDisperseStage(stage, x, b0, b1, b2, a1, a2) {
  // Direct Form I allpass (or transposed DF-II style with history)
  const y = b0 * x + b1 * stage.x1 + b2 * stage.x2 - a1 * stage.y1 - a2 * stage.y2;
  stage.x2 = stage.x1;
  stage.x1 = x;
  stage.y2 = stage.y1;
  stage.y1 = Number.isFinite(y) ? y : 0;
  // denormal kill
  if (stage.y1 > -1e-30 && stage.y1 < 1e-30) stage.y1 = 0;
  return stage.y1;
}

/**
 * Pinch 0..1 → Q. Low pinch = broad group delay, high = concentrated at Frequency.
 */
function nodeGraphPhaseDispersePinchToQ(pinch) {
  const p = Math.max(0, Math.min(1, Number(pinch) || 0));
  // ~0.35 .. ~18 (musical disperser range)
  return 0.35 * Math.pow(50, p);
}

/**
 * Amount 0..1 → active stage count 1..MAX (smooth: fractional last stage blend).
 */
function nodeGraphPhaseDisperseAmountToStages(amount) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  // Mild at bottom, strong at top (up to 64 stages)
  const n = 1 + a * (NODE_GRAPH_PHASE_DISPERSE_MAX_STAGES - 1);
  return n;
}

/**
 * One sample.
 */
function nodeGraphPhaseDisperseSample(state, input, frequencyHz, amount, pinch, sampleRate) {
  if (!state || !state.stages) return Number(input) || 0;

  const q = nodeGraphPhaseDispersePinchToQ(pinch);
  nodeGraphPhaseDisperseEnsure(state, frequencyHz, q, sampleRate);

  const { b0, b1, b2, a1, a2 } = state;
  const stageCount = nodeGraphPhaseDisperseAmountToStages(amount);
  const full = Math.floor(stageCount);
  const frac = stageCount - full;

  let y = Number(input) || 0;
  const max = Math.min(NODE_GRAPH_PHASE_DISPERSE_MAX_STAGES, full);
  for (let i = 0; i < max; i += 1) {
    y = nodeGraphPhaseDisperseStage(state.stages[i], y, b0, b1, b2, a1, a2);
  }
  // Fractional next stage: wet blend of one more APF (still update state for continuity)
  if (frac > 1e-6 && full < NODE_GRAPH_PHASE_DISPERSE_MAX_STAGES) {
    const before = y;
    const after = nodeGraphPhaseDisperseStage(state.stages[full], y, b0, b1, b2, a1, a2);
    y = before + (after - before) * frac;
  }

  if (!Number.isFinite(y)) y = 0;
  if (y > -1e-30 && y < 1e-30) y = 0;
  return y;
}
