// FBM Field face: WebGL 2D fBm (primary) + low-res CPU fallback.
// Gradient via shared Display Settings multi-stop LUT.

const nodeGraphFbmFieldSettingsDefaults = Object.freeze({
  background: "#05060a",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.25, color: "#1a2744" }),
    Object.freeze({ t: 0.5, color: "#3d7ea6" }),
    Object.freeze({ t: 0.75, color: "#c4e0a8" }),
    Object.freeze({ t: 1, color: "#ffffff" }),
  ]),
});

/** CPU fallback only — long-side cap. */
const NODE_GRAPH_FBM_FIELD_CPU_MAX = 96;
const NODE_GRAPH_FBM_FIELD_CPU_SIM_MS = 33;

function normalizeNodeGraphFbmFieldSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphFbmFieldSettingsDefaults;
  const peak = defaults.gradientStops[defaults.gradientStops.length - 1].color;
  let gradientStops;
  if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    if (source.gradientStops || source.gradient) {
      gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, peak);
    } else {
      gradientStops = defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
    }
  } else if (typeof normalizeNodeGraphSharedGradientStops === "function") {
    gradientStops = normalizeNodeGraphSharedGradientStops(
      source.gradientStops ?? source.gradient,
      defaults.gradientStops,
    );
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

function nodeGraphFbmFieldSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphFbmFieldSettings();
  }
  return normalizeNodeGraphFbmFieldSettings(node.traceDisplaySettings);
}

function nodeGraphFbmFieldReadParam(nodeId, key, fallback) {
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

function nodeGraphFbmFieldSampleGradientRgb(stops, energy) {
  if (typeof nodeGraphLedSampleGradientRgb === "function") {
    return nodeGraphLedSampleGradientRgb(stops, energy);
  }
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    return nodeGraphSampleGradientStopsRgb(stops, energy, "#ffffff");
  }
  const t = Math.max(0, Math.min(1, Number(energy) || 0));
  const list = Array.isArray(stops) && stops.length >= 2 ? stops : nodeGraphFbmFieldSettingsDefaults.gradientStops;
  const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return [255, 255, 255];
    return m.slice(1).map((p) => Number.parseInt(p, 16));
  };
  const parsed = list.map((s) => {
    const [r, g, b] = hexToRgb(s?.color);
    return { t: Math.max(0, Math.min(1, Number(s?.t) || 0)), r, g, b };
  }).sort((a, b) => a.t - b.t);
  if (t <= parsed[0].t) return [parsed[0].r, parsed[0].g, parsed[0].b];
  const last = parsed[parsed.length - 1];
  if (t >= last.t) return [last.r, last.g, last.b];
  for (let i = 1; i < parsed.length; i += 1) {
    const a = parsed[i - 1];
    const b = parsed[i];
    if (t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return [
        Math.round(a.r + (b.r - a.r) * u),
        Math.round(a.g + (b.g - a.g) * u),
        Math.round(a.b + (b.b - a.b) * u),
      ];
    }
  }
  return [last.r, last.g, last.b];
}

/** Full-res canvas for WebGL (Soft Fractal style). */
function syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
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

