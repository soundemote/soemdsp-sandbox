// FBM Field face: WebGL only (no JS/CPU fBm paint). Black plate if GL missing.

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

function nodeGraphFbmFieldFillBackground(canvas, face, background) {
  // Prefer GL clear if this canvas already has a GL context (never call 2d on it).
  if (typeof nodeGraphFbmFieldGlEnsure === "function") {
    const state = nodeGraphFbmFieldGlEnsure(canvas);
    if (state?.gl && !state.lost) {
      const gl = state.gl;
      const bg = typeof nodeGraphFbmFieldGlHexToRgb01 === "function"
        ? nodeGraphFbmFieldGlHexToRgb01(background)
        : [0.02, 0.024, 0.04];
      gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (face?.dataset) face.dataset.lightStrength = "0";
      return true;
    }
  }
  // No WebGL: solid CSS background only (no JS fBm).
  if (face) {
    face.style.background = background || "#05060a";
  }
  if (face?.dataset) face.dataset.lightStrength = "0";
  return false;
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

  if (typeof nodeGraphFbmFieldGlPaint !== "function" || typeof nodeGraphFbmFieldGlEnsure !== "function") {
    return nodeGraphFbmFieldFillBackground(canvas, face, settings.background);
  }

  if (!syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio)) {
    return false;
  }

  const glReady = Boolean(nodeGraphFbmFieldGlEnsure(canvas));
  if (!glReady) {
    return nodeGraphFbmFieldFillBackground(canvas, face, settings.background);
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
