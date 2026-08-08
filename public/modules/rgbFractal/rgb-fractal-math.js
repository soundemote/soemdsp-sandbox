// Soft Fractal audio: map oscillator only.
//   Hx/Hy = Re/Im of z ← z² + c(θ)  (real quadratic-map chaos)
//   c(θ)  = pure planetary: Seed + R·(cos θ, sin θ) — no multi-sine wander.
//   Map-step jumps are PolyBLEP'd in the output domain (variable-amplitude edges).

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
/** tanh scale / post-gain for Hx/Hy (shared by project + BLEP deltas). */
const NODE_GRAPH_RGB_FRACTAL_OUT_SCALE = 1.35;
const NODE_GRAPH_RGB_FRACTAL_OUT_GAIN = 0.85;

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
    // Last map-step jump in output domain (for pre-edge PolyBLEP lobe).
    lastDeltaHx: 0,
    lastDeltaHy: 0,
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
 * No multi-sine wander — modulate C / Orbit Size / Orbit Speed / Speed externally if wanted.
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
  const orbitSpeedRaw = Number(params.orbitSpeed);
  const orbitSpeed = Number.isFinite(orbitSpeedRaw) ? Math.max(0, orbitSpeedRaw) : 1;
  const master = Number.isFinite(speed) ? speed : 0;
  // c-walk only: Speed × Orbit Speed (map step rate stays Speed-only in AudioSample).
  const rate = master * orbitSpeed;
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

/**
 * 2-point PolyBLEP residual for a unit discontinuity in phase domain.
 * t = phase in [0,1), dt = phase increment this sample.
 * Same kernel as classic saw/square PolyBLEP (Välimäki / Finké).
 */
