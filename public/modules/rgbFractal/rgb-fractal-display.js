// Soft Fractal face: WebGL full-face Julia (primary) + CPU fallback.
// Continuous phasors for seed/flow/warp/rotation/color (speed changes rate only).

const nodeGraphRgbFractalSettingsDefaults = Object.freeze({
  // Display Background color (used when outerPlate = "background").
  background: "#000000",
  // "background" = original dream plate (first option)
  // "gradientStart" = gradient stop 0 as outer / empty plate (second option)
  outerPlate: "background",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.12, color: "#12083a" }),
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
  const outerRaw = String(source.outerPlate ?? source.outerColor ?? defaults.outerPlate).trim().toLowerCase();
  let outerPlate = "background";
  if (outerRaw === "haze" || outerRaw === "2") {
    outerPlate = "haze";
  } else if (
    outerRaw === "gradientstart"
    || outerRaw === "gradient"
    || outerRaw === "1"
  ) {
    outerPlate = "gradientStart";
  }
  return { background, gradientStops, outerPlate };
}

/** Low end of the palette — exterior when outerPlate = gradientStart. */
function nodeGraphRgbFractalStop0Color(settingsOrStops) {
  if (Array.isArray(settingsOrStops)) {
    const c = settingsOrStops[0]?.color;
    return c ? String(c) : "#000000";
  }
  const stops = settingsOrStops?.gradientStops;
  if (Array.isArray(stops) && stops[0]?.color) {
    return String(stops[0].color);
  }
  return String(settingsOrStops?.background || "#000000");
}

