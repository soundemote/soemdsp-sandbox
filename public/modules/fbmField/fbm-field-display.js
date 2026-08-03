// FBM Field face: WebGL only (no JS/CPU fBm paint).
// Soft Fractal rules: black when audio stopped/reset; freeze on Evolve≈0 / pause.

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

/**
 * Transport pause, live speed multiplier ≤ 0, or domain rate ≈ 0.
 * Domain rate = Frequency × Evolve (face scroll locked to audio probe rate).
 */
function nodeGraphFbmFieldShouldFreeze(domainRate = 0) {
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
  return !(Math.abs(Number(domainRate) || 0) > 1e-6);
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

/** Pure black — audio stopped / reset (matches Soft Fractal). */
function nodeGraphFbmFieldFillBlack(canvas, face) {
  if (!canvas) {
    return false;
  }
  if (typeof nodeGraphFbmFieldGlClearBlack === "function" && nodeGraphFbmFieldGlClearBlack(canvas)) {
    if (face?.dataset) face.dataset.lightStrength = "0";
    if (face) {
      face._fbmFieldHasFrame = false;
      face._fbmFieldBlack = true;
    }
    return true;
  }
  // Ensure canvas has size for a future GL path; CSS black plate meanwhile.
  if (face) {
    face.style.background = "#000000";
  }
  if (face?.dataset) face.dataset.lightStrength = "0";
  if (face) {
    face._fbmFieldHasFrame = false;
    face._fbmFieldBlack = true;
  }
  return true;
}

function paintNodeGraphFbmFieldFace(canvas, face, nodeId, options = {}) {
  if (!canvas || !face || !nodeId) {
    return false;
  }
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);

  if (!syncNodeGraphFbmFieldCanvasHiRes(canvas, face, pixelRatio)) {
    return false;
  }

  // Audio stopped / reset → screen off (black), not a frozen still of the field.
  if (!nodeGraphFbmFieldCircuitRunning()) {
    face._fbmFieldLastTs = 0;
    if (face._fbmFieldBlack && !options.force) {
      return true;
    }
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }
  face._fbmFieldBlack = false;

  // Frequency = same domain rate as WASM X/Y probe (units/sec).
  // Evolve multiplies face scroll (0 freezes face; 1 locks visual to Frequency).
  const frequency = Math.max(0, nodeGraphFbmFieldReadParam(nodeId, "frequency", 0.5));
  const evolve = Math.max(0, nodeGraphFbmFieldReadParam(nodeId, "speed", 1));
  const domainRate = frequency * evolve;
  const frozen = nodeGraphFbmFieldShouldFreeze(domainRate);
  // Hold last frame while paused / domainRate=0 (unless force for knob scrub still-frame).
  if (frozen && face._fbmFieldHasFrame && !options.force) {
    face._fbmFieldLastTs = 0;
    if (face.dataset) face.dataset.lightStrength = "1";
    return true;
  }

  if (!Number.isFinite(face._fbmFieldTime)) {
    face._fbmFieldTime = 0;
  }

  let dt = Number(options.dt);
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(0.05, dt);
  if (frozen) {
    dt = 0;
  }
  // Integrate domain position so Frequency moves the texture (matches audio time base).
  face._fbmFieldTime += dt * domainRate;

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
    // time already includes Frequency×Evolve; shader scroll factor = 1
    speed: 1,
    zoom: nodeGraphFbmFieldReadParam(nodeId, "zoom", 1),
  };

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphFbmFieldSettingsForNode(patchNode);
  const time = face._fbmFieldTime || 0;

  if (typeof nodeGraphFbmFieldGlPaint !== "function" || typeof nodeGraphFbmFieldGlEnsure !== "function") {
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }

  const glReady = Boolean(nodeGraphFbmFieldGlEnsure(canvas));
  if (!glReady) {
    return nodeGraphFbmFieldFillBlack(canvas, face);
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
    face._fbmFieldBlack = false;
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
