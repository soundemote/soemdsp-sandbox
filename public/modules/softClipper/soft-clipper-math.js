// Soft Clipper — tanh-shaped saturator.
// Antialias: first-order ADAA (Paschou / Parker–Zavalishin) on the same
// rational tanh the native module uses, plus a tiny Softwave-style dither.
// AA 0 = tanh only (no history). AA 1 = ADAA only. (0,1) = both, then mix.
// Clipper Limiter shares this sample + ADAA state factory.

function nodeGraphClipperDbToLin(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return 10 ** (n / 20);
}

function createNodeGraphSoftClipperChannelState() {
  return { u1: 0, F1: 0, n: 0 };
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
  const safeWidth = Math.max(0.000001, Math.abs(Number(width) || 2));
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
 * @param {{ u1: number, F1: number, n: number } | null} state
 * @param {number} antialias 0 = cheap tanh only, 1 = ADAA only, (0,1) = mix
 */
function nodeGraphSoftClipperSample(input, center = 0, width = 2, state = null, antialias = 0) {
  const aa = Math.max(0, Math.min(1, Number(antialias) || 0));
  const { scaleX, shiftX, scaleY, shiftY } = nodeGraphSoftClipperShaperCoeffs(center, width);
  let x = Number(input) || 0;
  if (aa <= 0 || !state) {
    return nodeGraphSoftClipperEvalAt(scaleX * x + shiftX, scaleY, shiftY);
  }
  state.n = (state.n + 1) | 0;
  // Softwave uses aa * 0.0005 * sin(phase·97.13). Same depth, hash instead of phase.
  x += aa * 0.0005 * nodeGraphSoftClipperHashBipolar(state.n, 0x51ed);
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
  const adaaY = shiftY + scaleY * adaaF;
  if (aa >= 1) {
    return adaaY;
  }
  const y = nodeGraphSoftClipperEvalAt(u, scaleY, shiftY);
  return y + aa * (adaaY - y);
}

/**
 * Mono sums into L/R before clip (same port contract as Gain / Bias).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphSoftClipperFrame(mono, left, right, center, width, state = null, antialias = 0, gainDb = 0) {
  const drive = nodeGraphClipperDbToLin(gainDb);
  const m = (Number(mono) || 0) * drive;
  const st = state || null;
  return {
    Out: nodeGraphSoftClipperSample(m, center, width, st?.mono, antialias),
    Left: nodeGraphSoftClipperSample((Number(left) || 0) * drive + m, center, width, st?.left, antialias),
    Right: nodeGraphSoftClipperSample((Number(right) || 0) * drive + m, center, width, st?.right, antialias),
  };
}