/** Low-res canvas only when CPU path is forced. */
function syncNodeGraphFbmFieldCanvasCpu(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  const dpr = Math.max(1, Math.min(2, Number(pixelRatio) || window.devicePixelRatio || 1));
  const cssW = Math.max(1, face.clientWidth || 1);
  const cssH = Math.max(1, face.clientHeight || 1);
  const long = Math.max(cssW, cssH);
  const gridScale = Math.min(1, NODE_GRAPH_FBM_FIELD_CPU_MAX / Math.max(1, long));
  const w = Math.max(8, Math.round(cssW * gridScale * dpr));
  const h = Math.max(8, Math.round(cssH * gridScale * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "pixelated";
  return w > 0 && h > 0;
}

function paintNodeGraphFbmFieldFaceCpu(canvas, face, nodeId, params, settings, time) {
  if (typeof nodeGraphFbmFieldFaceMono !== "function") {
    return false;
  }
  if (!syncNodeGraphFbmFieldCanvasCpu(canvas, face)) {
    return false;
  }
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return false;
  }
  const stops = settings.gradientStops;
  const bg = settings.background || "#05060a";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const faceParams = {
    ...params,
    octaves: Math.min(5, Math.round(params.octaves) || 4),
  };
  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      const mono = nodeGraphFbmFieldFaceMono(u, v, faceParams, time);
      const [r, g, b] = nodeGraphFbmFieldSampleGradientRgb(stops, mono);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}

function paintNodeGraphFbmFieldFace(canvas, face, nodeId, options = {}) {
  if (!canvas || !face || !nodeId) {
    return false;
  }
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);

  if (!Number.isFinite(face._fbmFieldTime)) {
    face._fbmFieldTime = 0;
  }
  const dt = Number(options.dt) || 0;
  face._fbmFieldTime += Math.min(0.05, Math.max(0, dt));

  const params = {
    contrast: nodeGraphFbmFieldReadParam(nodeId, "contrast", 1),
    lacunarity: nodeGraphFbmFieldReadParam(nodeId, "lacunarity", 2),
    octaves: nodeGraphFbmFieldReadParam(nodeId, "octaves", 4),
    panX: nodeGraphFbmFieldReadParam(nodeId, "panX", 0),
    panY: nodeGraphFbmFieldReadParam(nodeId, "panY", 0),
    persistence: nodeGraphFbmFieldReadParam(nodeId, "persistence", 0.5),
    rotate: nodeGraphFbmFieldReadParam(nodeId, "rotate", 0),
    scale: nodeGraphFbmFieldReadParam(nodeId, "scale", 1),
    seed: nodeGraphFbmFieldReadParam(nodeId, "seed", 1),
    smoothness: nodeGraphFbmFieldReadParam(nodeId, "smoothness", 0.55),
    speed: nodeGraphFbmFieldReadParam(nodeId, "speed", 0.15),
    zoom: nodeGraphFbmFieldReadParam(nodeId, "zoom", 1),
  };

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphFbmFieldSettingsForNode(patchNode);
  const time = face._fbmFieldTime || 0;

  // Prefer WebGL full-face (high res) — never call 2d on a canvas that already has WebGL.
  const wantGl = typeof nodeGraphFbmFieldGlPaint === "function";
  const glReady = wantGl && typeof nodeGraphFbmFieldGlEnsure === "function"
    ? Boolean(nodeGraphFbmFieldGlEnsure(canvas))
    : false;

  if (glReady) {
    if (!syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio)) {
      return false;
    }
    const ok = nodeGraphFbmFieldGlPaint(canvas, {
      ...params,
      time,
      gradientStops: settings.gradientStops,
      background: settings.background,
    });
    if (ok) {
      if (face.dataset) face.dataset.lightStrength = "1";
      face._fbmFieldHasFrame = true;
      return true;
    }
  }

  // CPU throttle when no GL
  if (!options.force && face._fbmFieldHasFrame) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lastSim = Number(face._fbmFieldLastSimMs) || 0;
    if (now - lastSim < NODE_GRAPH_FBM_FIELD_CPU_SIM_MS) {
      return true;
    }
    face._fbmFieldLastSimMs = now;
  } else {
    face._fbmFieldLastSimMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  const ok = paintNodeGraphFbmFieldFaceCpu(canvas, face, nodeId, params, settings, time);
  if (ok) {
    if (face.dataset) face.dataset.lightStrength = "1";
    face._fbmFieldHasFrame = true;
  }
  return ok;
}

function paintNodeGraphFbmFieldFaceForNode(nodeId, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const face = options.face
    || (typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(id)?.querySelector?.(".node-fbm-field-face")
      : null);
  const canvas = face?.querySelector?.(".node-fbm-field-canvas");
  if (!face || !canvas) {
    return false;
  }
  return paintNodeGraphFbmFieldFace(canvas, face, id, options);
}

function drawNodeGraphFbmFieldFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  if (!face._fbmFieldRunning && typeof paintNodeGraphFbmFieldFace === "function") {
    const canvas = face.querySelector?.(".node-fbm-field-canvas");
    if (canvas) {
      paintNodeGraphFbmFieldFace(canvas, face, slot.nodeId, {
        dt: 0,
        force: true,
        face,
        pixelRatio,
      });
    }
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.fbmFieldFace = drawNodeGraphFbmFieldFaceItem;
}