/** Idle / DOM plate color for current outerPlate mode. */
function nodeGraphRgbFractalPlateColor(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const mode = String(s.outerPlate || "background");
  if (mode === "gradientStart") {
    return nodeGraphRgbFractalStop0Color(s);
  }
  // background + haze idle on the Background swatch (haze is live-shader only).
  return String(s.background || "#000000");
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

/** Latest sample from a buffered input port (Rotation / In). */
function nodeGraphRgbFractalReadPort(nodeId, port, fallback = 0) {
  const id = String(nodeId || "").trim();
  const p = String(port || "").trim();
  if (!id || !p) {
    return fallback;
  }
  try {
    const key = `${id}:${p}`;
    const buf = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.buffers?.get?.(key)
      : null;
    if (buf?.length) {
      const sample = typeof nodeGraphOscilloscopeLatestSample === "function"
        ? nodeGraphOscilloscopeLatestSample(buf, fallback)
        : Number(buf[buf.length - 1]);
      if (Number.isFinite(sample)) {
        return sample;
      }
    }
  } catch (_) { /* fall through */ }
  return fallback;
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
  if (!Number.isFinite(face._rgbFractalRotationPhasor)) {
    face._rgbFractalRotationPhasor = 0;
  }
  if (!Number.isFinite(face._rgbFractalColorPhasor)) {
    face._rgbFractalColorPhasor = 0;
  }
  face._rgbFractalPhase = face._rgbFractalOrbitPhasor;
}

/** Continuous sample of locus ring at s∈[0,1) — Catmull–Rom (matches audio path). */
function nodeGraphRgbFractalSampleLocus(loci, s01) {
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
 * Pure planetary c(t) — same as audio: Seed + circular orbit only.
 */
function nodeGraphRgbFractalComputeC(seed, tOrbit, orbitSize) {
  if (typeof nodeGraphRgbFractalAudioComputeC === "function") {
    return nodeGraphRgbFractalAudioComputeC(seed, tOrbit, orbitSize);
  }
  const loci = NODE_GRAPH_RGB_FRACTAL_LOCI;
  const seed01 = ((seed % 1) + 1) % 1;
  const base = nodeGraphRgbFractalSampleLocus(loci, seed01);
  const size = Number(orbitSize);
  const rad = (Number.isFinite(size) ? Math.max(0, size) : 0) * 0.028;
  const theta = tOrbit;
  return {
    cx: base.x + rad * Math.cos(theta),
    cy: base.y + rad * Math.sin(theta),
  };
}

function syncNodeGraphRgbFractalCanvas(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  // HD fragment-shader face: layout CSS × devicePixelRatio (no intentional
  // downsample). Soft/AA cost is in the shader, not by shrinking the buffer.
  const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
  const dprCap = Math.min(dpr, 2);
  const w = Math.max(1, Math.round((face.clientWidth || 1) * dprCap));
  const h = Math.max(1, Math.round((face.clientHeight || 1) * dprCap));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  // Smooth HD scale (not pixelated blocks). Workspace zoom still scales the face.
  canvas.style.imageRendering = "auto";
  return w > 0 && h > 0;
}

function nodeGraphRgbFractalFillPlate(canvas, face, plateHex = "#000000") {
  if (!canvas) {
    return false;
  }
  const color = String(plateHex || "#000000");
  // Prefer GL clear if this canvas already has a GL context
  if (typeof nodeGraphRgbFractalGlClearPlate === "function" && nodeGraphRgbFractalGlClearPlate(canvas, color)) {
    if (face?.dataset) face.dataset.lightStrength = "0";
    if (face) {
      face._rgbFractalHasFrame = false;
      face._rgbFractalBlack = true;
      face.style.background = color;
    }
    return true;
  }
  if (typeof nodeGraphRgbFractalGlClearBlack === "function" && color === "#000000" && nodeGraphRgbFractalGlClearBlack(canvas)) {
    if (face?.dataset) face.dataset.lightStrength = "0";
    if (face) {
      face._rgbFractalHasFrame = false;
      face._rgbFractalBlack = true;
      face.style.background = color;
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
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  if (face?.dataset) face.dataset.lightStrength = "0";
  if (face) {
    face._rgbFractalHasFrame = false;
    face._rgbFractalBlack = true;
    face.style.background = color;
  }
  return true;
}

/** Idle fill — uses active outer plate mode (Background or Gradient start). */
function nodeGraphRgbFractalFillBlack(canvas, face) {
  const patchNode = face?.dataset?.node && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(face.dataset.node)
    : null;
  const settings = typeof nodeGraphRgbFractalSettingsForNode === "function"
    ? nodeGraphRgbFractalSettingsForNode(patchNode)
    : null;
  const plate = typeof nodeGraphRgbFractalPlateColor === "function"
    ? nodeGraphRgbFractalPlateColor(settings)
    : "#000000";
  return nodeGraphRgbFractalFillPlate(canvas, face, plate);
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
  const panX = Number(params.panX) || 0;
  const panY = Number(params.panY) || 0;
  for (let j = 0; j < simH; j += 1) {
    const row = j * simW;
    for (let i = 0; i < simW; i += 1) {
      // Pure offset pan (no UV wrap) — matches WebGL mapUvToZ
      const un = ((i + 0.5) / simW) * 2 - 1;
      const vn = ((j + 0.5) / simH) * 2 - 1;
      const zx = un * halfSpan * aspect;
      const zy = vn * halfSpan;
      const rx = zx * cosR - zy * sinR + centerX + panX;
      const ry = zx * sinR + zy * cosR + centerY + panY;
      let e = nodeGraphRgbFractalJuliaSmooth(rx, ry, cx, cy, maxIter);
      e = Math.pow(Math.max(0, Math.min(1, e)), 0.72 - glow * 0.25);
      // Match GPU: energy → one gradient pass; phase rotates (does not multi-wrap bands).
      const lit = e < 0.03 ? 0 : Math.min(1, (e - 0.03) / 0.19);
      if (lit > 0.001) {
        const phase = ((Number(colorPhase) % 1) + 1) % 1;
        const bands = Math.max(0.25, Number(params.bands) || 1);
        const span = Math.min(1, bands);
        let once = e * span;
        if (bands > 1.001) {
          // Explicit multi-wrap only when Color Bands > 1.
          once = ((e * bands + phase) % 1 + 1) % 1;
        } else {
          once = ((once + phase) % 1 + 1) % 1;
        }
        e = once * lit * (Number(breath) || 1);
      } else {
        e = 0;
      }
      field[row + i] = Math.max(0, Math.min(1, e));
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
  // Letterbox / beyond-sim: match outer plate mode (haze idles on Background).
  const outerMode = String(params.outerPlate || "background");
  const plate = outerMode === "gradientStart"
    ? ((Array.isArray(stops) && stops[0]?.color) || params.background || "#000000")
    : (params.background || "#000000");
  ctx.fillStyle = plate;
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

  // Domain values come from params (UI already honors min/max). No code re-clamp.
  const speedRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "speed", 1));
  const speed = Number.isFinite(speedRaw) ? speedRaw : 0;
  const frozen = nodeGraphRgbFractalShouldFreeze(speed);
  if (frozen && face._rgbFractalHasFrame && !options.force) {
    face._rgbFractalLastTs = 0;
    face._rgbFractalPendingDt = 0;
    if (face.dataset) face.dataset.lightStrength = "1";
    return true;
  }

  let dt = Number(options.dt);
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  // Frame dt cap is render safety (not a parameter limit).
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
  const scaleRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "scale", 1.2));
  const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1.2;
  const depthRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "depth", 1.2));
  const depth = Number.isFinite(depthRaw) ? Math.max(0, depthRaw) : 1.2;
  const orbitSize = nodeGraphRgbFractalReadParam(nodeId, "orbitSize", 1);
  // Pure view offset (bipolar); applied in complex plane after halfSpan is known.
  const panXRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "panX", 0));
  const panYRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "panY", 0));
  const panAmtX = Number.isFinite(panXRaw) ? panXRaw : 0;
  const panAmtY = Number.isFinite(panYRaw) ? panYRaw : 0;

  // Face look: Soft + Color Rate (CV jack only) / Shift + Color Bands.
  const softRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "soft", 0.48));
  const soft = Number.isFinite(softRaw) ? Math.max(0, Math.min(1, softRaw)) : 0.48;
  // Color Rate is input-only: wire a CV for palette cycle rate (× Speed).
  // Unconnected default 1 = natural lock to Speed (same as the old param default).
  const colorRateRaw = Number(nodeGraphRgbFractalReadPort(nodeId, "Color Rate", 1));
  const colorRate = Number.isFinite(colorRateRaw) ? Math.max(0, colorRateRaw) : 1;
  const colorShift = ((nodeGraphRgbFractalReadParam(nodeId, "colorShift", 0) % 1) + 1) % 1;
  // Bands default 1 = one smooth pass through the palette (not multi-wrap hash).
  const bandsRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "bands", 1));
  const bands = Number.isFinite(bandsRaw) ? Math.max(0.25, bandsRaw) : 1;
  const glow = 0;
  const breath = 1;
  face._rgbFractalBreath = 1;

  const rotMultRaw = Number(nodeGraphRgbFractalReadParam(nodeId, "rotation", 1));
  const rotMult = Number.isFinite(rotMultRaw) ? rotMultRaw : 0;

  nodeGraphRgbFractalEnsurePhasors(face);
  if (dt > 0) {
    // Shared planetary clock: pure θ for face c + co-rotation.
    const dTheta = speed * 0.32 * dt;
    face._rgbFractalOrbitPhasor += dTheta;
    face._rgbFractalPhase = face._rgbFractalOrbitPhasor;
    face._rgbFractalRotationPhasor += -rotMult * dTheta;
    // Palette cycle independent of orbit — Color Rate × Speed.
    face._rgbFractalColorPhasor += speed * colorRate * 0.14 * dt;
  }

  const tOrbit = Number(face._rgbFractalOrbitPhasor) || 0;
  const { cx, cy } = nodeGraphRgbFractalComputeC(seed, tOrbit, orbitSize);

  const halfSpan = Math.max(
    0.022,
    Math.min(5, 2.55 / Math.pow(Math.max(0.1, scale), 0.92)),
  );
  // Pan ±1 ≈ shift by one half-span (pure offset, no wrap).
  const panX = panAmtX * halfSpan;
  const panY = panAmtY * halfSpan;

  const rot = Number(face._rgbFractalRotationPhasor) || 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const centerX = 0;
  const centerY = 0;

  // Continuous palette phase + static Color Shift (wraps in shader via fract).
  const colorPhase = (Number(face._rgbFractalColorPhasor) || 0) + colorShift;

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphRgbFractalSettingsForNode(patchNode);

  // HD path: full iter budget for the fragment shader; Soft still rolls depth
  // inside GLSL. Cap at loop max (256) for safety only — no intentional low-res.
  const maxIter = Math.min(256, Math.max(8, Math.round(24 + depth * 72)));

  const paintParams = {
    cx,
    cy,
    centerX,
    centerY,
    panX,
    panY,
    halfSpan,
    cosR,
    sinR,
    maxIter,
    soft,
    glow,
    colorPhase,
    breath,
    trapMix: 0,
    trapX: 0,
    trapY: 0,
    // Haze mode uses time for radial-only plate breath; other modes ignore it.
    time: (settings.outerPlate || "background") === "haze" ? tOrbit : 0,
    background: settings.background || "#000000",
    outerPlate: settings.outerPlate || "background",
    gradientStops: settings.gradientStops,
    depth,
    fold: 0,
    bands,
    domainWarp: 0,
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
    // DOM plate under the canvas matches active outer mode.
    face.style.background = nodeGraphRgbFractalPlateColor(settings);
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
 * Scope pass: face is owned by rAF. No In→breath (that read as plate pulsing).
 */
function drawNodeGraphRgbFractalFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const buffer = item?.buffer;
  face._rgbFractalBreath = 1;
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