function nodeGraphRgbFractalPolyBlep(t, dt) {
  if (!(dt > 1e-12) || !Number.isFinite(t)) return 0;
  const phase = t - Math.floor(t);
  if (phase < dt) {
    const x = phase / dt;
    return x + x - x * x - 1;
  }
  if (phase > 1 - dt) {
    const x = (phase - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Project complex z through DC-ish offset + tanh to Hx/Hy domain (for jump deltas). */
function nodeGraphRgbFractalAudioProjectOut(re, im, dcRe, dcIm) {
  const hx = Math.tanh((re - dcRe) * NODE_GRAPH_RGB_FRACTAL_OUT_SCALE) * NODE_GRAPH_RGB_FRACTAL_OUT_GAIN;
  const hy = Math.tanh((im - dcIm) * NODE_GRAPH_RGB_FRACTAL_OUT_SCALE) * NODE_GRAPH_RGB_FRACTAL_OUT_GAIN;
  return {
    hx: Number.isFinite(hx) ? hx : 0,
    hy: Number.isFinite(hy) ? hy : 0,
  };
}

/**
 * Pure one map iterate (or reseed) from a z snapshot — does not mutate state.
 * Used for committed steps and for peeking the next jump height (pre-edge BLEP).
 */
function nodeGraphRgbFractalAudioIterateZ(zx, zy, stepCount, cx, cy, seed, detune, orbitPhase) {
  const d = Math.max(0, Number(detune) || 0);
  const k = d * 1.2e-4;
  const sc = Number(stepCount) || 0;
  const px = (Number(zx) || 0) + k * Math.sin(sc * 1.6180339887 + seed * 3.1);
  const py = (Number(zy) || 0) + k * Math.cos(sc * 2.4142135623 - seed * 2.7);
  const nx = px * px - py * py + cx;
  const ny = 2 * px * py + cy;
  const nextCount = sc + 1;
  if (!(Number.isFinite(nx) && Number.isFinite(ny)) || nx * nx + ny * ny > NODE_GRAPH_RGB_FRACTAL_OSC_BAILOUT2) {
    // Match reseed formula (stateless).
    const a = seed * 6.28318
      + nextCount * (0.6180339887 + d * 0.271828)
      + (Number(orbitPhase) || 0) * (0.13 + d * 0.07);
    const r = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(nextCount * (0.31 + d * 0.11) + seed * 4));
    return {
      zx: r * Math.cos(a),
      zy: r * Math.sin(a * (1.17 + d * 0.19) + 0.4),
      stepCount: nextCount,
      reseeded: true,
    };
  }
  return { zx: nx, zy: ny, stepCount: nextCount, reseeded: false };
}

function nodeGraphRgbFractalAudioMapStep(state, cx, cy, seed, detune, orbitPhase) {
  const next = nodeGraphRgbFractalAudioIterateZ(
    state.zx,
    state.zy,
    state.stepCount,
    cx,
    cy,
    seed,
    detune,
    orbitPhase,
  );
  state.zx = next.zx;
  state.zy = next.zy;
  state.stepCount = next.stepCount;
  return next;
}

/**
 * Hx/Hy = Re/Im of quadratic map z ← z² + pure planetary c,
 * with PolyBLEP on map-step (and bailout reseed) discontinuities.
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
    state.lastDeltaHx = 0;
    state.lastDeltaHy = 0;
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
  const dt = iterHz > 0 ? iterHz / sr : 0;

  const dcR = Number(state.dcRe) || 0;
  const dcI = Number(state.dcIm) || 0;

  // PolyBLEP accumulation in output domain (post-tanh jump heights).
  let blepHx = 0;
  let blepHy = 0;
  let steps = 0;

  if (dt > 0) {
    state.mapPhase = (Number(state.mapPhase) || 0) + dt;

    // Pre-edge lobe: if we are about to wrap, peek the true next jump height
    // so the sample(s) before the discontinuity get the correct residual.
    // (Using lastDelta alone would lag one chaos event.)
    if (state.mapPhase < 1 && state.mapPhase >= 1 - dt) {
      const peek = nodeGraphRgbFractalAudioIterateZ(
        state.zx,
        state.zy,
        state.stepCount,
        cx,
        cy,
        seed,
        detune,
        theta,
      );
      const beforePeek = nodeGraphRgbFractalAudioProjectOut(state.zx, state.zy, dcR, dcI);
      const afterPeek = nodeGraphRgbFractalAudioProjectOut(peek.zx, peek.zy, dcR, dcI);
      const dHx = afterPeek.hx - beforePeek.hx;
      const dHy = afterPeek.hy - beforePeek.hy;
      const pb = nodeGraphRgbFractalPolyBlep(state.mapPhase, dt);
      blepHx += pb * (dHx * 0.5);
      blepHy += pb * (dHy * 0.5);
    }

    while (state.mapPhase >= 1 && steps < NODE_GRAPH_RGB_FRACTAL_OSC_MAX_STEPS) {
      state.mapPhase -= 1;
      steps += 1;
      const before = nodeGraphRgbFractalAudioProjectOut(state.zx, state.zy, dcR, dcI);
      nodeGraphRgbFractalAudioMapStep(state, cx, cy, seed, detune, theta);
      const after = nodeGraphRgbFractalAudioProjectOut(state.zx, state.zy, dcR, dcI);
      const dHx = after.hx - before.hx;
      const dHy = after.hy - before.hy;
      state.lastDeltaHx = dHx;
      state.lastDeltaHy = dHy;

      // Single step/sample: full 2-point residual at post-wrap phase.
      // Multi-step: map is faster than audio — BLEP degrades; keep only the
      // last event's residual (applied after the loop with final phase).
      if (steps === 1) {
        const pb = nodeGraphRgbFractalPolyBlep(state.mapPhase, dt);
        blepHx += pb * (dHx * 0.5);
        blepHy += pb * (dHy * 0.5);
      }
    }
    if (state.mapPhase >= 1) {
      state.mapPhase = state.mapPhase % 1;
    }
    // Multi-wrap this sample: replace with last-jump residual only (phase is post-final-wrap).
    if (steps > 1) {
      const pb = nodeGraphRgbFractalPolyBlep(state.mapPhase, dt);
      blepHx = pb * (state.lastDeltaHx * 0.5);
      blepHy = pb * (state.lastDeltaHy * 0.5);
    }
  }

  let re = Number(state.zx);
  let im = Number(state.zy);
  if (!Number.isFinite(re)) re = 0;
  if (!Number.isFinite(im)) im = 0;

  state.dcRe = dcR * 0.9992 + re * 0.0008;
  state.dcIm = dcI * 0.9992 + im * 0.0008;
  // Naive staircase in output domain (held map value after this sample's steps).
  const naive = nodeGraphRgbFractalAudioProjectOut(re, im, state.dcRe, state.dcIm);

  // out = naive + 0.5 * delta * polyBlep  (matches saw/square scale for jump height ±2).
  // blep* already includes the 0.5 * delta factor above.
  const hx = naive.hx + blepHx;
  const hy = naive.hy + blepHy;

  return {
    Hx: Number.isFinite(hx) ? hx : 0,
    Hy: Number.isFinite(hy) ? hy : 0,
  };
}
