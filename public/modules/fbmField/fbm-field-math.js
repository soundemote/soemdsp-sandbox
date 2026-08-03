// FBM Field — pure 2D value-noise fractal (main + worklet).
// Same family as fractalBrownianNoise (smooth lattice + octave stack),
// extended to 2D so the face texture and X/Y outs share one field.

function createNodeGraphFbmFieldState() {
  return {
    resetWasHigh: false,
    time: 0,
  };
}

function nodeGraphFbmFieldHashBipolar(ix, iy, seed) {
  let value = (Math.imul(Math.trunc(ix), 374761393)
    ^ Math.imul(Math.trunc(iy), 668265263)
    ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
}

/** Smoothstep blend controlled by smoothness 0…1 (linear → hermite → quintic). */
function nodeGraphFbmFieldFade(t, smoothness) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  const s = Math.max(0, Math.min(1, Number(smoothness) || 0));
  if (s <= 0) {
    return x;
  }
  const hermite = x * x * (3 - 2 * x);
  if (s <= 0.5) {
    const u = s * 2;
    return x + (hermite - x) * u;
  }
  const quintic = x * x * x * (x * (x * 6 - 15) + 10);
  const u = (s - 0.5) * 2;
  return hermite + (quintic - hermite) * u;
}

/**
 * Bipolar value noise in 2D (−1…1).
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 * @param {number} smoothness 0…1
 */
function nodeGraphFbmFieldValueNoise2d(x, y, seed, smoothness) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = nodeGraphFbmFieldFade(fx, smoothness);
  const v = nodeGraphFbmFieldFade(fy, smoothness);
  const a = nodeGraphFbmFieldHashBipolar(x0, y0, seed);
  const b = nodeGraphFbmFieldHashBipolar(x0 + 1, y0, seed);
  const c = nodeGraphFbmFieldHashBipolar(x0, y0 + 1, seed);
  const d = nodeGraphFbmFieldHashBipolar(x0 + 1, y0 + 1, seed);
  const x1 = a + (b - a) * u;
  const x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}

/**
 * Normalize field params (shared by face + DSP).
 */
function nodeGraphFbmFieldNormalizeParams(params = {}) {
  const seed = Math.max(0, Math.round(Number(params.seed) || 0));
  const octaves = Math.max(1, Math.min(8, Math.round(Number(params.octaves) || 4)));
  const persistence = Math.max(0, Math.min(0.99, Number(params.persistence) || 0.5));
  const lacunarity = Math.max(1, Math.min(4, Number(params.lacunarity) || 2));
  const scale = Math.max(0.000001, Number(params.scale) || 1);
  const smoothness = Math.max(0, Math.min(1, Number(params.smoothness) || 0.5));
  const contrast = Math.max(0, Math.min(4, Number(params.contrast) || 1));
  const level = Number.isFinite(Number(params.level)) ? Number(params.level) : 1;
  const zoom = Math.max(0.05, Number(params.zoom) || 1);
  const panX = Number(params.panX) || 0;
  const panY = Number(params.panY) || 0;
  const rotate = Number(params.rotate) || 0;
  const frequency = Math.max(0, Number(params.frequency) || 0);
  const speed = Number.isFinite(Number(params.speed)) ? Number(params.speed) : 0.15;
  return {
    seed,
    octaves,
    persistence,
    lacunarity,
    scale,
    smoothness,
    contrast,
    level,
    zoom,
    panX,
    panY,
    rotate,
    frequency,
    speed,
  };
}

/**
 * Fractal Brownian field sample (bipolar −1…1 before level).
 * @param {number} x world X
 * @param {number} y world Y
 * @param {object} p normalized or raw params
 */
function nodeGraphFbmFieldSample2d(x, y, params = {}) {
  const p = params._normalized ? params : nodeGraphFbmFieldNormalizeParams(params);
  let total = 0;
  let amplitude = 1;
  let noiseFrequency = 1;
  let maxValue = 0;
  const baseSeed = p.seed * 1009 + 17;
  for (let i = 0; i < p.octaves; i += 1) {
    const sx = x * p.scale * noiseFrequency;
    const sy = y * p.scale * noiseFrequency;
    total += nodeGraphFbmFieldValueNoise2d(sx, sy, baseSeed + i * 1013, p.smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= p.persistence;
    noiseFrequency *= p.lacunarity;
  }
  const normalized = maxValue > 0 ? total / maxValue : 0;
  return Number.isFinite(normalized) ? normalized : 0;
}

/**
 * Mono energy 0…1 for gradient (applies contrast around mid-grey).
 */
function nodeGraphFbmFieldToMono(bipolar, contrast = 1) {
  const mid = (Number(bipolar) || 0) * 0.5 + 0.5;
  const c = Math.max(0, Number(contrast) || 1);
  if (c === 1) {
    return Math.max(0, Math.min(1, mid));
  }
  const shaped = 0.5 + (mid - 0.5) * c;
  return Math.max(0, Math.min(1, shaped));
}

/**
 * Sample field at face UV (0…1), with pan/zoom/rotate and optional time scroll.
 * @returns {number} mono 0…1
 */
function nodeGraphFbmFieldFaceMono(u, v, params = {}, time = 0) {
  const p = nodeGraphFbmFieldNormalizeParams(params);
  const nx = (Number(u) || 0) - 0.5;
  const ny = (Number(v) || 0) - 0.5;
  const rot = (p.rotate || 0) * Math.PI * 2;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const rx = nx * cosR - ny * sinR;
  const ry = nx * sinR + ny * cosR;
  const span = 1 / Math.max(0.05, p.zoom);
  const wx = rx * span + p.panX + (Number(time) || 0) * p.speed;
  const wy = ry * span + p.panY + (Number(time) || 0) * p.speed * 0.73;
  const bipolar = nodeGraphFbmFieldSample2d(wx, wy, { ...p, _normalized: true });
  return nodeGraphFbmFieldToMono(bipolar, p.contrast);
}

/**
 * Advance time + sample X/Y noise from the same 2D field.
 * X samples along (t, 0); Y along (0, t) so both live in the visible field.
 * @returns {{ X: number, Y: number, "X Raw": number, "Y Raw": number }}
 */
function nodeGraphFbmFieldVector(state, params, sampleRate, reset = 0) {
  const p = nodeGraphFbmFieldNormalizeParams(params);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const resetHigh = Number(reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.time = 0;
  }
  state.resetWasHigh = resetHigh;

  const t = Number(state.time) || 0;
  // Domain path through the field (matches face zoom/pan origin).
  const pathScale = 1 / Math.max(0.05, p.zoom);
  const xRaw = nodeGraphFbmFieldSample2d(
    t * pathScale + p.panX,
    p.panY,
    { ...p, _normalized: true },
  );
  const yRaw = nodeGraphFbmFieldSample2d(
    p.panX,
    t * pathScale + p.panY,
    { ...p, _normalized: true },
  );
  state.time = t + p.frequency / rate;

  const x = xRaw * p.level;
  const y = yRaw * p.level;
  return {
    X: Number.isFinite(x) ? x : 0,
    Y: Number.isFinite(y) ? y : 0,
    "X Raw": Number.isFinite(xRaw) ? xRaw : 0,
    "Y Raw": Number.isFinite(yRaw) ? yRaw : 0,
  };
}
