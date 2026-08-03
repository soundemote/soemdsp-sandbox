const nodeGraphModuleScopeState = {
  animationTime: 0,
  animationDeltaSeconds: 1 / 60,
  animationLastTime: 0,
  buffers: new Map(),
  drawFrame: 0,
  drawFrameHeartbeat: 0,
  drawFrameRequestedAt: 0,
  drawFrameWatchdog: 0,
  enabled: false,
  frames: 0,
  lightDisplayStates: new Map(),
  lightSpriteTextures: new Map(),
  liveFrameCapacity: 16384,
  monitorFingerprint: "",
  modelFrameTimes: new Map(),
  monitors: [],
  mode: "",
  clockPhasors: new Map(),
  oscillatorPhasors: new Map(),
  additiveHarmonicProfiles: new Map(),
  patchFingerprint: "",
  phosphorFrame: {
    key: "",
    lastUpdate: 0,
  },
  renderMetrics: {
    drawCalls: 0,
    fps: 0,
    fpsFrames: 0,
    fpsLastTime: 0,
    points: 0,
    vertices: 0,
  },
  renderDebug: {
    canvasHeight: 0,
    canvasWidth: 0,
    committedFrames: 0,
    debugHistory: [],
    drawAttempts: 0,
    lastDrawMs: 0,
    lastError: "",
    lastFrameEndMs: 0,
    lastFrameStartMs: 0,
    lastHeartbeatMs: 0,
    lastSkipReason: "",
    pendingAgeMs: 0,
    phase: "boot",
    pixelRatio: 1,
    skippedFrames: 0,
    totalSlots: 0,
    visibleItems: 0,
    zoom: 1,
  },
  scopeTracesOffActive: false,
  renderer: null,
  sampleRate: 0,
  // WeakMap, not Map: nodeGraphScope2dBurnCanvasForSlot() replaces this
  // canvas (old one .remove()'d, a new one created) whenever a node's scope
  // slot is torn down/rebuilt or the renderer version bumps. A Map would
  // hold the detached canvas -- and its WebGL context plus two framebuffers
  // and two textures -- alive forever, since nothing ever called .delete()
  // on it. That leaked one full WebGL context per node recreation, and
  // browsers hard-cap live WebGL contexts per page (Chrome: ~16) -- so
  // editing/reloading patches over a session would eventually exhaust the
  // budget and hang the whole trace renderer. A WeakMap lets the detached
  // canvas (and the GL resources tied to it) become collectible once
  // nothing else references it.
  scope2dBurnRenderers: new WeakMap(),
  slots: new Map(),
  traceDisplayDrawCache: new Map(),
  traceDisplayScratch: new Map(),
  // Per-DISPLAY-node auto-trigger lock for Trace/Output Sync (phase EMA,
  // miss timeout). Keyed by the display's own node id — NOT the shared
  // captured-signal buffer — so multiple scopes on one source keep independent
  // locks. See nodeGraphTraceDisplayStabilizedSyncStart.
  traceDisplaySyncLocks: new Map(),
  traceImageTexture: {
    dataUrl: "",
    generatedKey: "",
    image: null,
    texture: null,
  },
  versionSerial: 0,
};
const nodeGraphModuleScopeSnapshotListeners = new Set();

function addNodeGraphModuleScopeSnapshotListener(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  nodeGraphModuleScopeSnapshotListeners.add(listener);
  return () => nodeGraphModuleScopeSnapshotListeners.delete(listener);
}

