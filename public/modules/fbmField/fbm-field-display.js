// FBM Field face: 1 WASM sample per canvas pixel. No field upscale/downscale.
// Canvas buffer size == fill_grid size. CSS may enlarge with pixelated scaling
// only when the face is bigger than the 512² WASM cap (honest blocks, not blur).

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

/**
 * Size canvas buffer to 1 sample per pixel (capped by WASM max grid).
 * DPR is NOT applied as extra supersampling — that would be a second scale.
 * CSS size = face; buffer = eval grid (1:1 with WASM).
 */
function nodeGraphFbmFieldResolveGridSize(face, wasmMaxW, wasmMaxH) {
  const cssW = Math.max(1, Math.round(face.clientWidth || 1));
  const cssH = Math.max(1, Math.round(face.clientHeight || 1));
  const maxW = Math.max(8, Math.min(512, wasmMaxW || 512));
  const maxH = Math.max(8, Math.min(512, wasmMaxH || 512));
  // Fit inside max while preserving aspect — still 1:1 samples, may pixelate via CSS if capped
  let gw = cssW;
  let gh = cssH;
  if (gw > maxW || gh > maxH) {
    const s = Math.min(maxW / gw, maxH / gh);
    gw = Math.max(1, Math.round(gw * s));
    gh = Math.max(1, Math.round(gh * s));
  }
  return { gridW: gw, gridH: gh, cssW, cssH, capped: cssW !== gw || cssH !== gh };
}

function syncNodeGraphFbmFieldCanvas1to1(canvas, face, gridW, gridH) {
  if (!canvas || !face) return false;
  if (canvas.width !== gridW || canvas.height !== gridH) {
    canvas.width = gridW;
    canvas.height = gridH;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  // If CSS stretches past 1:1 (face larger than cap), show true samples as blocks — no blur
  canvas.style.imageRendering = "pixelated";
  canvas.style.imageRendering = "crisp-edges";
  return true;
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
  face._fbmFieldTime += dt * domainRate;

  const wasm = typeof nodeGraphFbmFieldWasm !== "undefined" ? nodeGraphFbmFieldWasm.exports : null;
  const maxW = wasm?.soemdsp_fbm_field_grid_max_width?.() || 512;
  const maxH = wasm?.soemdsp_fbm_field_grid_max_height?.() || 512;
  const { gridW, gridH } = nodeGraphFbmFieldResolveGridSize(face, maxW, maxH);
  if (!syncNodeGraphFbmFieldCanvas1to1(canvas, face, gridW, gridH)) return false;

  if (typeof nodeGraphFbmFieldFillGrid !== "function") {
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }

  const grid = nodeGraphFbmFieldFillGrid({
    width: gridW,
    height: gridH,
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
  });

  if (!grid?.mono || grid.width !== gridW || grid.height !== gridH) {
    if (!face._fbmFieldHasFrame) return nodeGraphFbmFieldFillBlack(canvas, face);
    return true;
  }

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphFbmFieldSettingsForNode(patchNode);

  if (typeof nodeGraphFbmFieldGlPresent !== "function") {
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }

  const ok = nodeGraphFbmFieldGlPresent(canvas, grid.mono, grid.width, grid.height, {
    gradientStops: settings.gradientStops,
    background: settings.background,
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
  if (!face._fbmFieldRunning && typeof paintNodeGraphFbmFieldFace === "function") {
    const canvas = face.querySelector?.(".node-fbm-field-canvas");
    if (canvas) {
      paintNodeGraphFbmFieldFace(canvas, face, slot.nodeId, {
        dt: 0,
        force: true,
        face,
      });
    }
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.fbmFieldFace = drawNodeGraphFbmFieldFaceItem;
}
