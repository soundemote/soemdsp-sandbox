// Soft Fractal face: WebGL full-face Julia (primary) + CPU fallback.
// Continuous phasors for seed/flow/warp/rotation/color (speed changes rate only).

const nodeGraphRgbFractalSettingsDefaults = Object.freeze({
  background: "#050014",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#050018" }),
    Object.freeze({ t: 0.1, color: "#12083a" }),
    Object.freeze({ t: 0.22, color: "#1a1cff" }),
    Object.freeze({ t: 0.38, color: "#b000ff" }),
    Object.freeze({ t: 0.52, color: "#ff1493" }),
    Object.freeze({ t: 0.66, color: "#ff6a00" }),
    Object.freeze({ t: 0.8, color: "#ffd54a" }),
    Object.freeze({ t: 0.92, color: "#fff6c8" }),
    Object.freeze({ t: 1, color: "#ffffff" }),
  ]),
});

/**
 * Curated Julia c-loci that actually look like fractals (not boring mid-plane circles).
 * Seed walks this list; warp/orbit animate around the active family.
 */
const NODE_GRAPH_RGB_FRACTAL_LOCI = Object.freeze([
  Object.freeze({ x: -0.74543, y: 0.11301, name: "seahorse" }),
  Object.freeze({ x: -0.123, y: 0.745, name: "rabbit" }),
  Object.freeze({ x: -0.75, y: 0.11, name: "valley" }),
  Object.freeze({ x: -0.8, y: 0.156, name: "spiral" }),
  Object.freeze({ x: 0.285, y: 0.01, name: "bulb" }),
  Object.freeze({ x: -0.7269, y: 0.1889, name: "filament" }),
  Object.freeze({ x: 0.0, y: 0.8, name: "dendrite" }),
  Object.freeze({ x: -0.162, y: 1.04, name: "feather" }),
  Object.freeze({ x: -1.476, y: 0.0, name: "airplane" }),
  Object.freeze({ x: -0.391, y: -0.587, name: "siegel" }),
  Object.freeze({ x: -0.4, y: 0.6, name: "classic" }),
  Object.freeze({ x: 0.37, y: 0.1, name: "cauliflower" }),
  Object.freeze({ x: -0.70176, y: -0.3842, name: "sanmarco" }),
  Object.freeze({ x: -0.235125, y: 0.827215, name: "dragon" }),
  Object.freeze({ x: 0.355, y: 0.355, name: "quasi" }),
  Object.freeze({ x: -0.75, y: 0.05, name: "tip" }),
  Object.freeze({ x: -0.12, y: 0.77, name: "douady" }),
  Object.freeze({ x: -0.11, y: 0.6557, name: "elephant" }),
  Object.freeze({ x: -0.75, y: 0.15, name: "valley2" }),
  Object.freeze({ x: 0.28, y: 0.53, name: "needle" }),
  Object.freeze({ x: -0.16, y: 1.037, name: "tendril" }),
  Object.freeze({ x: -0.7269, y: 0.1889, name: "filament2" }),
  Object.freeze({ x: -0.74529, y: 0.11307, name: "seahorsemin" }),
  Object.freeze({ x: 0.32, y: 0.043, name: "minibrot" }),
]);

/** CPU fallback grid (only if WebGL missing). */
const NODE_GRAPH_RGB_FRACTAL_CPU_MAX_LONG = 280;
const NODE_GRAPH_RGB_FRACTAL_CPU_SIM_MS = 33;

function normalizeNodeGraphRgbFractalSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphRgbFractalSettingsDefaults;
  const peak = defaults.gradientStops[defaults.gradientStops.length - 1].color;
  let gradientStops;
  if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    if (source.gradientStops || source.gradient) {
      gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, peak);
    } else {
      gradientStops = defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
    }
  } else {
    gradientStops = Array.isArray(source.gradientStops) && source.gradientStops.length >= 2
      ? source.gradientStops
      : defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
  }
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, defaults.background)
    : String(source.background || defaults.background);
  return { background, gradientStops };
}

function nodeGraphRgbFractalSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphRgbFractalSettings();
  }
  return normalizeNodeGraphRgbFractalSettings(node.traceDisplaySettings);
}

function nodeGraphRgbFractalReadParam(nodeId, key, fallback) {
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = nodeGraphReadNodeNumber(nodeId, key);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const raw = Number(node?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function nodeGraphRgbFractalCanvasForSlot(slot) {
  const face = slot?.scopeElement;
  if (!face) {
    return null;
  }
  return face.querySelector?.(":scope > .node-rgb-fractal-canvas")
    || face.querySelector?.(".node-rgb-fractal-canvas")
    || null;
}

function nodeGraphRgbFractalCircuitRunning() {
  try {
    if (typeof nodeGraphModuleScopeCircuitRunning === "function") {
      return nodeGraphModuleScopeCircuitRunning();
    }
  } catch (_) { /* fall through */ }
  try {
    const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
    return Boolean(live?.outputEnabled && live?.node);
  } catch (_) {
    return false;
  }
}

/**
 * Transport pause or Soft Fractal Speed ≈ 0.
 * Speed is bipolar (−8…+8): only near-zero freezes; negative = reverse evolution.
 */
function nodeGraphRgbFractalShouldFreeze(moduleSpeed = 1) {
  try {
    if (typeof nodeGraphModuleScopeEnginePaused === "function" && nodeGraphModuleScopeEnginePaused()) {
      return true;
    }
  } catch (_) { /* fall through */ }
  try {
    const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
    if (Number.isFinite(speed) && speed <= 0) {
      return true;
    }
  } catch (_) { /* fall through */ }
  return !(Math.abs(Number(moduleSpeed) || 0) > 1e-6);
}

function nodeGraphRgbFractalEnsurePhasors(face) {
  if (!Number.isFinite(face._rgbFractalOrbitPhasor)) {
    face._rgbFractalOrbitPhasor = Number(face._rgbFractalPhase) || 0;
  }
  if (!Number.isFinite(face._rgbFractalFlowPhasor)) {
    face._rgbFractalFlowPhasor = 0;
  }
  if (!Number.isFinite(face._rgbFractalWarpPhasor)) {
    face._rgbFractalWarpPhasor = 0;
  }
  if (!Number.isFinite(face._rgbFractalRotationPhasor)) {
    face._rgbFractalRotationPhasor = (Number(face._rgbFractalFlowPhasor) || 0) * 0.85;
  }
  if (!Number.isFinite(face._rgbFractalColorPhasor)) {
    face._rgbFractalColorPhasor = (Number(face._rgbFractalOrbitPhasor) || 0) * 0.14;
  }
  if (!Number.isFinite(face._rgbFractalZoomPhasor)) {
    face._rgbFractalZoomPhasor = 0;
  }
  if (!Number.isFinite(face._rgbFractalPanPhasor)) {
    face._rgbFractalPanPhasor = 0;
  }
  if (!Number.isFinite(face._rgbFractalTrapPhasor)) {
    face._rgbFractalTrapPhasor = 0;
  }
  face._rgbFractalPhase = face._rgbFractalOrbitPhasor;
}

/**
 * Map seed + motion params → Julia c near Mandelbrot-edge families.
 * opts: { morph, wander, orbitSize, harm1, harm2, detune }
 */
function nodeGraphRgbFractalComputeC(seed, warp, tOrbit, tFlow, tWarp, opts = {}) {
  const loci = NODE_GRAPH_RGB_FRACTAL_LOCI;
  const n = loci.length;
  const w = Math.max(0, Number(warp) || 0);
  const morph = Math.max(0, Number(opts.morph) || 0);
  const wanderAmt = Math.max(0, Number(opts.wander) || 0);
  const orbitSize = Math.max(0, Number(opts.orbitSize) || 1);
  const harm1 = Math.max(0.05, Number(opts.harm1) || 1);
  const harm2 = Math.max(0.05, Number(opts.harm2) || 1.618);
  const detune = Math.max(0, Number(opts.detune) || 0);

  // Seed walks the locus ring with smooth crossfade
  const u = ((seed % 1) + 1) % 1 * n;
  const i0 = Math.floor(u) % n;
  const i1 = (i0 + 1) % n;
  const f = u - Math.floor(u);
  const ft = f * f * (3 - 2 * f);
  const a = loci[i0];
  const b = loci[i1];
  let cx = a.x + (b.x - a.x) * ft;
  let cy = a.y + (b.y - a.y) * ft;

  // Local multi-harmonic orbit (Lissajous-ish). harm1/harm2 + detune → quasi-periodic.
  const rad = (0.01 + orbitSize * 0.07 + Math.min(w, 4) * 0.02) * (0.55 + orbitSize * 0.45);
  const dSkew = 1 + detune * 0.271828;
  const a1 = tOrbit * harm1 + tFlow * (1.1 + detune * 0.37) + seed * 6.28318;
  const a2 = tOrbit * harm2 * dSkew - tFlow * 0.4 + tWarp * (0.7 + detune * 0.2) + seed * 3.1;
  const a3 = tOrbit * (harm1 + harm2) * 0.5 * (1 + detune * 0.14142) + tWarp * 0.31;
  cx += rad * Math.cos(a1) * (0.5 + 0.35 * Math.cos(a2 * 0.37) + 0.15 * Math.sin(a3));
  cy += rad * Math.sin(a1 * 0.93 + 0.35) * (0.5 + 0.35 * Math.sin(a2 * 0.51) + 0.15 * Math.cos(a3 * 1.07));

  // Morph toward a distant family (independent of warp chaos)
  if (morph > 0.01) {
    const mAmt = Math.min(1, Math.pow(morph / 2.2, 0.8));
    const j = (i0 + 3 + Math.floor(seed * 7 + morph * 2)) % n;
    const c = loci[j];
    const j2 = (j + 5) % n;
    const c2 = loci[j2];
    const mt = 0.5 + 0.5 * Math.sin(tWarp * (0.4 + detune * 0.15) + tOrbit * 0.11);
    const mx = c.x + (c2.x - c.x) * mt;
    const my = c.y + (c2.y - c.y) * mt;
    cx = cx * (1 - mAmt) + mx * mAmt;
    cy = cy * (1 - mAmt) + my * mAmt;
  }

  // Wander / chaos path on c (rate from warp phasor, amount from wander)
  if (wanderAmt > 0.01 || w > 0.01) {
    const wAmt = Math.min(1.4, wanderAmt * 0.55 + Math.min(w, 4) * 0.2);
    const amp = 0.02 + wanderAmt * 0.09 + Math.min(w, 4) * 0.03;
    const f1 = 1.1 + seed + detune * 0.19;
    const f2 = 0.9 + seed * 0.7 + detune * 0.31;
    const f3 = 2.1 + detune * 0.47;
    cx += wAmt * amp * Math.sin(tWarp * f1 + tOrbit * 0.2 + a1 * 0.15);
    cy += wAmt * amp * Math.cos(tWarp * f2 - tOrbit * 0.15 - a2 * 0.12);
    if (wanderAmt > 0.4 || w > 0.5) {
      const k = Math.min(1.4, (wanderAmt + w) * 0.35);
      cx += k * 0.08 * Math.sin(tWarp * f3 + a1);
      cy += k * 0.08 * Math.cos(tWarp * (1.7 + detune * 0.2) - a2);
      // Slow third-order drift so paths don't re-close soon
      cx += k * 0.04 * Math.sin(tFlow * (0.17 + detune * 0.05) + seed * 5.0);
      cy += k * 0.04 * Math.cos(tFlow * (0.13 + detune * 0.07) - seed * 4.0);
    }
  }

  // Soft clamp into a drawable Julia neighborhood (prevents total wash-out)
  const cMag = Math.hypot(cx, cy);
  const clampR = 1.45 + Math.min(0.35, orbitSize * 0.08 + wanderAmt * 0.05);
  if (cMag > clampR) {
    const s = clampR / cMag;
    cx *= s;
    cy *= s;
  }
  return { cx, cy };
}

function syncNodeGraphRgbFractalCanvas(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
  // Cap DPR a bit so huge modules don't create multi-megapixel shaders unnecessarily
  const dprCap = Math.min(dpr, 2);
  const w = Math.max(1, Math.round(face.clientWidth * dprCap));
  const h = Math.max(1, Math.round(face.clientHeight * dprCap));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "auto";
  return w > 0 && h > 0;
}

function nodeGraphRgbFractalFillBlack(canvas, face) {
  if (!canvas) {
    return false;
  }
  // Prefer GL clear if this canvas already has a GL context
  if (typeof nodeGraphRgbFractalGlClearBlack === "function" && nodeGraphRgbFractalGlClearBlack(canvas)) {
    if (face?.dataset) face.dataset.lightStrength = "0";
    if (face) {
      face._rgbFractalHasFrame = false;
      face._rgbFractalBlack = true;
    }
    return true;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const w = Math.max(1, canvas.width || 1);
  const h = Math.max(1, canvas.height || 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  if (face?.dataset) face.dataset.lightStrength = "0";
  if (face) {
    face._rgbFractalHasFrame = false;
    face._rgbFractalBlack = true;
  }
  return true;
}

// —— CPU fallback (WebGL missing only) ————————————————————————————————

function nodeGraphRgbFractalJuliaSmooth(zx, zy, cx, cy, maxIter) {
  let x = zx;
  let y = zy;
  let i = 0;
  let trap = 1e6;
  const bail2 = 256;
  for (; i < maxIter; i += 1) {
    const x2 = x * x;
    const y2 = y * y;
    if (x2 + y2 > bail2) break;
    const xy = 2 * x * y;
    x = x2 - y2 + cx;
    y = xy + cy;
    const d = Math.hypot(x - 0.3, y);
    if (d < trap) trap = d;
  }
  if (i >= maxIter) {
    return 0.04 + 0.1 * (1 - Math.min(1, trap));
  }
  const r2 = x * x + y * y;
  const logZn = Math.log(Math.max(1e-12, r2)) * 0.5;
  const nu = Math.log(Math.max(1e-12, logZn / Math.LN2)) / Math.LN2;
  const escape = Math.max(0, Math.min(1, (i + 1 - nu) / maxIter));
  const tTrap = 1 - Math.min(1, trap / 1.2);
  return Math.max(0, Math.min(1, escape * 0.55 + tTrap * 0.55));
}

function nodeGraphRgbFractalBuildPaletteLut(stops, peak) {
  const lut = new Uint8ClampedArray(256 * 3);
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(stops, t, peak)
    : (t) => {
      const v = Math.round(t * 255);
      return [v, v, v];
    };
  for (let i = 0; i < 256; i += 1) {
    const rgb = sample(i / 255);
    const o = i * 3;
    lut[o] = rgb[0];
    lut[o + 1] = rgb[1];
    lut[o + 2] = rgb[2];
  }
  return lut;
}

function paintNodeGraphRgbFractalFaceCpu(canvas, face, params) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const w = canvas.width;
  const h = canvas.height;
  let simW = w;
  let simH = h;
  const longEdge = Math.max(simW, simH);
  if (longEdge > NODE_GRAPH_RGB_FRACTAL_CPU_MAX_LONG) {
    const s = NODE_GRAPH_RGB_FRACTAL_CPU_MAX_LONG / longEdge;
    simW = Math.max(1, Math.round(simW * s));
    simH = Math.max(1, Math.round(simH * s));
  }
  const maxIter = Math.round(18 + params.depth * 40);
  let field = face._rgbFractalField;
  if (!field || field.length !== simW * simH) {
    field = new Float32Array(simW * simH);
    face._rgbFractalField = field;
  }
  const aspect = simW / Math.max(1, simH);
  const { cx, cy, halfSpan, cosR, sinR, centerX, centerY, colorPhase, breath, glow } = params;
  for (let j = 0; j < simH; j += 1) {
    const vn = ((j + 0.5) / simH) * 2 - 1;
    const row = j * simW;
    for (let i = 0; i < simW; i += 1) {
      const un = ((i + 0.5) / simW) * 2 - 1;
      const zx = un * halfSpan * aspect;
      const zy = vn * halfSpan;
      const rx = zx * cosR - zy * sinR + centerX;
      const ry = zx * sinR + zy * cosR + centerY;
      let e = nodeGraphRgbFractalJuliaSmooth(rx, ry, cx, cy, maxIter);
      e = Math.pow(Math.max(0, Math.min(1, e)), 0.72 - glow * 0.25);
      e = (e * (2.2 + glow * 2.5) + colorPhase) % 1;
      if (e < 0) e += 1;
      field[row + i] = Math.max(0, Math.min(1, e * breath));
    }
  }

  // Soft: one blur pass
  if (params.soft > 0.1) {
    let dst = face._rgbFractalFieldB;
    if (!dst || dst.length !== field.length) {
      dst = new Float32Array(field.length);
      face._rgbFractalFieldB = dst;
    }
    const ck = 2.2;
    for (let j = 0; j < simH; j += 1) {
      for (let i = 0; i < simW; i += 1) {
        let acc = 0;
        let wgt = 0;
        for (let dj = -1; dj <= 1; dj += 1) {
          const y = j + dj;
          if (y < 0 || y >= simH) continue;
          for (let di = -1; di <= 1; di += 1) {
            const x = i + di;
            if (x < 0 || x >= simW) continue;
            const k = di === 0 && dj === 0 ? ck : 1;
            acc += field[y * simW + x] * k;
            wgt += k;
          }
        }
        dst[j * simW + i] = acc / Math.max(1e-6, wgt);
      }
    }
    field = dst;
    face._rgbFractalField = field;
  }

  let off = face._rgbFractalOff;
  if (!off || off.width !== simW || off.height !== simH) {
    off = document.createElement("canvas");
    off.width = simW;
    off.height = simH;
    face._rgbFractalOff = off;
    face._rgbFractalImg = null;
  }
  const octx = off.getContext("2d");
  if (!octx) return false;
  let img = face._rgbFractalImg;
  if (!img || img.width !== simW || img.height !== simH) {
    img = octx.createImageData(simW, simH);
    face._rgbFractalImg = img;
  }
  const stops = params.gradientStops;
  const peak = stops?.[stops.length - 1]?.color || "#ffffff";
  const lutKey = peak + "|" + (stops?.length || 0);
  if (!face._rgbFractalLut || face._rgbFractalLutKey !== lutKey) {
    face._rgbFractalLut = nodeGraphRgbFractalBuildPaletteLut(stops, peak);
    face._rgbFractalLutKey = lutKey;
  }
  const lut = face._rgbFractalLut;
  const data = img.data;
  for (let i = 0; i < field.length; i += 1) {
    const idx = Math.max(0, Math.min(255, (field[i] * 255) | 0)) * 3;
    const p = i * 4;
    data[p] = lut[idx];
    data[p + 1] = lut[idx + 1];
    data[p + 2] = lut[idx + 2];
    data[p + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = params.background || "#050014";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, simW, simH, 0, 0, w, h);
  return true;
}

// —— Main paint ————————————————————————————————————————————————————————

function paintNodeGraphRgbFractalFace(canvas, face, nodeId, options = {}) {
  if (!canvas || !face || !nodeId) {
    return false;
  }
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  if (!syncNodeGraphRgbFractalCanvas(canvas, face, pixelRatio)) {
    return false;
  }

  if (!nodeGraphRgbFractalCircuitRunning()) {
    face._rgbFractalLastTs = 0;
    face._rgbFractalPendingDt = 0;
    if (face._rgbFractalBlack && !options.force) {
      return true;
    }
    return nodeGraphRgbFractalFillBlack(canvas, face);
  }
  face._rgbFractalBlack = false;

  // Wide practical ranges (match register definition). Speed is bipolar (−8…+8).
  const speed = Math.max(-8, Math.min(8, nodeGraphRgbFractalReadParam(nodeId, "speed", 1)));
  const frozen = nodeGraphRgbFractalShouldFreeze(speed);
  if (frozen && face._rgbFractalHasFrame && !options.force) {
    face._rgbFractalLastTs = 0;
    face._rgbFractalPendingDt = 0;
    if (face.dataset) face.dataset.lightStrength = "1";
    return true;
  }

  let dt = Number(options.dt);
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(0.05, dt);
  if (frozen) dt = 0;

  // CPU fallback: throttle sim. WebGL: paint every rAF (cheap full-face).
  const wantGl = typeof nodeGraphRgbFractalGlPaint === "function";
  // Probe GL once (may bind context)
  const glReady = wantGl && typeof nodeGraphRgbFractalGlEnsure === "function"
    ? Boolean(nodeGraphRgbFractalGlEnsure(canvas))
    : false;

  if (!glReady && !options.force && face._rgbFractalHasFrame && !frozen) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    face._rgbFractalPendingDt = (Number(face._rgbFractalPendingDt) || 0) + dt;
    const lastSim = Number(face._rgbFractalLastSimMs) || 0;
    if (now - lastSim < NODE_GRAPH_RGB_FRACTAL_CPU_SIM_MS) {
      return true;
    }
    dt = Number(face._rgbFractalPendingDt) || 0;
    face._rgbFractalPendingDt = 0;
    face._rgbFractalLastSimMs = now;
  } else {
    face._rgbFractalPendingDt = 0;
  }

  const seed = ((nodeGraphRgbFractalReadParam(nodeId, "seed", 0) % 1) + 1) % 1;
  const scale = Math.max(0.1, Math.min(24, nodeGraphRgbFractalReadParam(nodeId, "scale", 1.2)));
  const depth = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "depth", 1.2)));
  const warp = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "warp", 0.6)));
  const rotation = Math.max(-8, Math.min(8, nodeGraphRgbFractalReadParam(nodeId, "rotation", 0.4)));
  const softRaw = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "soft", 0.85)));
  const flow = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "flow", 0.4)));
  const glowRaw = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "glow", 1)));
  const panX = Math.max(-4, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "x", 0)));
  const panY = Math.max(-4, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "y", 0)));
  // New exploration knobs
  const detune = Math.max(0, Math.min(3, nodeGraphRgbFractalReadParam(nodeId, "detune", 0.45)));
  const orbitRateK = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "orbit", 1)));
  const orbitSize = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "orbitSize", 1)));
  const morph = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "morph", 0.7)));
  const wander = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "wander", 0.55)));
  const harm1 = Math.max(0.1, Math.min(5, nodeGraphRgbFractalReadParam(nodeId, "harm1", 1)));
  const harm2 = Math.max(0.1, Math.min(5, nodeGraphRgbFractalReadParam(nodeId, "harm2", 1.618)));
  const zoomPulse = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "zoomPulse", 0.25)));
  const zoomAmt = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "zoomAmt", 0.35)));
  const panDrift = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "panDrift", 0.15)));
  const panSize = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "panSize", 0.25)));
  const fold = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "fold", 0.35)));
  const trapAmt = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "trap", 0.55)));
  const trapSpin = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "trapSpin", 0.5)));
  const trapRad = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "trapRad", 0.4)));
  const colorRateK = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "colorRate", 1)));
  const colorShift = ((nodeGraphRgbFractalReadParam(nodeId, "colorShift", 0) % 1) + 1) % 1;
  const bands = Math.max(0, Math.min(4, nodeGraphRgbFractalReadParam(nodeId, "bands", 1)));
  const domainWarp = Math.max(0, Math.min(2, nodeGraphRgbFractalReadParam(nodeId, "domainWarp", 0.4)));

  // Shader expects soft/glow roughly 0…1 intensity (soft 2 / glow 4 = full throw)
  const soft = Math.min(1, softRaw / 1.5);
  const glow = Math.min(1.35, glowRaw / 2.2);

  let breath = Number(face._rgbFractalBreath);
  if (!Number.isFinite(breath)) breath = 1;
  const buffer = options.buffer;
  if (buffer?.length && !buffer.nodeGraphScopeXy) {
    const sample = typeof nodeGraphOscilloscopeLatestSample === "function"
      ? nodeGraphOscilloscopeLatestSample(buffer, 0)
      : Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      breath = Math.max(0.55, Math.min(1.4, 0.9 + sample * 0.5));
      face._rgbFractalBreath = breath;
    }
  }

  nodeGraphRgbFractalEnsurePhasors(face);
  if (dt > 0) {
    // Signed master speed; Detune multiplies secondary rates by irrational-ish factors
    // so phasors rarely re-lock (ever-evolving instead of short loops).
    const speedAbs = Math.abs(speed);
    const sign = Math.sign(speed || 1);
    const d1 = 1 + detune * 0.6180339887;
    const d2 = 1 + detune * 1.4142135623;
    const d3 = 1 + detune * 0.7071067811;
    const d4 = 1 + detune * 0.3333333333;
    const d5 = 1 + detune * 1.7320508075;
    const seedOrbitSkew = 0.65 + seed * 0.7;
    const orbitRate = speed * orbitRateK * (0.75 + Math.min(warp, 4) * 0.12) * seedOrbitSkew * d1;
    face._rgbFractalOrbitPhasor += orbitRate * dt;
    face._rgbFractalFlowPhasor += speed * flow * 0.85 * d2 * dt;
    face._rgbFractalWarpPhasor += speed * (0.2 + Math.min(warp, 4) * 0.65) * d3 * dt;
    const spinGate = speedAbs > 1e-6
      ? (0.35 + Math.min(speedAbs, 8) * 0.12) * sign
      : 0;
    face._rgbFractalRotationPhasor += rotation * spinGate * dt;
    face._rgbFractalColorPhasor += speed * colorRateK * (0.14 + glowRaw * 0.05) * d4 * dt;
    face._rgbFractalZoomPhasor += speed * zoomPulse * 0.35 * d5 * dt;
    face._rgbFractalPanPhasor += speed * panDrift * 0.28 * (1 + detune * 0.5) * dt;
    face._rgbFractalTrapPhasor += speed * trapSpin * 0.55 * (1 + detune * 0.41) * dt;
    face._rgbFractalPhase = face._rgbFractalOrbitPhasor;
  }

  const tOrbit = Number(face._rgbFractalOrbitPhasor) || 0;
  const tFlow = Number(face._rgbFractalFlowPhasor) || 0;
  const tWarp = Number(face._rgbFractalWarpPhasor) || 0;
  const tRot = Number(face._rgbFractalRotationPhasor) || 0;
  const tColor = (Number(face._rgbFractalColorPhasor) || 0) + seed * 2.4 + colorShift * 6.28318;
  const tZoom = Number(face._rgbFractalZoomPhasor) || 0;
  const tPan = Number(face._rgbFractalPanPhasor) || 0;
  const tTrap = Number(face._rgbFractalTrapPhasor) || 0;

  const { cx, cy } = nodeGraphRgbFractalComputeC(seed, warp, tOrbit, tFlow, tWarp, {
    morph,
    wander,
    orbitSize,
    harm1,
    harm2,
    detune,
  });

  // Scale 0.1…24 as zoom + optional breathing from Zoom Pulse / Amt
  const zoomBreath = 1 + zoomAmt * 0.55 * Math.sin(tZoom * Math.PI * 2);
  const scaleEff = Math.max(0.08, scale * Math.max(0.35, zoomBreath));
  const halfSpan = Math.max(
    0.035,
    Math.min(5, 2.55 / Math.pow(Math.max(0.1, scaleEff), 0.92)),
  );
  const rot = tRot * Math.PI * 2;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  // Manual pan + auto elliptical pan (detuned so it doesn't re-sync with orbit)
  const autoPanX = panSize * Math.cos(tPan * Math.PI * 2);
  const autoPanY = panSize * Math.sin(tPan * Math.PI * 2 * (1 + detune * 0.27) + 0.4);
  const centerX = (panX + autoPanX) * halfSpan * 0.55;
  const centerY = -(panY + autoPanY) * halfSpan * 0.55;

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphRgbFractalSettingsForNode(patchNode);

  // Orbit-trap attractor: independent trap phasor + trapRad
  const trapAmp = 0.08 + trapRad * 0.45 + Math.min(flow, 4) * 0.04;
  const trapX = trapAmp * Math.cos(tTrap * Math.PI * 2 + seed * 4.0)
    + 0.08 * Math.sin(tWarp * (1 + detune * 0.2));
  const trapY = trapAmp * Math.sin(tTrap * Math.PI * 2 * (1 + detune * 0.19) - seed * 3.0)
    + 0.07 * Math.cos(tOrbit * 0.4);
  const trapMix = Math.min(0.85, (0.08 + trapAmt * 0.42 + Math.min(warp, 4) * 0.05) * (1 - soft * 0.45));

  // Depth 0…4 → ~24…~360 iters before soft roll-off in shader
  const maxIter = Math.round(24 + depth * 85 * (1 - soft * 0.32));

  // Color band density for shader (bands 0…4)
  const bandAmt = 0.35 + bands * 1.15 + glow * 0.35;

  const paintParams = {
    cx,
    cy,
    centerX,
    centerY,
    halfSpan,
    cosR,
    sinR,
    maxIter,
    soft,
    glow,
    colorPhase: tColor,
    breath,
    trapMix,
    trapX,
    trapY,
    time: tOrbit + tFlow * 0.7 + tWarp * 0.35,
    background: settings.background,
    gradientStops: settings.gradientStops,
    depth,
    fold: Math.min(1, fold / 1.5),
    bands: bandAmt,
    domainWarp: Math.min(1, domainWarp / 1.5 + soft * 0.15),
  };

  let ok = false;
  if (glReady && typeof nodeGraphRgbFractalGlPaint === "function") {
    ok = nodeGraphRgbFractalGlPaint(canvas, paintParams);
    // Canvas already has a WebGL context — never call getContext("2d") on it.
  } else {
    ok = paintNodeGraphRgbFractalFaceCpu(canvas, face, paintParams);
  }

  if (ok) {
    if (face.dataset) face.dataset.lightStrength = "1";
    face._rgbFractalHasFrame = true;
  }
  return ok;
}

