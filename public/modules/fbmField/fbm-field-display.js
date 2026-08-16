// Fractal Brownian Field face: 1 WASM sample per canvas pixel.
// Canvas buffer size == fill_grid size. CSS may enlarge with pixelated scaling
// only when the face is bigger than the 512² WASM cap (honest blocks, not blur).

const nodeGraphFbmFieldSettingsDefaults = Object.freeze({
  background: "#05060a",
  // Late black→white ramp (ellipsoid-circleghj FBM face).
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.396, color: "#000000" }),
    Object.freeze({ t: 0.999, color: "#ffffff" }),
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

function nodeGraphFbmFieldEnsureCanvasSize(canvas, face) {
  if (!canvas) return false;
  const cssW = Math.max(1, Math.round(face?.clientWidth || canvas.clientWidth || canvas.width || 1));
  const cssH = Math.max(1, Math.round(face?.clientHeight || canvas.clientHeight || canvas.height || 1));
  if (canvas.width !== cssW || canvas.height !== cssH) {
    canvas.width = cssW;
    canvas.height = cssH;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "pixelated";
  canvas.style.imageRendering = "crisp-edges";
  return true;
}

function nodeGraphFbmFieldFillBlack(canvas, face) {
  if (!canvas) return false;
  nodeGraphFbmFieldEnsureCanvasSize(canvas, face);
  let cleared = false;
  if (typeof nodeGraphFbmFieldGlClearBlack === "function") {
    cleared = Boolean(nodeGraphFbmFieldGlClearBlack(canvas));
  }
  // If WebGL clear failed (no context yet / lost), force a blank buffer.
  if (!cleared) {
    try {
      // Resize trick drops any prior drawing buffer contents.
      const w = Math.max(1, canvas.width | 0);
      const h = Math.max(1, canvas.height | 0);
      canvas.width = w;
      canvas.height = h;
    } catch (_error) {
      // Best-effort.
    }
  }
  if (face) {
    face.style.background = "#000000";
    face._fbmFieldBlack = true;
    face._fbmFieldHasFrame = false;
    face._fbmFieldTime = 0;
    face._fbmFieldLastTs = 0;
    nodeGraphFbmFieldSyncProbeMarkers(face, face.dataset?.node || "", false);
  }
  if (face?.dataset) face.dataset.lightStrength = "0";
  if (typeof setNodeGraphLightStrength === "function" && face) {
    try {
      setNodeGraphLightStrength(face, 0);
    } catch (_error) {
      // Best-effort.
    }
  }
  return true;
}

/**
 * Full cold-stop: cancel every FBM face rAF and plate the screens black.
 * Called from module-scope wipe (engine stop) and when transport is stopped.
 */
function wipeNodeGraphFbmFieldScreensToColdBoot() {
  if (typeof document === "undefined") return;
  for (const face of document.querySelectorAll(".node-fbm-field-face")) {
    if (typeof nodeGraphFbmFieldStopLoop === "function") {
      nodeGraphFbmFieldStopLoop(face);
    } else if (face._fbmFieldRaf) {
      cancelAnimationFrame(face._fbmFieldRaf);
      face._fbmFieldRaf = 0;
      face._fbmFieldRunning = false;
    }
    const canvas = face.querySelector?.(".node-fbm-field-canvas");
    if (canvas) {
      nodeGraphFbmFieldFillBlack(canvas, face);
    } else {
      face._fbmFieldBlack = true;
      face._fbmFieldHasFrame = false;
      face._fbmFieldTime = 0;
      if (face.dataset) face.dataset.lightStrength = "0";
    }
  }
}

/**
 * Transport sync: when engine is live, ensure each mounted FBM face is painting;
 * when stopped, kill loops and keep screens black (no idle field preview).
 */
function syncNodeGraphFbmFieldFacesToLiveState() {
  if (typeof document === "undefined") return;
  const running = nodeGraphFbmFieldCircuitRunning();
  const faces = document.querySelectorAll(".node-fbm-field-face");
  if (!faces.length) return;
  if (!running) {
    // Only re-wipe when something is still spinning or still showing a frame.
    let needsWipe = false;
    for (const face of faces) {
      if (face._fbmFieldRunning || face._fbmFieldHasFrame || !face._fbmFieldBlack) {
        needsWipe = true;
        break;
      }
    }
    if (needsWipe) wipeNodeGraphFbmFieldScreensToColdBoot();
    return;
  }
  for (const face of faces) {
    const nodeId = face.dataset?.node;
    if (!nodeId) continue;
    if (typeof nodeGraphFbmFieldStartLoop === "function") {
      nodeGraphFbmFieldStartLoop(face, nodeId);
    }
  }
}

/**
 * Map field-space probe (sx,sy) → face UV (matches fill_grid + rotate).
 * Probes: X=center, Y=+X offset, Z=+Y offset (span*0.35) — same as native sample().
 */
function nodeGraphFbmFieldProbeToFaceUv(sx, sy, panX, panY, span, cosR, sinR) {
  const rx = sx - panX;
  const ry = sy - panY;
  // Inverse of face rotate: [px,py] = R^T * [rx,ry]
  const px = rx * cosR + ry * sinR;
  const py = -rx * sinR + ry * cosR;
  const nx = span > 1e-12 ? px / span : 0;
  const ny = span > 1e-12 ? py / span : 0;
  return {
    u: (nx + 1) * 0.5,
    v: (1 - ny) * 0.5,
  };
}

/** Debug UI on: Hide Debug off (body without keyboard-debug-hidden). */
function nodeGraphFbmFieldDebugOverlayEnabled() {
  try {
    return !document.body?.classList?.contains("keyboard-debug-hidden");
  } catch (_error) {
    return false;
  }
}

function nodeGraphFbmFieldSyncProbeMarkers(face, nodeId, visible) {
  const overlay = face?.querySelector?.(".node-fbm-field-probe-overlay");
  if (!overlay) return;
  const debugOn = nodeGraphFbmFieldDebugOverlayEnabled();
  const show = Boolean(visible) && debugOn;
  const modeTag = overlay.querySelector(".node-fbm-field-debug-mode-tag");
  const svg = overlay.querySelector(".node-fbm-field-probe-svg");
  const tri = overlay.querySelector(".node-fbm-field-volume-tri");
  if (!show) {
    for (const mark of overlay.querySelectorAll(".node-fbm-field-probe-mark")) {
      mark.style.display = "none";
    }
    if (modeTag) modeTag.style.display = "none";
    if (svg) svg.style.display = "none";
    return;
  }
  const zoom = Math.max(0.05, nodeGraphFbmFieldReadParam(nodeId, "zoom", 1));
  const panX = nodeGraphFbmFieldReadParam(nodeId, "panX", 0);
  const panY = nodeGraphFbmFieldReadParam(nodeId, "panY", 0);
  const rotate = nodeGraphFbmFieldReadParam(nodeId, "rotate", 0);
  const motion = Math.max(0, Math.min(1, Math.round(nodeGraphFbmFieldReadParam(nodeId, "motion", 1))));
  const isVolume = motion === 1;
  const span = 1 / zoom;
  const d = span * 0.35;
  const ang = rotate * Math.PI * 2;
  const cosR = Math.cos(ang);
  const sinR = Math.sin(ang);
  // Match native soemdsp_fbm_field_sample probe layout.
  const probes = [
    { key: "X", sx: panX, sy: panY, color: "rgba(120,220,255,0.95)" },
    { key: "Y", sx: panX + d, sy: panY, color: "rgba(160,255,140,0.95)" },
    { key: "Z", sx: panX, sy: panY + d, color: "rgba(255,190,120,0.95)" },
  ];
  if (modeTag) {
    modeTag.style.display = "block";
    modeTag.textContent = isVolume ? "VOLUME  (t → lattice Z)" : "SCROLL  (t → pan XY)";
    modeTag.style.borderColor = isVolume
      ? "rgba(255,200,80,0.55)"
      : "rgba(140,200,255,0.45)";
    modeTag.style.color = isVolume
      ? "rgba(255,220,140,0.95)"
      : "rgba(180,220,255,0.95)";
  }
  const faceW = Math.max(1, face.clientWidth || 1);
  const faceH = Math.max(1, face.clientHeight || 1);
  const triPts = [];
  for (const p of probes) {
    const mark = overlay.querySelector(`.node-fbm-field-probe-mark[data-probe="${p.key}"]`);
    if (!mark) continue;
    const { u, v } = nodeGraphFbmFieldProbeToFaceUv(p.sx, p.sy, panX, panY, span, cosR, sinR);
    // Hide if outside the face (zoom/pan can push Y/Z off-screen).
    if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) {
      mark.style.display = "none";
      const halo = mark.querySelector(".node-fbm-field-probe-halo");
      if (halo) halo.style.display = "none";
      continue;
    }
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, v));
    mark.style.display = "flex";
    mark.style.left = `${cu * 100}%`;
    mark.style.top = `${cv * 100}%`;
    const ring = mark.querySelector(".node-fbm-field-probe-ring");
    if (ring) ring.style.borderColor = p.color;
    const label = mark.querySelector(".node-fbm-field-probe-label");
    if (label) label.style.color = p.color;
    const halo = mark.querySelector(".node-fbm-field-probe-halo");
    if (halo) halo.style.display = isVolume ? "block" : "none";
    triPts.push(`${(cu * faceW).toFixed(1)},${(cv * faceH).toFixed(1)}`);
  }
  if (svg && tri) {
    if (isVolume && triPts.length >= 2) {
      svg.style.display = "block";
      tri.setAttribute("points", triPts.join(" "));
    } else {
      svg.style.display = "none";
      tri.setAttribute("points", "");
    }
  }
}

