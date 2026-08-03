// FBM Field face: 2D noise field from WASM fill_grid (same fbm2d as X/Y).
// WebGL only presents/upscales + gradient LUT — no JS/GLSL noise evaluation.

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

/** WASM grid resolution (bilinear upscale to full face). */
const NODE_GRAPH_FBM_FIELD_GRID = 192;

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
  if (!node) return normalizeNodeGraphFbmFieldSettings();
  return normalizeNodeGraphFbmFieldSettings(node.traceDisplaySettings);
}

function nodeGraphFbmFieldReadParam(nodeId, key, fallback) {
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = nodeGraphReadNodeNumber(nodeId, key);
    if (Number.isFinite(n)) return n;
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const raw = Number(node?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function nodeGraphFbmFieldCircuitRunning() {
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

function nodeGraphFbmFieldShouldFreeze(domainRate) {
  try {
    if (typeof nodeGraphModuleScopeEnginePaused === "function" && nodeGraphModuleScopeEnginePaused()) {
      return true;
    }
  } catch (_) { /* fall through */ }
  try {
    const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
    if (Number.isFinite(speed) && speed <= 0) return true;
  } catch (_) { /* fall through */ }
  return !(Math.abs(Number(domainRate) || 0) > 1e-6);
}

function syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio) {
  if (!canvas || !face) return false;
  const dpr = Math.min(2, Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1));
  const w = Math.max(1, Math.round(face.clientWidth * dpr));
  const h = Math.max(1, Math.round(face.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "auto";
  return w > 0 && h > 0;
}

function nodeGraphFbmFieldFillBlack(canvas, face) {
  if (typeof nodeGraphFbmFieldGlClearBlack === "function" && nodeGraphFbmFieldGlClearBlack(canvas)) {
    if (face?.dataset) face.dataset.lightStrength = "0";
    if (face) {
      face._fbmFieldBlack = true;
      face._fbmFieldHasFrame = false;
    }
    return true;
  }
  if (face) {
    face.style.background = "#000000";
    face._fbmFieldBlack = true;
    face._fbmFieldHasFrame = false;
  }
  if (face?.dataset) face.dataset.lightStrength = "0";
  return true;
}

function paintNodeGraphFbmFieldFace(canvas, face, nodeId, options = {}) {
  if (!canvas || !face || !nodeId) return false;
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  if (!syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio)) return false;

  // Kick wasm load early
  if (typeof nodeGraphFbmFieldLoadWasm === "function") {
    nodeGraphFbmFieldLoadWasm();
  }

  if (!nodeGraphFbmFieldCircuitRunning()) {
    face._fbmFieldLastTs = 0;
    if (face._fbmFieldBlack && !options.force) return true;
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }
  face._fbmFieldBlack = false;

  const frequency = Math.max(0, nodeGraphFbmFieldReadParam(nodeId, "frequency", 0.5));
  const evolve = Math.max(0, nodeGraphFbmFieldReadParam(nodeId, "speed", 1));
  const domainRate = frequency * evolve;
  const frozen = nodeGraphFbmFieldShouldFreeze(domainRate);
  if (frozen && face._fbmFieldHasFrame && !options.force) {
    face._fbmFieldLastTs = 0;
    if (face.dataset) face.dataset.lightStrength = "1";
    return true;
  }

  if (!Number.isFinite(face._fbmFieldTime)) face._fbmFieldTime = 0;
  let dt = Number(options.dt);
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(0.05, dt);
  if (frozen) dt = 0;
  // Same domain rate as audio: frequency * evolve (units/sec)
  face._fbmFieldTime += dt * domainRate;

  const params = {
    domainTime: face._fbmFieldTime,
    zoom: nodeGraphFbmFieldReadParam(nodeId, "zoom", 1),
    panX: nodeGraphFbmFieldReadParam(nodeId, "panX", 0),
    panY: nodeGraphFbmFieldReadParam(nodeId, "panY", 0),
    rotate: nodeGraphFbmFieldReadParam(nodeId, "rotate", 0),
    seed: nodeGraphFbmFieldReadParam(nodeId, "seed", 1),
    octaves: nodeGraphFbmFieldReadParam(nodeId, "octaves", 4),
    persistence: nodeGraphFbmFieldReadParam(nodeId, "persistence", 0.5),
    lacunarity: nodeGraphFbmFieldReadParam(nodeId, "lacunarity", 2),
    scale: nodeGraphFbmFieldReadParam(nodeId, "scale", 1),
    smoothness: nodeGraphFbmFieldReadParam(nodeId, "smoothness", 0.55),
    contrast: nodeGraphFbmFieldReadParam(nodeId, "contrast", 1),
    width: NODE_GRAPH_FBM_FIELD_GRID,
    height: NODE_GRAPH_FBM_FIELD_GRID,
  };

  if (typeof nodeGraphFbmFieldFillGrid !== "function") {
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }
  const grid = nodeGraphFbmFieldFillGrid(params);
  if (!grid?.mono) {
    // wasm not ready yet
    if (!face._fbmFieldHasFrame) {
      return nodeGraphFbmFieldFillBlack(canvas, face);
    }
    return true;
  }

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphFbmFieldSettingsForNode(patchNode);
  const soft = Math.max(0, Math.min(1, 0.15 + params.smoothness * 0.4));

  if (typeof nodeGraphFbmFieldGlPresent !== "function") {
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }
  const ok = nodeGraphFbmFieldGlPresent(canvas, grid.mono, grid.width, grid.height, {
    gradientStops: settings.gradientStops,
    background: settings.background,
    soft,
  });
  if (ok) {
    if (face.dataset) face.dataset.lightStrength = "1";
    face._fbmFieldHasFrame = true;
    face._fbmFieldBlack = false;
  }
  return ok;
}

function paintNodeGraphFbmFieldFaceForNode(nodeId, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id) return false;
  const face = options.face
    || (typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(id)?.querySelector?.(".node-fbm-field-face")
      : null);
  const canvas = face?.querySelector?.(".node-fbm-field-canvas");
  if (!face || !canvas) return false;
  return paintNodeGraphFbmFieldFace(canvas, face, id, options);
}

function drawNodeGraphFbmFieldFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) return;
  // Scope pass: force still/update when rAF is not the owner.
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