function notifyNodeGraphModuleScopeSnapshotListeners() {
  for (const listener of nodeGraphModuleScopeSnapshotListeners) {
    try {
      listener();
    } catch (error) {
      console.error("module scope snapshot listener failed", error);
    }
  }
}
const nodeGraphModuleScopeSettingsStorageKey = "soemdsp-sandbox.moduleScopeSettings.v1";
const nodeGraphModuleScopeMaxBackingStoreSize = 4096;
// 1D Trace history window (UI label "History (s)"). 10s covers slow LFO /
// envelope inspection without absurd live-buffer growth at 48k.
// nodeGraphTraceDisplayMaxZoomSeconds → node-graph-module-scope-defaults.js
// nodeGraphModuleScopeDefaultSettings → node-graph-module-scope-defaults.js
// nodeGraphModuleScopeDefaultDotCores → node-graph-module-scope-defaults.js
// nodeGraphModuleScopeMinCycles → node-graph-module-scope-defaults.js
// nodeGraphModuleScopeDiscontinuityThreshold → node-graph-module-scope-defaults.js
// nodeGraphModuleScopeUnipolarTypes → node-graph-module-scope-defaults.js
function normalizeNodeGraphModuleScopeSetting(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const cycles = Number(source.cycles);
  const timeMs = Number(source.timeMs);
  const offset = Number(source.offset);
  const pan = Number(source.pan);
  return {
    blinkLightShape: ["circle", "square", "diamond"].includes(source.blinkLightShape)
      ? source.blinkLightShape
      : nodeGraphModuleScopeDefaultSettings.blinkLightShape,
    brightness: nodeGraphModuleScopeDefaultSettings.brightness,
    cycles: Number.isFinite(cycles) && cycles >= 0
      ? clampNodeSliderValue(cycles, nodeGraphModuleScopeMinCycles, 128)
      : nodeGraphModuleScopeDefaultSettings.cycles,
    gain: nodeGraphModuleScopeDefaultSettings.gain,
    lineThickness: nodeGraphModuleScopeDefaultSettings.lineThickness,
    offset: Number.isFinite(offset) ? clampNodeSliderValue(offset, -1, 1) : nodeGraphModuleScopeDefaultSettings.offset,
    oscillatorTraceMode: source.oscillatorTraceMode === "window" ? "window" : "frequencyReset",
    pan: Number.isFinite(pan) ? clampNodeSliderValue(pan, -128, 128) : nodeGraphModuleScopeDefaultSettings.pan,
    sync: source.sync !== false,
    timeMs: Number.isFinite(timeMs) && timeMs >= 0
      ? clampNodeSliderValue(timeMs, 0, 10000)
      : nodeGraphModuleScopeDefaultSettings.timeMs,
  };
}

function normalizeNodeGraphModuleScopeBrightness(value, fallback = 1) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 1;
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0, 4) : clampNodeSliderValue(safeFallback, 0, 4);
}

function nodeGraphNormalizeScopeTraceColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return nodeGraphModuleScopeDefaultDotCores.traceColor;
}

function nodeGraphScopeHexColorToRgb(color) {
  const normalized = nodeGraphNormalizeScopeTraceColor(color);
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset + 1, offset + 3), 16) / 255);
}

// Scope shader settings → node-graph-module-scope-shader-settings.js
function normalizeNodeGraphModuleScopeSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([nodeId]) => Boolean(nodeId))
      .map(([nodeId, setting]) => [nodeId, normalizeNodeGraphModuleScopeSetting(setting)]),
  );
}

function nodeGraphModuleScopeSetting(nodeId) {
  return normalizeNodeGraphModuleScopeSetting(nodeGraphMvp.moduleScopeSettings?.[nodeId]);
}

function nodeGraphModuleScopeEffectiveSettingForSlot(slot) {
  const setting = nodeGraphModuleScopeSetting(slot?.nodeId || "");
  const shader = nodeGraphModuleScopeExplicitShaderConfigForSlot(slot);
  if (!shader) {
    return setting;
  }
  const cycles = Number(shader.cycles);
  const zoom = Number(shader.zoom);
  const syncSpeed = Number(shader.syncSpeed);
  const nextSetting = { ...setting };
  if (Number.isFinite(cycles)) {
    nextSetting.cycles = clampNodeSliderValue(cycles, nodeGraphModuleScopeMinCycles, 128);
  }
  if (Number.isFinite(zoom) && zoom > 0) {
    nextSetting.shaderZoom = clampNodeSliderValue(zoom, 0.01, 50);
  }
  if (Number.isFinite(syncSpeed)) {
    nextSetting.syncSpeed = clampNodeSliderValue(syncSpeed, 0, 50);
  }
  if (shader.sync === "on") {
    return { ...nextSetting, sync: true };
  }
  if (shader.sync === "off") {
    return { ...nextSetting, sync: false };
  }
  return nextSetting;
}

