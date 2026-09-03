// Soft Clipper — tanh-shaped saturator.
// Oversample: 0 = original tanh (no AA). 1 = first-order ADAA at 1×.
// 2 = causal 2× (linear mid + current, ADAA at 2×, average). No extra delay.
// Clipper Limiter shares this sample + state factory.

function nodeGraphClipperDbToLin(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return 10 ** (n / 20);
}

function createNodeGraphSoftClipperChannelState() {
  // F1 must start at ∫tanhApprox(0)=(4/3)ln(3) so the first ADAA step is not (F-0)/du.
  return {
    u1: 0,
    F1: (4 / 3) * Math.log(3),
    n: 0,
    x1: 0,
    hasX: false,
  };
}

function nodeGraphSoftClipperOversampleMode(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return n >= 2 ? 2 : 1;
}

function createNodeGraphSoftClipperState() {
  return {
    mono: createNodeGraphSoftClipperChannelState(),
    left: createNodeGraphSoftClipperChannelState(),
    right: createNodeGraphSoftClipperChannelState(),
  };
}

/** Same odd sigmoid as native soft_clipper.cpp (wasm32, no libm tanh). */
function nodeGraphSoftClipperTanhApprox(value) {
  const x = Number(value) || 0;
  const x2 = x * x;
  const den = 27 + 9 * x2;
  return den <= 0 ? 0 : (x * (27 + x2)) / den;
}

/** ∫ tanhApprox(x) dx = x²/18 + (4/3) ln(x²+3) */
function nodeGraphSoftClipperTanhAntideriv(value) {
  const x = Number(value) || 0;
  return (x * x) / 18 + (4 / 3) * Math.log(x * x + 3);
}

/** Murmur-style bipolar hash — matches native hash_bipolar. */
function nodeGraphSoftClipperHashBipolar(index, seed) {
  let value = (index ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 4294967295) * 2 - 1;
}

function nodeGraphSoftClipperShaperCoeffs(center, width) {
  const safeWidth = Math.max(0.000001, Math.abs(nodeGraphFiniteNumber(width, 2)));
  const safeCenter = Number(center) || 0;
  const scaleX = 2 / safeWidth;
  const shiftX = -1 - (scaleX * (safeCenter - 0.5 * safeWidth));
  const scaleY = 1 / scaleX;
  const shiftY = -shiftX * scaleY;
  return { scaleX, shiftX, scaleY, shiftY };
}

function nodeGraphSoftClipperEvalAt(u, scaleY, shiftY) {
  return shiftY + scaleY * nodeGraphSoftClipperTanhApprox(u);
}

/**
 * One shaped sample. useAdaa=false is the original tanh (x0).
 * @param {{ u1: number, F1: number, n: number } | null} state
 */
function nodeGraphSoftClipperShape(input, center, width, state, useAdaa) {
  const { scaleX, shiftX, scaleY, shiftY } = nodeGraphSoftClipperShaperCoeffs(center, width);
  let x = Number(input) || 0;
  if (!useAdaa || !state) {
    return nodeGraphSoftClipperEvalAt(scaleX * x + shiftX, scaleY, shiftY);
  }
  state.n = (state.n + 1) | 0;
  x += 0.0005 * nodeGraphSoftClipperHashBipolar(state.n, 0x51ed);
  const u = scaleX * x + shiftX;
  const Fu = nodeGraphSoftClipperTanhAntideriv(u);
  const du = u - state.u1;
  let adaaF;
  if (Math.abs(du) < 1e-5) {
    adaaF = nodeGraphSoftClipperTanhApprox((u + state.u1) * 0.5);
  } else {
    adaaF = (Fu - state.F1) / du;
  }
  state.u1 = u;
  state.F1 = Fu;
  return shiftY + scaleY * adaaF;
}

/**
 * @param {number} oversample 0 = original, 1 = ADAA, 2 = causal 2× + ADAA
 */
function nodeGraphSoftClipperSample(input, center = 0, width = 2, state = null, oversample = 0) {
  const mode = nodeGraphSoftClipperOversampleMode(oversample);
  const x = Number(input) || 0;
  if (mode <= 0 || !state) {
    if (state) {
      state.x1 = x;
      state.hasX = true;
    }
    return nodeGraphSoftClipperShape(x, center, width, null, false);
  }
  if (mode === 1) {
    const y = nodeGraphSoftClipperShape(x, center, width, state, true);
    state.x1 = x;
    state.hasX = true;
    return y;
  }
  const mid = state.hasX ? (state.x1 + x) * 0.5 : x;
  const y0 = nodeGraphSoftClipperShape(mid, center, width, state, true);
  const y1 = nodeGraphSoftClipperShape(x, center, width, state, true);
  state.x1 = x;
  state.hasX = true;
  return (y0 + y1) * 0.5;
}

/**
 * Mono sums into L/R before clip (same port contract as Gain / Bias).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphSoftClipperFrame(mono, left, right, center, width, state = null, oversample = 2, gainDb = 0) {
  const drive = nodeGraphClipperDbToLin(gainDb);
  const m = (Number(mono) || 0) * drive;
  const st = state || null;
  return {
    Out: nodeGraphSoftClipperSample(m, center, width, st?.mono, oversample),
    Left: nodeGraphSoftClipperSample((Number(left) || 0) * drive + m, center, width, st?.left, oversample),
    Right: nodeGraphSoftClipperSample((Number(right) || 0) * drive + m, center, width, st?.right, oversample),
  };
}
