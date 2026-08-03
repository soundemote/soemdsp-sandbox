// Soft Fractal audio: map oscillator only.
//   Hx/Hy = Re/Im of z ← z² + c(θ)  (real quadratic-map chaos)
//   c(θ)  = pure planetary: Seed + R·(cos θ, sin θ) — no multi-sine wander.

const NODE_GRAPH_RGB_FRACTAL_AUDIO_LOCI = Object.freeze([
  Object.freeze({ x: -0.74543, y: 0.11301 }),
  Object.freeze({ x: -0.123, y: 0.745 }),
  Object.freeze({ x: -0.75, y: 0.11 }),
  Object.freeze({ x: -0.8, y: 0.156 }),
  Object.freeze({ x: 0.285, y: 0.01 }),
  Object.freeze({ x: -0.7269, y: 0.1889 }),
  Object.freeze({ x: 0.0, y: 0.8 }),
  Object.freeze({ x: -0.162, y: 1.04 }),
  Object.freeze({ x: -1.476, y: 0.0 }),
  Object.freeze({ x: -0.391, y: -0.587 }),
  Object.freeze({ x: -0.4, y: 0.6 }),
  Object.freeze({ x: 0.37, y: 0.1 }),
  Object.freeze({ x: -0.70176, y: -0.3842 }),
  Object.freeze({ x: -0.235125, y: 0.827215 }),
  Object.freeze({ x: 0.355, y: 0.355 }),
  Object.freeze({ x: -0.75, y: 0.05 }),
  Object.freeze({ x: -0.12, y: 0.77 }),
  Object.freeze({ x: -0.11, y: 0.6557 }),
  Object.freeze({ x: -0.75, y: 0.15 }),
  Object.freeze({ x: 0.28, y: 0.53 }),
  Object.freeze({ x: -0.16, y: 1.037 }),
  Object.freeze({ x: -0.7269, y: 0.1889 }),
  Object.freeze({ x: -0.74529, y: 0.11307 }),
  Object.freeze({ x: 0.32, y: 0.043 }),
]);

const NODE_GRAPH_RGB_FRACTAL_AUDIO_SILENCE = Object.freeze({ Hx: 0, Hy: 0 });

/** Max map steps per sample (pathological rate safety). */
const NODE_GRAPH_RGB_FRACTAL_OSC_MAX_STEPS = 24;
/** Bailout radius² — reseed when orbit escapes. */
const NODE_GRAPH_RGB_FRACTAL_OSC_BAILOUT2 = 16;

function createNodeGraphRgbFractalAudioState() {
  return {
    orbitPhasor: 0,
    zx: 0.12,
    zy: 0.07,
    mapPhase: 0,
    dcRe: 0,
    dcIm: 0,
    stepCount: 0,
    hasStarted: false,
  };
}

function nodeGraphRgbFractalClamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Continuous sample of locus ring at s∈[0,1) — Catmull–Rom. */
function nodeGraphRgbFractalAudioSampleLocus(loci, s01) {
  const n = loci.length;
  if (!(n > 0)) return { x: 0, y: 0 };
  const u = (((s01 % 1) + 1) % 1) * n;
  const i1 = Math.floor(u) % n;
  const t = u - Math.floor(u);
  const i0 = (i1 - 1 + n) % n;
  const i2 = (i1 + 1) % n;
  const i3 = (i1 + 2) % n;
  const p0 = loci[i0];
  const p1 = loci[i1];
  const p2 = loci[i2];
  const p3 = loci[i3];
  const t2 = t * t;
  const t3 = t2 * t;
  const x = 0.5 * (
    (2 * p1.x)
    + (-p0.x + p2.x) * t
    + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
    + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );
  const y = 0.5 * (
    (2 * p1.y)
    + (-p0.y + p2.y) * t
    + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
    + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
  return { x, y };
}

/**
 * Pure planetary c(t): Seed family center + single forward circular orbit.
 * No multi-sine wander — modulate Seed / Orbit Size / Speed externally if wanted.
 */
function nodeGraphRgbFractalAudioComputeC(seed, tOrbit, orbitSize) {
  const loci = NODE_GRAPH_RGB_FRACTAL_AUDIO_LOCI;
  const seed01 = ((seed % 1) + 1) % 1;
  const base = nodeGraphRgbFractalAudioSampleLocus(loci, seed01);
  const size = Number(orbitSize);
  const rad = (Number.isFinite(size) ? Math.max(0, size) : 0) * 0.028;
  const theta = tOrbit;
  return {
    cx: base.x + rad * Math.cos(theta),
    cy: base.y + rad * Math.sin(theta),
  };
}

function nodeGraphRgbFractalAudioAdvancePhasors(state, params, dt) {
  const speed = Number(params.speed);
  const rate = Number.isFinite(speed) ? speed : 0;
  if (!(Math.abs(rate) > 1e-6) || !(dt > 0)) return;
  state.orbitPhasor += rate * 0.32 * dt;
}

function nodeGraphRgbFractalAudioReseedZ(state, seed, stepCount, detune, orbitPhase) {
  // Reseed on bailout — angle mixes seed, step count, detune, orbit phase (not multi-sine on c).
  const d = Math.max(0, Number(detune) || 0);
  const a = seed * 6.28318
    + stepCount * (0.6180339887 + d * 0.271828)
    + (Number(orbitPhase) || 0) * (0.13 + d * 0.07);
  const r = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(stepCount * (0.31 + d * 0.11) + seed * 4));
  state.zx = r * Math.cos(a);
  state.zy = r * Math.sin(a * (1.17 + d * 0.19) + 0.4);
}