function nodeGraphModuleScopePositiveCycles(setting) {
  const cycles = Number(setting?.cycles);
  if (Number.isFinite(cycles) && cycles > 0) {
    return clampNodeSliderValue(cycles, nodeGraphModuleScopeMinCycles, 128);
  }
  return nodeGraphModuleScopeDefaultSettings.cycles;
}

function nodeGraphModuleScopeVisualGain(setting) {
  const gain = Number.isFinite(Number(setting?.gain))
    ? Number(setting.gain)
    : nodeGraphModuleScopeDefaultSettings.gain;
  const zoom = Number.isFinite(Number(setting?.shaderZoom)) && Number(setting.shaderZoom) > 0
    ? Number(setting.shaderZoom)
    : 1;
  return clampNodeSliderValue(gain * zoom, 0.01, 100);
}

function nodeGraphModuleScopeEffectiveCycles(setting) {
  const cycles = Number(setting?.cycles);
  if (Number.isFinite(cycles) && cycles === 0) {
    return nodeGraphModuleScopeMinCycles;
  }
  const positiveCycles = nodeGraphModuleScopePositiveCycles(setting);
  return setting?.sync === false
    ? positiveCycles
    : Math.max(1, Math.round(positiveCycles));
}

function applyNodeGraphModuleScopeSettings(value = {}) {
  nodeGraphMvp.moduleScopeSettings = normalizeNodeGraphModuleScopeSettings(value);
  renderNodeGraphSceneScopeControls();
  scheduleNodeGraphModuleScopeDraw();
}

function loadNodeGraphModuleScopeSettingsLocal() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeGraphModuleScopeSettingsStorageKey);
    const settings = text ? normalizeNodeGraphModuleScopeSettings(JSON.parse(text)) : null;
    if (settings) {
      applyNodeGraphModuleScopeSettings(settings);
    }
    return settings;
  } catch {
    return null;
  }
}

function saveNodeGraphModuleScopeSettingsLocal(value = nodeGraphMvp.moduleScopeSettings) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(
      nodeGraphModuleScopeSettingsStorageKey,
      JSON.stringify(normalizeNodeGraphModuleScopeSettings(value)),
    );
    return true;
  } catch {
    return false;
  }
}

function updateNodeGraphModuleScopeSetting(nodeId, patch = {}) {
  if (!nodeId) {
    return;
  }
  nodeGraphMvp.moduleScopeSettings = {
    ...normalizeNodeGraphModuleScopeSettings(nodeGraphMvp.moduleScopeSettings),
    [nodeId]: normalizeNodeGraphModuleScopeSetting({
      ...nodeGraphModuleScopeSetting(nodeId),
      ...patch,
    }),
  };
  saveNodeGraphModuleScopeSettingsLocal();
  renderNodeGraphSceneScopeControls(nodeId);
  scheduleNodeGraphModuleScopeDraw();
}

function nodeGraphFormatScopeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return Number(number.toFixed(4)).toString();
}

function nodeGraphScopeControlTargetNodeId() {
  const scopeNode = nodeGraphMvp.scopeContextTargetNode;
  if (scopeNode && nodeGraphPatchNode(scopeNode)) {
    return scopeNode;
  }
  return nodeGraphModuleActionTargetNodeId();
}

// Scope scene controls → node-graph-module-scope-scene-controls.js
function nodeGraphModuleScopeCanvas() {
  return document.getElementById("nodeModuleScopeCanvas");
}

function nodeGraphModuleScopeLightCanvas() {
  return document.getElementById("nodeModuleScopeLightCanvas");
}

function nodeGraphModuleScopesEnabled() {
  return Boolean(nodeGraphModuleScopeState.enabled);
}