function paintNodeGraphFbmFieldFace(canvas, face, nodeId, options = {}) {
  if (!canvas || !face || !nodeId) return false;

  if (typeof nodeGraphFbmFieldLoadWasm === "function") {
    nodeGraphFbmFieldLoadWasm();
  }

  if (!nodeGraphFbmFieldCircuitRunning()) {
    face._fbmFieldLastTs = 0;
    face._fbmFieldTime = 0;
    // Stop the paint loop — screen must not keep "running" while engine is off.
    if (face._fbmFieldRunning && typeof nodeGraphFbmFieldStopLoop === "function") {
      nodeGraphFbmFieldStopLoop(face);
    } else if (face._fbmFieldRunning) {
      if (face._fbmFieldRaf) {
        cancelAnimationFrame(face._fbmFieldRaf);
        face._fbmFieldRaf = 0;
      }
      face._fbmFieldRunning = false;
    }
    nodeGraphFbmFieldSyncProbeMarkers(face, nodeId, false);
    // Always plate black on stop (force re-clear even if already flagged black —
    // wipe / remount / size change can leave a stale WebGL frame).
    return nodeGraphFbmFieldFillBlack(canvas, face);
  }
  face._fbmFieldBlack = false;

  // Frequency alone is domain rate (same as WASM X/Y path). No second rate knob.
  const frequency = Math.max(0, nodeGraphFbmFieldReadParam(nodeId, "frequency", 20));
  const frozen = nodeGraphFbmFieldShouldFreeze(frequency);
  if (frozen && face._fbmFieldHasFrame && !options.force) {
    face._fbmFieldLastTs = 0;
    if (face.dataset) face.dataset.lightStrength = "1";
    nodeGraphFbmFieldSyncProbeMarkers(face, nodeId, true);
    return true;
  }

  if (!Number.isFinite(face._fbmFieldTime)) face._fbmFieldTime = 0;
  let dt = Number(options.dt);
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(0.05, dt);
  if (frozen) dt = 0;
  face._fbmFieldTime += dt * frequency;

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
    // 0 Scroll · 1 Volume — same mapping as X/Y/Z probes
    motion: nodeGraphFbmFieldReadParam(nodeId, "motion", 1),
    brightness: nodeGraphFbmFieldReadParam(nodeId, "brightness", 1),
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
    nodeGraphFbmFieldSyncProbeMarkers(face, nodeId, true);
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

function nodeGraphFbmFieldCollectFaces() {
  const faces = [];
  if (typeof document === "undefined") {
    return faces;
  }
  const nodes = document.querySelectorAll(".node-fbm-field-face");
  for (const face of nodes) {
    if (face.closest?.(".dsp-node")?.classList.contains("viewport-asleep")) {
      continue;
    }
    const nodeId = face.dataset?.node
      || face.closest?.(".dsp-node")?.dataset?.node
      || "";
    if (typeof nodeGraphScreenSoloAllowsNode === "function"
      && !nodeGraphScreenSoloAllowsNode(nodeId)) {
      continue;
    }
    faces.push({ face, nodeId });
  }
  return faces;
}

function paintNodeGraphFbmFieldFacesNow(options = {}) {
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : Math.max(0, Math.round(Number(nodeGraphMvp?.moduleScopeFramesPerSecond) || 60));
  const dt = options.dt != null
    ? Number(options.dt)
    : (fps > 0 ? Math.min(0.05, 1 / fps) : 0);
  let painted = 0;
  for (const { face, nodeId } of nodeGraphFbmFieldCollectFaces()) {
    if (!nodeId) {
      continue;
    }
    try {
      paintNodeGraphFbmFieldFaceForNode(nodeId, {
        dt: Number.isFinite(dt) ? dt : 0,
        face,
        force: options.force === true,
      });
      painted += 1;
    } catch (_error) {
      // Best-effort per face.
    }
  }
  return painted;
}

function drawNodeGraphFbmFieldFaceItem() {
  // Live write is once, after the shared Simulation FPS gate.
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.fbmFieldFace = drawNodeGraphFbmFieldFaceItem;
}