function nodeGraphRgbFractalAudioMapStep(state, cx, cy, seed, detune, orbitPhase) {
  const zx = Number(state.zx) || 0;
  const zy = Number(state.zy) || 0;
  const d = Math.max(0, Number(detune) || 0);
  // Tiny state-space kick so short cycles slip (map dynamics, not c multi-LFO).
  const k = d * 1.2e-4;
  const sc = Number(state.stepCount) || 0;
  const px = zx + k * Math.sin(sc * 1.6180339887 + seed * 3.1);
  const py = zy + k * Math.cos(sc * 2.4142135623 - seed * 2.7);
  const nx = px * px - py * py + cx;
  const ny = 2 * px * py + cy;
  state.stepCount = sc + 1;
  if (!(Number.isFinite(nx) && Number.isFinite(ny)) || nx * nx + ny * ny > NODE_GRAPH_RGB_FRACTAL_OSC_BAILOUT2) {
    nodeGraphRgbFractalAudioReseedZ(state, seed, state.stepCount, d, orbitPhase);
    return;
  }
  state.zx = nx;
  state.zy = ny;
}

/**
 * Hard Hx/Hy = Re/Im of quadratic map z ← z² + pure planetary c.
 * @returns {{ Hx: number, Hy: number }}
 */
function nodeGraphRgbFractalAudioSample(state, params, _input, sampleRate) {
  if (!state || typeof state !== "object") {
    return { ...NODE_GRAPH_RGB_FRACTAL_AUDIO_SILENCE };
  }
  const p = params || {};
  const seed = (((Number(p.seed) || 0) % 1) + 1) % 1;
  const detune = Math.max(0, Number(p.detune) || 0);
  if (!state.hasStarted) {
    state.hasStarted = true;
    nodeGraphRgbFractalAudioReseedZ(state, seed, 0, detune, 0);
    state.mapPhase = 0;
    state.dcRe = 0;
    state.dcIm = 0;
  }

  const sr = Math.max(1, Number(sampleRate) || 44100);
  nodeGraphRgbFractalAudioAdvancePhasors(state, p, 1 / sr);

  const orbitSize = Number.isFinite(Number(p.orbitSize)) ? Number(p.orbitSize) : 1;
  const theta = Number(state.orbitPhasor) || 0;
  const { cx, cy } = nodeGraphRgbFractalAudioComputeC(seed, theta, orbitSize);

  const speed = Number(p.speed);
  const speedAbs = Number.isFinite(speed) ? Math.abs(speed) : 0;
  // At Speed 1 ≈ 180 map steps/sec; detune slightly skews rate so periods slip.
  const iterHz = speedAbs * 180 * (1 + detune * 0.17);
  if (iterHz > 0) {
    state.mapPhase = (Number(state.mapPhase) || 0) + iterHz / sr;
    let steps = 0;
    while (state.mapPhase >= 1 && steps < NODE_GRAPH_RGB_FRACTAL_OSC_MAX_STEPS) {
      state.mapPhase -= 1;
      steps += 1;
      nodeGraphRgbFractalAudioMapStep(state, cx, cy, seed, detune, theta);
    }
    if (state.mapPhase >= 1) {
      state.mapPhase = state.mapPhase % 1;
    }
  }

  let re = Number(state.zx);
  let im = Number(state.zy);
  if (!Number.isFinite(re)) re = 0;
  if (!Number.isFinite(im)) im = 0;

  const dcR = Number(state.dcRe) || 0;
  const dcI = Number(state.dcIm) || 0;
  state.dcRe = dcR * 0.9992 + re * 0.0008;
  state.dcIm = dcI * 0.9992 + im * 0.0008;
  re -= state.dcRe;
  im -= state.dcIm;

  const hx = Math.tanh(re * 1.35) * 0.85;
  const hy = Math.tanh(im * 1.35) * 0.85;

  return {
    Hx: Number.isFinite(hx) ? hx : 0,
    Hy: Number.isFinite(hy) ? hy : 0,
  };
}