function setNodeGraphModuleScopesEnabled(enabled) {
  nodeGraphModuleScopeState.enabled = Boolean(enabled);
  document.getElementById("nodeGraphWorkspace")
    ?.classList.toggle("module-scopes-enabled", nodeGraphModuleScopesEnabled());
  syncNodeGraphModuleScopeHeartbeat();
  syncNodeGraphModuleScopeCanvas();
}

function syncNodeGraphModuleScopeHeartbeat() {
  if (!nodeGraphModuleScopesEnabled()) {
    if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
      window.clearInterval(nodeGraphModuleScopeState.drawFrameHeartbeat);
      nodeGraphModuleScopeState.drawFrameHeartbeat = 0;
    }
    return;
  }
  if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
    return;
  }
  nodeGraphModuleScopeState.drawFrameHeartbeat = window.setInterval(() => {
    syncNodeGraphScopeGpuDebugDisplay();
    if (!nodeGraphModuleScopeHasDrawableSlots()) {
      return;
    }
    if (nodeGraphModuleScopePaused()) {
      // While frozen, only absorb phosphor sample cursors — never step energy.
      absorbNodeGraphModuleScopePhosphorDrawCursors();
      return;
    }
    const pendingFrame = Number(nodeGraphModuleScopeState.drawFrame) || 0;
    const requestedAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
    const now = (performance.now?.() || Date.now());
    if (pendingFrame && requestedAt > 0 && now - requestedAt <= 250) {
      return;
    }
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      nodeGraphModuleScopeState.drawFrame = 0;
      nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    }
    if (nodeGraphModuleScopeState.drawFrameWatchdog) {
      window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
      nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    }
    scheduleNodeGraphModuleScopeDraw();
  }, 100);
}

// Scope slots → node-graph-module-scope-slots.js
function resetNodeGraphModuleScopeFrameClocks() {
  nodeGraphModuleScopeState.modelFrameTimes.clear();
  nodeGraphModuleScopeState.clockPhasors.clear();
  nodeGraphModuleScopeState.phosphorFrame = {
    key: "",
    lastUpdate: 0,
  };
}

/**
 * Resolve the LCD/plate color under a face canvas (CSS token, then solid bg).
 * Used when simulation stops so screens return to a cold dark plate, not a
 * frozen last frame.
 */
function nodeGraphModuleScopePlateBackgroundForElement(element) {
  if (!element || typeof getComputedStyle !== "function") {
    return nodeGraphFacePlateDefaultBackground;
  }
  const host = element.closest?.(
    ".node-module-scope-window, .node-module-scope-window-surface, .node-xy-pad, .node-led-face, .dsp-node",
  ) || element.parentElement || element;
  try {
    const style = getComputedStyle(host);
    const token = String(style.getPropertyValue("--node-scope-background") || "").trim();
    if (token) {
      return token;
    }
    const bg = String(style.backgroundColor || "").trim();
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      return bg;
    }
  } catch (_error) {
    // Best-effort; fall through to default plate.
  }
  return nodeGraphFacePlateDefaultBackground;
}

/**
 * Wipe every module screen back to idle plate — same cold look as app start.
 * Drops phosphor residual FBOs and paints face canvases solid plate color so
 * stop feels like powering the simulation off (not freezing mid-trail).
 */