function paintNodeGraphRgbFractalFaceForNode(nodeId, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const face = options.face
    || (typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(id)?.querySelector?.(".node-rgb-fractal-face")
      : null);
  const canvas = face?.querySelector?.(".node-rgb-fractal-canvas");
  if (!face || !canvas) {
    return false;
  }
  return paintNodeGraphRgbFractalFace(canvas, face, id, options);
}

/**
 * Scope pass: only sample In → breath. Full fractal is owned by face rAF.
 */
function drawNodeGraphRgbFractalFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const buffer = item?.buffer;
  if (buffer?.length && !buffer.nodeGraphScopeXy) {
    const sample = typeof nodeGraphOscilloscopeLatestSample === "function"
      ? nodeGraphOscilloscopeLatestSample(buffer, 0)
      : Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      face._rgbFractalBreath = Math.max(0.55, Math.min(1.4, 0.9 + sample * 0.5));
    }
  }
  if (!face._rgbFractalRunning && typeof paintNodeGraphRgbFractalFace === "function") {
    const canvas = nodeGraphRgbFractalCanvasForSlot(slot);
    if (canvas) {
      paintNodeGraphRgbFractalFace(canvas, face, slot.nodeId, {
        buffer,
        dt: 0,
        force: true,
        face,
      });
    }
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rgbFractalFace = drawNodeGraphRgbFractalFaceItem;
}