// Scope wipe → node-graph-module-scope-wipe.js
function nodeGraphModuleScopeScalarValue(value) {
  const readNumber = (candidate) => {
    const number = Number(candidate);
    if (!Number.isFinite(number) || Number.isNaN(number)) {
      return null;
    }
    return number;
  };
  if (typeof value === "number") {
    return readNumber(value) ?? 0;
  }
  if (!value || typeof value !== "object") {
    return 0;
  }
  for (const key of ["Bias", "Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
    const number = readNumber(value[key]);
    if (number !== null) {
      return number;
    }
  }
  for (const candidate of Object.values(value)) {
    const number = readNumber(candidate);
    if (number !== null) {
      return number;
    }
  }
  return 0;
}

// Scope graph query → node-graph-module-scope-graph-query.js
function nodeGraphModuleScopeBuffersCurrent() {
  if (nodeGraphModuleScopeHasModelDisplay()) {
    return true;
  }
  if (!nodeGraphModuleScopeState.buffers.size) {
    return false;
  }
  const patch = nodeGraphMvp?.patch;
  if (nodeGraphModuleScopeState.mode === "live") {
    // Live rings stay valid while the audio session is up. Layout commits
    // change the full patch fingerprint without invalidating sample history;
    // do not treat that as "stale" or scopes go blank until the next plan sync.
    return Boolean(nodeGraphMvp?.live?.node);
  }
  return nodeGraphModuleScopeState.patchFingerprint === nodeGraphPatchFingerprint()
    && nodeGraphModuleScopeState.monitorFingerprint === nodeGraphModuleScopeMonitorFingerprint(
      nodeGraphModuleScopeCaptureMonitors(patch),
    );
}

function clearNodeGraphModuleScopeCanvas() {
  const canvas = nodeGraphModuleScopeCanvas();
  const lightCanvas = nodeGraphModuleScopeLightCanvas();
  if (lightCanvas) {
    const context = lightCanvas.getContext("2d");
    context?.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  }
  if (!canvas) return;
  if (nodeGraphModuleScopeState.renderer?.kind === "webgl") {
    const gl = nodeGraphModuleScopeState.renderer.gl;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  canvas.width = canvas.width;
}

function nodeGraphModuleScopeTracesOff() {
  const value = Number(nodeGraphMvp?.visualControls?.scopeTracesOff) || 0;
  return value > 0.5;
}

function nodeGraphModuleScopeCircuitRunning() {
  const live = nodeGraphMvp?.live || {};
  const contextState = String(live.context?.state || "");
  return Boolean(
    live.outputEnabled &&
    live.node &&
    live.context &&
    contextState !== "closed" &&
    contextState !== "suspended"
  );
}

/**
 * Simulation / transport pause: live speedMultiplier === 0 (Play/Pause, no
 * separate "scope pause" clock). That is the only dedicated freeze signal we
 * use for holding phosphor; visualControls.scopePaused is an optional patch
 * overlay on top.
 */
function nodeGraphModuleScopeEnginePaused() {
  const speed = Number(nodeGraphMvp?.live?.speedMultiplier);
  return Number.isFinite(speed) && speed <= 0;
}

function nodeGraphModuleScopePaused() {
  // Engine speed 0 = simulation paused (transport Play/Pause).
  if (nodeGraphModuleScopeEnginePaused()) {
    return true;
  }
  const visualPause = Number(nodeGraphMvp?.visualControls?.scopePaused) || 0;
  if (visualPause > 0.5) {
    return true;
  }
  if (!nodeGraphModuleScopeCircuitRunning()) {
    return true;
  }
  return !nodeGraphModuleScopeHasModelDisplay() && !nodeGraphModuleScopeHasRenderableSlots();
}

/**
 * Phosphor freeze: no new deposits, no decay/bleed step, hold the last face pixels.
 * Primary signal is engine speed 0. While frozen we still advance per-canvas
 * sample cursors so unpause does not dump a backlog of stamps.
 */
// nodeGraphModuleScopePhosphorFrozen → node-graph-module-scope-phosphor.js
// absorbNodeGraphPhosphorDrawCursorOnCanvas → node-graph-module-scope-phosphor.js
// absorbNodeGraphModuleScopePhosphorDrawCursors → node-graph-module-scope-phosphor.js
function nodeGraphModuleScopeBackingPixelRatio(rect, requestedPixelRatio = window.devicePixelRatio || 1) {
  const width = Math.max(1, Number(rect?.width) || 1);
  const height = Math.max(1, Number(rect?.height) || 1);
  const requested = Math.max(0.25, Number(requestedPixelRatio) || 1);
  const maxSize = Math.max(256, Number(nodeGraphModuleScopeMaxBackingStoreSize) || 4096);
  return Math.max(
    0.25,
    Math.min(
      requested,
      maxSize / width,
      maxSize / height,
    ),
  );
}

/**
 * Fixed pixel-grid backing for face-local scopes (scope2d burn / Lorenz,
 * PhosphorLight, Number Readout, local fallback canvases).
 *
 * Uses layout CSS size (clientWidth/offsetWidth) × devicePixelRatio — the same
 * contract as nodeGraphSizeDisplayCanvas (filter curve, phosphor waveform).
 * Workspace zoom must NOT grow the buffer: getBoundingClientRect is screen-
 * space and balloons with zoom, killing FPS on burn/energy FBOs. CSS width/
 * height 100% scales the fixed bitmap; .pixelated-canvas-zoom keeps it crisp
 * (blocky) when zoomed in instead of bilinear mush.
 */
function nodeGraphModuleScopeFaceBackingSize(screenElement, requestedPixelRatio = window.devicePixelRatio || 1) {
  if (!screenElement) {
    return null;
  }
  const rect = typeof screenElement.getBoundingClientRect === "function"
    ? screenElement.getBoundingClientRect()
    : { width: 0, height: 0 };
  const zoom = Math.max(
    0.01,
    Number(
      typeof nodeGraphZoom === "function"
        ? nodeGraphZoom()
        : (nodeGraphMvp && nodeGraphMvp.zoom),
    ) || 1,
  );
  // Layout (pre-transform) CSS pixels — stable under workspace zoom.
  const cssWidth = Math.max(
    1,
    Number(screenElement.clientWidth || screenElement.offsetWidth || 0)
      || (Number(rect.width) || 1) / zoom,
  );
  const cssHeight = Math.max(
    1,
    Number(screenElement.clientHeight || screenElement.offsetHeight || 0)
      || (Number(rect.height) || 1) / zoom,
  );
  // Face buffers use devicePixelRatio only (capped by max store vs layout size).
  // Do not inherit a workspace-rect-derived ratio that shrank for the whole
  // graph, and never scale by workspace zoom.
  const requested = Math.max(
    0.25,
    Number(window.devicePixelRatio)
      || Number(requestedPixelRatio)
      || 1,
  );
  const pixelRatio = nodeGraphModuleScopeBackingPixelRatio(
    { width: cssWidth, height: cssHeight },
    requested,
  );
  return {
    cssHeight,
    cssWidth,
    height: Math.max(1, Math.round(cssHeight * pixelRatio)),
    pixelRatio,
    width: Math.max(1, Math.round(cssWidth * pixelRatio)),
  };
}

function syncNodeGraphModuleScopeCanvas() {
  const canvas = nodeGraphModuleScopeCanvas();
  const lightCanvas = nodeGraphModuleScopeLightCanvas();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!canvas || !workspace) {
    return false;
  }

  const rect = workspace.getBoundingClientRect();
  const pixelRatio = nodeGraphModuleScopeBackingPixelRatio(rect);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  nodeGraphModuleScopeState.backingPixelRatio = pixelRatio;
  if (nodeGraphModuleScopeState.renderer?.canvas === canvas) {
    nodeGraphModuleScopeState.renderer.pixelRatio = pixelRatio;
  }
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  if (lightCanvas) {
    if (lightCanvas.width !== width) {
      lightCanvas.width = width;
    }
    if (lightCanvas.height !== height) {
      lightCanvas.height = height;
    }
  }
  return true;
}

// Scope WebGL → node-graph-module-scope-webgl.js
// Scope buffer views → node-graph-module-scope-buffer-view.js
function runNodeGraphModuleScopeDrawFrame(source = "raf") {
  try {
    drawNodeGraphModuleScopes();
  } catch (error) {
    markNodeGraphModuleScopeDebugError(error);
    console.error(`node graph module scope ${source} draw failed`, error);
    scheduleNodeGraphModuleScopeDraw();
  }
}

// Scope geometry → node-graph-module-scope-geometry.js
// Scope vertices/textures → node-graph-module-scope-vertices.js
// Scope screen items → node-graph-module-scope-screen-items.js
