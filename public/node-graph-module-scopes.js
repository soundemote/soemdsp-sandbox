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
  // Per-DISPLAY-node trigger-lock cache for the "Sync" trace setting, keyed
  // by the display's own node id -- NOT the shared captured-signal buffer.
  // Multiple scopes watching the same source share one buffer object; the
  // lock used to be cached as properties on that shared buffer, so with 2+
  // scopes (each with its own zoom/cycles) each frame's draw clobbered the
  // others' lock, forcing a full re-acquire almost every frame -- worse the
  // more scopes shared a source. See nodeGraphTraceDisplayStabilizedSyncStart.
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
const nodeGraphTraceDisplayMaxZoomSeconds = 2;
const nodeGraphModuleScopeDefaultSettings = Object.freeze({
  blinkLightShape: "circle",
  brightness: 1,
  cycles: 2,
  gain: 1,
  lineThickness: 1,
  offset: 0,
  oscillatorTraceMode: "frequencyReset",
  pan: 0,
  sync: true,
  timeMs: 20,
});
const nodeGraphModuleScopeDefaultDotCores = Object.freeze({
  dot1: Object.freeze({
    brightness: 4.5,
    color: "#ffffff",
    size: 3.18,
  }),
  traceColor: "#3de0ff",
});
const nodeGraphModuleScopeMinCycles = 1;
const nodeGraphModuleScopeDiscontinuityThreshold = 0.85;
const nodeGraphModuleScopeUnipolarTypes = new Set([
  "badvalMonitor",
  "clock",
  "clockDivider",
  "delayedTrigger",
  "expAdsr",
  "linearEnvelope",
  "midiNotePitch",
  "midiOut",
  "pluckEnvelope",
  "bloomGlow",
  "chromaColor",
  "rgbaHsla",
  "sandboxVisuals",
  "stepSequencer",
  "triggerCounter",
  "triggerDivider",
  "vactrolEnvelopeSeries",
  "vactrolEnvelopeCustom",
]);

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

function nodeGraphModuleScopeDefaultShaderSourceForNode(node) {
  try {
    const moduleDefault = typeof nodeGraphScopeShaderModuleDefaultSource === "function"
      ? nodeGraphScopeShaderModuleDefaultSource(node)
      : "";
    if (moduleDefault) {
      return moduleDefault;
    }
  } catch {
    // Fall through to the built-in starter shader.
  }
  const builtInSource = typeof nodeGraphScopeShaderDefaultSourceForType === "function"
    ? nodeGraphScopeShaderDefaultSourceForType(node?.type)
    : "";
  return normalizeNodeGraphScopeShader({ source: builtInSource }).source;
}

function nodeGraphModuleScopeExplicitShaderSourceForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return "";
  }
  try {
    const liveState = typeof nodeGraphShaderScriptState !== "undefined" ? nodeGraphShaderScriptState : null;
    const dialog = typeof nodeGraphShaderScriptDialog === "function" ? nodeGraphShaderScriptDialog() : null;
    if (
      liveState?.dialogMode === "scope" &&
      liveState.scopeTargetNodeId === node.id &&
      dialog &&
      !dialog.hidden
    ) {
      return document.getElementById("nodeShaderScriptSource")?.value || "";
    }
  } catch {
    // Scope rendering should survive if the editor is unavailable.
  }
  return Object.hasOwn(node, "scopeShader")
    ? normalizeNodeGraphScopeShader(node.scopeShader).source
    : "";
}

function nodeGraphModuleScopeShaderSourceForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return "";
  }
  return nodeGraphModuleScopeExplicitShaderSourceForSlot(slot) ||
    nodeGraphModuleScopeDefaultShaderSourceForNode(node);
}

function nodeGraphModuleScopeShaderVideoInputForSlot(slot) {
  return normalizeNodeGraphScopeShader({ source: nodeGraphModuleScopeShaderSourceForSlot(slot) }).videoInput;
}

function nodeGraphModuleScopeShaderConfigForSlot(slot) {
  return normalizeNodeGraphScopeShader({ source: nodeGraphModuleScopeShaderSourceForSlot(slot) });
}

function nodeGraphModuleScopeExplicitShaderConfigForSlot(slot) {
  const source = nodeGraphModuleScopeExplicitShaderSourceForSlot(slot);
  return source ? normalizeNodeGraphScopeShader({ source }) : null;
}

function nodeGraphModuleScopeShaderOutputPortForSlot(slot) {
  const videoInput = nodeGraphModuleScopeShaderVideoInputForSlot(slot);
  const match = String(videoInput || "").match(/^output(\d+)$/);
  if (!match) {
    return "";
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const outputs = node ? nodeGraphPatchNodeOutputPorts(node) : [];
  return outputs[Number(match[1])] || "";
}

function nodeGraphModuleScopeShaderAssignmentValue(source, dotName, key) {
  const safeDotName = dotName === "dot2" ? "dot2" : "dot1";
  const safeKey = String(key || "").replace(/[^\w]/g, "");
  if (!safeKey) {
    return "";
  }
  const match = String(source || "").match(new RegExp(`\\b${safeDotName}\\.${safeKey}\\s*=\\s*([^;]+)\\s*;`));
  return String(match?.[1] || "").trim();
}

function nodeGraphModuleScopeShaderColor(source, dotName, fallback) {
  const value = nodeGraphModuleScopeShaderAssignmentValue(source, dotName, "color");
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return nodeGraphNormalizeScopeTraceColor(value);
  }
  if (new RegExp(`^${dotName}\\.(?:global|globals)\\.color$`).test(value)) {
    return nodeGraphModuleScopeShaderGlobalColor(dotName);
  }
  return fallback;
}

// Only "dot1" resolves to anything now that Dot 2 has been removed -- a
// legacy custom shader script that still assigns from `dot2.global.color`
// (parsed generically by nodeGraphModuleScopeShaderExpressionPartValue's
// dot([12]) regex, independent of what this app calls it with) is gated
// out by nodeGraphModuleScopeShaderDotNameIsPrimary below, which
// nodeGraphModuleScopeShaderColor's caller already treats as "use the
// fallback" -- a true no-op, not a throw.
function nodeGraphModuleScopeShaderDotNameIsPrimary(dotName) {
  return dotName === "dot1";
}

function nodeGraphModuleScopeShaderGlobalColor(dotName) {
  if (!nodeGraphModuleScopeShaderDotNameIsPrimary(dotName)) {
    return null;
  }
  const defaultCore = nodeGraphModuleScopeDefaultDotCores.dot1;
  return normalizeNodeGraphModuleScopeDotCoreColor(
    nodeGraphMvp?.moduleScopeDotCore1Color ?? defaultCore.color,
    defaultCore.color,
  );
}

function nodeGraphModuleScopeShaderNumber(source, dotName, key, fallback) {
  const value = nodeGraphModuleScopeShaderExpressionValue(
    nodeGraphModuleScopeShaderAssignmentValue(source, dotName, key),
    dotName,
    key,
    fallback,
  );
  return Number.isFinite(value) ? value : fallback;
}

// Same reasoning as nodeGraphModuleScopeShaderGlobalColor above: a custom
// shader script's embedded expression can still literally say "dot2.global.*"
// (parsed by the generic dot([12]) regex in
// nodeGraphModuleScopeShaderExpressionPartValue, independent of which dot
// this call is actually computing) -- with no Dot 2 state left to read,
// that resolves to the given fallback, i.e. no effect, not a throw.
function nodeGraphModuleScopeShaderGlobalValue(dotName, key, fallback) {
  if (!nodeGraphModuleScopeShaderDotNameIsPrimary(dotName)) {
    return fallback;
  }
  const defaultCore = nodeGraphModuleScopeDefaultDotCores.dot1;
  const enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  if (key === "size") {
    const size = normalizeNodeGraphModuleScopeDotCoreSize(
      nodeGraphMvp?.moduleScopeDotCore1Size ?? defaultCore.size,
      defaultCore.size,
    );
    return normalizeNodeGraphModuleScopeDotCoreSize(
      (Number(fallback) || 0) * (size / defaultCore.size),
      defaultCore.size,
    );
  }
  if (key === "brightness") {
    if (!enabled) {
      return 0;
    }
    return normalizeNodeGraphModuleScopeDotCoreBrightness(
      nodeGraphMvp?.moduleScopeDotCore1Brightness ?? defaultCore.brightness,
      defaultCore.brightness,
    );
  }
  if (key === "blur") {
    return Number.isFinite(Number(defaultCore.blur)) ? normalizeNodeGraphModuleScopeDotBlur(defaultCore.blur, 0) : 0;
  }
  return fallback;
}

function nodeGraphModuleScopeShaderExpressionPartValue(part, dotName, key, fallback) {
  const text = String(part || "").trim();
  if (!text) {
    return NaN;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }
  const globalMatch = text.match(/^dot([12])\.(?:global|globals)\.(size|brightness|blur)$/);
  if (globalMatch) {
    return nodeGraphModuleScopeShaderGlobalValue(`dot${globalMatch[1]}`, globalMatch[2], fallback);
  }
  if (text === "globalsize" || text === "global.size") {
    return nodeGraphModuleScopeShaderGlobalValue(dotName, "size", fallback);
  }
  return NaN;
}

function nodeGraphModuleScopeShaderExpressionValue(expression, dotName, key, fallback) {
  const text = String(expression || "").trim();
  if (!text) {
    return fallback;
  }
  const product = text
    .split("*")
    .map((part) => nodeGraphModuleScopeShaderExpressionPartValue(part, dotName, key, fallback));
  if (product.length && product.every((value) => Number.isFinite(value))) {
    return product.reduce((value, part) => value * part, 1);
  }
  return fallback;
}

function nodeGraphModuleScopeShaderSizeRatio(source, dotName, fallback) {
  return clampNodeSliderValue(
    nodeGraphModuleScopeShaderNumber(source, dotName, "size", fallback),
    0,
    1,
  );
}

function normalizeNodeGraphModuleScopeDotBlur(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0, 1) : fallback;
}

function nodeGraphModuleScopeShaderBlurRatio(source, dotName, fallback = 0) {
  return normalizeNodeGraphModuleScopeDotBlur(
    nodeGraphModuleScopeShaderNumber(source, dotName, "blur", fallback),
    fallback,
  );
}

function nodeGraphModuleScopeLightShaderStyle(slot, buffer) {
  const source = nodeGraphModuleScopeShaderSourceForSlot(slot);
  const dotCore1Enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  const centerFallback = normalizeNodeGraphModuleScopeDotCoreColor(
    buffer.nodeGraphScopeLightCenterColor ?? nodeGraphMvp?.moduleScopeDotCore1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
    nodeGraphModuleScopeDefaultDotCores.dot1.color,
  );
  return {
    centerBrightness: clampNodeSliderValue(
      (dotCore1Enabled ? 1 : 0) * nodeGraphModuleScopeShaderNumber(
        source,
        "dot1",
        "brightness",
        normalizeNodeGraphModuleScopeDotCoreBrightness(
          nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
          nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
        ),
      ),
      0,
      40,
    ),
    centerColor: nodeGraphModuleScopeShaderColor(source, "dot1", centerFallback),
    centerBlur: nodeGraphModuleScopeShaderBlurRatio(source, "dot1", 0),
    centerSize: nodeGraphModuleScopeShaderSizeRatio(
      source,
      "dot1",
      0.035,
    ),
    source,
    usesShader: Boolean(source),
  };
}

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

function renderNodeGraphSceneScopeControls(nodeId = nodeGraphScopeControlTargetNodeId()) {
  const setting = nodeGraphModuleScopeEffectiveSettingForSlot({ nodeId });
  const targetNode = nodeGraphPatchNode(nodeId);
  const individualControls = document.getElementById("nodeIndividualScopeControls");
  if (individualControls) {
    individualControls.hidden = !targetNode;
  }
  const timeInput = document.getElementById("nodeSceneScopeTime");
  if (timeInput && document.activeElement !== timeInput) {
    timeInput.value = nodeGraphFormatScopeNumber(setting.cycles);
    timeInput.title = "Scope horizontal window in detected cycles.";
  }
  const scopeFields = document.querySelector("#nodeSceneScopeControls .scene-context-scope-fields");
  if (scopeFields) {
    const showOscillatorMode = nodeGraphModuleScopeIsOscillatorType(targetNode?.type);
    scopeFields.classList.toggle("three", showOscillatorMode);
    scopeFields.classList.toggle("two", !showOscillatorMode);
  }
  const syncButton = document.getElementById("nodeSceneScopeSync");
  if (syncButton) {
    syncButton.textContent = setting.sync ? "sync" : "free";
    syncButton.setAttribute("aria-pressed", String(setting.sync));
    syncButton.title = "Scope rising-edge sync";
  }
  const oscillatorTraceModeButton = document.getElementById("nodeSceneScopeOscillatorTraceMode");
  if (oscillatorTraceModeButton) {
    const isFrequencyResetMode = setting.oscillatorTraceMode !== "window";
    oscillatorTraceModeButton.hidden = !nodeGraphModuleScopeIsOscillatorType(targetNode?.type);
    oscillatorTraceModeButton.textContent = isFrequencyResetMode ? "freq reset" : "window";
    oscillatorTraceModeButton.setAttribute("aria-pressed", String(isFrequencyResetMode));
    oscillatorTraceModeButton.title = "Oscillator scope redraw mode";
  }
  const blinkLightControls = document.getElementById("nodeSceneBlinkLightControls");
  if (blinkLightControls) {
    blinkLightControls.hidden = targetNode?.type !== "clock";
  }
  const blinkLightShape = document.getElementById("nodeSceneBlinkLightShape");
  if (blinkLightShape && document.activeElement !== blinkLightShape) {
    blinkLightShape.value = setting.blinkLightShape;
  }
}

function handleNodeGraphSceneScopeNumericInput(event) {
  const input = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  if (!nodeId) {
    return;
  }
  const value = Number(input.value.trim());
  if (!Number.isFinite(value)) {
    renderNodeGraphSceneScopeControls(nodeId);
    return;
  }
  if (input.dataset.scopeInput === "cycles") {
    updateNodeGraphModuleScopeSetting(nodeId, { cycles: value });
  }
}

function handleNodeGraphSceneScopeOptionInput(event) {
  const input = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  if (!nodeId) {
    return;
  }
  if (input.dataset.scopeInput === "blinkLightShape") {
    updateNodeGraphModuleScopeSetting(nodeId, {
      blinkLightShape: ["circle", "square", "diamond"].includes(input.value) ? input.value : "circle",
    });
  }
}

function handleNodeGraphSceneScopeNumericKeydown(event) {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}

function nodeGraphScopeNumberInputRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step);
  return {
    max: Number.isFinite(max) ? max : 1,
    min: Number.isFinite(min) ? min : 0,
    step: Number.isFinite(step) && step > 0 ? step : 0.01,
  };
}

function nodeGraphScopeNumberInputStepDecimals(input) {
  const stepText = String(input.step || "");
  const decimalPart = stepText.includes(".") ? stepText.split(".").pop() : "";
  return Math.min(6, decimalPart.length);
}

function nodeGraphScopeNumberInputSnapValue(input, value) {
  const { min, max, step } = nodeGraphScopeNumberInputRange(input);
  const decimals = nodeGraphScopeNumberInputStepDecimals(input);
  const clamped = clampNodeSliderValue(Number(value) || 0, min, max);
  const quantized = Math.round(clamped / step) * step;
  const snapped = clampNodeSliderValue(quantized, min, max);
  return Number(snapped.toFixed(decimals));
}

function setNodeGraphScopeNumberInputValue(input, value) {
  input.value = input.dataset.scopeInput === "cycles"
    ? nodeGraphFormatScopeNumber(clampNodeSliderValue(Number(value) || 0, nodeGraphModuleScopeMinCycles, 128))
    : nodeGraphScopeNumberInputSnapValue(input, value).toString();
  if (input.dataset.globalScopeInput === "framesPerSecond") {
    setNodeGraphModuleScopeFramesPerSecond(input.value);
  } else if (input.dataset.globalScopeInput === "pointBudget") {
    setNodeGraphModuleScopePointBudget(input.value);
  } else if (input.dataset.timingField) {
    updateNodeGraphPatchTimingFromHeader(input);
  } else if (input.dataset.audioField) {
    updateNodeGraphPatchAudioFromHeader(input);
  } else if (input.dataset.globalScopeInput === "lineThickness") {
    setNodeGraphModuleScopeLineThickness(input.value);
  } else if (input.dataset.globalScopeInput === "dotCore1Size") {
    setNodeGraphModuleScopeDotCore1Size(input.value);
  } else if (input.dataset.globalScopeInput === "dotCore1Brightness") {
    setNodeGraphModuleScopeDotCore1Brightness(input.value);
  } else if (input.dataset.globalScopeInput === "discontinuitySkipSamples") {
    setNodeGraphModuleScopeDiscontinuitySkipSamples(input.value);
  } else {
    handleNodeGraphSceneScopeNumericInput({ currentTarget: input });
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function nodeGraphScopeNumberDragInputFromTarget(target) {
  if (target instanceof HTMLInputElement) {
    return target;
  }
  return target?.querySelector?.("input[data-global-scope-number-drag='true']") || null;
}

function nodeGraphSettingsTextControlFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.(
    "input[type='text'], input[type='number'], input[type='search'], input[inputmode], textarea",
  ) || null;
}

function nodeGraphSettingsTextRootFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.("#nodeGlobalScopeMenu, #nodeParameterMetadataPopover, #nodeTraceDisplaySettingsPopover");
}

function preventNodeGraphSettingsTextTransfer(event) {
  if (!nodeGraphSettingsTextControlFromTarget(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphSettingsTextPointer(event) {
  const input = nodeGraphSettingsTextControlFromTarget(event.target);
  const root = input ? nodeGraphSettingsTextRootFromTarget(input) : null;
  if (!input || !root) {
    return;
  }
  root.dataset.settingsTextPointerActive = "true";
  root.dataset.settingsTextPointerId = String(event.pointerId ?? "mouse");
  root.dataset.settingsTextPointerStartX = String(event.clientX ?? 0);
  root.dataset.settingsTextPointerStartY = String(event.clientY ?? 0);
  root.dataset.settingsTextPointerMoved = "false";
  root.dataset.settingsTextSuppressClick = "false";
  event.stopPropagation();
}

function moveNodeGraphSettingsTextPointer(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event.target);
  if (!root || root.dataset.settingsTextPointerActive !== "true") {
    return;
  }
  const activePointerId = root.dataset.settingsTextPointerId || "";
  const pointerId = String(event.pointerId ?? "mouse");
  if (activePointerId && activePointerId !== pointerId) {
    return;
  }
  const startX = Number(root.dataset.settingsTextPointerStartX) || 0;
  const startY = Number(root.dataset.settingsTextPointerStartY) || 0;
  if (Math.abs((event.clientX ?? 0) - startX) > 2 || Math.abs((event.clientY ?? 0) - startY) > 2) {
    root.dataset.settingsTextPointerMoved = "true";
  }
  event.stopPropagation();
}

function endNodeGraphSettingsTextPointer(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event.target);
  if (!root || root.dataset.settingsTextPointerActive !== "true") {
    return;
  }
  const activePointerId = root.dataset.settingsTextPointerId || "";
  const pointerId = String(event.pointerId ?? "mouse");
  if (activePointerId && activePointerId !== pointerId) {
    return;
  }
  const moved = root.dataset.settingsTextPointerMoved === "true";
  root.dataset.settingsTextPointerActive = "false";
  root.dataset.settingsTextPointerId = "";
  root.dataset.settingsTextPointerMoved = "false";
  root.dataset.settingsTextSuppressClick = moved ? "true" : "false";
  if (moved) {
    window.setTimeout(() => {
      if (root.dataset.settingsTextSuppressClick === "true") {
        root.dataset.settingsTextSuppressClick = "false";
      }
    }, 180);
  }
  event.stopPropagation();
}

function nodeGraphSettingsTextGestureShouldIgnoreClick(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event?.target);
  return Boolean(root && root.dataset.settingsTextSuppressClick === "true");
}

function bindNodeGraphSettingsTextInputProtection(root) {
  if (!root || root.dataset.settingsTextInputProtectionBound === "true") {
    return;
  }
  root.dataset.settingsTextInputProtectionBound = "true";
  root.addEventListener("dragstart", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("dragover", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("drop", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("pointerdown", beginNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointermove", moveNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointerup", endNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointercancel", endNodeGraphSettingsTextPointer, true);
  for (const input of root.querySelectorAll("input[type='text'], input[type='number'], input[type='search'], input[inputmode], textarea")) {
    input.draggable = false;
  }
}

function bindNodeGraphModuleScopeWindowEvents(scopeElement) {
  if (!scopeElement || scopeElement.dataset.scopeWindowEventsBound === "true") {
    return;
  }
  scopeElement.dataset.scopeWindowEventsBound = "true";
  scopeElement.addEventListener("dblclick", beginNodeGraphModuleScopeWindowNumberEdit);
  scopeElement.addEventListener("contextmenu", beginNodeGraphModuleScopeWindowNumberEdit);
}

function beginNodeGraphModuleScopeWindowNumberEdit(event) {
  const scopeElement = event.currentTarget;
  const moduleElement = scopeElement?.closest?.(".dsp-node");
  const nodeId = moduleElement?.dataset?.node || scopeElement?.dataset?.node || "";
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (!nodeId || !nodeGraphPatchNode(nodeId) || !menu) {
    return;
  }
  if (typeof openNodeGraphTraceDisplaySettings === "function" && openNodeGraphTraceDisplaySettings(nodeId, event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  menu.hidden = true;
  event.preventDefault();
  event.stopPropagation();
}

function nodeGraphScopeNumberDragScale(input, event) {
  const { min, max, step } = nodeGraphScopeNumberInputRange(input);
  const multiplier = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  if (input.dataset.globalScopeInput === "framesPerSecond") {
    return (step / 10) * multiplier;
  }
  if (input.dataset.globalScopeInput === "pointBudget") {
    return 64 * multiplier;
  }
  if (input.dataset.timingField) {
    return (step / 10) * multiplier;
  }
  if (input.dataset.scopeInput === "cycles") {
    const baseCycles = Math.max(step / 8, (max - min) / 960);
    return baseCycles * multiplier;
  }
  const base = Math.max(step, (max - min) / 160);
  return base * multiplier;
}

function beginNodeGraphScopeNumberDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const input = nodeGraphScopeNumberDragInputFromTarget(event.currentTarget);
  if (!input) {
    return;
  }
  if (input.closest("#nodeGlobalScopeMenu, #nodeParameterMetadataPopover, #nodeTraceDisplaySettingsPopover")) {
    return;
  }
  nodeGraphMvp.scopeNumberDragging = {
    captureTarget: event.currentTarget,
    input,
    pointerId: event.pointerId ?? null,
    scale: nodeGraphScopeNumberDragScale(input, event),
    startValue: Number(input.value) || 0,
    startX: event.clientX,
    startY: event.clientY,
  };
  input.classList.add("value-dragging");
  input.closest(".node-header-timing-field")?.classList.add("value-dragging");
  input.readOnly = true;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphScopeNumber(event) {
  const drag = nodeGraphMvp.scopeNumberDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const horizontalDelta = event.clientX - drag.startX;
  const verticalDelta = drag.startY - event.clientY;
  setNodeGraphScopeNumberInputValue(
    drag.input,
    drag.startValue + (horizontalDelta + verticalDelta) * drag.scale,
  );
  event.preventDefault();
}

function endNodeGraphScopeNumberDrag(event) {
  const drag = nodeGraphMvp.scopeNumberDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  const headerField = drag.input.closest(".node-header-timing-field");
  headerField?.classList.remove("value-dragging");
  drag.input.readOnly = Boolean(headerField);
  const captureTarget = drag.captureTarget || drag.input;
  if (event.pointerId !== undefined && captureTarget.hasPointerCapture?.(event.pointerId)) {
    captureTarget.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp.scopeNumberDragging = null;
  event.preventDefault();
}

function beginNodeGraphScopeNumberEdit(event) {
  const input = nodeGraphScopeNumberDragInputFromTarget(event.currentTarget);
  if (!input) {
    return;
  }
  input.readOnly = false;
  input.focus();
  input.select();
  event.preventDefault();
  event.stopPropagation();
}

function handleNodeGraphSceneScopeControlClick(event) {
  const button = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  const setting = nodeGraphModuleScopeSetting(nodeId);
  if (button.dataset.scopeControl === "sync") {
    updateNodeGraphModuleScopeSetting(nodeId, { sync: !setting.sync });
  } else if (button.dataset.scopeControl === "oscillatorTraceMode") {
    updateNodeGraphModuleScopeSetting(nodeId, {
      oscillatorTraceMode: setting.oscillatorTraceMode === "window" ? "frequencyReset" : "window",
    });
  }
  event.preventDefault();
  event.stopPropagation();
}

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
    if (!nodeGraphModuleScopeHasDrawableSlots() || nodeGraphModuleScopePaused()) {
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

function registerNodeGraphModuleScopeSlot(moduleElement, options = {}) {
  const nodeId = moduleElement?.dataset?.node || options.nodeId || "";
  if (!nodeId) {
    return null;
  }
  const scopeElement = options.scopeElement
    || moduleElement?.querySelector?.(".node-module-scope-window")
    || null;
  const slot = {
    element: moduleElement,
    nodeId,
    scopeElement,
    type: options.type || moduleElement?.dataset?.nodeType || "",
  };
  if (options.viewDrag !== false) {
    bindNodeGraphModuleScopeWindowEvents(scopeElement);
  }
  nodeGraphModuleScopeState.slots.set(nodeId, slot);
  scheduleNodeGraphModuleScopeDraw();
  return slot;
}

function unregisterNodeGraphModuleScopeSlot(nodeId) {
  const slot = nodeGraphModuleScopeState.slots.get(nodeId);
  const burnCanvas = slot?.scopeElement?.querySelector?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  );
  if (burnCanvas && typeof disposeNodeGraphScope2dBurnRendererForCanvas === "function") {
    disposeNodeGraphScope2dBurnRendererForCanvas(burnCanvas);
  }
  nodeGraphModuleScopeState.slots.delete(nodeId);
  nodeGraphModuleScopeState.lightDisplayStates.delete(nodeId);
  nodeGraphModuleScopeState.modelFrameTimes.delete(nodeId);
  nodeGraphModuleScopeState.clockPhasors.delete(nodeId);
  nodeGraphModuleScopeState.oscillatorPhasors.delete(nodeId);
  if (typeof nodeGraphPhosphorWaveformViewStates !== "undefined") {
    nodeGraphPhosphorWaveformViewStates.delete(nodeId);
  }
}

function nodeGraphModuleScopeSlots() {
  return [...nodeGraphModuleScopeState.slots.values()]
    .filter((slot) => slot.element?.isConnected && !slot.element.hidden && slot.scopeElement);
}

function nodeGraphModuleScopeSlotDisplayVisible(slot) {
  if (!slot?.element?.isConnected || slot.element.hidden || !slot.scopeElement) {
    return false;
  }
  if (nodeGraphMvp?.moduleOscilloscopesVisible === false) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(slot.nodeId)
    : null;
  if (
    slot.nodeId &&
    typeof nodeGraphNodeIsBypassed === "function" &&
    nodeGraphNodeIsBypassed(slot.nodeId)
  ) {
    return false;
  }
  if (
    patchNode &&
    typeof nodeGraphModuleDisplayVisibleForUi === "function" &&
    !nodeGraphModuleDisplayVisibleForUi(patchNode.type, patchNode.ui)
  ) {
    return false;
  }
  const normalizedUi = patchNode?.ui && typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(patchNode.ui)
    : (patchNode?.ui || {});
  return normalizedUi?.oscilloscopeHidden !== true;
}

function nodeGraphModuleScopeSlotIsDrawable(slot) {
  return nodeGraphModuleScopeSlotDisplayVisible(slot);
}

function nodeGraphVisibleModuleScopeSlots() {
  return nodeGraphModuleScopeSlots().filter(nodeGraphModuleScopeSlotIsDrawable);
}

function nodeGraphVisibleModuleScopeNodeIds() {
  return new Set(nodeGraphVisibleModuleScopeSlots()
    .map((slot) => String(slot?.nodeId || ""))
    .filter(Boolean));
}

function nodeGraphModuleScopeHasDrawableSlots() {
  return nodeGraphVisibleModuleScopeSlots().length > 0;
}

function nodeGraphModuleScopeMonitorFingerprint(monitors = []) {
  return normalizeNodeGraphPatchMonitors(monitors)
    .map(nodeGraphMonitorEndpointKey)
    .sort()
    .join("|");
}

function nodeGraphModuleScopeIsOscillatorType(type) {
  return nodeGraphModuleIsRealtimeOscillatorType(type);
}

function nodeGraphModuleScopeIsAdditiveType(type) {
  return type === "additiveOsc" || type === "gpuAdditiveOsc";
}

function nodeGraphDefaultModuleScopeMonitors(patch = nodeGraphMvp?.patch) {
  return (Array.isArray(patch?.nodes) ? patch.nodes : [])
    .map((node) => {
      if (nodeGraphModuleScopeIsOscillatorType(node?.type)) {
        return {
          io: "output",
          node: node.id,
          port: nodeGraphOscillatorSelectedOutputPort(node),
        };
      }
      const inputs = nodeGraphPatchNodeInputPorts(node);
      if (inputs.length) {
        return {
          io: "input",
          node: node.id,
          port: inputs[0],
        };
      }
      const outputs = nodeGraphPatchNodeOutputPorts(node);
      if (!outputs.length) {
        return null;
      }
      const port = outputs.includes("Out") ? "Out" : outputs[0];
      return {
        io: "output",
        node: node.id,
        port,
      };
    })
    .filter(Boolean);
}

function nodeGraphOscillatorSelectedOutputPort(node) {
  const outputs = nodeGraphPatchNodeOutputPorts(node);
  return outputs.includes("Wave Out") ? "Wave Out" : outputs[0] || "Out";
}

function nodeGraphModuleScopeCaptureMonitors(patch = nodeGraphMvp?.patch) {
  const monitors = normalizeNodeGraphPatchMonitors(patch?.monitors, patch);
  return monitors.length ? monitors : nodeGraphDefaultModuleScopeMonitors(patch);
}

function nodeGraphModuleScopeHasModelDisplay() {
  return nodeGraphVisibleModuleScopeSlots().some((slot) => {
    const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
    const outputs = nodeGraphPatchNodeOutputPorts(nodeGraphModuleScopeNodeForSlot(slot));
    return slot.type === "clock" ||
      slot.type === "transport" ||
      nodeGraphModuleScopeIsOscillatorType(slot.type) ||
      (["traceDisplay", "dotOscilloscope", "valueOscilloscope", "lineBurnOscilloscope"].includes(slot.type) &&
        nodeGraphModuleScopeConnectionsTo(slot.nodeId, "In").length > 0) ||
      (["scope2d", "scope2dTrace", "phosphorLight"].includes(renderer) && (
        (outputs.includes("X") && outputs.includes("Y")) ||
        (
          nodeGraphModuleScopeConnectionsTo(slot.nodeId, "X").length > 0 &&
          nodeGraphModuleScopeConnectionsTo(slot.nodeId, "Y").length > 0
        )
      )) ||
      (slot.type === "gain" && nodeGraphModuleScopeConnectionsTo(slot.nodeId, "In").length > 0) ||
      (slot.type === "output" && nodeGraphModuleScopeOutputConnectionList(
        nodeGraphModuleScopeOutputInputConnections(slot.nodeId),
      ).length > 0);
  });
}

function nodeGraphModuleScopeHasRenderableSlots() {
  return nodeGraphVisibleModuleScopeSlots().some((slot) => slot?.scopeElement);
}

function resetNodeGraphModuleScopeFrameClocks() {
  nodeGraphModuleScopeState.modelFrameTimes.clear();
  nodeGraphModuleScopeState.clockPhasors.clear();
  nodeGraphModuleScopeState.phosphorFrame = {
    key: "",
    lastUpdate: 0,
  };
}

function clearNodeGraphModuleScopeBuffers(options = {}) {
  const preserveDisplay = options?.preserveDisplay === true;
  const preserveBuffers = options?.preserveBuffers === true;
  if (nodeGraphModuleScopeState.drawFrame) {
    window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
    nodeGraphModuleScopeState.drawFrame = 0;
  }
  if (nodeGraphModuleScopeState.drawFrameWatchdog) {
    window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
    nodeGraphModuleScopeState.drawFrameWatchdog = 0;
  }
  if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
    window.clearInterval(nodeGraphModuleScopeState.drawFrameHeartbeat);
    nodeGraphModuleScopeState.drawFrameHeartbeat = 0;
  }
  if (!preserveBuffers) {
    nodeGraphModuleScopeState.buffers.clear();
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
    nodeGraphModuleScopeState.lightDisplayStates.clear();
    nodeGraphModuleScopeState.frames = 0;
    nodeGraphModuleScopeState.monitorFingerprint = "";
    nodeGraphModuleScopeState.mode = "";
    resetNodeGraphModuleScopeFrameClocks();
    nodeGraphModuleScopeState.oscillatorPhasors.clear();
    nodeGraphModuleScopeState.patchFingerprint = "";
    nodeGraphModuleScopeState.sampleRate = 0;
  }
  nodeGraphModuleScopeState.animationLastTime = 0;
  nodeGraphModuleScopeState.animationTime = 0;
  nodeGraphModuleScopeState.animationDeltaSeconds = 0;
  if (!preserveDisplay) {
    setNodeGraphModuleScopesEnabled(false);
    clearNodeGraphModuleScopeCanvas();
  }
}

function clearNodeGraphRenderedModuleScopeBuffers() {
  if (nodeGraphModuleScopeState.mode === "live") {
    return;
  }
  if (nodeGraphModuleScopeHasModelDisplay()) {
    nodeGraphModuleScopeState.buffers.clear();
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
    nodeGraphModuleScopeState.frames = 0;
    nodeGraphModuleScopeState.monitorFingerprint = "";
    nodeGraphModuleScopeState.mode = "model";
    nodeGraphModuleScopeState.patchFingerprint = nodeGraphPatchFingerprint();
    nodeGraphModuleScopeState.sampleRate = nodeGraphMvp.sampleRate || 44100;
    scheduleNodeGraphModuleScopeDraw();
    return;
  }
  clearNodeGraphModuleScopeBuffers();
}

function nodeGraphMonitorEndpointKey(endpoint) {
  return `${endpoint?.node || ""}.${endpoint?.io || ""}.${endpoint?.port || endpoint?.param || ""}`;
}

function nodeGraphMonitorEndpointFromElement(element) {
  if (!element) {
    return null;
  }
  if (element.classList?.contains("node-io-row")) {
    return {
      io: String(element.dataset.io || ""),
      node: String(element.dataset.node || ""),
      port: String(element.dataset.port || ""),
    };
  }
  if (element.classList?.contains("modulation-input")) {
    return {
      io: "modulation",
      node: String(element.dataset.node || ""),
      port: String(element.dataset.param || element.dataset.port || ""),
    };
  }
  if (element.classList?.contains("node-port")) {
    return {
      io: String(element.dataset.io || ""),
      node: String(element.dataset.node || ""),
      port: String(element.dataset.port || ""),
    };
  }
  return null;
}

function nodeGraphMonitorEndpointIsValid(endpoint, nodes = []) {
  const node = nodes.find((candidate) => candidate.id === endpoint?.node);
  const definition = nodeGraphModuleDefinitions[node?.type];
  if (!node || !definition || !endpoint?.port) {
    return false;
  }
  if (endpoint.io === "modulation") {
    return (definition.parameters || []).some((parameter) => parameter.key === endpoint.port);
  }
  if (endpoint.io === "input") {
    return nodeGraphPatchNodeInputPorts(node).includes(nodeGraphCanonicalInputPort(node.type, endpoint.port));
  }
  if (endpoint.io === "output") {
    return nodeGraphPatchNodeOutputPorts(node).includes(nodeGraphCanonicalOutputPort(node.type, endpoint.port));
  }
  return false;
}

function normalizeNodeGraphPatchMonitors(monitors = [], patch = nodeGraphMvp?.patch) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const normalized = [];
  const seen = new Set();
  for (const monitor of Array.isArray(monitors) ? monitors : []) {
    const endpoint = {
      io: String(monitor?.io || ""),
      node: String(monitor?.node || ""),
      port: String(monitor?.port || monitor?.param || ""),
    };
    if (!nodeGraphMonitorEndpointIsValid(endpoint, nodes)) {
      continue;
    }
    const key = nodeGraphMonitorEndpointKey(endpoint);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(endpoint);
  }
  return normalized;
}

function nodeGraphMonitorPortSelector(endpoint) {
  if (endpoint?.io === "modulation") {
    return nodeGraphModulationPortSelector(endpoint.node, endpoint.port);
  }
  return nodeGraphPortSelector(endpoint.node, endpoint.port, endpoint.io);
}

function syncNodeGraphMonitorIndicators(patch = nodeGraphMvp?.patch) {
  const workspace = nodeGraphZoomSurface?.();
  if (!workspace || !patch) {
    return;
  }
  const monitors = normalizeNodeGraphPatchMonitors(patch.monitors, patch);
  nodeGraphModuleScopeState.monitors = monitors;
  for (const port of workspace.querySelectorAll(".node-port, .node-param-port")) {
    port.classList.remove("monitored-port");
    port.removeAttribute("data-monitor-state");
  }
  for (const monitor of monitors) {
    const element = workspace.querySelector(nodeGraphMonitorPortSelector(monitor));
    element?.classList.add("monitored-port");
    element?.setAttribute("data-monitor-state", "active");
  }
  scheduleNodeGraphModuleScopeDraw();
}

function toggleNodeGraphMonitorForPort(port) {
  const endpoint = nodeGraphMonitorEndpointFromElement(port);
  if (!endpoint || !nodeGraphMonitorEndpointIsValid(endpoint, nodeGraphMvp.patch.nodes)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const monitors = normalizeNodeGraphPatchMonitors(patch.monitors, patch);
  const key = nodeGraphMonitorEndpointKey(endpoint);
  const nextMonitors = monitors.filter((monitor) => nodeGraphMonitorEndpointKey(monitor) !== key);
  const enabled = nextMonitors.length === monitors.length;
  if (enabled) {
    nextMonitors.push(endpoint);
  }
  patch.monitors = nextMonitors;
  commitNodeGraphPatch(patch, {
    status: enabled ? "monitor added" : "monitor removed",
  });
  return true;
}

function toggleNodeGraphMonitorFromPortEvent(event) {
  if (event.button !== 0 || !event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (toggleNodeGraphMonitorForPort(event.currentTarget)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
}

function beginNodeGraphRenderedScopeCapture(options = {}) {
  const patch = options.patch || nodeGraphMvp?.patch;
  const monitors = nodeGraphModuleScopeCaptureMonitors(patch);
  const frames = Math.max(0, Math.floor(Number(options.frames) || 0));
  if (!monitors.length || frames <= 0) {
    clearNodeGraphModuleScopeBuffers();
    return null;
  }

  const groups = new Map();
  for (const monitor of monitors) {
    const group = groups.get(monitor.node) || [];
    group.push(monitor);
    groups.set(monitor.node, group);
  }

  const buffers = new Map(
    [...groups.keys()].map((nodeId) => [nodeId, new Float32Array(frames)]),
  );
  return {
    buffers,
    frames,
    groups,
    monitorFingerprint: nodeGraphModuleScopeMonitorFingerprint(monitors),
    patchFingerprint: String(options.patchFingerprint || ""),
    sampleRate: Number(options.sampleRate) || 0,
  };
}

function nodeGraphRenderedScopeMonitorValue(
  monitor,
  runtime,
  frameValues,
  frame,
  frames,
) {
  if (monitor.io === "output") {
    return readNodeGraphRuntimePortOutput(
      runtime,
      frameValues,
      monitor.node,
      monitor.port,
      frame,
      frames,
    );
  }
  if (monitor.io === "input") {
    return (runtime.inputConnections?.get(`${monitor.node}.${monitor.port}`) || [])
      .reduce((sum, connection) => sum + readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      ), 0);
  }
  if (monitor.io === "modulation") {
    return (runtime.modulationConnections?.get(nodeGraphParameterKey(monitor.node, monitor.port)) || [])
      .reduce((sum, modulation) => sum + clampNodeSliderValue(readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        modulation.sourceNode,
        modulation.sourcePort,
        frame,
        frames,
      ), 0, 1), 0);
  }
  return 0;
}

function captureNodeGraphRenderedScopeFrame(
  capture,
  runtime,
  frameValues,
  bufferFrame,
  evaluationFrame,
  evaluationFrames,
) {
  if (!capture) {
    return;
  }
  for (const [nodeId, monitors] of capture.groups) {
    const buffer = capture.buffers.get(nodeId);
    if (!buffer || bufferFrame < 0 || bufferFrame >= buffer.length) {
      continue;
    }
    const sum = monitors.reduce(
      (total, monitor) => total + nodeGraphRenderedScopeMonitorValue(
        monitor,
        runtime,
        frameValues,
        evaluationFrame,
        evaluationFrames,
      ),
      0,
    );
    buffer[bufferFrame] = sum / Math.max(1, monitors.length);
  }
}

function finishNodeGraphRenderedScopeCapture(capture) {
  if (!capture) {
    return;
  }
  nodeGraphModuleScopeState.buffers = capture.buffers;
  nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
  nodeGraphModuleScopeState.traceDisplayScratch.clear();
  nodeGraphModuleScopeState.frames = capture.frames;
  nodeGraphModuleScopeState.monitorFingerprint = capture.monitorFingerprint;
  nodeGraphModuleScopeState.mode = "rendered";
  nodeGraphModuleScopeState.patchFingerprint = capture.patchFingerprint;
  nodeGraphModuleScopeState.sampleRate = capture.sampleRate;
  scheduleNodeGraphModuleScopeDraw();
}

function nodeGraphLiveModuleScopeFrameCapacity(options = {}) {
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || Number(nodeGraphMvp?.sampleRate) || 44100);
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  const visualFrameWindow = fps > 0 ? Math.ceil(sampleRate / Math.max(1, fps)) : 0;
  const traceHistoryWindow = Math.ceil(sampleRate * nodeGraphTraceDisplayMaxZoomSeconds);
  return Math.max(
    32,
    Math.floor(Number(options.frames) || 0),
    nodeGraphModuleScopeState.liveFrameCapacity,
    traceHistoryWindow,
    visualFrameWindow,
  );
}

function nodeGraphLiveModuleScopeFingerprint(plan = {}) {
  const ids = Array.isArray(plan.order) && plan.order.length
    ? plan.order
    : (Array.isArray(plan.nodes) ? plan.nodes.map((node) => node.id) : []);
  return ids.map((id) => String(id || "")).filter(Boolean).sort().join("|");
}

function beginNodeGraphLiveModuleScopeCapture(plan = {}, options = {}) {
  if (!nodeGraphModuleScopeHasDrawableSlots() || nodeGraphModuleScopeTracesOff()) {
    clearNodeGraphModuleScopeBuffers();
    return;
  }
  const ids = Array.isArray(plan.order) && plan.order.length
    ? plan.order
    : (Array.isArray(plan.nodes) ? plan.nodes.map((node) => node.id) : []);
  const frameCapacity = nodeGraphLiveModuleScopeFrameCapacity({ ...options, patch: options.patch || nodeGraphMvp?.patch });
  const patchFingerprint = String(plan.patchFingerprint || nodeGraphPatchFingerprint());
  const canReuseBuffers = nodeGraphModuleScopeState.mode === "live" &&
    nodeGraphModuleScopeState.patchFingerprint === patchFingerprint;
  const nextBuffers = new Map();
  for (const id of ids.map((candidate) => String(candidate || "")).filter(Boolean)) {
    const previous = canReuseBuffers ? nodeGraphModuleScopeState.buffers.get(id) : null;
    nextBuffers.set(id, resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity));
  }
  if (canReuseBuffers) {
    for (const [key, previous] of nodeGraphModuleScopeState.buffers) {
      if (!String(key || "").includes(":")) {
        continue;
      }
      const nodeId = String(key).split(":")[0];
      if (nextBuffers.has(nodeId)) {
        nextBuffers.set(key, resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity));
      }
    }
  } else {
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
  }
  nodeGraphModuleScopeState.buffers = nextBuffers;
  nodeGraphModuleScopeState.frames = frameCapacity;
  nodeGraphModuleScopeState.monitorFingerprint = nodeGraphLiveModuleScopeFingerprint(plan);
  nodeGraphModuleScopeState.mode = "live";
  nodeGraphModuleScopeState.patchFingerprint = patchFingerprint;
  nodeGraphModuleScopeState.sampleRate = Number(options.sampleRate) || 0;
  scheduleNodeGraphModuleScopeDraw();
}

function updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint = nodeGraphPatchFingerprint()) {
  if (nodeGraphModuleScopeState.mode !== "live") {
    return;
  }
  const fingerprint = String(patchFingerprint || "");
  if (!fingerprint || nodeGraphModuleScopeState.patchFingerprint === fingerprint) {
    return;
  }
  nodeGraphModuleScopeState.patchFingerprint = fingerprint;
}

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
  for (const key of ["Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
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

function nodeGraphModuleScopeNodeForSlot(slot) {
  return (Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [])
    .find((node) => node.id === slot?.nodeId) || null;
}

// Name kept as-is: scripts/smoke_test.py asserts it exists.
function nodeGraphModuleScopeNodeParam(node, key, fallback) {
  return nodeGraphNodeParamNumber(node, key, fallback);
}

function nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps) {
  const normalizedFps = normalizeNodeGraphModuleScopeFramesPerSecond(fps);
  if (normalizedFps <= 0) {
    const lastUpdate = Number(state?.lastUpdate);
    const stateTime = Number(state?.time);
    return {
      ready: false,
      steps: 0,
      lastUpdate: Number.isFinite(lastUpdate) ? lastUpdate : now,
      time: Number.isFinite(stateTime) ? stateTime : now,
    };
  }
  const frameDuration = 1 / normalizedFps;
  const lastUpdate = Number(state?.lastUpdate);
  const stateTime = Number(state?.time);
  if (!Number.isFinite(lastUpdate) || lastUpdate <= 0 || now <= lastUpdate) {
    return {
      ready: true,
      steps: 1,
      lastUpdate: now,
      time: Number.isFinite(stateTime) ? stateTime : now,
    };
  }
  const elapsed = now - lastUpdate;
  const resyncDuration = Math.max(0.5, frameDuration * 4);
  if (elapsed > resyncDuration) {
    return {
      ready: true,
      steps: 1,
      lastUpdate: now,
      time: now,
    };
  }
  if (elapsed + frameDuration * 0.05 < frameDuration) {
    return {
      ready: false,
      steps: 0,
      lastUpdate,
      time: Number.isFinite(stateTime) ? stateTime : lastUpdate,
    };
  }
  const steps = Math.max(1, Math.floor((elapsed + frameDuration * 0.05) / frameDuration));
  const nextLastUpdate = lastUpdate + steps * frameDuration;
  const nextTime = (Number.isFinite(stateTime) ? stateTime : lastUpdate) + steps * frameDuration;
  return {
    ready: true,
    steps,
    lastUpdate: nextLastUpdate,
    time: nextTime,
  };
}

function nodeGraphModuleScopeModelFrameTime(slot) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return Math.max(0, Number(nodeGraphModuleScopeState.animationTime) || 0);
  }
  const fps = normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60);
  if (fps <= 0) {
    return false;
  }
  const now = Math.max(0, Number(nodeGraphModuleScopeState.animationTime) || 0);
  const state = nodeGraphModuleScopeState.modelFrameTimes.get(nodeId);
  if (!state) {
    const initialState = {
      lastUpdate: now,
      time: now,
    };
    nodeGraphModuleScopeState.modelFrameTimes.set(nodeId, initialState);
    return initialState.time;
  }
  const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps);
  if (tick.ready) {
    state.lastUpdate = tick.lastUpdate;
    state.time = tick.time;
  }
  nodeGraphModuleScopeState.modelFrameTimes.set(nodeId, state);
  return state.time;
}

function nodeGraphModuleScopeNodeMap() {
  return new Map((Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [])
    .map((node) => [node.id, node]));
}

function nodeGraphModuleScopeConnectionsTo(nodeId, port = "In") {
  return (Array.isArray(nodeGraphMvp?.patch?.connections) ? nodeGraphMvp.patch.connections : [])
    .filter((connection) => connection.destinationNode === nodeId && connection.destinationPort === port);
}

function nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port = "In") {
  const connection = nodeGraphModuleScopeConnectionsTo(nodeId, port)
    .find((candidate) => candidate?.sourceNode && candidate?.sourcePort);
  if (!connection) {
    return null;
  }
  return nodeGraphModuleScopeState.buffers.get(`${connection.sourceNode}:${connection.sourcePort}`) ||
    nodeGraphModuleScopeState.buffers.get(connection.sourceNode) ||
    null;
}

function nodeGraphModuleScopeLatestOutputValue(nodeId, port, fallback = null) {
  const buffer = nodeGraphModuleScopeState.buffers.get(`${nodeId}:${port}`);
  if (!buffer?.length) {
    return fallback;
  }
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const value = Number(buffer[index]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function nodeGraphModuleScopeStableSeed(text) {
  let seed = 0x12345678;
  for (const character of String(text)) {
    seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
  }
  return seed || 0x12345678;
}

function nodeGraphModuleScopeLinearToDb(value) {
  const amplitude = Math.abs(Number(value) || 0);
  return amplitude > 0.000001 ? 20 * Math.log10(amplitude) : -Infinity;
}

function nodeGraphModuleScopeFormatDb(value) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB` : "-inf dB";
}

function nodeGraphModuleScopeBufferStats(buffer) {
  if (!buffer?.length) {
    return {
      peak: 0,
      peakDb: -Infinity,
      rms: 0,
      rmsDb: -Infinity,
    };
  }
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Number(buffer[index]) || 0;
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  return {
    peak,
    peakDb: nodeGraphModuleScopeLinearToDb(peak),
    rms,
    rmsDb: nodeGraphModuleScopeLinearToDb(rms),
  };
}

function renderNodeGraphModuleScopeAnalyzer(slot, buffer = null) {
  const analyzer = slot?.scopeElement?.querySelector?.(".node-module-scope-analyzer");
  if (!analyzer) {
    return;
  }
  analyzer.classList.toggle("gain-scope-analyzer", slot?.type === "gain");
  const metrics = buffer?.nodeGraphScopeAnalyzer;
  if (!metrics) {
    analyzer.hidden = true;
    analyzer.textContent = "";
    return;
  }
  analyzer.hidden = false;
  const rows = [
    ["gain", metrics.gainDb],
    metrics.inputRmsDb === undefined ? null : ["in", metrics.inputRmsDb],
    ["pk", metrics.peakDb],
    ["rms", metrics.rmsDb],
  ].filter(Boolean);
  analyzer.replaceChildren(
    ...rows.map(([label, value]) => {
      const item = document.createElement("span");
      item.dataset.scopeMetric = label;
      item.textContent = `${label} ${nodeGraphModuleScopeFormatDb(value)}`;
      return item;
    }),
  );
}

function nodeGraphModuleScopeOfflineSourceFrequency(nodeId, nodeMap = nodeGraphModuleScopeNodeMap(), visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) {
    return 0;
  }
  visited.add(nodeId);
  const node = nodeMap.get(nodeId);
  if (!node) {
    return 0;
  }
  if (nodeGraphModuleScopeIsOscillatorType(node.type)) {
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          { nodeMap },
          connection.sourceNode,
          0,
          0,
          connection.sourcePort,
          1,
        ), 0),
      -1,
      1,
    );
    return Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
  }
  if (node.type === "clock") {
    return Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
  }
  if (node.type === "gain" || node.type === "bias" || node.type === "gainBias") {
    return Math.max(
      0,
      ...nodeGraphModuleScopeConnectionsTo(node.id, "In")
        .map((connection) => nodeGraphModuleScopeOfflineSourceFrequency(connection.sourceNode, nodeMap, visited)),
    );
  }
  return 0;
}

function nodeGraphModuleScopeOfflineSignalSample(context, nodeId, localTime, sampleIndex, port = "Out", depth = 0) {
  if (!context || !nodeId || depth > 16) {
    return 0;
  }
  const node = context.nodeMap.get(nodeId);
  if (!node) {
    return 0;
  }
  if (nodeGraphModuleScopeIsOscillatorType(node.type)) {
    const waveformByPort = {
      Saw: 0,
      Ramp: 1,
      Square: 2,
      Tri: 3,
      Sine: 4,
    };
    const waveform = Object.hasOwn(waveformByPort, port)
      ? waveformByPort[port]
      : nodeGraphModuleScopeNodeParam(node, "waveform", 0);
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          context,
          connection.sourceNode,
          localTime,
          sampleIndex,
          connection.sourcePort,
          depth + 1,
        ), 0),
      -1,
      1,
    );
    const frequency = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
    const phase = wrapNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "phase", 0), 0, 1);
    const level = nodeGraphModuleScopeNodeParam(node, "level", 0.5);
    const phasor = nodeGraphModuleScopeOscillatorPhasor(
      { nodeId: node.id },
      frequency,
      1,
      nodeGraphModuleScopeModelFrameTime({ nodeId: node.id }),
    );
    const displayFrame = Number(context.zeroFrequencyDisplayFrame);
    const displayFrames = Math.max(1, Number(context.zeroFrequencyDisplayFrames) || 1);
    const displayCycles = Math.max(0.125, Number(context.zeroFrequencyDisplayCycles) || 1);
    const zeroFrequencyDisplayPhase = Number.isFinite(displayFrame)
      ? (displayFrame / Math.max(1, displayFrames - 1)) * displayCycles
      : 0;
    const scopeStartTime = Number(context.scopeStartTime);
    const elapsedTime = Math.max(
      0,
      localTime - (Number.isFinite(scopeStartTime) ? scopeStartTime : localTime),
    );
    const signalPhase = (Number(phasor.signal) || 0) +
      (frequency > 0 ? elapsedTime * frequency : zeroFrequencyDisplayPhase);
    return nodeGraphModuleScopeOfflineOscillatorSample(waveform, phase + signalPhase) * level;
  }
  if (nodeGraphModuleScopeIsAdditiveType(node.type)) {
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          context,
          connection.sourceNode,
          localTime,
          sampleIndex,
          connection.sourcePort,
          depth + 1,
        ), 0),
      -1,
      1,
    );
    const frequency = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
    const phase = wrapNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "phase", 0), 0, 1);
    const phasor = nodeGraphModuleScopeOscillatorPhasor(
      { nodeId: node.id },
      frequency,
      1,
      nodeGraphModuleScopeModelFrameTime({ nodeId: node.id }),
    );
    const scopeStartTime = Number(context.scopeStartTime);
    const elapsedTime = Math.max(
      0,
      localTime - (Number.isFinite(scopeStartTime) ? scopeStartTime : localTime),
    );
    const signalPhase = (Number(phasor.signal) || 0) + elapsedTime * frequency;
    return nodeGraphAdditiveOscillatorSample(
      null,
      node.id,
      (phase + signalPhase) * Math.PI * 2,
      {
        frequency,
        harmonics: nodeGraphModuleScopeNodeParam(node, "harmonics", 32),
        level: nodeGraphModuleScopeNodeParam(node, "level", 0.35),
        modA: nodeGraphModuleScopeNodeParam(node, "modA", 0.5),
        waveform: nodeGraphModuleScopeNodeParam(node, "waveform", 1),
      },
      Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100,
    );
  }
  if (node.type === "clock") {
    const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
    const duty = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "duty", 0.5), 0, 1);
    const level = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "level", 1), 0, 1);
    const sampleRate = Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100;
    const phase = nodeGraphModuleScopeClockPhaseAt(context, node.id, rate, localTime);
    if (port === "Analog Out") {
      return nodeGraphModuleScopeClockAnalogMonitorSample(phase, level);
    }
    if (port === "Pulse") {
      return rate > 0 && phase < Math.min(1, rate / Math.max(1, sampleRate)) ? level : 0;
    }
    return duty > 0 && level > 0 && phase < duty ? level : 0;
  }
  const input = nodeGraphModuleScopeConnectionsTo(node.id, "In")
    .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
      context,
      connection.sourceNode,
      localTime,
      sampleIndex,
      connection.sourcePort,
      depth + 1,
    ), 0);
  if (node.type === "gain") {
    return input * nodeGraphModuleScopeNodeParam(node, "amount", 1);
  }
  if (node.type === "bias") {
    return input + nodeGraphModuleScopeNodeParam(node, "offset", 0);
  }
  if (node.type === "gainBias") {
    return input * nodeGraphModuleScopeNodeParam(node, "amount", 1) +
      nodeGraphModuleScopeNodeParam(node, "offset", 0);
  }
  return 0;
}

// Matches LFO/basic_oscillator waveform indices:
// 0 Saw, 1 Ramp, 2 Square, 3 Triangle, 4 Sine, 5 Noise.
function nodeGraphModuleScopeOfflineOscillatorSample(waveform, phaseCycle) {
  const cycle = wrapNodeSliderValue(phaseCycle, 0, 1);
  switch (Math.round(Number(waveform) || 0)) {
    case 1: // Ramp
      return -1 + cycle * 2;
    case 2: // Square
      return cycle < 0.5 ? 1 : -1;
    case 3: // Triangle
      return 1 - 4 * Math.abs(cycle - 0.5);
    case 4: // Sine
      return Math.sin(cycle * Math.PI * 2);
    case 5: // Noise (deterministic-ish hash of phase for offline scope)
      return Math.tanh(
        Math.sin((cycle * 17.13 + 0.17) * Math.PI * 2) * 0.62 +
        Math.sin((cycle * 37.71 + 0.41) * Math.PI * 2) * 0.38 +
        Math.sin((cycle * 73.19 + 0.73) * Math.PI * 2) * 0.24,
      );
    case 0: // Saw
    default:
      return 1 - cycle * 2;
  }
}

function nodeGraphModuleScopeClockPhasor(slot, rate, modelTime = nodeGraphModuleScopeModelFrameTime(slot)) {
  const nodeId = String(slot?.nodeId || "");
  const now = Math.max(0, Number(modelTime) || 0);
  const safeRate = Math.max(0, Number(rate) || 0);
  let phasor = nodeGraphModuleScopeState.clockPhasors.get(nodeId);
  if (!phasor) {
    const phase = wrapNodeSliderValue(now * safeRate, 0, 1);
    phasor = {
      lastTime: now,
      phase,
      previousPhase: phase,
      previousTime: now,
      rate: safeRate,
      renderTime: -1,
      turns: 0,
    };
    nodeGraphModuleScopeState.clockPhasors.set(nodeId, phasor);
  }
  if (phasor.renderTime === now) {
    phasor.rate = safeRate;
    return phasor;
  }

  const lastTime = Math.max(0, Number(phasor.lastTime) || now);
  const advanceRate = Math.max(0, Number(phasor.rate) || 0);
  if (now < lastTime) {
    const phase = wrapNodeSliderValue((Number(phasor.phase) || 0) - advanceRate * (lastTime - now), 0, 1);
    return {
      ...phasor,
      phase,
      previousPhase: phase,
      previousTime: now,
      rate: safeRate,
      turns: 0,
    };
  }
  const dt = clampNodeSliderValue(now - lastTime, 0, 0.25);
  const previousPhase = Number(phasor.phase) || 0;
  if (dt > 0 && advanceRate > 0) {
    phasor.phase = wrapNodeSliderValue(previousPhase + advanceRate * dt, 0, 1);
  }
  phasor.previousPhase = previousPhase;
  phasor.previousTime = lastTime;
  phasor.rate = safeRate;
  phasor.lastTime = now;
  phasor.renderTime = now;
  phasor.turns = Math.max(0, advanceRate * dt);
  return phasor;
}

function nodeGraphModuleScopeClockPhaseAt(context, nodeId, rate, localTime) {
  const safeRate = Math.max(0, Number(rate) || 0);
  const safeTime = Math.max(0, Number(localTime) || 0);
  if (!context.clockPhaseAnchors) {
    context.clockPhaseAnchors = new Map();
  }
  const key = String(nodeId || "");
  let anchor = context.clockPhaseAnchors.get(key);
  if (!anchor) {
    const scopeStartTime = Number(context.scopeStartTime);
    const anchorTime = Number.isFinite(scopeStartTime) ? Math.max(0, scopeStartTime) : safeTime;
    const phasor = nodeGraphModuleScopeClockPhasor({ nodeId: key }, safeRate, anchorTime);
    anchor = {
      phase: Number(phasor.phase) || 0,
      rate: safeRate,
      time: anchorTime,
    };
    context.clockPhaseAnchors.set(key, anchor);
  }
  return wrapNodeSliderValue(
    (Number(anchor.phase) || 0) + Math.max(0, safeTime - (Number(anchor.time) || safeTime)) * safeRate,
    0,
    1,
  );
}

function nodeGraphModuleScopeOscillatorPhasor(slot, frequency, cycles, modelTime = nodeGraphModuleScopeModelFrameTime(slot)) {
  const nodeId = String(slot?.nodeId || "");
  const now = Math.max(0, Number(modelTime) || 0);
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const safeCycles = Math.max(1e-6, Number(cycles) || 1);
  let phasor = nodeGraphModuleScopeState.oscillatorPhasors.get(nodeId);
  if (!phasor) {
    phasor = {
      frequency: safeFrequency,
      lastTime: now,
      previousSweep: 0,
      renderTime: -1,
      signal: 0,
      sweep: 0,
      sweepDelta: 0,
    };
    nodeGraphModuleScopeState.oscillatorPhasors.set(nodeId, phasor);
  }
  if (phasor.renderTime === now) {
    phasor.frequency = safeFrequency;
    return phasor;
  }

  const dt = clampNodeSliderValue(now - (Number(phasor.lastTime) || now), 0, 0.25);
  const previousSweep = Number(phasor.sweep) || 0;
  phasor.previousSweep = previousSweep;
  phasor.sweepDelta = 0;
  const advanceFrequency = Math.max(0, Number(phasor.frequency) || 0);
  if (dt > 0 && advanceFrequency > 0) {
    const cycleDelta = advanceFrequency * dt;
    const sweepDelta = cycleDelta / safeCycles;
    phasor.signal = wrapNodeSliderValue((Number(phasor.signal) || 0) + cycleDelta, 0, 1);
    phasor.sweep = wrapNodeSliderValue(previousSweep + sweepDelta, 0, 1);
    phasor.sweepDelta = sweepDelta;
  }
  phasor.frequency = safeFrequency;
  phasor.lastTime = now;
  phasor.renderTime = now;
  return phasor;
}

function nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  for (let index = capturedBuffer.length - 1; index >= 0; index -= 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      return clampNodeSliderValue(Math.abs(sample), 0, 1);
    }
  }
  return null;
}

function nodeGraphModuleScopeCapturedCurrentPositiveLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  for (let index = capturedBuffer.length - 1; index >= 0; index -= 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      return clampNodeSliderValue(sample, 0, 1);
    }
  }
  return null;
}

function nodeGraphModuleScopeCapturedFrameLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let sum = 0;
  let count = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += Math.abs(sample);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}

function nodeGraphModuleScopeCapturedFramePositiveLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const recentCount = Math.max(0, Math.floor(Number(capturedBuffer.nodeGraphScopeRecentSampleCount) || 0));
  const startIndex = recentCount > 0
    ? Math.max(0, capturedBuffer.length - Math.min(capturedBuffer.length, recentCount))
    : 0;
  let sum = 0;
  let count = 0;
  for (let index = startIndex; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += clampNodeSliderValue(sample, 0, 1);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}

function nodeGraphModuleScopeCapturedFrameBipolarLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const recentCount = Math.max(0, Math.floor(Number(capturedBuffer.nodeGraphScopeRecentSampleCount) || 0));
  const startIndex = recentCount > 0
    ? Math.max(0, capturedBuffer.length - Math.min(capturedBuffer.length, recentCount))
    : 0;
  let sum = 0;
  let count = 0;
  for (let index = startIndex; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += clampNodeSliderValue(Math.abs(sample), 0, 1);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}

function nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let previousState = null;
  let transitions = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    const state = Math.abs(sample) >= 0.5;
    if (previousState !== null && state !== previousState) {
      transitions += 1;
    }
    previousState = state;
    if (transitions > 2) {
      return nodeGraphModuleScopeCapturedFrameLightTarget(capturedBuffer);
    }
  }
  return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer);
}

function nodeGraphModuleScopeCapturedPulseLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let peak = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  return clampNodeSliderValue(peak, 0, 1);
}

function nodeGraphModuleScopeCapturedBufferForSlot(slot) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return null;
  }
  const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
  if (["scope2d", "scope2dTrace", "phosphorLight"].includes(renderer)) {
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    return nodeGraphModuleScopeCapturedScope2dBuffer(slot, source
      ? { xPort: source.x, yPort: source.y }
      : {});
  }
  if (["traceDisplay", "dotOscilloscope", "valueOscilloscope", "numberReadout", "lineBurnOscilloscope"].includes(slot?.type)) {
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:In`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "In") ||
      null;
  }
  if (slot?.type === "customDisplay") {
    const displayScript = normalizeNodeGraphCustomDisplay(nodeGraphModuleScopeNodeForSlot(slot)?.customDisplay);
    const primaryPort = displayScript.inputs[0] || "In1";
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:${primaryPort}`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, primaryPort) ||
      new Float32Array([0]);
  }
  const source = nodeGraphModuleDisplaySourceForSlot(slot);
  const sourcePort = String(source?.value || "").trim();
  if (sourcePort) {
    const sourceBuffer = nodeGraphModuleScopeState.buffers.get(`${nodeId}:${sourcePort}`);
    if (sourceBuffer?.length) {
      return sourceBuffer;
    }
  }
  const selectedPort = nodeGraphModuleScopeShaderOutputPortForSlot(slot);
  if (selectedPort) {
    const selectedBuffer = nodeGraphModuleScopeState.buffers.get(`${nodeId}:${selectedPort}`);
    if (selectedBuffer?.length) {
      return selectedBuffer;
    }
  }
  return nodeGraphModuleScopeState.buffers.get(nodeId) || null;
}

// secondary* is read only when a "trace"-schema node is Output's stereo
// display (drawNodeGraphTraceDisplayCanvasItem) -- Output shares this same
// formType with plain single-value Trace nodes (both declare
// displayType/renderer "trace"), so the field exists here for all of them,
// but a non-Output trace node's draw path never reads it.
const nodeGraphTraceDisplaySettingsDefaults = Object.freeze({
  brightness: 0.92,
  color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.08,
  secondaryBrightness: 0.18,
  secondaryColor: "#184fff",
  secondaryEnabled: true,
  secondarySize: 0.24,
  secondaryLineThickness: 0.48,
  cycles: 2,
  lineThickness: 0.2,
  padding: 0,
  skipDiscontinuities: false,
  sourceSync: false,
  zoomSeconds: 0.05,
});

const nodeGraphLineBurnSettingsDefaults = Object.freeze({
  burn: 0.3,
  cycles: 2,
  decay: 0.3,
  dot1Blur: 0.2,
  dot1Brightness: 2,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.07,
  lineThickness: 0.2,
  zoomSeconds: 2,
});

const nodeGraphTraceDisplayRenderPointBudgetDefault = 4096;

function nodeGraphTraceDisplayRenderPointBudget() {
  return typeof normalizeNodeGraphModuleScopePointBudget === "function"
    ? normalizeNodeGraphModuleScopePointBudget(nodeGraphMvp?.moduleScopePointBudget ?? nodeGraphTraceDisplayRenderPointBudgetDefault)
    : nodeGraphTraceDisplayRenderPointBudgetDefault;
}

const nodeGraphZeroDBurnSettingsDefaults = Object.freeze({
  bipolarBrightness: false,
  dot1Brightness: 0.92,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.08,
  lineThickness: 0.2,
});

const nodeGraphValueOscilloscopeSettingsDefaults = Object.freeze({
  brightness: 0.92,
  burn: 0,
  capEnabled: true,
  capLength: 0.16,
  capSize: 0.08,
  color: "#75ebff",
  decay: 0,
  dot1Enabled: true,
  dot1Size: 0.08,
  lineLength: 0.88,
  lineThickness: 0.2,
});

// numberReadout owns a fully independent schema (not Trace/Dot/2D). Includes
// its own phosphor burn/decay plus LCD plate (ghost 8s) and bezel chrome.
const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({
  background: "#020608",
  brightness: 0.92,
  burn: 0.42,
  color: "#75ebff",
  decay: 0.28,
  decimals: 2,
  ghost: 0.22,
  innerGlow: 0.35,
  innerShadow: 0.4,
});

const nodeGraphScope2dSettingsDefaults = Object.freeze({
  burn: 0.82,
  decay: 0.12,
  dot1Brightness: 0.92,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  // 0–1 of face min side: 1 = diameter fills the square (same as PhosphorLight).
  dot1Size: 0.08,
  // Soft stamp budget (ceiling). Under load, dots spread evenly (skips), not head-only.
  dotBudget: 2048,
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: 0.35,
  // 0 = lo-fi floor (~1/16 layout, never 1×1), 1 = layout×dpr, 4 = 4× AA.
  pixelDensity: 1,
  scale: 1,
});

const nodeGraphScope2dTraceSettingsDefaults = Object.freeze({
  dot1Brightness: 0.92,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.08,
  historySeconds: 0.05,
  lineThickness: 0.2,
  scale: 1,
});

function normalizeNodeGraphTraceDisplayColor(value, fallback = nodeGraphTraceDisplaySettingsDefaults.color) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function normalizeNodeGraphTraceDisplayNumber(value, fallback, min, max, integer = false) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  const normalized = Number.isFinite(number)
    ? Math.max(safeMin, Math.min(safeMax, number))
    : Math.max(safeMin, Math.min(safeMax, safeFallback));
  return integer ? Math.round(normalized) : normalized;
}


function normalizeNodeGraphTraceDisplayZoomSeconds(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return clampNodeSliderValue(number, 0, nodeGraphTraceDisplayMaxZoomSeconds);
  }
  const safeFallback = Number(fallback);
  return Number.isFinite(safeFallback) ? clampNodeSliderValue(safeFallback, 0, nodeGraphTraceDisplayMaxZoomSeconds) : 0;
}

function normalizeNodeGraphLineBurnSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphLineBurnSettingsDefaults;
  const legacyWindowMs = source.windowMs === undefined ? undefined : Number(source.windowMs) / 1000;
  const zoomSeconds = source.zoomSeconds ?? source.windowSeconds ?? legacyWindowMs;
  return {
    burn: normalizeNodeGraphTraceDisplayNumber(source.burn, defaults.burn, 0, 1),
    cycles: normalizeNodeGraphTraceDisplayNumber(source.cycles, defaults.cycles, 1, 64, true),
    decay: normalizeNodeGraphTraceDisplayNumber(source.decay, defaults.decay, 0, 1),
    dot1Brightness: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
      0,
      Infinity,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(source.dot1Color ?? source.color, defaults.dot1Color),
    // Dot toggleability removed app-wide -- redundant with the display's
    // own show/hide (if you don't want to see it, hide the whole
    // display). Always true regardless of any stored/legacy value, same
    // way this file already handles the Dot 2 removal.
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? defaults.lineThickness,
    ),
    zoomSeconds: normalizeNodeGraphTraceDisplayZoomSeconds(zoomSeconds, defaults.zoomSeconds),
  };
}

function normalizeNodeGraphZeroDBurnSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphZeroDBurnSettingsDefaults;
  return {
    bipolarBrightness: source.bipolarBrightness === true,
    dot1Brightness: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
      0,
      2,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(source.dot1Color ?? source.color, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    lineThickness: normalizeNodeGraphTraceDisplayNumber(
      source.lineThickness ?? source.dot1Blur,
      defaults.lineThickness,
      0,
      1,
    ),
  };
}

function normalizeNodeGraphTraceDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphTraceDisplaySettingsDefaults;
  const legacyWindowMs = source.windowMs === undefined ? undefined : Number(source.windowMs) / 1000;
  const zoomSeconds = source.zoomSeconds ?? source.windowSeconds ?? legacyWindowMs;
  return {
    brightness: normalizeNodeGraphTraceDisplayNumber(
      source.brightness ?? source.dot1Brightness,
      defaults.brightness,
      0,
      Infinity,
    ),
    color: normalizeNodeGraphTraceDisplayColor(source.color ?? source.dot1Color, defaults.color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Size,
      defaults.dot1Size,
      0,
      1,
    ),
    secondaryBrightness: normalizeNodeGraphTraceDisplayNumber(
      source.secondaryBrightness,
      defaults.secondaryBrightness,
      0,
      Infinity,
    ),
    secondaryColor: normalizeNodeGraphTraceDisplayColor(source.secondaryColor, defaults.secondaryColor),
    secondaryEnabled: source.secondaryEnabled !== false,
    secondarySize: normalizeNodeGraphTraceDisplayNumber(
      source.secondarySize,
      defaults.secondarySize,
      0,
      1,
    ),
    secondaryLineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.secondaryLineThickness ?? defaults.secondaryLineThickness,
    ),
    cycles: normalizeNodeGraphTraceDisplayNumber(source.cycles, defaults.cycles, -Infinity, Infinity),
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? defaults.lineThickness,
    ),
    padding: normalizeNodeGraphTraceDisplayNumber(source.padding, defaults.padding, -Infinity, Infinity),
    skipDiscontinuities: source.skipDiscontinuities !== false,
    sourceSync: source.sourceSync !== false,
    zoomSeconds: normalizeNodeGraphTraceDisplayZoomSeconds(zoomSeconds, defaults.zoomSeconds),
  };
}

function normalizeNodeGraphValueOscilloscopeSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphValueOscilloscopeSettingsDefaults;
  return {
    brightness: normalizeNodeGraphTraceDisplayNumber(
      source.brightness ?? source.dot1Brightness,
      defaults.brightness,
      0,
      Infinity,
    ),
    burn: normalizeNodeGraphTraceDisplayNumber(source.burn, defaults.burn, 0, 1),
    capEnabled: source.capEnabled !== false,
    capLength: normalizeNodeGraphTraceDisplayNumber(source.capLength, defaults.capLength, 0, 1),
    capSize: normalizeNodeGraphTraceDisplayNumber(source.capSize, defaults.capSize, 0, 1),
    color: normalizeNodeGraphTraceDisplayColor(source.color ?? source.dot1Color, defaults.color),
    decay: normalizeNodeGraphTraceDisplayNumber(source.decay, defaults.decay, 0, 1),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    lineLength: normalizeNodeGraphTraceDisplayNumber(source.lineLength, defaults.lineLength, 0, 1),
    lineThickness: normalizeNodeGraphTraceDisplayNumber(source.lineThickness, defaults.lineThickness, 0, 1),
  };
}

function normalizeNodeGraphNumberReadoutSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphNumberReadoutSettingsDefaults;
  return {
    background: normalizeNodeGraphTraceDisplayColor(
      source.background ?? source.backgroundColor,
      defaults.background,
    ),
    brightness: normalizeNodeGraphTraceDisplayNumber(
      source.brightness ?? source.dot1Brightness,
      defaults.brightness,
      0,
      2,
    ),
    burn: normalizeNodeGraphTraceDisplayNumber(source.burn, defaults.burn, 0, 1),
    color: normalizeNodeGraphTraceDisplayColor(source.color ?? source.dot1Color, defaults.color),
    decay: normalizeNodeGraphTraceDisplayNumber(source.decay, defaults.decay, 0, 1),
    decimals: normalizeNodeGraphTraceDisplayNumber(source.decimals, defaults.decimals, 0, 8, true),
    ghost: normalizeNodeGraphTraceDisplayNumber(source.ghost, defaults.ghost, 0, 1),
    innerGlow: normalizeNodeGraphTraceDisplayNumber(source.innerGlow, defaults.innerGlow, 0, 1),
    innerShadow: normalizeNodeGraphTraceDisplayNumber(source.innerShadow, defaults.innerShadow, 0, 1),
  };
}

function normalizeNodeGraphScope2dSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphScope2dSettingsDefaults;
  return {
    burn: normalizeNodeGraphTraceDisplayNumber(source.burn, defaults.burn, 0, 1),
    decay: normalizeNodeGraphTraceDisplayNumber(source.decay, defaults.decay, 0, 1),
    dot1Brightness: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
      0,
      Infinity,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(source.dot1Color ?? source.color, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    dotBudget: Math.max(
      64,
      Math.min(8192, Math.round(
        Number(source.dotBudget ?? defaults.dotBudget) || defaults.dotBudget,
      )),
    ),
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? source.dot1Blur ?? defaults.lineThickness,
    ),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      4,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0, Infinity),
  };
}

function normalizeNodeGraphScope2dTraceSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphScope2dTraceSettingsDefaults;
  return {
    dot1Brightness: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
      0,
      Infinity,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(source.dot1Color ?? source.color, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    historySeconds: normalizeNodeGraphTraceDisplayZoomSeconds(
      source.historySeconds ?? source.history,
      defaults.historySeconds,
    ),
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? source.dot1Blur ?? defaults.lineThickness,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0, Infinity),
  };
}

function nodeGraphZeroDBurnSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphZeroDBurnSettings();
  }
  return normalizeNodeGraphZeroDBurnSettings(node.zeroDBurnSettings);
}

function nodeGraphTraceDisplaySettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphTraceDisplaySettings();
  }
  const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
  return settingsSchema === "value"
    ? normalizeNodeGraphValueOscilloscopeSettings(node.traceDisplaySettings)
    : normalizeNodeGraphTraceDisplaySettings(node.traceDisplaySettings);
}

function nodeGraphLineBurnSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphLineBurnSettings();
  }
  return normalizeNodeGraphLineBurnSettings(node.traceDisplaySettings);
}

function nodeGraphNumberReadoutSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphNumberReadoutSettings();
  }
  return normalizeNodeGraphNumberReadoutSettings(node.traceDisplaySettings);
}

function nodeGraphScope2dSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphScope2dSettings();
  }
  return normalizeNodeGraphScope2dSettings(node.traceDisplaySettings);
}

function nodeGraphScope2dTraceSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphScope2dTraceSettings();
  }
  return normalizeNodeGraphScope2dTraceSettings(node.traceDisplaySettings);
}

function nodeGraphGlobalTraceSettings() {
  return normalizeNodeGraphTraceDisplaySettings(nodeGraphMvp?.traceSettings);
}

function nodeGraphTraceDisplaySettingsEditingGlobal() {
  return nodeGraphMvp?.traceDisplaySettingsTargetNode === "__globalTraceSettings";
}

function nodeGraphTraceDisplaySettingsEditingTraceDefaults() {
  if (nodeGraphTraceDisplaySettingsEditingGlobal()) {
    return true;
  }
  const node = nodeGraphPatchNode(nodeGraphMvp?.traceDisplaySettingsTargetNode);
  // Plain Trace nodes intentionally share one global look -- edits fall
  // through to nodeGraphMvp.traceSettings below. Output reuses the same
  // "trace" schema to render its Left/Right channels, but each Output
  // node's colors/sizes are its own per-node choice (read straight off
  // node.traceDisplaySettings in drawNodeGraphTraceDisplayCanvasItem), so
  // it must never share the global bucket the way plain Trace nodes do.
  return nodeGraphModuleDisplaySettingsSchemaForNode(node) === "trace" && node?.type !== "output";
}

const nodeGraphDisplayModeRenderers = Object.freeze(["trace", "clock", "dot", "value", "lineBurn", "hypersawBurn", "oscilloscopeBankBurn", "videoscopeBurn", "spectrogramBurn", "transportBpm", "scope2d", "scope2dTrace", "phosphorLight", "numberReadout", "customDisplay", "spectrum", "ledLamp"]);
const nodeGraphDisplayModeSignalKinds = Object.freeze(["scalar", "xy", "buffer"]);

function nodeGraphDisplayModeSettingsSchemaForRenderer(renderer) {
  return nodeGraphDisplayModeRenderers.includes(renderer) ? renderer : "trace";
}

function normalizeNodeGraphDisplaySignal(signal, index = 0) {
  const raw = typeof signal === "string" ? { key: signal } : (signal && typeof signal === "object" ? signal : {});
  const key = String(raw.key || raw.name || raw.port || `signal${index + 1}`).trim();
  if (!key) {
    return null;
  }
  const kind = nodeGraphDisplayModeSignalKinds.includes(raw.kind) ? raw.kind : "scalar";
  return {
    key,
    kind,
    label: String(raw.label || key).trim() || key,
  };
}

function nodeGraphModuleOutputPortsForType(type) {
  const outputs = nodeGraphModuleDefinitions?.[type]?.outputs;
  return Array.isArray(outputs)
    ? outputs.map((output) => String(output || "").trim()).filter(Boolean)
    : [];
}

function nodeGraphModuleDefaultScalarDisplayPort(type) {
  const outputs = nodeGraphModuleOutputPortsForType(type);
  // Prefer the selected-waveform port used by LFO/PolyBLEP/BLIT (Wave Out)
  // before falling back to a fixed shape port like Saw.
  return outputs.find((port) => port === "Out") ||
    outputs.find((port) => port === "Wave Out") ||
    outputs.find((port) => port === "Mono") ||
    outputs.find((port) => port === "Wave") ||
    outputs[0] ||
    "";
}

function nodeGraphModuleDefaultXyDisplaySource(type) {
  const outputs = nodeGraphModuleOutputPortsForType(type);
  const x = outputs.find((port) => port === "X") ||
    outputs.find((port) => port === "Out X") ||
    outputs.find((port) => port === "Left") ||
    "";
  const y = outputs.find((port) => port === "Y") ||
    outputs.find((port) => port === "Out Y") ||
    outputs.find((port) => port === "Right") ||
    "";
  return x && y ? { x, y } : null;
}

function nodeGraphModuleDisplaySignalsForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displaySignals;
  const signals = Array.isArray(declared)
    ? declared.map(normalizeNodeGraphDisplaySignal).filter(Boolean)
    : nodeGraphModuleOutputPortsForType(type).map((port, index) => normalizeNodeGraphDisplaySignal({ key: port, label: port, kind: "scalar" }, index)).filter(Boolean);
  const xy = nodeGraphModuleDefaultXyDisplaySource(type);
  if (xy && !signals.some((signal) => signal.key === "X/Y")) {
    signals.push({ key: "X/Y", kind: "xy", label: "X/Y" });
  }
  return signals;
}

function normalizeNodeGraphDisplayMode(mode, type = "", index = 0) {
  const raw = mode && typeof mode === "object" ? mode : {};
  const renderer = nodeGraphDisplayModeRenderers.includes(raw.renderer)
    ? raw.renderer
    : nodeGraphModuleDeclaredDisplayTypeForType(type);
  if (renderer === "legacy") {
    return null;
  }
  const key = String(raw.key || raw.name || `${renderer}${index + 1}`).trim();
  if (!key) {
    return null;
  }
  const source = raw.source && typeof raw.source === "object"
    ? { ...raw.source }
    : nodeGraphModuleImplicitDisplayModeSource(type, renderer);
  return {
    key,
    label: String(raw.label || key).trim() || key,
    renderer,
    settingsSchema: nodeGraphDisplayModeSettingsSchemaForRenderer(raw.settingsSchema || renderer),
    source,
  };
}

function nodeGraphModuleImplicitDisplayModeSource(type, renderer) {
  if (["scope2d", "scope2dTrace"].includes(renderer)) {
    return nodeGraphModuleDefaultXyDisplaySource(type) || { value: nodeGraphModuleDefaultScalarDisplayPort(type) };
  }
  return { value: nodeGraphModuleDefaultScalarDisplayPort(type) };
}

function nodeGraphModuleImplicitDisplayModeForType(type) {
  const renderer = nodeGraphModuleDeclaredDisplayTypeForType(type);
  if (renderer === "legacy") {
    return null;
  }
  return normalizeNodeGraphDisplayMode({
    key: renderer,
    label: nodeGraphDisplayModeSettingsSchemaForRenderer(renderer),
    renderer,
    settingsSchema: nodeGraphDisplayModeSettingsSchemaForRenderer(renderer),
    source: nodeGraphModuleImplicitDisplayModeSource(type, renderer),
  }, type, 0);
}

function nodeGraphModuleWithSpectrumCompanionMode(modes) {
  if (!Array.isArray(modes) || !modes.length || modes.some((mode) => mode.renderer === "spectrum")) {
    return modes;
  }
  const traceMode = modes.find((mode) => mode.renderer === "trace");
  if (!traceMode) {
    return modes;
  }
  return [
    ...modes,
    {
      key: `${traceMode.key}Spectrum`,
      label: `${traceMode.label} (Spectrum)`,
      renderer: "spectrum",
      settingsSchema: "trace",
      source: { ...traceMode.source },
    },
  ];
}

function nodeGraphModuleDisplayModesForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displayModes;
  const modes = Array.isArray(declared)
    ? declared.map((mode, index) => normalizeNodeGraphDisplayMode(mode, type, index)).filter(Boolean)
    : [];
  if (modes.length) {
    return nodeGraphModuleWithSpectrumCompanionMode(modes);
  }
  const implicit = nodeGraphModuleImplicitDisplayModeForType(type);
  return nodeGraphModuleWithSpectrumCompanionMode(implicit ? [implicit] : []);
}

function nodeGraphModuleDefaultDisplayModeKeyForType(type) {
  const declared = String(nodeGraphModuleDefinitions?.[type]?.defaultDisplayMode || "").trim();
  const modes = nodeGraphModuleDisplayModesForType(type);
  return modes.some((mode) => mode.key === declared)
    ? declared
    : (modes[0]?.key || "");
}

function nodeGraphModuleSelectedDisplayMode(node) {
  const modes = nodeGraphModuleDisplayModesForType(node?.type);
  const selected = String(node?.ui?.displayModeKey || nodeGraphModuleDefaultDisplayModeKeyForType(node?.type) || "").trim();
  return modes.find((mode) => mode.key === selected) || modes[0] || null;
}

function nodeGraphModuleDisplayRendererForNode(node) {
  return nodeGraphModuleSelectedDisplayMode(node)?.renderer || nodeGraphModuleDisplayTypeForType(node?.type);
}

function nodeGraphModuleDisplaySettingsSchemaForNode(node) {
  return nodeGraphModuleSelectedDisplayMode(node)?.settingsSchema || nodeGraphDisplayModeSettingsSchemaForRenderer(nodeGraphModuleDisplayRendererForNode(node));
}

function nodeGraphModuleDisplayRendererForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  return node
    ? nodeGraphModuleDisplayRendererForNode(node)
    : nodeGraphModuleDisplayTypeForType(slot?.type);
}

function nodeGraphModuleDisplaySettingsSchemaForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  return node
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : nodeGraphDisplayModeSettingsSchemaForRenderer(nodeGraphModuleDisplayRendererForSlot(slot));
}

function nodeGraphModuleDeclaredDisplayTypeForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displayType;
  if (nodeGraphDisplayModeRenderers.includes(declared)) {
    return declared;
  }
  if (nodeGraphModuleDefinitions?.[type]) {
    return "trace";
  }
  return "legacy";
}

function nodeGraphModuleDisplayTypeForType(type) {
  return nodeGraphModuleDisplayModesForType(type)[0]?.renderer || nodeGraphModuleDeclaredDisplayTypeForType(type);
}

function nodeGraphModuleDisplayTypeForSlot(slot) {
  return nodeGraphModuleDisplayRendererForSlot(slot);
}

function nodeGraphModuleScopeSlotUsesWiredInputs(slot) {
  return ["traceDisplay", "dotOscilloscope", "valueOscilloscope", "lineBurnOscilloscope", "scope2d", "scope2dTrace", "phosphorLight", "visualOscilloscope", "numberReadout"].includes(slot?.type);
}

function nodeGraphModuleDisplaySourceForSlot(slot) {
  return nodeGraphModuleSelectedDisplayMode(nodeGraphModuleScopeNodeForSlot(slot))?.source || null;
}

function nodeGraphWirelessVideoCatalogNode(node) {
  if (!node?.id || !nodeGraphModuleDefinitions?.[node.type]) {
    return null;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  const signals = nodeGraphModuleDisplaySignalsForType(node.type);
  if (!modes.length && !signals.length) {
    return null;
  }
  const selectedMode = nodeGraphModuleSelectedDisplayMode(node);
  return {
    id: String(node.id),
    modes: modes.map((mode) => ({
      key: mode.key,
      kind: mode.kind,
      label: mode.label,
      renderer: mode.renderer,
      schema: mode.settingsSchema,
      settingsSchema: mode.settingsSchema,
      source: mode.source && typeof mode.source === "object" ? { ...mode.source } : {},
    })),
    selectedModeKey: selectedMode?.key || "",
    signals: signals.map((signal) => ({
      key: signal.key,
      kind: signal.kind,
      label: signal.label,
      port: signal.port,
    })),
    title: typeof nodeGraphPatchNodeTitle === "function"
      ? nodeGraphPatchNodeTitle(node)
      : nodeGraphNodeLabels?.[node.type] || String(node.type || ""),
    type: String(node.type || ""),
  };
}

function nodeGraphWirelessVideoCatalog(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  return nodes
    .filter((node) => includeHidden || !normalizeNodeGraphPatchNodeUi(node.ui, node.type).oscilloscopeHidden)
    .map((node) => nodeGraphWirelessVideoCatalogNode(node))
    .filter(Boolean);
}

function nodeGraphCanvasVideoApi() {
  return Object.freeze({
    list(options = {}) {
      return nodeGraphWirelessVideoCatalog(options).map((entry) => ({
        ...entry,
        modes: entry.modes.map((mode) => ({
          ...mode,
          source: mode.source && typeof mode.source === "object" ? { ...mode.source } : {},
        })),
        signals: entry.signals.map((signal) => ({ ...signal })),
      }));
    },
  });
}

if (typeof window !== "undefined") {
  window.nodeGraphCanvasVideoApi = nodeGraphCanvasVideoApi;
  window.nodeGraphWirelessVideoCatalog = nodeGraphWirelessVideoCatalog;
}

function nodeGraphModuleDisplayTypeHasLocalSettings(displayType) {
  return ["trace", "dot", "value", "lineBurn", "scope2d", "scope2dTrace", "phosphorLight", "numberReadout"].includes(displayType);
}

function nodeGraphNodeHasLocalDisplaySettings(node) {
  return Boolean(node && nodeGraphModuleDisplayTypeHasLocalSettings(nodeGraphModuleDisplaySettingsSchemaForNode(node)));
}

function nodeGraphNodeCanOpenDisplaySettings(node) {
  return Boolean(
    nodeGraphNodeHasLocalDisplaySettings(node) ||
    (typeof nodeGraphPatchNodeHasHideableOscilloscope === "function" && nodeGraphPatchNodeHasHideableOscilloscope(node)),
  );
}

function nodeGraphTraceDisplaySettingsForSlot(slot) {
  // Plain Trace nodes intentionally share one global look (see
  // nodeGraphTraceDisplaySettingsEditingTraceDefaults). Output reuses the
  // "trace" schema for its Left/Right channels but each Output node's own
  // brightness/size/blur are per-node -- reading the global bucket here
  // meant those fields silently never reflected what was actually saved
  // on the node (only color worked, since the draw path reads color
  // straight off the node as a separate override).
  if (
    nodeGraphModuleDisplaySettingsSchemaForSlot(slot) === "trace" &&
    nodeGraphModuleScopeNodeForSlot(slot)?.type !== "output"
  ) {
    return nodeGraphGlobalTraceSettings();
  }
  return nodeGraphTraceDisplaySettingsForNode(nodeGraphModuleScopeNodeForSlot(slot));
}

function prepareNodeGraphTraceDisplayBuffer(buffer, settings = nodeGraphTraceDisplaySettingsDefaults) {
  if (!buffer?.length) {
    return buffer;
  }
  const traceSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  buffer.nodeGraphScopeDrawFullWindow = true;
  buffer.nodeGraphScopeDrawProgress = 1;
  buffer.nodeGraphScopeDrawStartProgress = 0;
  buffer.nodeGraphScopeDrawWrap = false;
  buffer.nodeGraphScopeHoldPoint = false;
  buffer.nodeGraphScopeSkipDiscontinuities = traceSettings.skipDiscontinuities;
  buffer.nodeGraphScopeTracePadding = 0;
  buffer.nodeGraphScopeMinPointSpacingPx = 0.5;
  buffer.nodeGraphScopeVisualPointLimit = nodeGraphTraceDisplayRenderPointBudget();
  buffer.nodeGraphScopeUseFullWindow = true;
  return buffer;
}

function nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const selectedPort = nodeGraphModuleScopeShaderOutputPortForSlot(slot);
  if (selectedPort === "Analog Out") {
    return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer);
  }
  if (selectedPort === "Pulse") {
    return nodeGraphModuleScopeCapturedPulseLightTarget(capturedBuffer);
  }
  return nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer);
}

function nodeGraphModuleScopeClockAnalogMonitorSample(phase, level) {
  const p = clampNodeSliderValue(Number(phase) || 0, 0, 1);
  const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
  const release = Math.pow(Math.max(0, 1 - p), 1.85);
  const snapEnvelope = attack * release;
  const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
  const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
  const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
  const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
  return (body + sheen) * snapEnvelope * level;
}

function nodeGraphModuleScopeClockMonitorTargetAtPhase(slot, node, phase, duty, level) {
  const port = nodeGraphModuleScopeShaderOutputPortForSlot(slot) || "Digital Out";
  const safePhase = clampNodeSliderValue(Number(phase) || 0, 0, 1);
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (port === "Analog Out") {
    return clampNodeSliderValue(Math.abs(nodeGraphModuleScopeClockAnalogMonitorSample(safePhase, safeLevel)), 0, 1);
  }
  if (port === "Pulse") {
    const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
    const frameWindow = Math.max(1 / 120, Number(nodeGraphModuleScopeState.animationDeltaSeconds) || (1 / 60));
    return rate > 0 && safePhase < Math.min(1, rate * frameWindow) ? safeLevel : 0;
  }
  return duty > 0 && safeLevel > 0 && safePhase < duty ? safeLevel : 0;
}

function nodeGraphModuleScopeClockGateFrameBrightness(previousPhase, turns, duty, level) {
  const safeDuty = clampNodeSliderValue(Number(duty) || 0, 0, 1);
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (safeDuty <= 0 || safeLevel <= 0) {
    return 0;
  }
  if (safeDuty >= 1) {
    return safeLevel;
  }
  const start = wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const span = Math.max(0, Number(turns) || 0);
  if (span <= 0) {
    return start < safeDuty ? safeLevel : 0;
  }
  let remaining = span;
  let phase = start;
  let onDuration = 0;
  let guard = 0;
  while (remaining > 1e-9 && guard < 8) {
    guard += 1;
    if (phase <= 1e-9 && remaining >= 1) {
      const fullCycles = Math.floor(remaining);
      onDuration += fullCycles * safeDuty;
      remaining -= fullCycles;
      continue;
    }
    const segmentDuration = Math.min(remaining, 1 - phase);
    const segmentEnd = phase + segmentDuration;
    onDuration += Math.max(0, Math.min(segmentEnd, safeDuty) - Math.max(phase, 0));
    remaining -= segmentDuration;
    phase = 0;
  }
  return clampNodeSliderValue((onDuration / span) * safeLevel, 0, 1);
}

function nodeGraphModuleScopeClockPulseFrameBrightness(previousPhase, turns, rate, level) {
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  const safeRate = Math.max(0, Number(rate) || 0);
  const span = Math.max(0, Number(turns) || 0);
  if (safeLevel <= 0 || safeRate <= 0 || span <= 0) {
    return 0;
  }
  const start = wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const pulseCount = Math.max(0, Math.floor(start + span));
  if (pulseCount <= 0) {
    return 0;
  }
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const frameSeconds = span / safeRate;
  const pulseSeconds = pulseCount / sampleRate;
  return clampNodeSliderValue((pulseSeconds / Math.max(1 / sampleRate, frameSeconds)) * safeLevel, 0, 1);
}

function nodeGraphModuleScopeClockAnalogFrameBrightness(previousPhase, turns, level) {
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (safeLevel <= 0) {
    return 0;
  }
  const span = Math.max(0, Number(turns) || 0);
  if (span <= 0) {
    return clampNodeSliderValue(Math.abs(
      nodeGraphModuleScopeClockAnalogMonitorSample(previousPhase, safeLevel),
    ), 0, 1);
  }
  const cycleSpan = span >= 1 ? 1 : span;
  const startPhase = span >= 1 ? 0 : wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const samples = Math.max(4, Math.min(128, Math.ceil(cycleSpan * 96) + 4));
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = samples <= 1 ? 0 : index / (samples - 1);
    const phase = wrapNodeSliderValue(startPhase + cycleSpan * t, 0, 1);
    sum += Math.abs(nodeGraphModuleScopeClockAnalogMonitorSample(phase, safeLevel));
  }
  return clampNodeSliderValue(sum / samples, 0, 1);
}

function nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level) {
  const port = nodeGraphModuleScopeShaderOutputPortForSlot(slot) || "Digital Out";
  const previousPhase = Number(phasor?.previousPhase);
  const fallbackPhase = Number(phasor?.phase) || 0;
  const frameStartPhase = Number.isFinite(previousPhase) ? previousPhase : fallbackPhase;
  const turns = Math.max(0, Number(phasor?.turns) || 0);
  if (turns <= 0) {
    return nodeGraphModuleScopeClockMonitorTargetAtPhase(slot, node, fallbackPhase, duty, level);
  }
  if (port === "Analog Out") {
    return nodeGraphModuleScopeClockAnalogFrameBrightness(frameStartPhase, turns, level);
  }
  if (port === "Pulse") {
    return nodeGraphModuleScopeClockPulseFrameBrightness(frameStartPhase, turns, nodeGraphModuleScopeNodeParam(node, "rate", 0), level);
  }
  return nodeGraphModuleScopeClockGateFrameBrightness(frameStartPhase, turns, duty, level);
}

function nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer = null) {
  if (slot?.type !== "clock") {
    return null;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return null;
  }
  const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
  const duty = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "duty", 0.5), 0, 1);
  const level = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "level", 1), 0, 1);
  const phasor = nodeGraphModuleScopeClockPhasor(
    slot,
    rate,
    nodeGraphModuleScopeModelFrameTime(slot),
  );
  const modelTarget = nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level);
  const capturedTarget = nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer);
  return {
    length: 1,
    nodeGraphScopeFrameBrightness: true,
    nodeGraphScopeEventFrameTurns: Math.max(0, Number(phasor.turns) || 0),
    nodeGraphScopeLightDisplay: true,
    nodeGraphScopeLightInstant: true,
    nodeGraphScopeLightReleaseSeconds: 0.006,
    nodeGraphScopeLightShape: nodeGraphModuleScopeSetting(slot.nodeId).blinkLightShape,
    nodeGraphScopeLightTarget: capturedTarget ?? (Number.isFinite(modelTarget) ? modelTarget : 0),
  };
}

function nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer = null) {
  if (!capturedBuffer?.length) {
    return null;
  }
  capturedBuffer.nodeGraphScopeFrameBrightness = true;
  capturedBuffer.nodeGraphScopeLightTarget =
    nodeGraphModuleScopeCapturedFramePositiveLightTarget(capturedBuffer) ??
    nodeGraphModuleScopeCapturedCurrentPositiveLightTarget(capturedBuffer) ??
    0;
  capturedBuffer.nodeGraphScopeBipolarLightTarget =
    nodeGraphModuleScopeCapturedFrameBipolarLightTarget(capturedBuffer) ??
    nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer) ??
    0;
  return capturedBuffer;
}

// transport's BPM readout (displayType "transportBpm") is model-driven, not
// buffer-driven -- it reads nodeGraphPatchTimingValue("tempoBpm") directly
// and has no real audio-rate signal behind it at all ("bpm" isn't a wired
// output port). Without this, nodeGraphModuleScopeDisplayBuffer() had no
// branch for it, so it fell through to the generic else-clause and depended
// entirely on an incidental buffers.get(nodeId) entry (populated by whatever
// happened to be captured from the node's real audio output) just to pass
// the "!buffer" gate in nodeGraphModuleScopeScreenItems. Any unrelated
// parameter change that disturbed that incidental capture (nothing to do
// with tempo) made the buffer momentarily missing -- and a missing buffer
// there means the slot gets explicitly cleared and skipped for the frame,
// with nothing to force a redraw afterward since the display's own cache
// key (the BPM digits) hadn't changed. Same fix shape as clock's
// nodeGraphModuleScopeOfflineClockBlinkBuffer above: always return a stable,
// non-null sentinel so this slot can never be buffer-starved by something
// that has nothing to do with what it actually displays.
function nodeGraphModuleScopeTransportBpmBuffer(slot) {
  if (slot?.type !== "transport") {
    return null;
  }
  return { length: 1 };
}

function nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot) {
  if (slot?.type !== "gain") {
    return null;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node || !nodeGraphModuleScopeConnectionsTo(node.id, "In").length) {
    return null;
  }
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const nodeMap = nodeGraphModuleScopeNodeMap();
  const sourceFrequency = nodeGraphModuleScopeOfflineSourceFrequency(node.id, nodeMap);
  const cycles = nodeGraphModuleScopeEffectiveCycles(settings) || nodeGraphModuleScopeDefaultSettings.cycles;
  const windowSeconds = sourceFrequency > 0
    ? cycles / sourceFrequency
    : Math.max(0.005, (settings.timeMs || nodeGraphModuleScopeDefaultSettings.timeMs) / 1000);
  const time = nodeGraphModuleScopeModelFrameTime(slot);
  const startTime = time;
  const frames = 2048;
  const buffer = new Float32Array(frames);
  const inputBuffer = new Float32Array(frames);
  const context = {
    nodeMap,
    scopeStartTime: startTime,
    zeroFrequencyDisplayCycles: sourceFrequency > 0 ? 0 : cycles,
    zeroFrequencyDisplayFrames: frames,
  };
  const amount = nodeGraphModuleScopeNodeParam(node, "amount", 1);
  const inputConnections = nodeGraphModuleScopeConnectionsTo(node.id, "In");
  for (let index = 0; index < frames; index += 1) {
    const progress = index / Math.max(1, frames - 1);
    const localTime = startTime + progress * windowSeconds;
    const sampleIndex = Math.floor(localTime * sampleRate);
    context.zeroFrequencyDisplayFrame = sourceFrequency > 0 ? null : index;
    inputBuffer[index] = inputConnections.reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
      context,
      connection.sourceNode,
      localTime,
      sampleIndex,
      connection.sourcePort,
      1,
    ), 0);
    buffer[index] = inputBuffer[index];
  }
  const inputStats = nodeGraphModuleScopeBufferStats(inputBuffer);
  buffer.nodeGraphScopeDrawProgress = 1;
  buffer.nodeGraphScopeAnalyzer = {
    gainDb: nodeGraphModuleScopeLinearToDb(amount),
    inputPeakDb: inputStats.peakDb,
    inputRmsDb: inputStats.rmsDb,
    ...nodeGraphModuleScopeBufferStats(buffer),
  };
  buffer.nodeGraphScopePeriodSamples = sourceFrequency > 0 ? frames / cycles : 0;
  buffer.nodeGraphScopeCurrentSamplePosition = 0;
  buffer.nodeGraphScopeSourceFrequency = sourceFrequency;
  buffer.nodeGraphScopeSyncBuffer = buffer;
  return buffer;
}

function nodeGraphModuleScopeXyTraceFrameCount(length) {
  const safeLength = Math.max(2, Math.floor(Number(length) || 0));
  return safeLength;
}

function nodeGraphModuleScopeCapturedXyTraceFrameCount(slot, length) {
  const frames = nodeGraphModuleScopeXyTraceFrameCount(length);
  return slot?.type === "audioPlayer"
    ? Math.min(frames, 256)
    : frames;
}

function nodeGraphModuleScopeOutputInputConnections(nodeId) {
  return {
    Mono: nodeGraphModuleScopeConnectionsTo(nodeId, "Mono"),
    Left: nodeGraphModuleScopeConnectionsTo(nodeId, "Left"),
    Right: nodeGraphModuleScopeConnectionsTo(nodeId, "Right"),
  };
}

function nodeGraphModuleScopeOutputConnectionList(inputConnections) {
  return [
    ...(inputConnections?.Mono || []),
    ...(inputConnections?.Left || []),
    ...(inputConnections?.Right || []),
  ];
}

function nodeGraphModuleScopeOfflineConnectionsSourceFrequency(connections, nodeMap) {
  return Math.max(
    0,
    ...(connections || [])
      .map((connection) => nodeGraphModuleScopeOfflineSourceFrequency(connection.sourceNode, nodeMap)),
  );
}

function nodeGraphModuleScopeOfflineConnectionSum(context, connections, localTime, sampleIndex) {
  return (connections || []).reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
    context,
    connection.sourceNode,
    localTime,
    sampleIndex,
    connection.sourcePort,
    1,
  ), 0);
}

const nodeGraphSpectrumFftSize = 1024;
const nodeGraphSpectrumBarCount = 160;

function nodeGraphSpectrumHannWindow(size) {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

const nodeGraphSpectrumHannWindowCache = nodeGraphSpectrumHannWindow(nodeGraphSpectrumFftSize);

// Iterative in-place radix-2 Cooley-Tukey FFT. `real`/`imag` must be
// same-length power-of-two Float64Arrays; results are written back in place.
function nodeGraphSpectrumFftInPlace(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tempReal = real[i];
      real[i] = real[j];
      real[j] = tempReal;
      const tempImag = imag[i];
      imag[i] = imag[j];
      imag[j] = tempImag;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < halfLen; k += 1) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const evenIndex = start + k;
        const oddIndex = start + k + halfLen;
        const oddR = real[oddIndex] * wr - imag[oddIndex] * wi;
        const oddI = real[oddIndex] * wi + imag[oddIndex] * wr;
        real[oddIndex] = real[evenIndex] - oddR;
        imag[oddIndex] = imag[evenIndex] - oddI;
        real[evenIndex] += oddR;
        imag[evenIndex] += oddI;
      }
    }
  }
}

// Builds a bar-height buffer (values 0..1, tagged nodeGraphScopeSpectrum) from
// the same raw time-domain sample buffer the waveform trace renderer reads,
// so switching a node's display mode to "Spectrum" needs no separate capture
// path. Magnitude is mapped from a -100..0 dB window, matching typical scope
// analyzer floor/ceiling defaults.
function nodeGraphModuleScopeSpectrumBuffer(capturedBuffer) {
  const size = nodeGraphSpectrumFftSize;
  if (!capturedBuffer?.length) {
    return capturedBuffer;
  }
  const available = Math.min(capturedBuffer.length, size);
  const offset = capturedBuffer.length - available;
  const windowOffset = size - available;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let i = 0; i < available; i += 1) {
    real[windowOffset + i] = (Number(capturedBuffer[offset + i]) || 0) *
      nodeGraphSpectrumHannWindowCache[windowOffset + i];
  }
  nodeGraphSpectrumFftInPlace(real, imag);
  const bins = size / 2;
  const minDb = -100;
  const maxDb = 0;
  const magnitudes = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (size / 2);
    const db = 20 * Math.log10(Math.max(magnitude, 1e-9));
    magnitudes[i] = clampNodeSliderValue((db - minDb) / (maxDb - minDb), 0, 1);
  }
  // Bar geometry is one solid-color rectangle per array entry, so at typical
  // scope widths (100-700px) 512 raw FFT bins rasterize as far-sub-pixel
  // slivers -- effectively invisible even though the draw call is correct.
  // Max-pool down to a fixed, always-visible bar count instead.
  const barCount = Math.min(bins, nodeGraphSpectrumBarCount);
  const spectrum = new Float32Array(barCount);
  const bandSize = bins / barCount;
  for (let i = 0; i < barCount; i += 1) {
    const start = Math.floor(i * bandSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bandSize));
    let peak = 0;
    for (let bin = start; bin < end && bin < bins; bin += 1) {
      if (magnitudes[bin] > peak) {
        peak = magnitudes[bin];
      }
    }
    spectrum[i] = peak;
  }
  spectrum.nodeGraphScopeSpectrum = true;
  return spectrum;
}

function nodeGraphModuleScopeDisplayBuffer(slot, capturedBuffer = null) {
  let buffer = null;
  const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
  if (renderer === "scope2dTrace") {
    const settings = nodeGraphScope2dTraceSettingsForNode(nodeGraphModuleScopeNodeForSlot(slot));
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    buffer = nodeGraphModuleScopeCapturedScope2dBuffer(slot, {
      historySeconds: settings.historySeconds,
      ...(source ? { xPort: source.x, yPort: source.y } : {}),
    }) || capturedBuffer;
  } else if (renderer === "scope2d" || renderer === "phosphorLight") {
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    buffer = nodeGraphModuleScopeCapturedScope2dBuffer(slot, source
      ? { xPort: source.x, yPort: source.y }
      : {}) || capturedBuffer;
  } else if (slot?.type === "valueOscilloscope") {
    buffer = capturedBuffer;
  } else if (slot?.type === "numberReadout") {
    // Number Readout must only ever show real captured input — never an
    // offline model guess. No fallback chain here on purpose.
    buffer = capturedBuffer;
  } else if (slot?.type === "clock") {
    buffer = nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer) ||
      nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer);
  } else if (renderer === "transportBpm") {
    buffer = nodeGraphModuleScopeTransportBpmBuffer(slot);
  } else if (renderer === "dot") {
    buffer = nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer);
  } else if (slot?.type === "lineBurnOscilloscope") {
    buffer = prepareNodeGraphTraceDisplayBuffer(
      capturedBuffer,
      nodeGraphLineBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(slot)),
    );
  } else if (renderer === "trace") {
    buffer = prepareNodeGraphTraceDisplayBuffer(
      capturedBuffer,
      nodeGraphTraceDisplaySettingsForSlot(slot),
    );
  } else if (renderer === "spectrum") {
    buffer = nodeGraphModuleScopeSpectrumBuffer(capturedBuffer);
  } else {
    buffer = nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer) ||
      nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot) ||
      capturedBuffer;
  }
  return buffer;
}

const nodeGraphTraceDisplaySettingsWindowSize = Object.freeze({
  height: 620,
  maxHeight: 820,
  maxWidth: 760,
  minHeight: 260,
  minWidth: 24,
  width: 185,
});

const nodeGraphTraceDisplaySettingFields = Object.freeze([
  ["zoomSeconds", "Zoom (s)"],
  ["historySeconds", "History (s)"],
  ["scale", "Scale"],
  ["burn", "Burn"],
  ["decay", "Decay"],
  ["pixelDensity", "Pixel density"],
  ["dotBudget", "Dot budget"],
  ["padding", "Amp"],
  ["cycles", "Cycles"],
  ["decimals", "Decimals"],
  ["ghost", "LCD plate"],
  ["innerGlow", "Inner glow"],
  ["innerShadow", "Inner shadow"],

  ["dot1Size", "Size"],
  ["lineThickness", "Blur"],
  ["dot1Brightness", "Dot light"],
  ["secondarySize", "Secondary size"],
  ["secondaryLineThickness", "Secondary blur"],
  ["secondaryBrightness", "Secondary light"],
  ["lineLength", "Line length"],
  ["capSize", "Cap size"],
  ["capLength", "Cap length"],
]);

const nodeGraphTraceDisplaySettingControlKeys = Object.freeze({
  fields: nodeGraphTraceDisplaySettingFields.map(([key]) => key),
  colors: ["dot1Color", "secondaryColor", "backgroundColor"],
  toggles: ["sourceSync", "bipolarBrightness", "secondaryEnabled", "capEnabled"],
  choices: [],
});

const nodeGraphTraceDisplayActiveControlsByType = Object.freeze({
  trace: Object.freeze({
    fields: Object.freeze([
      "zoomSeconds",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "secondarySize",
      "secondaryLineThickness",
      "secondaryBrightness",
    ]),
    colors: Object.freeze(["dot1Color", "secondaryColor"]),
    toggles: Object.freeze(["sourceSync", "skipDiscontinuities", "secondaryEnabled"]),
    choices: Object.freeze([]),
  }),
  dot: Object.freeze({
    fields: Object.freeze([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze(["bipolarBrightness"]),
    choices: Object.freeze([]),
  }),
  lineBurn: Object.freeze({
    fields: Object.freeze([
      "burn",
      "decay",
      "cycles",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  value: Object.freeze({
    fields: Object.freeze([
      "lineLength",
      "burn",
      "decay",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "capSize",
      "capLength",
    ]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  scope2d: Object.freeze({
    fields: Object.freeze([
      "burn",
      "decay",
      "scale",
      "pixelDensity",
      "dotBudget",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  scope2dTrace: Object.freeze({
    fields: Object.freeze([
      "historySeconds",
      "scale",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  numberReadout: Object.freeze({
    fields: Object.freeze([
      "decimals",
      "burn",
      "decay",
      "ghost",
      "innerGlow",
      "innerShadow",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  phosphorLight: Object.freeze({
    fields: Object.freeze([
      "burn",
      "decay",
      "scale",
      "pixelDensity",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplayActiveControlsForType(type = nodeGraphTraceDisplaySettingsFormType()) {
  return nodeGraphTraceDisplayActiveControlsByType[type] || nodeGraphTraceDisplayActiveControlsByType.trace;
}

function nodeGraphTraceDisplayActiveControlSet(kind, type = nodeGraphTraceDisplaySettingsFormType()) {
  return new Set(nodeGraphTraceDisplayActiveControlsForType(type)[kind] || []);
}

const nodeGraphTraceDisplaySectionControls = Object.freeze({
  caps: Object.freeze({
    fields: Object.freeze(["capSize", "capLength"]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  dot1: Object.freeze({
    fields: Object.freeze(["dot1Size", "lineThickness", "dot1Brightness"]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze(["bipolarBrightness"]),
    choices: Object.freeze([]),
  }),
  secondary: Object.freeze({
    fields: Object.freeze(["secondarySize", "secondaryLineThickness", "secondaryBrightness"]),
    colors: Object.freeze(["secondaryColor"]),
    toggles: Object.freeze(["secondaryEnabled"]),
    choices: Object.freeze([]),
  }),
  trace: Object.freeze({
    fields: Object.freeze([
      "burn",
      "decay",
      "zoomSeconds",
      "historySeconds",
      "scale",
      "pixelDensity",
      "dotBudget",
      "padding",
      "decimals",
      "ghost",
      "innerGlow",
      "innerShadow",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["sourceSync", "skipDiscontinuities"]),
    choices: Object.freeze([]),
  }),
  value: Object.freeze({
    fields: Object.freeze(["lineLength"]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplaySectionHasActiveControls(section, type = nodeGraphTraceDisplaySettingsFormType()) {
  const sectionControls = nodeGraphTraceDisplaySectionControls[section];
  if (!sectionControls) {
    return false;
  }
  return ["fields", "colors", "toggles", "choices"].some((kind) => {
    const activeSet = nodeGraphTraceDisplayActiveControlSet(kind, type);
    return (sectionControls[kind] || []).some((key) => activeSet.has(key));
  });
}

function setNodeGraphTraceDisplaySectionVisible(popover, section, visible) {
  if (!popover) {
    return;
  }
  for (const element of popover.querySelectorAll(`.node-trace-display-${section}-title, .node-trace-display-${section}-section`)) {
    element.hidden = !visible;
  }
}

function formatNodeGraphTraceDisplaySetting(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(4).replace(/\.?0+$/g, "");
}

function nodeGraphTraceDisplaySettingsElement() {
  let popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    return popover;
  }
  popover = document.createElement("div");
  popover.id = "nodeTraceDisplaySettingsPopover";
  popover.className = "node-parameter-metadata-popover node-trace-display-settings-popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "Trace Display drawing settings");
  popover.innerHTML = `
    <div class="scene-context-heading node-trace-display-settings-heading">
      <button
        id="nodeTraceDisplaySettingsDragHandle"
        class="scene-context-drag-handle node-drag-handle"
        type="button"
        aria-label="Move Trace Display drawing settings">&#x2725;</button>
      <div class="scene-context-title">
        <span id="nodeTraceDisplaySettingsTitle">DISPLAY</span>
        <small id="nodeTraceDisplaySettingsSubtitle">Settings</small>
      </div>
      <button
        id="nodeTraceDisplaySettingsClose"
        class="panel-close-button"
        type="button"
        aria-label="Close Trace Display drawing settings">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="metadata-popover-grid node-trace-display-settings-grid">
      <div id="nodeTraceDisplaySettingsTarget" class="node-trace-display-settings-target">No module</div>
      <div class="metadata-field-actions" aria-label="Trace Display drawing actions">
        <button id="nodeTraceDisplaySettingsDefaults" type="button">Defaults</button>
      </div>
      <div class="metadata-section-title node-trace-display-mode-title">Mode</div>
      <div class="metadata-field-section node-trace-display-mode-section">
        <label>
          <span>Mode</span>
          <select id="nodeTraceDisplayModeSelect" data-trace-display-mode-select></select>
        </label>
      </div>
      <div class="metadata-section-title node-trace-display-trace-title">Trace</div>
      <div class="metadata-field-section node-trace-display-trace-section">
        <label class="metadata-checkbox-label node-trace-display-sync-row">
          <input id="nodeTraceDisplaySourceSync" type="checkbox" data-trace-display-toggle="sourceSync">
          Sync
        </label>
        <label class="node-trace-display-line-burn-row">
          <span>Burn</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="burn" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayBurn" type="text" inputmode="decimal" data-trace-display-field="burn">
            <button type="button" data-trace-display-step-target="burn" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-line-burn-row">
          <span>Decay</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="decay" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayDecay" type="text" inputmode="decimal" data-trace-display-field="decay">
            <button type="button" data-trace-display-step-target="decay" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>History (s)</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="historySeconds" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayHistorySeconds" type="text" inputmode="decimal" data-trace-display-field="historySeconds">
            <button type="button" data-trace-display-step-target="historySeconds" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Scale</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="scale" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayScale" type="text" inputmode="decimal" data-trace-display-field="scale">
            <button type="button" data-trace-display-step-target="scale" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Pixel density</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="pixelDensity" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayPixelDensity" type="text" inputmode="decimal" data-trace-display-field="pixelDensity">
            <button type="button" data-trace-display-step-target="pixelDensity" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Dot budget</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="dotBudget" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayDotBudget" type="text" inputmode="numeric" data-trace-display-field="dotBudget">
            <button type="button" data-trace-display-step-target="dotBudget" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Zoom (s)</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="zoomSeconds" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayZoomSeconds" type="text" inputmode="decimal" data-trace-display-field="zoomSeconds">
            <button type="button" data-trace-display-step-target="zoomSeconds" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Cycles</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="cycles" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayCycles" type="text" inputmode="decimal" data-trace-display-field="cycles">
            <button type="button" data-trace-display-step-target="cycles" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Decimals</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="decimals" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayDecimals" type="text" inputmode="decimal" data-trace-display-field="decimals">
            <button type="button" data-trace-display-step-target="decimals" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>LCD plate</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="ghost" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayGhost" type="text" inputmode="decimal" data-trace-display-field="ghost">
            <button type="button" data-trace-display-step-target="ghost" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Inner glow</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="innerGlow" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayInnerGlow" type="text" inputmode="decimal" data-trace-display-field="innerGlow">
            <button type="button" data-trace-display-step-target="innerGlow" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-thickness-row">
          <span>Inner shadow</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="innerShadow" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayInnerShadow" type="text" inputmode="decimal" data-trace-display-field="innerShadow">
            <button type="button" data-trace-display-step-target="innerShadow" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-dot2-thickness-row">
          <span>Amp</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="padding" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayPadding" type="text" inputmode="decimal" data-trace-display-field="padding">
            <button type="button" data-trace-display-step-target="padding" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="metadata-checkbox-label">
          <input id="nodeTraceDisplaySkipDiscontinuities" type="checkbox" data-trace-display-toggle="skipDiscontinuities">
          Skip discontinuities
        </label>
      </div>
      <div class="metadata-section-title node-trace-display-value-title">Line</div>
      <div class="metadata-field-section node-trace-display-value-section">
        <label>
          <span>Line length</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="lineLength" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayValueLineLength" type="text" inputmode="decimal" data-trace-display-field="lineLength">
            <button type="button" data-trace-display-step-target="lineLength" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
      </div>
      <div class="metadata-section-title node-trace-display-dot1-title">
        <span id="nodeTraceDisplayDot1TitleLabel">Dot</span>
      </div>
      <div class="metadata-field-section node-trace-display-dot1-section">
        <label class="metadata-checkbox-label node-trace-display-bipolar-brightness-row">
          <input id="nodeTraceDisplayBipolarBrightness" type="checkbox" data-trace-display-toggle="bipolarBrightness">
          Bipolar
        </label>
        <label>
          <span>Brightness</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="dot1Brightness" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayBrightness" type="text" inputmode="decimal" data-trace-display-field="dot1Brightness">
            <button type="button" data-trace-display-step-target="dot1Brightness" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-trace-line-thickness-row">
          <span>Blur</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="lineThickness" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayLineThickness" type="text" inputmode="decimal" data-trace-display-field="lineThickness">
            <button type="button" data-trace-display-step-target="lineThickness" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label>
          <span>Size</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="dot1Size" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayDot1Size" type="text" inputmode="decimal" data-trace-display-field="dot1Size">
            <button type="button" data-trace-display-step-target="dot1Size" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label>
          <span>Color</span>
          <input id="nodeTraceDisplayColor" type="color" data-trace-display-color="dot1Color" aria-label="Dot color">
        </label>
        <label>
          <span>Background</span>
          <input id="nodeTraceDisplayBackgroundColor" type="color" data-trace-display-color="backgroundColor" aria-label="Background color">
        </label>
      </div>
      <div class="metadata-section-title node-trace-display-secondary-title">
        <span id="nodeTraceDisplaySecondaryTitleLabel">Secondary</span>
        <input
          id="nodeTraceDisplaySecondaryEnabled"
          type="checkbox"
          aria-label="Secondary on"
          data-trace-display-toggle="secondaryEnabled">
      </div>
      <div class="metadata-field-section node-trace-display-secondary-section">
        <label>
          <span>Brightness</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="secondaryBrightness" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplaySecondaryBrightness" type="text" inputmode="decimal" data-trace-display-field="secondaryBrightness">
            <button type="button" data-trace-display-step-target="secondaryBrightness" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label class="node-trace-display-secondary-line-thickness-row">
          <span>Blur</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="secondaryLineThickness" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplaySecondaryLineThickness" type="text" inputmode="decimal" data-trace-display-field="secondaryLineThickness">
            <button type="button" data-trace-display-step-target="secondaryLineThickness" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label>
          <span>Size</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="secondarySize" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplaySecondarySize" type="text" inputmode="decimal" data-trace-display-field="secondarySize">
            <button type="button" data-trace-display-step-target="secondarySize" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label>
          <span>Color</span>
          <input id="nodeTraceDisplaySecondaryColor" type="color" data-trace-display-color="secondaryColor" aria-label="Secondary color">
        </label>
      </div>
      <div class="metadata-section-title node-trace-display-caps-title">Caps</div>
      <div class="metadata-field-section node-trace-display-caps-section">
        <label class="metadata-checkbox-label">
          <input id="nodeTraceDisplayCapEnabled" type="checkbox" data-trace-display-toggle="capEnabled">
          Caps on
        </label>
        <label>
          <span>Size</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="capSize" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayCapSize" type="text" inputmode="decimal" data-trace-display-field="capSize">
            <button type="button" data-trace-display-step-target="capSize" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
        <label>
          <span>Length</span>
          <span class="metadata-stepper-control">
            <button type="button" data-trace-display-step-target="capLength" data-trace-display-step-direction="-1">-</button>
            <input id="nodeTraceDisplayCapLength" type="text" inputmode="decimal" data-trace-display-field="capLength">
            <button type="button" data-trace-display-step-target="capLength" data-trace-display-step-direction="1">+</button>
          </span>
        </label>
      </div>
    </div>
    <div
      id="nodeTraceDisplaySettingsCornerDrag"
      class="metadata-popover-corner-drag"
      aria-label="Resize Trace Display drawing settings"
      role="button"
      tabindex="0"></div>`;
  (document.querySelector(".node-wiring-panel") || document.body).append(popover);
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  bindNodeGraphSettingsTextInputProtection(popover);
  applyNodeGraphTraceDisplaySettingsTooltips(popover);
  return popover;
}

function applyNodeGraphTraceDisplaySettingsTooltips(popover) {
  if (!popover) {
    return;
  }
  const fieldKeys = {
    dot1Brightness: "traceDisplaySettings.brightness",
    dot1Size: "traceDisplaySettings.dot1Size",
    secondaryBrightness: "traceDisplaySettings.secondaryBrightness",
    secondarySize: "traceDisplaySettings.secondarySize",
    secondaryLineThickness: "traceDisplaySettings.secondaryLineThickness",
    burn: "traceDisplaySettings.burn",
    decay: "traceDisplaySettings.decay",
    pixelDensity: "traceDisplaySettings.pixelDensity",
    dotBudget: "traceDisplaySettings.dotBudget",
    zoomSeconds: "traceDisplaySettings.zoomSeconds",
    skipDiscontinuities: "traceDisplaySettings.skipDiscontinuities",
    padding: "traceDisplaySettings.padding",
    lineThickness: "traceDisplaySettings.lineThickness",
    lineLength: "traceDisplaySettings.lineLength",
    capSize: "traceDisplaySettings.capSize",
    capLength: "traceDisplaySettings.capLength",
  };
  for (const [field, key] of Object.entries(fieldKeys)) {
    for (const element of popover.querySelectorAll(`[data-trace-display-field="${field}"], [data-trace-display-step-target="${field}"]`)) {
      element.dataset.tooltipKey = key;
    }
  }
  const colorKeys = {
    dot1Color: "traceDisplaySettings.color",
    secondaryColor: "traceDisplaySettings.secondaryColor",
  };
  for (const [field, key] of Object.entries(colorKeys)) {
    popover.querySelector(`[data-trace-display-color="${field}"]`)?.setAttribute("data-tooltip-key", key);
  }
  const toggleKeys = {
    bipolarBrightness: "traceDisplaySettings.bipolarBrightness",
    secondaryEnabled: "traceDisplaySettings.secondaryEnabled",
    capEnabled: "traceDisplaySettings.capEnabled",
    sourceSync: "traceDisplaySettings.sourceSync",
  };
  for (const [field, key] of Object.entries(toggleKeys)) {
    popover.querySelector(`[data-trace-display-toggle="${field}"]`)?.setAttribute("data-tooltip-key", key);
  }
  const keyedControls = {
    nodeTraceDisplaySettingsDefaults: "traceDisplaySettings.defaults",
  };
  for (const [id, key] of Object.entries(keyedControls)) {
    popover.querySelector(`#${id}`)?.setAttribute("data-tooltip-key", key);
  }
  if (typeof applyNodeGraphStaticTooltips === "function") {
    applyNodeGraphStaticTooltips(popover);
  }
}

function setNodeGraphTraceDisplaySettingsHeader(title = "DISPLAY", subtitle = "Settings", target = "") {
  const titleElement = document.getElementById("nodeTraceDisplaySettingsTitle");
  const subtitleElement = document.getElementById("nodeTraceDisplaySettingsSubtitle");
  const targetElement = document.getElementById("nodeTraceDisplaySettingsTarget");
  if (titleElement) {
    titleElement.textContent = title;
  }
  if (subtitleElement) {
    subtitleElement.textContent = subtitle;
  }
  if (targetElement) {
    targetElement.textContent = target || "";
    targetElement.hidden = !target;
  }
}

function nodeGraphTraceDisplaySettingsTargetLabel(node) {
  if (!node) {
    return "";
  }
  return typeof nodeGraphPatchNodeTitle === "function"
    ? nodeGraphPatchNodeTitle(node)
    : (nodeGraphNodeLabels?.[node.type] || "Module");
}

function setNodeGraphTraceDisplayModeSelectorVisible(popover, visible) {
  if (!popover) {
    return;
  }
  for (const element of popover.querySelectorAll(".node-trace-display-mode-title, .node-trace-display-mode-section")) {
    element.hidden = !visible;
  }
}

function syncNodeGraphTraceDisplayModeSelector(node = null) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  const select = document.getElementById("nodeTraceDisplayModeSelect");
  if (!popover || !select || !node?.type || nodeGraphTraceDisplaySettingsEditingGlobal()) {
    setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
    return;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  if (modes.length <= 1) {
    setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
    return;
  }
  const selectedMode = nodeGraphModuleSelectedDisplayMode(node);
  const selectedKey = selectedMode?.key || nodeGraphModuleDefaultDisplayModeKeyForType(node.type);
  select.innerHTML = modes
    .map((mode) => `<option value="${String(mode.key).replace(/"/g, "&quot;")}">${String(mode.label || mode.key)}</option>`)
    .join("");
  select.value = selectedKey;
  select.dataset.displayModeTargetNode = String(node.id || "");
  setNodeGraphTraceDisplayModeSelectorVisible(popover, true);
}

function setNodeGraphTraceDisplaySettingsFormType(node = null) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover) {
    return;
  }
  const settingsSchema = node
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : "";
  const formType = settingsSchema || "trace";
  popover.dataset.displaySettingsType = formType;
  popover.dataset.displaySettingsTargetNode = node?.id ? String(node.id) : "";
  syncNodeGraphTraceDisplayModeSelector(node);
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", formType);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", formType);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", formType);
  const setControlHidden = (selector, hidden) => {
    for (const element of popover.querySelectorAll(selector)) {
      const row = element.closest("[data-trace-display-control-row], label") || element;
      row.hidden = hidden;
    }
  };
  for (const field of nodeGraphTraceDisplaySettingControlKeys.fields) {
    setControlHidden(
      `[data-trace-display-field="${field}"], [data-trace-display-step-target="${field}"]`,
      !activeFields.has(field),
    );
  }
  for (const color of nodeGraphTraceDisplaySettingControlKeys.colors) {
    setControlHidden(`[data-trace-display-color="${color}"]`, !activeColors.has(color));
  }
  for (const toggle of nodeGraphTraceDisplaySettingControlKeys.toggles) {
    setControlHidden(`[data-trace-display-toggle="${toggle}"]`, !activeToggles.has(toggle));
  }
  for (const choice of nodeGraphTraceDisplaySettingControlKeys.choices) {
    setControlHidden(
      `[data-trace-display-choice="${choice}"], [data-trace-display-choice-row="${choice}"]`,
      !activeChoices.has(choice),
    );
  }
  const traceSectionVisible = nodeGraphTraceDisplaySectionHasActiveControls("trace", formType);
  setNodeGraphTraceDisplaySectionVisible(popover, "trace", traceSectionVisible);
  const traceTitle = popover.querySelector(".node-trace-display-trace-title");
  if (traceTitle) {
    traceTitle.textContent = formType === "value"
      ? "Value"
      : formType === "lineBurn"
        ? "Burn"
        : formType === "scope2d"
          ? "2D"
          : formType === "scope2dTrace"
            ? "Trace"
            : formType === "numberReadout"
              ? "Readout"
              : formType === "phosphorLight"
                ? "PhosphorLight"
                : "Trace";
  }
  setNodeGraphTraceDisplaySectionVisible(popover, "value", nodeGraphTraceDisplaySectionHasActiveControls("value", formType));
  setNodeGraphTraceDisplaySectionVisible(popover, "dot1", nodeGraphTraceDisplaySectionHasActiveControls("dot1", formType));
  // The "trace" schema is shared by Output's stereo display and every plain
  // single-value Trace node -- secondary* only ever renders for Output (see
  // drawNodeGraphTraceDisplayCanvasItem), so gate the section on node type
  // too, or a Trace node would show live-looking Secondary controls that
  // silently do nothing.
  const secondaryActive = nodeGraphTraceDisplaySectionHasActiveControls("secondary", formType) &&
    node?.type === "output";
  setNodeGraphTraceDisplaySectionVisible(popover, "secondary", secondaryActive);
  setNodeGraphTraceDisplaySectionVisible(popover, "caps", nodeGraphTraceDisplaySectionHasActiveControls("caps", formType));

  // Output repurposes the shared dot1/secondary fields to show its two
  // speaker channels -- relabel them Left/Right there so it reads as a
  // stereo pair instead of a "primary/secondary" trace pairing. Every other
  // node type (plain Trace) keeps the generic labels, since "secondary"
  // there is a decorative second layer, not a channel.
  const isOutputNode = node?.type === "output";
  const dot1TitleLabel = popover.querySelector("#nodeTraceDisplayDot1TitleLabel");
  if (dot1TitleLabel) {
    dot1TitleLabel.textContent = isOutputNode ? "Left" : "Dot";
  }
  const secondaryTitleLabel = popover.querySelector("#nodeTraceDisplaySecondaryTitleLabel");
  if (secondaryTitleLabel) {
    secondaryTitleLabel.textContent = isOutputNode ? "Right" : "Secondary";
  }
  const dot1ColorInput = popover.querySelector("#nodeTraceDisplayColor");
  if (dot1ColorInput) {
    dot1ColorInput.setAttribute("aria-label", isOutputNode ? "Left color" : "Dot color");
  }
  const secondaryEnabledInput = popover.querySelector("#nodeTraceDisplaySecondaryEnabled");
  if (secondaryEnabledInput) {
    secondaryEnabledInput.setAttribute("aria-label", isOutputNode ? "Right on" : "Secondary on");
  }
  const secondaryColorInput = popover.querySelector("#nodeTraceDisplaySecondaryColor");
  if (secondaryColorInput) {
    secondaryColorInput.setAttribute("aria-label", isOutputNode ? "Right color" : "Secondary color");
  }
}

function nodeGraphTraceDisplaySettingsFormType() {
  return document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsType || "";
}

function nodeGraphTraceDisplaySettingsTargetNodeId() {
  return String(
    nodeGraphMvp.traceDisplaySettingsTargetNode ||
    document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsTargetNode ||
    "",
  );
}

function nodeGraphDisplaySettingsDefaultsForFormType(type = nodeGraphTraceDisplaySettingsFormType()) {
  if (type === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(nodeGraphZeroDBurnSettingsDefaults);
  }
  if (type === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(nodeGraphValueOscilloscopeSettingsDefaults);
  }
  if (type === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(nodeGraphLineBurnSettingsDefaults);
  }
  if (type === "scope2d") {
    return normalizeNodeGraphScope2dSettings(nodeGraphScope2dSettingsDefaults);
  }
  if (type === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(nodeGraphScope2dTraceSettingsDefaults);
  }
  if (type === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(nodeGraphNumberReadoutSettingsDefaults);
  }
  if (type === "phosphorLight") {
    const normalize = typeof normalizeNodeGraphPhosphorLightSettings === "function"
      ? normalizeNodeGraphPhosphorLightSettings
      : (value) => value || {};
    const defaults = typeof nodeGraphPhosphorLightSettingsDefaults !== "undefined"
      ? nodeGraphPhosphorLightSettingsDefaults
      : {};
    return normalize(defaults);
  }
  return normalizeNodeGraphTraceDisplaySettings(nodeGraphTraceDisplaySettingsDefaults);
}

function nodeGraphDisplaySettingsDefaultValue(key) {
  return Number(nodeGraphDisplaySettingsFormValue(nodeGraphDisplaySettingsDefaultsForFormType(), key)) || 0;
}

function normalizeNodeGraphDisplaySettingsForFormType(settings, type = nodeGraphTraceDisplaySettingsFormType()) {
  if (type === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(settings);
  }
  if (type === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(settings);
  }
  if (type === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(settings);
  }
  if (type === "scope2d") {
    return normalizeNodeGraphScope2dSettings(settings);
  }
  if (type === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(settings);
  }
  if (type === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(settings);
  }
  if (type === "phosphorLight") {
    const normalize = typeof normalizeNodeGraphPhosphorLightSettings === "function"
      ? normalizeNodeGraphPhosphorLightSettings
      : (value) => value || {};
    return normalize(settings);
  }
  return normalizeNodeGraphTraceDisplaySettings(settings);
}

function applyNodeGraphTraceDisplaySettingsWindowSize(size = {}) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover) {
    return null;
  }
  const normalized = normalizeNodeGraphFloatingWindowSize(size, nodeGraphTraceDisplaySettingsWindowSize);
  applyNodeGraphFloatingWindowSizeVars(
    popover,
    "metadata-popover",
    nodeGraphTraceDisplaySettingsWindowSize,
    normalized,
  );
  return normalized;
}

function nodeGraphTraceDisplaySettingsWindowSizeFromElement(popover = document.getElementById("nodeTraceDisplaySettingsPopover")) {
  const rect = popover?.getBoundingClientRect?.();
  return normalizeNodeGraphFloatingWindowSize(
    {
      width: rect?.width,
      height: rect?.height,
    },
    nodeGraphTraceDisplaySettingsWindowSize,
  );
}

function rememberNodeGraphTraceDisplaySettingsWindowState(patch = {}, options = {}) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (typeof rememberNodeGraphWorkspaceWindowState !== "function") {
    return null;
  }
  return rememberNodeGraphWorkspaceWindowState(
    "traceDisplaySettings",
    popover,
    patch,
    { status: false, ...options },
  );
}

function nodeGraphTraceDisplayCurrentSettingsForFormType(formType = nodeGraphTraceDisplaySettingsFormType()) {
  if (nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    return nodeGraphGlobalTraceSettings();
  }
  const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return nodeGraphDisplaySettingsDefaultsForFormType(formType);
  }
  const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
  if (settingsSchema === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(node.zeroDBurnSettings);
  }
  if (settingsSchema === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "scope2d") {
    return normalizeNodeGraphScope2dSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "phosphorLight") {
    const normalize = typeof normalizeNodeGraphPhosphorLightSettings === "function"
      ? normalizeNodeGraphPhosphorLightSettings
      : (value) => value || {};
    return normalize(node.traceDisplaySettings);
  }
  if (settingsSchema === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(node.traceDisplaySettings);
  }
  // Reaching here with schema "trace" only happens for Output (plain Trace
  // nodes are already caught by the editingTraceDefaults() check above) --
  // its own per-node settings, not the shared global bucket.
  if (settingsSchema === "trace" && node?.type === "output") {
    return nodeGraphTraceDisplaySettingsForNode(node);
  }
  return nodeGraphGlobalTraceSettings();
}

function readNodeGraphTraceDisplaySettingsForm() {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const current = normalizeNodeGraphDisplaySettingsForFormType(
    nodeGraphTraceDisplayCurrentSettingsForFormType(formType),
    formType,
  );
  const next = { ...current };
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", formType);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", formType);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", formType);
  for (const key of activeFields) {
    const input = document.querySelector(`[data-trace-display-field="${key}"]`);
    if (input) {
      const sanitizedValue = typeof sanitizeNodeGraphNumericText === "function"
        ? sanitizeNodeGraphNumericText(input.value)
        : String(input.value ?? "").trim();
      if (sanitizedValue && sanitizedValue !== input.value) {
        input.value = sanitizedValue;
      }
      next[key] = sanitizedValue;
      if (key === "dot1Brightness") {
        next.brightness = sanitizedValue;
      }
    }
  }
  for (const key of activeColors) {
    const input = document.querySelector(`[data-trace-display-color="${key}"]`);
    if (input) {
      next[key] = input.value;
      if (key === "dot1Color") {
        next.color = input.value;
      }
      if (key === "backgroundColor") {
        next.background = input.value;
      }
    }
  }
  for (const key of activeToggles) {
    const input = document.querySelector(`[data-trace-display-toggle="${key}"]`);
    if (input) {
      next[key] = input.checked;
    }
  }
  for (const key of activeChoices) {
    const input = document.querySelector(`[data-trace-display-choice="${key}"]`);
    if (input) {
      next[key] = input.value;
    }
  }
  return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
}

function nodeGraphDisplaySettingsFormValue(settings, key) {
  if (key === "dot1Brightness") {
    return settings.dot1Brightness ?? settings.brightness;
  }
  if (key === "dot1Color") {
    return settings.dot1Color ?? settings.color;
  }
  if (key === "backgroundColor") {
    return settings.backgroundColor ?? settings.background;
  }
  return settings[key];
}

function writeNodeGraphTraceDisplaySettingsForm(settings) {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const normalized = normalizeNodeGraphDisplaySettingsForFormType(settings, formType);
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", formType);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", formType);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", formType);
  for (const key of activeFields) {
    const input = document.querySelector(`[data-trace-display-field="${key}"]`);
    if (input) {
      input.value = formatNodeGraphTraceDisplaySetting(nodeGraphDisplaySettingsFormValue(normalized, key));
      input.readOnly = true;
      input.classList.toggle("trace-display-field-editing", false);
    }
  }
  for (const key of activeColors) {
    const input = document.querySelector(`[data-trace-display-color="${key}"]`);
    if (input) {
      input.value = nodeGraphDisplaySettingsFormValue(normalized, key);
    }
  }
  for (const key of activeToggles) {
    const input = document.querySelector(`[data-trace-display-toggle="${key}"]`);
    if (input) {
      input.checked = Boolean(normalized[key]);
    }
  }
  for (const key of activeChoices) {
    const input = document.querySelector(`[data-trace-display-choice="${key}"]`);
    if (input) {
      input.value = nodeGraphDisplaySettingsFormValue(normalized, key);
    }
  }
}

function nodeGraphTraceDisplayStepperQuantum(input) {
  if (!input) {
    return 0.1;
  }
  if (["cycles", "decimals"].includes(input.dataset?.traceDisplayField)) {
    return 1;
  }
  if (input.dataset?.traceDisplayField === "dotBudget") {
    return 64;
  }
  if (input.dataset?.traceDisplayField === "pixelDensity") {
    return 0.05;
  }
  return 0.1;
}

function nodeGraphTraceDisplaySizeControlField(key) {
  return ["dot1Size", "secondarySize", "capSize"].includes(key);
}

function nodeGraphTraceDisplaySensitiveControlField(key) {
  return nodeGraphTraceDisplaySizeControlField(key) ||
    key === "historySeconds" ||
    key === "pixelDensity" ||
    ["dot1Brightness", "secondaryBrightness"].includes(key);
}

const nodeGraphTraceDisplaySensitiveControlExponent = 3;

function nodeGraphTraceDisplaySensitiveControlMax(key) {
  if (key === "pixelDensity") {
    return 4;
  }
  return ["dot1Brightness", "secondaryBrightness"].includes(key) ? 2 : 1;
}

function nodeGraphTraceDisplaySizeToControlValue(value, max = 1) {
  return Math.pow(
    clampNodeSliderValue(Number(value) || 0, 0, max) / max,
    1 / nodeGraphTraceDisplaySensitiveControlExponent,
  );
}

function nodeGraphTraceDisplayControlToSizeValue(value, max = 1) {
  const control = clampNodeSliderValue(Number(value) || 0, 0, 1);
  return Math.pow(control, nodeGraphTraceDisplaySensitiveControlExponent) * max;
}

function adjustNodeGraphTraceDisplaySettingByControlDelta(key, startValue, delta) {
  if (!nodeGraphTraceDisplaySensitiveControlField(key)) {
    return startValue + delta;
  }
  const max = nodeGraphTraceDisplaySensitiveControlMax(key);
  return nodeGraphTraceDisplayControlToSizeValue(
    nodeGraphTraceDisplaySizeToControlValue(startValue, max) + delta,
    max,
  );
}

function nodeGraphTraceDisplayNumberDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function setNodeGraphTraceDisplayZoomEditActive(active) {
  nodeGraphMvp.traceDisplayZoomEditActive = Boolean(active);
}

function nodeGraphTraceDisplayClampUnit(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphTraceDisplayClampNonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

function nodeGraphTraceDisplayClampBrightness(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 2);
}

function nodeGraphTraceDisplayClampPixelDensity(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 4);
}

// Stamp blur 0–1 (hard→soft). Migrates legacy signed -1..1 patch values.
function nodeGraphTraceDisplayClampStampBlur(value) {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer?.normalizeBlur) {
    return PhosphorDrawer.normalizeBlur(value, 0.35);
  }
  let v = Number(value);
  if (!Number.isFinite(v)) return 0.35;
  if (v < 0) v = (Math.max(-1, v) + 1) * 0.5;
  return clampNodeSliderValue(v, 0, 1);
}

function nodeGraphTraceDisplayClampDotBudget(value) {
  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n)) {
    return 2048;
  }
  return Math.max(64, Math.min(8192, n));
}

// Clamp rules shared by every display-settings form type, keyed by field name.
// Each entry owns exactly one field's rule — adding/changing a rule for one
// display type cannot silently change behavior for another.
const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({
  burn: nodeGraphTraceDisplayClampUnit,
  capLength: nodeGraphTraceDisplayClampUnit,
  capSize: nodeGraphTraceDisplayClampUnit,
  cycles: (value) => Math.max(1, Math.min(64, Math.round(Number(value) || 0))),
  decay: nodeGraphTraceDisplayClampUnit,
  dotBudget: nodeGraphTraceDisplayClampDotBudget,
  decimals: (value) => Math.max(0, Math.min(8, Math.round(Number(value) || 0))),
  dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  dot1Size: nodeGraphTraceDisplayClampUnit,
  ghost: nodeGraphTraceDisplayClampUnit,
  historySeconds: nodeGraphTraceDisplayClampNonNegative,
  innerGlow: nodeGraphTraceDisplayClampUnit,
  innerShadow: nodeGraphTraceDisplayClampUnit,
  lineLength: nodeGraphTraceDisplayClampUnit,
  lineThickness: nodeGraphTraceDisplayClampNonNegative,
  pixelDensity: nodeGraphTraceDisplayClampPixelDensity,
  scale: nodeGraphTraceDisplayClampNonNegative,
  secondaryBrightness: nodeGraphTraceDisplayClampBrightness,
  secondaryLineThickness: nodeGraphTraceDisplayClampNonNegative,
  secondarySize: nodeGraphTraceDisplayClampUnit,
  zoomSeconds: nodeGraphTraceDisplayClampNonNegative,
});

// Per-formType overrides, only for the (formType, field) pairs that diverge
// from the shared table above. Isolated per formType so a new override can't
// leak into unrelated display types.
const nodeGraphTraceDisplayFormTypeValueClampOverrides = Object.freeze({
  dot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampUnit,
  }),
  // Soft phosphor dots: blur 0 hard … 1 full soft.
  scope2d: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  scope2dTrace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  // 1D Trace Display blur 0 hard … 1 soft skirt (same UX as burn stamps, no persistence).
  trace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
    secondaryLineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
});

function normalizeNodeGraphTraceDisplaySettingValueForKey(key, value) {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const clamp = nodeGraphTraceDisplayFormTypeValueClampOverrides[formType]?.[key] ||
    nodeGraphTraceDisplaySharedValueClamps[key];
  return clamp ? clamp(value) : value;
}

function nodeGraphTraceDisplayFieldFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.("[data-trace-display-field]") || null;
}

function setNodeGraphTraceDisplayFieldEditing(input, editing) {
  if (!input) {
    return;
  }
  input.readOnly = !editing;
  input.classList.toggle("trace-display-field-editing", Boolean(editing));
  if (editing) {
    input.focus();
    input.select?.();
  }
}

function beginNodeGraphTraceDisplayFieldEdit(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input) {
    return;
  }
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  setNodeGraphTraceDisplayFieldEditing(input, true);
  event.preventDefault();
  event.stopPropagation();
}

function finishNodeGraphTraceDisplayFieldEdit(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input) {
    return;
  }
  setNodeGraphTraceDisplayFieldEditing(input, false);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  input.value = formatNodeGraphTraceDisplaySetting(
    nodeGraphDisplaySettingsFormValue(
      normalizeNodeGraphDisplaySettingsForFormType(nodeGraphTraceDisplayCurrentSettingsForFormType()),
      input.dataset.traceDisplayField,
    ),
  );
}

function handleNodeGraphTraceDisplayFieldEditKeydown(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || input.readOnly) {
    return;
  }
  if (event.key === "Enter") {
    input.blur();
    event.preventDefault();
  } else if (event.key === "Escape") {
    if (input.dataset.traceDisplayField === "zoomSeconds") {
      setNodeGraphTraceDisplayZoomEditActive(false);
    }
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
    input.blur();
    event.preventDefault();
  }
  event.stopPropagation();
}

function preventNodeGraphTraceDisplayReadonlyFieldTextInteraction(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  if (event.type === "focusin") {
    input.blur();
    return;
  }
  event.preventDefault();
}

function beginNodeGraphTraceDisplayFieldDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  const key = input.dataset.traceDisplayField;
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  nodeGraphMvp.traceDisplayFieldDragging = {
    input,
    key,
    pointerId: event.pointerId ?? null,
    startValue: Number(input.value),
    startX: event.clientX,
    startY: event.clientY,
    multiplier: nodeGraphTraceDisplayNumberDragMultiplier(event),
    quantum: nodeGraphTraceDisplayStepperQuantum(input),
  };
  input.classList.add("value-dragging");
  input.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphTraceDisplayField(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const horizontalDelta = event.clientX - drag.startX;
  const verticalDelta = drag.startY - event.clientY;
  const startValue = Number.isFinite(drag.startValue)
    ? drag.startValue
    : nodeGraphDisplaySettingsDefaultValue(drag.key);
  const controlDelta = ((horizontalDelta + verticalDelta) / 8) * drag.quantum * drag.multiplier;
  const rawValue = adjustNodeGraphTraceDisplaySettingByControlDelta(drag.key, startValue, controlDelta);
  const nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(drag.key, rawValue);
  drag.input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "debounce", record: false });
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphTraceDisplayFieldDrag(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  const root = nodeGraphSettingsTextRootFromTarget(drag.input);
  if (root) {
    root.dataset.settingsTextPointerActive = "false";
    root.dataset.settingsTextPointerId = "";
    root.dataset.settingsTextPointerMoved = "false";
    root.dataset.settingsTextSuppressClick = "true";
    window.setTimeout(() => {
      if (root.dataset.settingsTextSuppressClick === "true") {
        root.dataset.settingsTextSuppressClick = "false";
      }
    }, 180);
  }
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  if (drag.key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  nodeGraphMvp.traceDisplayFieldDragging = null;
  event.preventDefault();
  event.stopPropagation();
}

function stepNodeGraphTraceDisplaySetting(event) {
  if (nodeGraphSettingsTextGestureShouldIgnoreClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-trace-display-step-target]");
  if (!button) {
    return;
  }
  const key = button.dataset.traceDisplayStepTarget;
  const input = document.querySelector(`[data-trace-display-field="${key}"]`);
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const direction = Number(button.dataset.traceDisplayStepDirection) < 0 ? -1 : 1;
  const quantum = nodeGraphTraceDisplayStepperQuantum(input);
  const current = Number(input.value);
  const baseValue = Number.isFinite(current) ? current : nodeGraphDisplaySettingsDefaultValue(key);
  const nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
    key,
    adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
  );
  input.value = formatNodeGraphTraceDisplaySetting(
    nextValue,
  );
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function toggleNodeGraphTraceDisplaySettingRow(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  input.checked = !input.checked;
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function suppressNodeGraphTraceDisplaySettingRowClick(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings) {
  if (!node) {
    return null;
  }
  if (displayType === "dot") {
    node.zeroDBurnSettings = normalizeNodeGraphZeroDBurnSettings(settings);
    return node.zeroDBurnSettings;
  }
  if (displayType === "lineBurn") {
    node.traceDisplaySettings = normalizeNodeGraphLineBurnSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "value") {
    node.traceDisplaySettings = normalizeNodeGraphValueOscilloscopeSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "scope2d") {
    node.traceDisplaySettings = normalizeNodeGraphScope2dSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "scope2dTrace") {
    node.traceDisplaySettings = normalizeNodeGraphScope2dTraceSettings(settings);
    return node.traceDisplaySettings;
  }
  // Must not fall through to Trace normalize: that drops decimals and expands
  // a full Trace schema onto the multimeter (can thrash draw/history/persist).
  if (displayType === "numberReadout") {
    node.traceDisplaySettings = normalizeNodeGraphNumberReadoutSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "phosphorLight") {
    const normalize = typeof normalizeNodeGraphPhosphorLightSettings === "function"
      ? normalizeNodeGraphPhosphorLightSettings
      : (value) => value || {};
    node.traceDisplaySettings = normalize(settings);
    return node.traceDisplaySettings;
  }
  node.traceDisplaySettings = normalizeNodeGraphTraceDisplaySettings(settings);
  return node.traceDisplaySettings;
}

function assignNodeGraphTypedDisplaySettingsEverywhere(node, displayType, settings) {
  if (!node?.id) {
    return null;
  }
  const normalized = assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings);
  const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === node.id);
  if (patchNode && patchNode !== node) {
    assignNodeGraphTypedDisplaySettingsToNode(patchNode, displayType, settings);
  }
  const workingNode = nodeGraphMvp.workingPatch?.nodes?.find((candidate) => candidate.id === node.id);
  if (workingNode && workingNode !== node && workingNode !== patchNode) {
    assignNodeGraphTypedDisplaySettingsToNode(workingNode, displayType, settings);
  }
  return normalized;
}

function assignNodeGraphDisplayModeKeyToNode(node, modeKey) {
  if (!node) {
    return null;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  const safeKey = String(modeKey || "").trim();
  const selectedMode = modes.find((mode) => mode.key === safeKey) || modes[0] || null;
  if (!selectedMode) {
    return null;
  }
  node.ui = {
    ...normalizeNodeGraphPatchNodeUi(node.ui, node.type),
    displayModeKey: selectedMode.key,
  };
  return selectedMode;
}

function assignNodeGraphDisplayModeKeyEverywhere(node, modeKey) {
  if (!node?.id) {
    return null;
  }
  const selectedMode = assignNodeGraphDisplayModeKeyToNode(node, modeKey);
  if (!selectedMode) {
    return null;
  }
  const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === node.id);
  if (patchNode && patchNode !== node) {
    assignNodeGraphDisplayModeKeyToNode(patchNode, selectedMode.key);
  }
  const workingNode = nodeGraphMvp.workingPatch?.nodes?.find((candidate) => candidate.id === node.id);
  if (workingNode && workingNode !== node && workingNode !== patchNode) {
    assignNodeGraphDisplayModeKeyToNode(workingNode, selectedMode.key);
  }
  return selectedMode;
}

function changeNodeGraphTraceDisplayMode(event) {
  const select = event?.target?.closest?.("[data-trace-display-mode-select]");
  if (!select) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return true;
  }
  const selectedMode = assignNodeGraphDisplayModeKeyEverywhere(node, select.value);
  if (!selectedMode) {
    return true;
  }
  nodeGraphMvp.patchDirtyState = "edited";
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType(selectedMode.settingsSchema));
  persistNodeGraphTraceDisplaySettingsSoon("immediate");
  if (typeof renderNodeGraphExecutionPlanDebug === "function") {
    renderNodeGraphExecutionPlanDebug();
  }
  if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    syncNodeGraphCurrentSavedPatchHeader();
  }
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

let nodeGraphTraceDisplaySettingsPersistTimer = 0;

function persistNodeGraphTraceDisplaySettingsSoon(persistMode = "debounce") {
  if (persistMode === false || persistMode === "none") {
    return;
  }
  if (nodeGraphTraceDisplaySettingsPersistTimer) {
    window.clearTimeout(nodeGraphTraceDisplaySettingsPersistTimer);
    nodeGraphTraceDisplaySettingsPersistTimer = 0;
  }
  const persist = () => {
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings({ immediateFile: persistMode === "immediate" });
    } else if (
      typeof serializeNodeUiDevSettings === "function" &&
      typeof saveNodeUiDevLocalDefaultSettings === "function"
    ) {
      saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
    }
  };
  if (persistMode === "immediate") {
    persist();
    return;
  }
  nodeGraphTraceDisplaySettingsPersistTimer = window.setTimeout(() => {
    nodeGraphTraceDisplaySettingsPersistTimer = 0;
    persist();
  }, 350);
}

function applyNodeGraphTraceDisplaySettingsForm(options = {}) {
  const settings = readNodeGraphTraceDisplaySettingsForm();
  const commit = Boolean(options.record || options.commit);
  if (nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    nodeGraphMvp.traceSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  } else {
    const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
    if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
      return null;
    }
    const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
    assignNodeGraphTypedDisplaySettingsEverywhere(node, settingsSchema, settings);
  }
  nodeGraphMvp.patchDirtyState = "edited";
  persistNodeGraphTraceDisplaySettingsSoon(options.persist || "debounce");
  if (commit) {
    if (typeof renderNodeGraphExecutionPlanDebug === "function") {
      renderNodeGraphExecutionPlanDebug();
    }
    if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      syncNodeGraphCurrentSavedPatchHeader();
    }
    if (options.record && typeof recordNodeGraphHistory === "function") {
      recordNodeGraphHistory();
    } else if (typeof renderNodeGraphHistoryControls === "function") {
      renderNodeGraphHistoryControls();
    }
  }
  scheduleNodeGraphModuleScopeDraw();
  return settings;
}

function commitOpenNodeGraphTraceDisplaySettings() {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover || popover.hidden || nodeGraphMvp.sharedInspectorActive !== "traceDisplaySettings") {
    return null;
  }
  return applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
}

function setNodeGraphTraceDisplaySettingsDefaults() {
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphDisplaySettingsDefaultsForFormType());
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function updateNodeGraphTraceDisplaySettingsLive() {
  applyNodeGraphTraceDisplaySettingsForm({ persist: "none", record: false });
}

function commitNodeGraphTraceDisplaySettingsChange(event) {
  if (changeNodeGraphTraceDisplayMode(event)) {
    return;
  }
  if (nodeGraphTraceDisplayFieldFromTarget(event?.target)) {
    return;
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
}

function closeNodeGraphTraceDisplaySettings() {
  finishCloseNodeGraphTraceDisplaySettings();
}

function finishCloseNodeGraphTraceDisplaySettings() {
  commitOpenNodeGraphTraceDisplaySettings();
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    popover.hidden = true;
  }
  rememberNodeGraphTraceDisplaySettingsWindowState({ open: false }, { status: false });
  nodeGraphMvp.traceDisplaySettingsTargetNode = null;
  scheduleNodeGraphModuleScopeDraw();
}

function hideNodeGraphTraceDisplaySettingsForInspectorReplacement() {
  commitOpenNodeGraphTraceDisplaySettings();
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    popover.hidden = true;
  }
  rememberNodeGraphTraceDisplaySettingsWindowState({ open: false }, { status: false });
  nodeGraphMvp.traceDisplaySettingsTargetNode = null;
}

function nodeGraphTraceDisplaySettingsVisibleRect() {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover || popover.hidden) {
    return null;
  }
  const rect = popover.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function prepareNodeGraphTraceDisplaySettingsForInspectorReplacement() {
  const rect = nodeGraphTraceDisplaySettingsVisibleRect();
  if (!rect) {
    return null;
  }
  hideNodeGraphTraceDisplaySettingsForInspectorReplacement();
  return rect;
}

function nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState = {}, replacementRect = null, event = {}) {
  const savedPosition = sharedInspectorState?.position;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  const rect = popover?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const replacementLeft = Number(replacementRect?.left);
  const replacementTop = Number(replacementRect?.top);
  const replacementWidth = Number(replacementRect?.width);
  const eventX = Number(event.clientX);
  const eventY = Number(event.clientY);
  const x = hasSavedPosition
    ? savedPosition.left
    : Number.isFinite(replacementLeft)
    ? replacementLeft + (Number.isFinite(replacementWidth) ? replacementWidth * 0.5 : 0) - rect.width * 0.5
    : Number.isFinite(eventX)
    ? eventX
    : window.innerWidth * 0.5 - rect.width * 0.5;
  const y = hasSavedPosition
    ? savedPosition.top
    : Number.isFinite(replacementTop)
    ? replacementTop
    : Number.isFinite(eventY)
    ? eventY
    : window.innerHeight * 0.25;
  return typeof nodeGraphFloatingWindowPosition === "function"
    ? nodeGraphFloatingWindowPosition(popover, x, y, {
      height: rect.height,
      visibleHeight: 48,
      visibleWidth: Math.min(Math.max(80, rect.width * 0.5), rect.width || 80),
      width: rect.width,
    })
    : { left: Math.round(Number(x) || 0), top: Math.round(Number(y) || 0) };
}

function restoreNodeGraphTraceDisplaySettingsWindowFromState(state = {}) {
  const nodeId = String(state.targetNode || nodeGraphMvp.traceDisplaySettingsTargetNode || "");
  const node = nodeGraphPatchNode(nodeId);
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  if (nodeId === "__globalTraceSettings") {
    nodeGraphMvp.traceDisplaySettingsTargetNode = "__globalTraceSettings";
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Global");
    setNodeGraphTraceDisplaySettingsFormType(null);
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphGlobalTraceSettings());
    return;
  }
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "No module");
    nodeGraphMvp.traceDisplaySettingsTargetNode = null;
    setNodeGraphTraceDisplaySettingsFormType(null);
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphDisplaySettingsDefaultsForFormType());
    return;
  }
  nodeGraphMvp.traceDisplaySettingsTargetNode = node.id;
  setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", nodeGraphTraceDisplaySettingsTargetLabel(node));
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
}

function syncOpenNodeGraphTraceDisplaySettingsToNode(nodeId) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    !popover ||
    popover.hidden ||
    nodeGraphMvp.sharedInspectorActive !== "traceDisplaySettings" ||
    nodeGraphMvp.traceDisplaySettingsTargetNode === "__globalTraceSettings"
  ) {
    return false;
  }
  const node = nodeGraphPatchNode(nodeId);
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return false;
  }
  if (nodeGraphMvp.traceDisplaySettingsTargetNode === node.id) {
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  restoreNodeGraphTraceDisplaySettingsWindowFromState({ targetNode: node.id });
  rememberNodeGraphTraceDisplaySettingsWindowState(
    { open: true, targetNode: node.id },
    { status: false },
  );
  return true;
}

function openNodeGraphGlobalTraceSettings(event = {}) {
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover &&
    !existingPopover.hidden &&
    nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings" &&
    nodeGraphMvp.traceDisplaySettingsTargetNode === "__globalTraceSettings"
  ) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(existingPopover);
    }
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return true;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  const replacementRect = metadataRect || moduleActionsRect;
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.traceDisplaySettingsTargetNode = "__globalTraceSettings";
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Global");
  setNodeGraphTraceDisplaySettingsFormType(null);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphGlobalTraceSettings());
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  popover.hidden = false;
  const position = nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState, replacementRect, event);
  popover.style.position = "fixed";
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(popover, position.left, position.top);
  } else {
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    popover.style.right = "auto";
  }
  rememberNodeGraphTraceDisplaySettingsWindowState(
    { open: true, position, targetNode: "__globalTraceSettings" },
    { status: false },
  );
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

function beginNodeGraphTraceDisplaySettingsDrag(event) {
  beginNodeGraphFloatingWindowDrag(
    event,
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    "traceDisplaySettingsDragging",
  );
}

function dragNodeGraphTraceDisplaySettings(event) {
  dragNodeGraphFloatingWindow(
    event,
    "traceDisplaySettingsDragging",
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    (next) => {
      rememberNodeGraphTraceDisplaySettingsWindowState(
        { open: true, position: next },
        { persist: false },
      );
    },
  );
  dragNodeGraphFloatingWindowResize(
    event,
    "traceDisplaySettingsResizing",
    applyNodeGraphTraceDisplaySettingsWindowSize,
    { width: true, height: true },
  );
}

function endNodeGraphTraceDisplaySettingsDrag(event) {
  const drag = nodeGraphMvp.traceDisplaySettingsDragging;
  endNodeGraphFloatingWindowDrag(event, "traceDisplaySettingsDragging", () => {
    const position = Number.isFinite(Number(drag?.currentLeft)) && Number.isFinite(Number(drag?.currentTop))
      ? { left: drag.currentLeft, top: drag.currentTop }
      : undefined;
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, ...(position ? { position } : {}) },
      { capturePosition: false, status: false },
    );
  });
  endNodeGraphFloatingWindowResize(event, "traceDisplaySettingsResizing", () => {
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, size: nodeGraphTraceDisplaySettingsWindowSizeFromElement() },
      { status: false },
    );
  });
}

function beginNodeGraphTraceDisplaySettingsResize(event) {
  beginNodeGraphFloatingWindowResize(
    event,
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    "traceDisplaySettingsResizing",
  );
}

function bindNodeGraphTraceDisplaySettingsEvents(popover) {
  if (!popover || popover.dataset.traceDisplaySettingsBound === "true") {
    return;
  }
  popover.dataset.traceDisplaySettingsBound = "true";
  bindNodeGraphSettingsTextInputProtection(popover);
  popover.addEventListener("pointerdown", toggleNodeGraphTraceDisplaySettingRow, true);
  popover.addEventListener("click", suppressNodeGraphTraceDisplaySettingRowClick, true);
  popover.addEventListener("input", updateNodeGraphTraceDisplaySettingsLive);
  popover.addEventListener("change", commitNodeGraphTraceDisplaySettingsChange);
  popover.addEventListener("click", stepNodeGraphTraceDisplaySetting);
  popover.addEventListener("dblclick", beginNodeGraphTraceDisplayFieldEdit, true);
  popover.addEventListener("blur", finishNodeGraphTraceDisplayFieldEdit, true);
  popover.addEventListener("keydown", handleNodeGraphTraceDisplayFieldEditKeydown, true);
  popover.addEventListener("focusin", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  popover.addEventListener("selectstart", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  popover.addEventListener("dragstart", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  popover.addEventListener("pointerdown", beginNodeGraphTraceDisplayFieldDrag, true);
  document.getElementById("nodeTraceDisplaySettingsDefaults")?.addEventListener("click", setNodeGraphTraceDisplaySettingsDefaults);
  document.getElementById("nodeTraceDisplaySettingsClose")?.addEventListener("click", closeNodeGraphTraceDisplaySettings);
  document.getElementById("nodeTraceDisplaySettingsDragHandle")?.addEventListener("pointerdown", beginNodeGraphTraceDisplaySettingsDrag);
  document.querySelector("#nodeTraceDisplaySettingsPopover .node-trace-display-settings-heading")?.addEventListener("pointerdown", beginNodeGraphTraceDisplaySettingsDrag);
  document.getElementById("nodeTraceDisplaySettingsCornerDrag")?.addEventListener("pointerdown", beginNodeGraphTraceDisplaySettingsResize);
  document.addEventListener("pointermove", dragNodeGraphTraceDisplayField, true);
  document.addEventListener("pointerup", endNodeGraphTraceDisplayFieldDrag, true);
  document.addEventListener("pointercancel", endNodeGraphTraceDisplayFieldDrag, true);
  document.addEventListener("pointermove", dragNodeGraphTraceDisplaySettings);
  document.addEventListener("pointerup", endNodeGraphTraceDisplaySettingsDrag);
  document.addEventListener("pointercancel", endNodeGraphTraceDisplaySettingsDrag);
}

function openNodeGraphTraceDisplaySettings(nodeId, event = {}) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node) {
    return false;
  }
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return false;
  }
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover &&
    !existingPopover.hidden &&
    nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings" &&
    nodeGraphMvp.traceDisplaySettingsTargetNode === node.id
  ) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(existingPopover);
    }
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return true;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  const replacementRect = metadataRect || moduleActionsRect;
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.traceDisplaySettingsTargetNode = node.id;
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader(
    "DISPLAY",
    "Settings",
    nodeGraphTraceDisplaySettingsTargetLabel(node),
  );
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  popover.hidden = false;
  const position = nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState, replacementRect, event);
  popover.style.position = "fixed";
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(popover, position.left, position.top);
  } else {
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    popover.style.right = "auto";
  }
  rememberNodeGraphTraceDisplaySettingsWindowState(
    { open: true, position, targetNode: node.id },
    { status: false },
  );
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

function nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength) {
  const safeSampleRate = Math.max(1, Number(sampleRate) || 44100);
  const safeFps = Math.max(1, Number(fps) || 60);
  const safeValidLength = Math.max(0, Math.floor(Number(validLength) || 0));
  return Math.min(safeValidLength, Math.max(1, Math.ceil(safeSampleRate / safeFps)));
}

function nodeGraphScopeBufferRecentSampleCount(buffer) {
  if (!buffer || !Object.prototype.hasOwnProperty.call(buffer, "nodeGraphScopeRecentSampleCount")) {
    return null;
  }
  return Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRecentSampleCount) || 0));
}

function nodeGraphScopeAvailableSampleCount(buffer) {
  if (!buffer?.length) {
    return 0;
  }
  const retainedSamples = Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0);
  if (retainedSamples > 0) {
    return Math.min(buffer.length, retainedSamples);
  }
  const absoluteFrame = Math.floor(Number(buffer.nodeGraphScopeAbsoluteFrame) || 0);
  return absoluteFrame > 0
    ? Math.min(buffer.length, absoluteFrame)
    : buffer.length;
}

function nodeGraphScopeSampleRate(buffer) {
  const bufferRate = Number(buffer?.nodeGraphScopeSampleRate);
  if (Number.isFinite(bufferRate) && bufferRate > 0) {
    return bufferRate;
  }
  const stateRate = Number(nodeGraphModuleScopeState.sampleRate);
  if (Number.isFinite(stateRate) && stateRate > 0) {
    return stateRate;
  }
  const appRate = Number(nodeGraphMvp?.sampleRate);
  return Number.isFinite(appRate) && appRate > 0 ? appRate : 44100;
}

function nodeGraphScopeContiguousSampleCount(buffer) {
  const recentSamples = nodeGraphScopeBufferRecentSampleCount(buffer);
  if (recentSamples !== null) {
    return Math.min(buffer?.length || 0, recentSamples);
  }
  return nodeGraphScopeAvailableSampleCount(buffer);
}

function nodeGraphModuleScopeCapturedScope2dBuffer(slot, options = {}) {
  if (!["scope2d", "scope2dTrace", "phosphorLight"].includes(nodeGraphModuleDisplayRendererForSlot(slot))) {
    return null;
  }
  const xPort = String(options.xPort || "X").trim() || "X";
  const yPort = String(options.yPort || "Y").trim() || "Y";
  const xBuffer = nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${xPort}`) ||
    nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, xPort);
  const yBuffer = nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${yPort}`) ||
    nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, yPort);
  const length = Math.min(xBuffer?.length || 0, yBuffer?.length || 0);
  if (length <= 0) {
    return null;
  }
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  const xRecentSamples = nodeGraphScopeBufferRecentSampleCount(xBuffer);
  const yRecentSamples = nodeGraphScopeBufferRecentSampleCount(yBuffer);
  const hasRecentSampleMetadata = xRecentSamples !== null || yRecentSamples !== null;
  if (hasRecentSampleMetadata && !(xRecentSamples > 0 && yRecentSamples > 0)) {
    return null;
  }
  const validLength = Math.min(
    nodeGraphScopeAvailableSampleCount(xBuffer),
    nodeGraphScopeAvailableSampleCount(yBuffer),
    length,
  );
  const xTotal = Math.max(0, Math.floor(Number(xBuffer.nodeGraphScopeTotalSampleCount) || 0));
  const yTotal = Math.max(0, Math.floor(Number(yBuffer.nodeGraphScopeTotalSampleCount) || 0));
  const absoluteFrame = Math.min(xTotal, yTotal);
  const canvas = nodeGraphScope2dBurnCanvasForSlot(slot);
  const lastDrawnFrame = Number(canvas?._nodeGraphScope2dLastDrawnFrame);
  const newSinceLastDraw = Number.isFinite(lastDrawnFrame) && absoluteFrame > lastDrawnFrame
    ? absoluteFrame - lastDrawnFrame
    : 0;
  const historySeconds = Number(options.historySeconds);
  const minWindowFrames = nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength);
  // Capture only what we need to deposit this frame (new samples + a small
  // pad). The energy FBO holds the trail via decay — re-capturing ~1s and
  // re-stamping it every frame painted a lagging "second path" behind the beam.
  const frames = Number.isFinite(historySeconds)
    ? Math.min(
      validLength,
      Math.max(1, Math.ceil(Math.max(0, historySeconds) * sampleRate)),
    )
    : Math.min(
      validLength,
      Math.max(minWindowFrames, newSinceLastDraw, 1),
    );
  const start = Math.max(0, length - frames);
  const startFrame = Math.max(0, absoluteFrame - frames);
  const x = new Float32Array(frames);
  const y = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    x[index] = Number(xBuffer[start + index]) || 0;
    y[index] = Number(yBuffer[start + index]) || 0;
  }
  return {
    length: frames,
    nodeGraphScopeAbsoluteFrame: absoluteFrame,
    nodeGraphScopeCapturedOutput: true,
    nodeGraphScopeDrawProgress: 1,
    nodeGraphScopeStartFrame: startFrame,
    nodeGraphScopeUseFullWindow: true,
    nodeGraphScopeXy: true,
    x,
    y,
  };
}

function captureNodeGraphLiveModuleScopeOutput(runtime, nodeId, output) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  const samples = runtime.scopeBuffers.get(id) || [];
  samples.push(nodeGraphModuleScopeScalarValue(output));
  runtime.scopeBuffers.set(id, samples);
  if (!output || typeof output !== "object") {
    return;
  }
  for (const [port, value] of Object.entries(output)) {
    if (!port || !Number.isFinite(Number(value))) {
      continue;
    }
    const portId = `${id}:${port}`;
    const portSamples = runtime.scopeBuffers.get(portId) || [];
    portSamples.push(nodeGraphModuleScopeScalarValue(value));
    runtime.scopeBuffers.set(portId, portSamples);
  }
}

function resizeNodeGraphLiveModuleScopeBuffer(buffer, frameCapacity) {
  const capacity = Math.max(0, Math.floor(Number(frameCapacity) || 0));
  if (capacity <= 0) {
    return new Float32Array(0);
  }
  if (buffer instanceof Float32Array && buffer.length === capacity) {
    return buffer;
  }
  const next = new Float32Array(capacity);
  if (!buffer?.length) {
    return next;
  }
  const sourceStart = Math.max(0, buffer.length - capacity);
  const copyCount = Math.min(capacity, buffer.length - sourceStart);
  const targetStart = capacity - copyCount;
  next.set(buffer.subarray(sourceStart, sourceStart + copyCount), targetStart);
  next.nodeGraphScopeRetainedSampleCount = Math.min(
    copyCount,
    Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0)),
  );
  next.nodeGraphScopeTotalSampleCount = Math.max(0, Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount) || 0));
  next.nodeGraphScopeBurnSweepStart = buffer.nodeGraphScopeBurnSweepStart;
  next.nodeGraphScopeBurnSweepLength = buffer.nodeGraphScopeBurnSweepLength;
  next.nodeGraphScopeBurnCrossings = buffer.nodeGraphScopeBurnCrossings;
  next.nodeGraphScopeBurnLastSample = buffer.nodeGraphScopeBurnLastSample;
  next.nodeGraphScopeBurnArmed = buffer.nodeGraphScopeBurnArmed;
  if (Number.isFinite(Number(buffer.nodeGraphScopeSampleRate)) && Number(buffer.nodeGraphScopeSampleRate) > 0) {
    next.nodeGraphScopeSampleRate = Number(buffer.nodeGraphScopeSampleRate);
  }
  if (Number.isFinite(Number(buffer.nodeGraphScopeSourceSampleRate)) && Number(buffer.nodeGraphScopeSourceSampleRate) > 0) {
    next.nodeGraphScopeSourceSampleRate = Number(buffer.nodeGraphScopeSourceSampleRate);
  }
  if (Number.isFinite(Number(buffer.nodeGraphScopeSampleStride)) && Number(buffer.nodeGraphScopeSampleStride) > 0) {
    next.nodeGraphScopeSampleStride = Number(buffer.nodeGraphScopeSampleStride);
  }
  return next;
}

function pushNodeGraphLiveModuleScopeSamples(nodeId, values, metadata = null) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  const frameCapacity = nodeGraphLiveModuleScopeFrameCapacity();
  nodeGraphModuleScopeState.frames = frameCapacity;
  let buffer = nodeGraphModuleScopeState.buffers.get(id);
  if (!buffer || buffer.length !== frameCapacity) {
    buffer = resizeNodeGraphLiveModuleScopeBuffer(buffer, frameCapacity);
    nodeGraphModuleScopeState.buffers.set(id, buffer);
  }
  const samples = Array.isArray(values) || ArrayBuffer.isView(values)
    ? [...values].map(nodeGraphModuleScopeScalarValue)
    : [nodeGraphModuleScopeScalarValue(values)];
  const count = Math.min(buffer.length, samples.length);
  if (count <= 0) {
    return;
  }
  if (count < buffer.length) {
    buffer.copyWithin(0, count);
  }
  const start = samples.length - count;
  for (let index = 0; index < count; index += 1) {
    buffer[buffer.length - count + index] = samples[start + index] || 0;
  }
  buffer.nodeGraphScopeRecentSampleCount = count;
  buffer.nodeGraphScopeTotalSampleCount = Math.max(
    0,
    Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount) || 0),
  ) + count;
  buffer.nodeGraphScopeRetainedSampleCount = Math.min(
    buffer.length,
    Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0)) + count,
  );
  if (metadata && typeof metadata === "object") {
    const absoluteFrame = Number(metadata.absoluteFrame);
    const startFrame = Number(metadata.startFrame);
    const sampleRate = Number(metadata.sampleRate);
    const sourceSampleRate = Number(metadata.sourceSampleRate);
    const sampleStride = Number(metadata.sampleStride);
    if (Number.isFinite(absoluteFrame)) {
      buffer.nodeGraphScopeAbsoluteFrame = absoluteFrame;
    }
    if (Number.isFinite(startFrame)) {
      buffer.nodeGraphScopeStartFrame = startFrame;
    }
    if (Number.isFinite(sampleRate) && sampleRate > 0) {
      buffer.nodeGraphScopeSampleRate = sampleRate;
    }
    if (Number.isFinite(sourceSampleRate) && sourceSampleRate > 0) {
      buffer.nodeGraphScopeSourceSampleRate = sourceSampleRate;
    }
    if (Number.isFinite(sampleStride) && sampleStride > 0) {
      buffer.nodeGraphScopeSampleStride = sampleStride;
    }
  } else {
    delete buffer.nodeGraphScopeAbsoluteFrame;
    delete buffer.nodeGraphScopeStartFrame;
  }
  nodeGraphModuleScopeState.versionSerial = (Number(nodeGraphModuleScopeState.versionSerial) || 0) + 1;
  buffer.nodeGraphScopeVersion = nodeGraphModuleScopeState.versionSerial;
}

function pushNodeGraphLiveModuleScopeSnapshot(values, options = {}) {
  if (!values) {
    return;
  }
  const patchFingerprint = String(options.patchFingerprint || nodeGraphPatchFingerprint());
  if (nodeGraphModuleScopeState.mode !== "live") {
    beginNodeGraphLiveModuleScopeCapture({
      nodes: [],
      order: values instanceof Map ? [...values.keys()] : values.map?.((entry) => entry?.[0]) || [],
      patchFingerprint,
    });
  }
  if (nodeGraphModuleScopeState.patchFingerprint !== patchFingerprint) {
    updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint);
  }
  if (Number.isFinite(Number(options.sampleRate)) && Number(options.sampleRate) > 0) {
    nodeGraphModuleScopeState.sampleRate = Number(options.sampleRate);
  }
  const defaultSampleRate = Number(options.sampleRate);
  const defaultSourceSampleRate = Number(options.sourceSampleRate);
  const defaultSampleStride = Number(options.sampleStride);
  const defaultMetadata = {
    sampleRate: Number.isFinite(defaultSampleRate) && defaultSampleRate > 0 ? defaultSampleRate : null,
    sourceSampleRate: Number.isFinite(defaultSourceSampleRate) && defaultSourceSampleRate > 0 ? defaultSourceSampleRate : null,
    sampleStride: Number.isFinite(defaultSampleStride) && defaultSampleStride > 0 ? defaultSampleStride : null,
  };
  const entries = values instanceof Map ? values.entries() : values;
  for (const entry of entries || []) {
    if (!entry) {
      continue;
    }
    const entryMetadata = entry[2] && typeof entry[2] === "object" ? entry[2] : null;
    const metadata = {
      ...defaultMetadata,
      ...(entryMetadata || {}),
    };
    pushNodeGraphLiveModuleScopeSamples(entry[0], entry[1], metadata);
  }
  notifyNodeGraphModuleScopeSnapshotListeners();
  scheduleNodeGraphModuleScopeDraw();
}

function captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate) {
  if (!runtime?.nodeOutputs?.size || !nodeGraphModuleScopeHasDrawableSlots() || nodeGraphModuleScopeTracesOff()) {
    return;
  }
  const interval = Math.max(1, Math.floor((Number(sampleRate) || nodeGraphMvp.sampleRate || 44100) / 30));
  runtime.scopeBuffers ||= new Map();
  const visibleScopeNodeIds = Array.isArray(runtime.scopeCaptureNodeIds) && runtime.scopeCaptureNodeIds.length
    ? new Set(runtime.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean))
    : nodeGraphVisibleModuleScopeNodeIds();
  for (const nodeId of visibleScopeNodeIds) {
    if (!runtime.nodeOutputs.has(nodeId)) {
      continue;
    }
    captureNodeGraphLiveModuleScopeOutput(runtime, nodeId, runtime.nodeOutputs.get(nodeId));
  }
  for (const sink of runtime.visualSinks || []) {
    const nodeId = String(sink?.nodeId || "");
    if (!nodeId) {
      continue;
    }
    if (!visibleScopeNodeIds.has(nodeId)) {
      continue;
    }
    let value = 0;
    for (const input of sink.inputs || []) {
      if (!input?.connected) {
        continue;
      }
      const inputValue = (input.connections || []).reduce(
        (connectionSum, connection) => connectionSum + readNodeGraphRuntimePortOutput(
          runtime,
          null,
          connection.sourceNode,
          connection.sourcePort,
          0,
          1,
        ),
        0,
      );
      value += inputValue;
      const inputPort = String(input.port || "").trim();
      if (input?.buffered && inputPort) {
        writeNodeGraphVisualInputBufferSample(runtime, nodeId, inputPort, inputValue, sink.bufferSampleLimit);
      }
      if (inputPort) {
        const portId = `${nodeId}:${inputPort}`;
        const portSamples = runtime.scopeBuffers.get(portId) || [];
        portSamples.push(nodeGraphModuleScopeScalarValue(inputValue));
        runtime.scopeBuffers.set(portId, portSamples);
      }
    }
    const samples = runtime.scopeBuffers.get(nodeId) || [];
    samples.push(nodeGraphModuleScopeScalarValue(value));
    runtime.scopeBuffers.set(nodeId, samples);
  }
  runtime.scopeCounter = (runtime.scopeCounter || 0) + 1;
  if (runtime.scopeCounter < interval) {
    return;
  }
  runtime.scopeCounter = 0;
  pushNodeGraphLiveModuleScopeSnapshot(runtime.scopeBuffers, {
    patchFingerprint: nodeGraphPatchFingerprint(),
    sampleRate,
  });
  runtime.scopeBuffers = new Map();
}

function createNodeGraphVisualInputBuffer(capacity = nodeGraphBufferedInputSampleLimit) {
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  return {
    absoluteFrame: 0,
    buffer: new Float32Array(safeCapacity),
    capacity: safeCapacity,
    length: 0,
    writeIndex: 0,
  };
}

function normalizeNodeGraphVisualInputBufferCapacity(capacity = nodeGraphBufferedInputSampleLimit) {
  return Math.max(1, Math.round(Number(capacity) || nodeGraphBufferedInputSampleLimit));
}

function resizeNodeGraphVisualInputBufferState(state, capacity = nodeGraphBufferedInputSampleLimit) {
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  if (!state || state.capacity !== safeCapacity || !(state.buffer instanceof Float32Array)) {
    const next = createNodeGraphVisualInputBuffer(safeCapacity);
    if (!state?.buffer?.length || !state?.length) {
      return next;
    }
    const oldLength = Math.min(Number(state.length) || 0, state.capacity || state.buffer.length);
    const copyCount = Math.min(oldLength, safeCapacity);
    const chronological = new Float32Array(copyCount);
    const first = ((Number(state.writeIndex) || 0) - oldLength + (state.capacity || state.buffer.length)) % (state.capacity || state.buffer.length);
    for (let index = 0; index < copyCount; index += 1) {
      const oldIndex = (first + oldLength - copyCount + index) % (state.capacity || state.buffer.length);
      chronological[index] = state.buffer[oldIndex] || 0;
    }
    next.buffer.set(chronological, 0);
    next.length = copyCount;
    next.writeIndex = copyCount % safeCapacity;
    next.absoluteFrame = Math.max(Number(state.absoluteFrame) || 0, copyCount);
    return next;
  }
  return state;
}

function syncNodeGraphVisualInputBuffers(runtime) {
  if (!runtime) {
    return;
  }
  runtime.visualInputBuffers ||= new Map();
  const expected = new Map();
  for (const sink of runtime.visualSinks || []) {
    const nodeId = String(sink?.nodeId || "");
    if (!nodeId) {
      continue;
    }
    for (const input of sink.inputs || []) {
      if (!input?.buffered) {
        continue;
      }
      const port = String(input.port || "").trim();
      if (!port) {
        continue;
      }
      expected.set(`${nodeId}:${port}`, normalizeNodeGraphVisualInputBufferCapacity(sink.bufferSampleLimit));
    }
  }
  for (const [key, capacity] of expected) {
    const current = runtime.visualInputBuffers.get(key);
    if (!current || current.capacity !== capacity) {
      runtime.visualInputBuffers.set(key, resizeNodeGraphVisualInputBufferState(current, capacity));
    }
  }
  for (const key of [...runtime.visualInputBuffers.keys()]) {
    if (!expected.has(key)) {
      runtime.visualInputBuffers.delete(key);
    }
  }
}

function writeNodeGraphVisualInputBufferSample(runtime, nodeId, port, value, capacity = nodeGraphBufferedInputSampleLimit) {
  if (!runtime || !nodeId || !port) {
    return;
  }
  runtime.visualInputBuffers ||= new Map();
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  const key = `${nodeId}:${port}`;
  let state = runtime.visualInputBuffers.get(key);
  if (!state || state.capacity !== safeCapacity) {
    state = resizeNodeGraphVisualInputBufferState(state, safeCapacity);
    runtime.visualInputBuffers.set(key, state);
  }
  state.buffer[state.writeIndex] = nodeGraphModuleScopeScalarValue(value);
  state.writeIndex = (state.writeIndex + 1) % state.capacity;
  state.length = Math.min(state.capacity, state.length + 1);
  state.absoluteFrame += 1;
}

function writeVisualInputBufferSample(runtime, nodeId, port, value, capacity = nodeGraphBufferedInputSampleLimit) {
  writeNodeGraphVisualInputBufferSample(runtime, nodeId, port, value, capacity);
}

function nodeGraphModuleScopeBuffersCurrent() {
  if (nodeGraphModuleScopeHasModelDisplay()) {
    return true;
  }
  if (!nodeGraphModuleScopeState.buffers.size) {
    return false;
  }
  const patch = nodeGraphMvp?.patch;
  if (nodeGraphModuleScopeState.mode === "live") {
    return Boolean(nodeGraphMvp?.live?.node)
      && nodeGraphModuleScopeState.patchFingerprint === nodeGraphPatchFingerprint();
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

function nodeGraphModuleScopePaused() {
  const visualPause = Number(nodeGraphMvp?.visualControls?.scopePaused) || 0;
  if (visualPause > 0.5) {
    return true;
  }
  if (!nodeGraphModuleScopeCircuitRunning()) {
    return true;
  }
  return !nodeGraphModuleScopeHasModelDisplay() && !nodeGraphModuleScopeHasRenderableSlots();
}

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

function createNodeGraphModuleScopeShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("module scope shader compile failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createNodeGraphModuleScopeProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createNodeGraphModuleScopeShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createNodeGraphModuleScopeShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("module scope shader link failed", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createNodeGraphModuleScopeWebGlRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }) || canvas.getContext("experimental-webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }

  const colorProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `, `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
      gl_FragColor = uColor;
    }
  `);
  const beamProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    attribute float aPointAge;
    uniform vec2 uCanvasSize;
    uniform float uSize;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vPointAge;
    void main() {
      vec2 segment = aEnd - aStart;
      float segmentLength = max(length(segment), 0.0001);
      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2(-tangent.y, tangent.x);
      float side = (aCorner == 0.0 || aCorner == 2.0) ? 1.0 : -1.0;
      float endpointMix = aCorner < 2.0 ? 0.0 : 1.0;
      float cap = aCorner < 2.0 ? -1.0 : 1.0;
      float beamHalfWidth = max(uSize * 1.85, 1.5);
      vec2 endpoint = mix(aStart, aEnd, endpointMix);
      vec2 position = endpoint + normal * side * beamHalfWidth + tangent * cap * beamHalfWidth;
      vStart = aStart;
      vEnd = aEnd;
      vPosition = position;
      vPointAge = aPointAge;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `, `
    precision highp float;
    uniform vec3 uColor;
    uniform float uBlur;
    uniform float uIntensity;
    uniform float uSize;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vPointAge;
    void main() {
      vec2 segment = vEnd - vStart;
      float segmentLengthSquared = max(dot(segment, segment), 0.0001);
      float along = clamp(dot(vPosition - vStart, segment) / segmentLengthSquared, 0.0, 1.0);
      vec2 closest = vStart + segment * along;
      float radius = max(uSize * 0.34, 0.0001);
      float normalizedDistance = length(vPosition - closest) / radius;
      if (normalizedDistance > 5.4) {
        discard;
      }
      float distanceSquared = normalizedDistance * normalizedDistance;
      float blur = clamp(uBlur, 0.0, 1.0);
      float edgeWidth = mix(0.01, 1.0, blur);
      float alpha = clamp((1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, normalizedDistance)) * uIntensity, 0.0, 1.0);
      gl_FragColor = vec4(uColor * alpha, alpha);
    }
  `);
  if (!colorProgram || !beamProgram) {
    if (colorProgram) {
      gl.deleteProgram(colorProgram);
    }
    if (beamProgram) {
      gl.deleteProgram(beamProgram);
    }
    return null;
  }

  const renderer = {
    beamBuffer: gl.createBuffer(),
    beamBlurLocation: gl.getUniformLocation(beamProgram, "uBlur"),
    beamCanvasSizeLocation: gl.getUniformLocation(beamProgram, "uCanvasSize"),
    beamColorLocation: gl.getUniformLocation(beamProgram, "uColor"),
    beamCornerLocation: gl.getAttribLocation(beamProgram, "aCorner"),
    beamEndLocation: gl.getAttribLocation(beamProgram, "aEnd"),
    beamIntensityLocation: gl.getUniformLocation(beamProgram, "uIntensity"),
    beamPointAgeLocation: gl.getAttribLocation(beamProgram, "aPointAge"),
    beamProgram,
    beamSizeLocation: gl.getUniformLocation(beamProgram, "uSize"),
    beamStartLocation: gl.getAttribLocation(beamProgram, "aStart"),
    canvas,
    colorLocation: gl.getUniformLocation(colorProgram, "uColor"),
    colorPositionBuffer: gl.createBuffer(),
    colorPositionLocation: gl.getAttribLocation(colorProgram, "aPosition"),
    colorProgram,
    gl,
    kind: "webgl",
  };
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return renderer;
}

function nodeGraphModuleScopeRenderer(canvas) {
  const current = nodeGraphModuleScopeState.renderer;
  if (current?.canvas === canvas) {
    return current;
  }
  const renderer = createNodeGraphModuleScopeWebGlRenderer(canvas);
  nodeGraphModuleScopeState.renderer = renderer;
  document.getElementById("nodeGraphWorkspace")
    ?.classList.toggle("module-scopes-webgl-unavailable", !renderer);
  return renderer;
}

function nodeGraphModuleScopeThreshold(buffer, start = 0, end = buffer.length) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = Math.max(0, start); index < Math.min(buffer.length, end); index += 1) {
    const value = Number(buffer[index]) || 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-5) {
    return null;
  }
  return (min + max) * 0.5;
}

function nodeGraphModuleScopeRisingCrossings(buffer, threshold, start = 1, end = buffer.length) {
  const crossings = [];
  const first = Math.max(1, Math.floor(start));
  const limit = Math.min(buffer.length, Math.ceil(end));
  for (let index = first; index < limit; index += 1) {
    const previous = Number(buffer[index - 1]) || 0;
    const current = Number(buffer[index]) || 0;
    if (previous <= threshold && current > threshold) {
      const delta = current - previous;
      const fraction = Math.abs(delta) > 1e-12
        ? clampNodeSliderValue((threshold - previous) / delta, 0, 1)
        : 0;
      crossings.push((index - 1) + fraction);
    }
  }
  return crossings;
}

function nodeGraphModuleScopeMedianPeriod(crossings) {
  if (!Array.isArray(crossings) || crossings.length < 2) {
    return null;
  }
  const distances = [];
  for (let index = 1; index < crossings.length; index += 1) {
    const distance = crossings[index] - crossings[index - 1];
    if (distance >= 2) {
      distances.push(distance);
    }
  }
  if (!distances.length) {
    return null;
  }
  distances.sort((a, b) => a - b);
  const periodSamples = distances[Math.floor(distances.length / 2)];
  return Number.isFinite(periodSamples) && periodSamples > 0 ? periodSamples : null;
}

function nodeGraphModuleScopeLowpassSyncTrace(buffer, start, end, periodSamples = 0) {
  const first = Math.max(0, Math.floor(start));
  const limit = Math.min(buffer.length, Math.ceil(end));
  if (limit - first < 3) {
    return null;
  }
  const threshold = nodeGraphModuleScopeThreshold(buffer, first, limit);
  if (threshold === null) {
    return null;
  }
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  const fundamental = periodSamples > 0 ? sampleRate / periodSamples : 120;
  const cutoff = clampNodeSliderValue(fundamental * 4, 20, sampleRate * 0.45);
  const alpha = clampNodeSliderValue(1 - Math.exp((-2 * Math.PI * cutoff) / Math.max(1, sampleRate)), 0.001, 1);
  const trace = new Float32Array(limit - first);
  let y1 = (Number(buffer[first]) || 0) - threshold;
  let y2 = y1;
  let y3 = y1;
  let y4 = y1;
  for (let index = first; index < limit; index += 1) {
    const input = (Number(buffer[index]) || 0) - threshold;
    y1 += (input - y1) * alpha;
    y2 += (y1 - y2) * alpha;
    y3 += (y2 - y3) * alpha;
    y4 += (y3 - y4) * alpha;
    trace[index - first] = y4;
  }
  return {
    start: first,
    threshold,
    trace,
  };
}

function nodeGraphModuleScopeTraceRisingCrossings(trace, start = 1, end = trace?.length || 0, offset = 0) {
  return nodeGraphModuleScopeRisingCrossings(trace || [], 0, start, end)
    .map((crossing) => crossing + offset);
}

function nodeGraphModuleScopeSyncBuffer(buffer) {
  return buffer?.nodeGraphScopeSyncBuffer?.length === buffer?.length
    ? buffer.nodeGraphScopeSyncBuffer
    : buffer;
}

function nodeGraphModuleScopeEstimatedCycle(buffer) {
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  const hintedPeriodSamples = Number(buffer?.nodeGraphScopePeriodSamples);
  if (syncBuffer?.length && Number.isFinite(hintedPeriodSamples) && hintedPeriodSamples > 0) {
    const searchStart = Math.max(0, syncBuffer.length - Math.min(syncBuffer.length, 8192));
    return {
      periodSamples: hintedPeriodSamples,
      threshold: nodeGraphModuleScopeThreshold(syncBuffer, searchStart, syncBuffer.length),
    };
  }
  const searchStart = Math.max(0, syncBuffer.length - Math.min(syncBuffer.length, 8192));
  const threshold = nodeGraphModuleScopeThreshold(syncBuffer, searchStart, syncBuffer.length);
  if (threshold === null) {
    return null;
  }
  const crossings = nodeGraphModuleScopeRisingCrossings(syncBuffer, threshold, searchStart + 1, syncBuffer.length);
  const rawPeriodSamples = nodeGraphModuleScopeMedianPeriod(crossings);
  if (!rawPeriodSamples) {
    return null;
  }
  const syncTrace = nodeGraphModuleScopeLowpassSyncTrace(syncBuffer, searchStart, syncBuffer.length, rawPeriodSamples);
  const syncCrossings = nodeGraphModuleScopeTraceRisingCrossings(syncTrace?.trace, 1, syncTrace?.trace?.length || 0, searchStart);
  const periodSamples = nodeGraphModuleScopeMedianPeriod(syncCrossings) || rawPeriodSamples;
  return { periodSamples, threshold };
}

function nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!syncBuffer?.length || !Number.isFinite(periodSamples) || periodSamples <= 0) {
    return null;
  }
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodSamples * 6, 1024),
  );
  const searchStart = Math.max(1, syncBuffer.length - Math.ceil(searchSpan));
  const searchEnd = syncBuffer.length;
  const syncTrace = nodeGraphModuleScopeLowpassSyncTrace(
    syncBuffer,
    searchStart,
    searchEnd,
    periodSamples,
  );
  let crossings = nodeGraphModuleScopeTraceRisingCrossings(
    syncTrace?.trace,
    1,
    syncTrace?.trace?.length || 0,
    syncTrace?.start || 0,
  );
  if (!crossings.length && cycleEstimate.threshold !== null) {
    crossings = nodeGraphModuleScopeRisingCrossings(
      syncBuffer,
      cycleEstimate.threshold,
      searchStart,
      searchEnd,
    );
  }
  for (let index = crossings.length - 1; index >= 0; index -= 1) {
    const crossing = crossings[index];
    const start = crossing;
    const end = start + visibleSamples;
    if (
      Number.isFinite(start) &&
      start >= 0 &&
      end <= syncBuffer.length &&
      crossing < syncBuffer.length - 1
    ) {
      return start;
    }
  }
  return null;
}

function nodeGraphTraceDisplaySyncedStart(syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (
    !syncBuffer?.length ||
    !Number.isFinite(periodSamples) ||
    periodSamples <= 0 ||
    !(visibleSamples > 0)
  ) {
    return null;
  }
  const defaultStart = Math.max(validStart, validEnd - visibleSamples);
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodSamples * 8, 1024),
  );
  const searchStart = Math.max(1, defaultStart - Math.ceil(searchSpan * 0.5));
  const searchEnd = Math.min(syncBuffer.length, validEnd);
  if (searchEnd <= searchStart + 1) {
    return null;
  }
  const syncTrace = nodeGraphModuleScopeLowpassSyncTrace(syncBuffer, searchStart, searchEnd, periodSamples);
  let crossings = nodeGraphModuleScopeTraceRisingCrossings(
    syncTrace?.trace,
    1,
    syncTrace?.trace?.length || 0,
    syncTrace?.start || 0,
  );
  if (!crossings.length && cycleEstimate.threshold !== null) {
    crossings = nodeGraphModuleScopeRisingCrossings(
      syncBuffer,
      cycleEstimate.threshold,
      searchStart,
      searchEnd,
    );
  }
  let bestStart = null;
  let bestDistance = Infinity;
  for (const crossing of crossings) {
    const start = crossing;
    const end = start + visibleSamples;
    if (start < validStart || end > validEnd) {
      continue;
    }
    const distance = Math.abs(start - defaultStart);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStart = start;
    }
  }
  return bestStart;
}

function nodeGraphModuleScopeVisibleSamples(buffer, settings, cycleEstimate) {
  const cycles = nodeGraphModuleScopeEffectiveCycles(settings);
  if (cycleEstimate?.periodSamples) {
    return Math.min(buffer.length, Math.max(8, cycleEstimate.periodSamples * cycles));
  }
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  const cycleRatio = Math.max(
    0.001,
    (Number(cycles) || nodeGraphModuleScopeDefaultSettings.cycles) /
      Math.max(0.001, nodeGraphModuleScopeDefaultSettings.cycles),
  );
  return settings.timeMs > 0
    ? Math.min(buffer.length, Math.max(8, Math.round((settings.timeMs / 1000) * sampleRate * cycleRatio)))
    : buffer.length;
}

function nodeGraphTraceDisplayVisibleSamples(buffer, settings) {
  const safeSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  const requestedSamples = safeSettings.zoomSeconds * sampleRate;
  if (requestedSamples === Infinity) {
    return buffer.length;
  }
  if (!Number.isFinite(requestedSamples)) {
    return 0;
  }
  return Math.max(0, Math.min(buffer.length, Math.round(requestedSamples)));
}

// Re-anchoring the trigger from scratch every frame (nearest zero-crossing to
// the buffer tail) looks fine for a perfectly stable tone, but for anything
// less clean -- noise, FM, a slowly evolving waveform -- the "nearest
// crossing" can land on a different cycle each frame, reading as constant
// jitter instead of a locked trace. This holds the previous lock's absolute
// phase and only re-searches when the lock is actually lost (period drifted
// too far, the window size changed, or the predicted position fell out of
// range). The buffer is a fixed-capacity scrolling window (old samples are
// shifted out as new ones arrive, so a fixed index does NOT mean a fixed
// point in time) -- nodeGraphScopeTotalSampleCount is the only thing that
// tracks how far the window has actually scrolled since the last lock, so
// the predicted anchor is shifted by exactly that amount, then folded back
// into range by whole periods (which preserves phase).
//
// `lock` is the caller's per-DISPLAY-node entry in
// nodeGraphModuleScopeState.traceDisplaySyncLocks, not a property on
// `buffer` -- `buffer` is the shared captured-signal object for whichever
// source node this display watches, so two scopes watching the same source
// (each with their own zoom/cycles) would otherwise stomp each other's lock
// every frame instead of each holding a stable trigger.
function nodeGraphTraceDisplayStabilizedSyncStart(lock, buffer, syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!(periodSamples > 0)) {
    return null;
  }
  const prevStart = Number(lock.lastSyncStart);
  const prevPeriod = Number(lock.lastSyncPeriod);
  const prevVisibleSamples = Number(lock.lastSyncVisibleSamples);
  const prevTotalSampleCount = Number(lock.lastSyncTotalSampleCount);
  const totalSampleCount = Number(buffer.nodeGraphScopeTotalSampleCount);
  const elapsed = Number.isFinite(prevTotalSampleCount) && Number.isFinite(totalSampleCount)
    ? totalSampleCount - prevTotalSampleCount
    : NaN;
  const periodDrift = Number.isFinite(prevPeriod) && prevPeriod > 0
    ? Math.abs(periodSamples - prevPeriod) / prevPeriod
    : Infinity;
  if (
    Number.isFinite(prevStart) &&
    Number.isFinite(elapsed) &&
    elapsed >= 0 &&
    prevVisibleSamples === visibleSamples &&
    periodDrift < 0.15
  ) {
    let predicted = prevStart - elapsed;
    if (predicted < validStart) {
      predicted += Math.ceil((validStart - predicted) / periodSamples) * periodSamples;
    }
    if (predicted + visibleSamples > validEnd) {
      predicted -= Math.ceil((predicted + visibleSamples - validEnd) / periodSamples) * periodSamples;
    }
    if (predicted >= validStart && predicted + visibleSamples <= validEnd) {
      lock.lastSyncStart = predicted;
      lock.lastSyncPeriod = periodSamples;
      lock.lastSyncVisibleSamples = visibleSamples;
      lock.lastSyncTotalSampleCount = totalSampleCount;
      return predicted;
    }
  }
  const reacquired = nodeGraphTraceDisplaySyncedStart(
    syncBuffer || buffer,
    cycleEstimate,
    visibleSamples,
    validStart,
    validEnd,
  );
  if (reacquired !== null) {
    lock.lastSyncStart = reacquired;
    lock.lastSyncPeriod = periodSamples;
    lock.lastSyncVisibleSamples = visibleSamples;
    lock.lastSyncTotalSampleCount = totalSampleCount;
  }
  return reacquired;
}

function nodeGraphTraceDisplayBufferView(buffer, slot) {
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const zoomEditActive = Boolean(nodeGraphMvp?.traceDisplayZoomEditActive);
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  const availableSamples = nodeGraphScopeAvailableSampleCount(buffer);
  const validEnd = buffer.length;
  const validStart = availableSamples > 0
    ? Math.max(0, validEnd - Math.min(validEnd, availableSamples))
    : 0;
  const validSamples = Math.max(0, validEnd - validStart);
  const visibleSamples = Math.min(validSamples, nodeGraphTraceDisplayVisibleSamples(buffer, settings));
  let start = Math.max(validStart, validEnd - visibleSamples);
  const syncEligible = settings.sourceSync && !zoomEditActive && visibleSamples < validSamples;
  const estimatedCycle = syncEligible ? nodeGraphModuleScopeEstimatedCycle(syncBuffer || buffer) : null;
  if (syncEligible && estimatedCycle) {
    const lockKey = String(slot?.nodeId || "");
    let lock = nodeGraphModuleScopeState.traceDisplaySyncLocks.get(lockKey);
    if (!lock) {
      lock = {};
      nodeGraphModuleScopeState.traceDisplaySyncLocks.set(lockKey, lock);
    }
    const triggeredStart = nodeGraphTraceDisplayStabilizedSyncStart(
      lock,
      buffer,
      syncBuffer,
      estimatedCycle,
      visibleSamples,
      validStart,
      validEnd,
    );
    if (triggeredStart !== null && triggeredStart >= validStart) {
      start = triggeredStart;
    }
  }
  return {
    end: Math.min(validEnd, start + visibleSamples),
    gain: 1,
    offset: 0,
    start,
  };
}

function nodeGraphModuleScopeBufferView(buffer, slot) {
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace") {
    return nodeGraphTraceDisplayBufferView(buffer, slot);
  }
  if (buffer?.nodeGraphScopeUseFullWindow) {
    return {
      end: buffer.length,
      gain: nodeGraphModuleScopeVisualGain(settings),
      offset: settings.offset,
      start: 0,
    };
  }
  const estimatedCycle = nodeGraphModuleScopeEstimatedCycle(buffer);
  const cycleEstimate = settings.sync ? estimatedCycle : null;
  const visibleSamples = nodeGraphModuleScopeVisibleSamples(buffer, settings, estimatedCycle);
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  const defaultStart = Math.max(0, buffer.length - visibleSamples);
  let start = defaultStart;
  if (settings.sync && cycleEstimate && visibleSamples < buffer.length) {
    const triggeredStart = nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples);
    if (triggeredStart !== null) {
      start = triggeredStart;
    } else {
      const searchStart = Math.max(1, defaultStart - Math.round(cycleEstimate.periodSamples * 2));
      const searchEnd = Math.min(buffer.length, defaultStart + Math.round(cycleEstimate.periodSamples * 2));
      const fallbackCrossings = nodeGraphModuleScopeRisingCrossings(
        syncBuffer,
        cycleEstimate.threshold,
        searchStart,
        searchEnd,
      );
      if (fallbackCrossings.length) {
        start = fallbackCrossings.reduce((best, crossing) =>
          Math.abs(crossing - defaultStart) < Math.abs(best - defaultStart) ? crossing : best);
      }
    }
  }
  const rawPanCycles = Number(settings.pan) || 0;
  const panCycles = settings.sync && cycleEstimate
    ? Math.round(rawPanCycles)
    : rawPanCycles;
  const panSamples = panCycles
    ? (cycleEstimate?.periodSamples || visibleSamples) * panCycles
    : 0;
  start = clampNodeSliderValue(start - panSamples, 0, Math.max(0, buffer.length - visibleSamples));
  return {
    end: Math.min(buffer.length, start + visibleSamples),
    gain: nodeGraphModuleScopeVisualGain(settings),
    offset: settings.offset,
    start,
  };
}

function nodeGraphModuleScopeInterpolatedSample(buffer, position) {
  const samplePosition = clampNodeSliderValue(Number(position) || 0, 0, Math.max(0, buffer.length - 1));
  const leftIndex = Math.floor(samplePosition);
  const rightIndex = Math.min(buffer.length - 1, leftIndex + 1);
  const blend = samplePosition - leftIndex;
  const left = Number(buffer[leftIndex]) || 0;
  const right = Number(buffer[rightIndex]) || left;
  return left + (right - left) * blend;
}

function nodeGraphModuleScopeSampleInfo(buffer, position) {
  const samplePosition = clampNodeSliderValue(Number(position) || 0, 0, Math.max(0, buffer.length - 1));
  const leftIndex = Math.floor(samplePosition);
  const rightIndex = Math.min(buffer.length - 1, leftIndex + 1);
  const blend = samplePosition - leftIndex;
  const left = Number(buffer[leftIndex]) || 0;
  const right = Number(buffer[rightIndex]) || left;
  const discontinuity = rightIndex !== leftIndex &&
    Math.abs(right - left) > nodeGraphModuleScopeDiscontinuityThreshold;
  return {
    blend,
    discontinuity,
    left,
    right,
    value: left + (right - left) * blend,
  };
}

function nodeGraphTraceDisplaySampleInfo(buffer, position, samplesPerPoint = 1) {
  const center = nodeGraphModuleScopeSampleInfo(buffer, position);
  const span = Math.max(0, Number(samplesPerPoint) || 0);
  if (!buffer?.length || span <= 1.25) {
    return center;
  }
  const halfSpan = Math.min(span * 0.5, 64);
  const first = clampNodeSliderValue(Number(position) - halfSpan, 0, Math.max(0, buffer.length - 1));
  const last = clampNodeSliderValue(Number(position) + halfSpan, 0, Math.max(0, buffer.length - 1));
  const taps = Math.max(3, Math.min(33, Math.ceil((last - first) * 2)));
  let total = 0;
  let weightTotal = 0;
  let spanMin = Infinity;
  let spanMax = -Infinity;
  for (let tap = 0; tap < taps; tap += 1) {
    const t = taps <= 1 ? 0.5 : tap / (taps - 1);
    const samplePosition = first + (last - first) * t;
    const weight = 1 - Math.abs(t - 0.5) * 0.75;
    const tapValue = nodeGraphModuleScopeInterpolatedSample(buffer, samplePosition);
    total += tapValue * weight;
    weightTotal += weight;
    if (tapValue < spanMin) spanMin = tapValue;
    if (tapValue > spanMax) spanMax = tapValue;
  }
  const spanDiscontinuity = center.discontinuity || (spanMax - spanMin) > nodeGraphModuleScopeDiscontinuityThreshold;
  return {
    ...center,
    discontinuity: spanDiscontinuity,
    value: weightTotal > 0 ? total / weightTotal : center.value,
  };
}

function nodeGraphModuleScopeBufferValue(buffer, position, view) {
  return clampNodeSliderValue((nodeGraphModuleScopeInterpolatedSample(buffer, position) * view.gain) + view.offset, -1, 1);
}

function nodeGraphModuleScopeHeatmapTraceColors() {
  return {
    core: [1, 1, 1],
  };
}

function nodeGraphModuleScopeDotStyle(slot, buffer) {
  const source = nodeGraphModuleScopeShaderSourceForSlot(slot);
  const coreFallback = nodeGraphModuleScopeShaderGlobalColor("dot1");
  const coreSize = nodeGraphMvp?.moduleScopeDotCore1Enabled === false
    ? 0
    : nodeGraphModuleScopeShaderNumber(
      source,
      "dot1",
      "size",
      normalizeNodeGraphModuleScopeDotCoreSize(
        nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
        nodeGraphModuleScopeDefaultDotCores.dot1.size,
      ),
    );
  const coreBrightness = nodeGraphMvp?.moduleScopeDotCore1Enabled === false
    ? 0
    : nodeGraphModuleScopeShaderNumber(
      source,
      "dot1",
      "brightness",
      normalizeNodeGraphModuleScopeDotCoreBrightness(
        nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
        nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
      ),
    );
  return {
    coreBrightness: clampNodeSliderValue(coreBrightness, 0, 40),
    coreColor: nodeGraphScopeHexColorToRgb(
      nodeGraphModuleScopeShaderColor(source, "dot1", coreFallback),
    ),
    coreSize: normalizeNodeGraphModuleScopeDotCoreSize(coreSize, nodeGraphModuleScopeDefaultDotCores.dot1.size),
  };
}

function nodeGraphModuleScopeZoomScale() {
  const zoom = typeof nodeGraphZoom === "function"
    ? nodeGraphZoom()
    : Number(nodeGraphMvp?.zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function nodeGraphModuleScopeStrokeZoomScale() {
  return clampNodeSliderValue(nodeGraphModuleScopeZoomScale(), 0.35, 4);
}

function nodeGraphModuleScopeUnzoomedLength(value, zoomScale = nodeGraphModuleScopeZoomScale()) {
  const length = Number(value);
  const zoom = Number(zoomScale);
  if (!Number.isFinite(length) || length <= 0) {
    return 1;
  }
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return length;
  }
  return Math.max(1, length / zoom);
}

function nodeGraphModuleScopeRenderedSampleWidth(rect, zoomScale = nodeGraphModuleScopeZoomScale()) {
  const width = Number(rect?.width);
  const sampleWidth = Number(rect?.sampleWidth);
  const zoom = Number(zoomScale);
  const renderedWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const zoomedSampleWidth = Number.isFinite(sampleWidth) && sampleWidth > 0 && Number.isFinite(zoom) && zoom > 0
    ? sampleWidth * zoom
    : 0;
  return Math.max(1, renderedWidth, zoomedSampleWidth);
}

function nodeGraphModuleScopeVisibleMetricRect(rect, options = {}) {
  const visibleRect = options?.visibleRect;
  return visibleRect && Number(visibleRect.width) > 1 && Number(visibleRect.height) > 1
    ? visibleRect
    : rect;
}

function nodeGraphModuleScopePhosphorFrameReady(slot) {
  const key = String(slot?.nodeId || "__default");
  const fps = normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60);
  const now = Math.max(0, Number(nodeGraphModuleScopeState.animationTime) || 0);
  const state = nodeGraphModuleScopeState.phosphorFrame || {
    key: "",
    lastUpdate: 0,
  };
  if (state.key !== key || !Number.isFinite(Number(state.lastUpdate))) {
    nodeGraphModuleScopeState.phosphorFrame = {
      key,
      lastUpdate: now,
    };
    return true;
  }
  const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps);
  if (!tick.ready) {
    return false;
  }
  nodeGraphModuleScopeState.phosphorFrame = {
    key,
    lastUpdate: tick.lastUpdate,
  };
  return true;
}

function beginNodeGraphModuleScopeRenderMetricsFrame() {
  const metrics = nodeGraphModuleScopeState.renderMetrics || {};
  metrics.drawCalls = 0;
  metrics.points = 0;
  metrics.vertices = 0;
  nodeGraphModuleScopeState.renderMetrics = metrics;
  return metrics;
}

function recordNodeGraphModuleScopeRenderMetrics(pointCount = 0, vertexCount = 0) {
  const metrics = nodeGraphModuleScopeState.renderMetrics || beginNodeGraphModuleScopeRenderMetricsFrame();
  metrics.drawCalls = (Number(metrics.drawCalls) || 0) + 1;
  metrics.points += Math.max(0, Math.floor(Number(pointCount) || 0));
  metrics.vertices += Math.max(0, Math.floor(Number(vertexCount) || 0));
}

function nodeGraphModuleScopeNowMs() {
  return performance.now?.() || Date.now();
}

function nodeGraphTraceDisplayTimingEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.nodeGraphTraceDisplayTimingEnabled === true ||
    window.localStorage?.getItem?.("nodeGraphTraceDisplayTiming") === "1";
}

function nodeGraphTraceDisplayTimingObject(slot) {
  if (!nodeGraphTraceDisplayTimingEnabled()) {
    return null;
  }
  return {
    bufferViewMs: 0,
    drawArraysMs: 0,
    frameStartMs: nodeGraphModuleScopeNowMs(),
    glBufferDataMs: 0,
    nodeId: String(slot?.nodeId || ""),
    passes: 0,
    pointGenerationMs: 0,
    points: 0,
    totalMs: 0,
    vertexGenerationMs: 0,
    vertices: 0,
  };
}

function nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings) {
  return [
    Number(buffer?.nodeGraphScopeVersion) || 0,
    nodeGraphScopeAvailableSampleCount(buffer),
    Math.round(Number(item?.scopeRect?.left) || 0),
    Math.round(Number(item?.scopeRect?.top) || 0),
    Math.round(Number(item?.scopeRect?.width) || 0),
    Math.round(Number(item?.scopeRect?.height) || 0),
    Math.round((Number(item?.visibleProgressRange?.[0]) || 0) * 10000),
    Math.round((Number(item?.visibleProgressRange?.[1]) || 0) * 10000),
    settings.zoomSeconds,
    settings.padding,
    settings.skipDiscontinuities ? 1 : 0,
    settings.lineThickness,
    settings.brightness,
    settings.color,
    settings.secondaryLineThickness,
    settings.secondaryBrightness,
    settings.secondaryColor,
    settings.sourceSync === false ? 0 : 1,
  ].join("|");
}

function nodeGraphTraceDisplaySignatureUnchanged(slot, item, buffer, settings) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return false;
  }
  const signature = nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings);
  return nodeGraphModuleScopeState.traceDisplayDrawCache.get(nodeId) === signature;
}

function rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return;
  }
  nodeGraphModuleScopeState.traceDisplayDrawCache.set(
    nodeId,
    nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings),
  );
}

function finishNodeGraphTraceDisplayTiming(timing) {
  if (!timing) {
    return;
  }
  timing.totalMs = Math.max(0, nodeGraphModuleScopeNowMs() - timing.frameStartMs);
  const debug = nodeGraphModuleScopeDebugState();
  debug.traceDisplayTiming = {
    bufferViewMs: Number(timing.bufferViewMs.toFixed(3)),
    drawArraysMs: Number(timing.drawArraysMs.toFixed(3)),
    glBufferDataMs: Number(timing.glBufferDataMs.toFixed(3)),
    nodeId: timing.nodeId,
    passes: timing.passes,
    pointGenerationMs: Number(timing.pointGenerationMs.toFixed(3)),
    points: timing.points,
    totalMs: Number(timing.totalMs.toFixed(3)),
    vertexGenerationMs: Number(timing.vertexGenerationMs.toFixed(3)),
    vertices: timing.vertices,
  };
  const now = nodeGraphModuleScopeNowMs();
  if (typeof console !== "undefined" && now - (Number(debug.traceDisplayTimingLastLogMs) || 0) > 500) {
    debug.traceDisplayTimingLastLogMs = now;
    console.table([debug.traceDisplayTiming]);
  }
}

function nodeGraphModuleScopeDebugState() {
  const debug = nodeGraphModuleScopeState.renderDebug || {};
  nodeGraphModuleScopeState.renderDebug = debug;
  return debug;
}

function setNodeGraphModuleScopeDebugPhase(phase, extra = {}) {
  const debug = nodeGraphModuleScopeDebugState();
  debug.phase = String(phase || "idle");
  Object.assign(debug, extra);
  return debug;
}

function markNodeGraphModuleScopeDebugSkip(reason) {
  const debug = setNodeGraphModuleScopeDebugPhase("skip", {
    lastSkipReason: String(reason || "unknown"),
  });
  debug.skippedFrames = (Number(debug.skippedFrames) || 0) + 1;
  pushNodeGraphModuleScopeDebugHistory(`skip:${debug.lastSkipReason}`);
  syncNodeGraphScopeGpuDebugDisplay();
}

function nodeGraphModuleScopeDebugSnapshot() {
  const debug = nodeGraphModuleScopeState.renderDebug || {};
  return {
    buffers: nodeGraphModuleScopeState.buffers.size,
    drawableSlots: nodeGraphVisibleModuleScopeSlots().length,
    enabled: nodeGraphModuleScopesEnabled(),
    lastSkipReason: debug.lastSkipReason || "",
    phase: debug.phase || "",
    scopeSlots: Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [],
    totalSlots: nodeGraphModuleScopeSlots().length,
    visibleItems: Number(debug.visibleItems) || 0,
  };
}

window.nodeGraphModuleScopeDebugSnapshot = nodeGraphModuleScopeDebugSnapshot;

function markNodeGraphModuleScopeDebugError(error) {
  const message = error?.message || String(error || "unknown error");
  setNodeGraphModuleScopeDebugPhase("error", {
    lastError: message.slice(0, 160),
    lastFrameEndMs: nodeGraphModuleScopeNowMs(),
  });
  pushNodeGraphModuleScopeDebugHistory("error");
  syncNodeGraphScopeGpuDebugDisplay();
}

function pushNodeGraphModuleScopeDebugHistory(reason = "frame") {
  const debug = nodeGraphModuleScopeDebugState();
  const history = Array.isArray(debug.debugHistory) ? debug.debugHistory : [];
  const now = nodeGraphModuleScopeNowMs();
  const entry = {
    ageMs: Math.max(0, now - (Number(debug.lastFrameEndMs) || now)),
    canvasHeight: Math.max(0, Math.floor(Number(debug.canvasHeight) || 0)),
    canvasWidth: Math.max(0, Math.floor(Number(debug.canvasWidth) || 0)),
    drawMs: Math.max(0, Number(debug.lastDrawMs) || 0),
    error: debug.lastError || "",
    phase: debug.phase || "idle",
    pixelRatio: Number(debug.pixelRatio) || 0,
    points: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.points) || 0)),
    reason: String(reason || "frame"),
    skippedFrames: Math.max(0, Math.floor(Number(debug.skippedFrames) || 0)),
    timeMs: now,
    totalSlots: Math.max(0, Math.floor(Number(debug.totalSlots) || 0)),
    vertices: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.vertices) || 0)),
    visibleItems: Math.max(0, Math.floor(Number(debug.visibleItems) || 0)),
    zoom: Number(debug.zoom) || 0,
  };
  history.push(entry);
  if (history.length > 120) {
    history.splice(0, history.length - 120);
  }
  debug.debugHistory = history;
  if (typeof window !== "undefined") {
    window.nodeGraphScopeDebugSnapshot = () => ({
      current: { ...nodeGraphModuleScopeDebugState() },
      metrics: { ...(nodeGraphModuleScopeState.renderMetrics || {}) },
      history: [...(nodeGraphModuleScopeDebugState().debugHistory || [])],
    });
  }
  return entry;
}

function commitNodeGraphModuleScopeRenderMetricsFrame(nowSeconds = (performance.now?.() || Date.now()) / 1000) {
  const metrics = nodeGraphModuleScopeState.renderMetrics || beginNodeGraphModuleScopeRenderMetricsFrame();
  const debug = nodeGraphModuleScopeDebugState();
  const now = Math.max(0, Number(nowSeconds) || 0);
  metrics.fpsFrames = (Number(metrics.fpsFrames) || 0) + 1;
  debug.committedFrames = (Number(debug.committedFrames) || 0) + 1;
  debug.lastFrameEndMs = nodeGraphModuleScopeNowMs();
  debug.lastDrawMs = Math.max(0, debug.lastFrameEndMs - (Number(debug.lastFrameStartMs) || debug.lastFrameEndMs));
  const last = Number(metrics.fpsLastTime) || 0;
  if (!last) {
    metrics.fpsLastTime = now;
  } else if (now - last >= 0.5) {
    metrics.fps = metrics.fpsFrames / Math.max(0.001, now - last);
    metrics.fpsFrames = 0;
    metrics.fpsLastTime = now;
  }
  pushNodeGraphModuleScopeDebugHistory("commit");
  syncNodeGraphScopeGpuMetricsDisplay();
}

function formatNodeGraphScopeGpuMetricFixedNumber(value, digits = 6) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const width = Math.max(1, Math.floor(Number(digits) || 1));
  const max = (10 ** width) - 1;
  return String(Math.min(count, max)).padStart(width, "0");
}

function formatNodeGraphScopeGpuMetricFps(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return "---.-";
  }
  return Math.min(999.9, Math.max(0, fps)).toFixed(1).padStart(5, "0");
}

function syncNodeGraphScopeGpuMetricsDisplay() {
  const root = document.getElementById("nodeScopeGpuMetrics");
  if (!root) {
    return;
  }
  const metrics = nodeGraphModuleScopeState.renderMetrics || {};
  const fps = Number(metrics.fps);
  const points = Math.max(0, Math.floor(Number(metrics.points) || 0));
  const vertices = Math.max(0, Math.floor(Number(metrics.vertices) || 0));
  const fpsElement = root.querySelector("[data-scope-gpu-metric='fps']");
  const pointsElement = root.querySelector("[data-scope-gpu-metric='points']");
  if (fpsElement) {
    fpsElement.textContent = formatNodeGraphScopeGpuMetricFps(fps);
  }
  if (pointsElement) {
    pointsElement.textContent = formatNodeGraphScopeGpuMetricFixedNumber(points, 6);
  }
  root.dataset.scopePoints = String(points);
  root.dataset.scopeVertices = String(vertices);
  root.title = `scope vertices ${formatNodeGraphScopeGpuMetricFixedNumber(vertices, 6)}`;
  syncNodeGraphScopeGpuDebugDisplay();
}

function nodeGraphScopeGpuMetricsVisible(root = document.getElementById("nodeScopeGpuMetrics")) {
  return Boolean(root && document.body.classList.contains("node-constraint-gpu-active"));
}

function formatNodeGraphScopeGpuDebugNumber(value, digits = 3) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  return String(number).padStart(Math.max(1, digits), "0");
}

function formatNodeGraphScopeGpuDebugMs(value) {
  const number = Math.max(0, Number(value) || 0);
  return Math.min(9999, number).toFixed(number >= 100 ? 0 : 1).padStart(5, "0");
}

function syncNodeGraphScopeGpuDebugDisplay() {
  const root = document.getElementById("nodeScopeGpuMetrics");
  const debugElement = root?.querySelector("[data-scope-gpu-debug='summary']");
  if (!root || !debugElement) {
    return;
  }
  const debug = nodeGraphModuleScopeDebugState();
  const now = nodeGraphModuleScopeNowMs();
  const pendingAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
  const pendingAge = nodeGraphModuleScopeState.drawFrame && pendingAt > 0 ? Math.max(0, now - pendingAt) : 0;
  const lastEnd = Number(debug.lastFrameEndMs) || 0;
  const frameAge = lastEnd > 0 ? Math.max(0, now - lastEnd) : 0;
  debug.pendingAgeMs = pendingAge;
  debug.lastHeartbeatMs = now;
  const error = debug.lastError ? ` err:${debug.lastError}` : "";
  const slotSummary = (Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [])
    .filter((slot) => ["scope2d", "scope2dTrace", "traceDisplay", "lineBurnOscilloscope", "dotOscilloscope", "valueOscilloscope"].includes(slot?.type))
    .map((slot) => {
      const id = String(slot.nodeId || slot.type || "?").replace(/Oscilloscope|Display/g, "");
      const length = Math.max(0, Math.floor(Number(slot.bufferLength) || 0));
      return `${id}:${slot.displayType || slot.type}:${length}${slot.skip ? `:${slot.skip}` : ""}`;
    })
    .slice(0, 6);
  if (!nodeGraphScopeGpuMetricsVisible(root)) {
    root.dataset.debugSnapshot = "";
    debugElement.textContent = "debug --";
    return;
  }
  const snapshot = {
    canvas: `${Math.max(0, Math.floor(Number(debug.canvasWidth) || 0))}x${Math.max(0, Math.floor(Number(debug.canvasHeight) || 0))}`,
    drawMs: Math.max(0, Number(debug.lastDrawMs) || 0),
    error: debug.lastError || "",
    frameAgeMs: frameAge,
    historyTail: (Array.isArray(debug.debugHistory) ? debug.debugHistory : []).slice(-12),
    pendingAgeMs: pendingAge,
    phase: debug.phase || "idle",
    pixelRatio: Number(debug.pixelRatio) || 0,
    points: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.points) || 0)),
    scopeSlots: Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [],
    slots: `${Math.max(0, Math.floor(Number(debug.visibleItems) || 0))}/${Math.max(0, Math.floor(Number(debug.totalSlots) || 0))}`,
    vertices: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.vertices) || 0)),
    zoom: Number(debug.zoom) || 0,
  };
  root.dataset.debugSnapshot = JSON.stringify(snapshot);
  debugElement.textContent = [
    `z${(Number(debug.zoom) || 0).toFixed(2)}`,
    `age${formatNodeGraphScopeGpuDebugMs(frameAge)}ms`,
    `draw${formatNodeGraphScopeGpuDebugMs(debug.lastDrawMs)}ms`,
    `pend${formatNodeGraphScopeGpuDebugMs(pendingAge)}ms`,
    `slots${formatNodeGraphScopeGpuDebugNumber(debug.visibleItems, 2)}/${formatNodeGraphScopeGpuDebugNumber(debug.totalSlots, 2)}`,
    `cv${formatNodeGraphScopeGpuDebugNumber(debug.canvasWidth, 4)}x${formatNodeGraphScopeGpuDebugNumber(debug.canvasHeight, 4)}`,
    `pr${(Number(debug.pixelRatio) || 0).toFixed(2)}`,
    slotSummary.length ? `scope:${slotSummary.join(",")}` : "",
    `phase:${debug.phase || "idle"}`,
    debug.lastSkipReason ? `skip:${debug.lastSkipReason}` : "",
  ].filter(Boolean).join(" ") + error;
}

function runNodeGraphModuleScopeDrawFrame(source = "raf") {
  try {
    drawNodeGraphModuleScopes();
  } catch (error) {
    markNodeGraphModuleScopeDebugError(error);
    console.error(`node graph module scope ${source} draw failed`, error);
    scheduleNodeGraphModuleScopeDraw();
  }
}

function nodeGraphModuleScopeBufferProgressRanges(buffer) {
  const drawProgress = Number.isFinite(Number(buffer?.nodeGraphScopeDrawProgress))
    ? clampNodeSliderValue(Number(buffer.nodeGraphScopeDrawProgress), 0.002, 1)
    : 1;
  if (buffer?.nodeGraphScopeDrawFullWindow) {
    return [[0, 1]];
  }
  const startProgress = Number(buffer?.nodeGraphScopeDrawStartProgress);
  if (!Number.isFinite(startProgress)) {
    return [[0, drawProgress]];
  }
  const start = clampNodeSliderValue(startProgress, 0, 1);
  if (buffer?.nodeGraphScopeDrawWrap) {
    return [
      [start, 1],
      [0, drawProgress],
    ].filter(([from, to]) => to - from > 0.001);
  }
  const end = Math.max(start + 0.002, drawProgress);
  return [[start, clampNodeSliderValue(end, 0.002, 1)]];
}

function nodeGraphModuleScopeProgressRangeIntersection(range, clipRange) {
  const start = clampNodeSliderValue(Number(range?.[0]) || 0, 0, 1);
  const end = clampNodeSliderValue(Number(range?.[1]) || 0, 0, 1);
  if (!Array.isArray(clipRange)) {
    return end - start > 0.001 ? [start, end] : null;
  }
  const clipStart = clampNodeSliderValue(Number(clipRange[0]) || 0, 0, 1);
  const clipEnd = clampNodeSliderValue(Number(clipRange[1]) || 0, 0, 1);
  const clippedStart = Math.max(start, clipStart);
  const clippedEnd = Math.min(end, clipEnd);
  return clippedEnd - clippedStart > 0.001 ? [clippedStart, clippedEnd] : null;
}

const nodeGraphModuleScopeDiscontinuityFixedSkipCount = 2;

function nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer) {
  if (buffer?.nodeGraphScopeDisableDiscontinuitySkip === true) {
    return 0;
  }
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace") {
    const enabled = buffer?.nodeGraphScopeSkipDiscontinuities
      ?? nodeGraphTraceDisplaySettingsForSlot(slot).skipDiscontinuities;
    return enabled ? nodeGraphModuleScopeDiscontinuityFixedSkipCount : 0;
  }
  return typeof normalizeNodeGraphModuleScopeDiscontinuitySkipSamples === "function"
    ? normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(nodeGraphMvp?.moduleScopeDiscontinuitySkipSamples ?? 1)
    : 1;
}

function nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points) {
  if (points?.nodeGraphScopeDisableDiscontinuitySkip === true) {
    return 0;
  }
  if (Number.isFinite(Number(points?.nodeGraphScopeDiscontinuitySkipSamples))) {
    return Math.min(nodeGraphModuleScopeDiscontinuityFixedSkipCount, Math.max(0, Math.round(Number(points.nodeGraphScopeDiscontinuitySkipSamples))));
  }
  return typeof normalizeNodeGraphModuleScopeDiscontinuitySkipSamples === "function"
    ? normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(nodeGraphMvp?.moduleScopeDiscontinuitySkipSamples ?? 1)
    : 1;
}

function nodeGraphModuleScopeTraceEdgePaddingRatio(slot, rect) {
  if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
    return 0.08;
  }
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const activePasses = [];
  if (settings.dot1Enabled !== false && settings.brightness > 0) {
    activePasses.push({
      blur: clampNodeSliderValue(settings.lineThickness, 0, 1),
      size: clampNodeSliderValue(settings.dot1Size, 0, 1),
    });
  }
  if (slot?.type === "output" && settings.secondaryEnabled !== false && settings.secondaryBrightness > 0) {
    activePasses.push({
      blur: clampNodeSliderValue(settings.secondaryLineThickness, 0, 1),
      size: clampNodeSliderValue(settings.secondarySize, 0, 1),
    });
  }
  const visualPadding = activePasses.reduce((largest, pass) => {
    const padding = pass.size * (0.22 + pass.blur * 0.16);
    return Math.max(largest, padding);
  }, 0);
  const pixelPadding = rect?.height > 0 ? 3 / rect.height : 0;
  return clampNodeSliderValue(Math.max(0.06, visualPadding, pixelPadding), 0, 0.24);
}

function nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect = null) {
  if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
    return 0.42;
  }
  return clampNodeSliderValue(0.5 - nodeGraphModuleScopeTraceEdgePaddingRatio(slot, rect), 0.24, 0.5);
}

function nodeGraphModuleScopeBufferSegmentPoints(
  buffer,
  rect,
  canvas,
  pixelRatio,
  slot,
  startProgress,
  endProgress,
  options = {},
) {
  const points = [];
  if (!buffer?.length || rect.width <= 1 || rect.height <= 1) {
    return points;
  }
  const clippedRange = nodeGraphModuleScopeProgressRangeIntersection(
    [startProgress, endProgress],
    options.visibleProgressRange,
  );
  if (!clippedRange) {
    return points;
  }
  const [start, end] = clippedRange;
  const drawSpan = end - start;
  if (drawSpan <= 0.001) {
    return points;
  }
  const traceDisplayMode = nodeGraphModuleDisplayRendererForSlot(slot) === "trace";
  const timing = traceDisplayMode ? options.traceTiming : null;
  const bufferViewStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  const view = nodeGraphModuleScopeBufferView(buffer, slot);
  if (timing) {
    timing.bufferViewMs += Math.max(0, nodeGraphModuleScopeNowMs() - bufferViewStartMs);
  }
  if (traceDisplayMode && view.end <= view.start) {
    return points;
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const spectrumMode = buffer?.nodeGraphScopeSpectrum === true;
  const holdPointMode = buffer?.nodeGraphScopeHoldPoint === true;
  const midY = spectrumMode
    ? rect.top + rect.height
    : rect.top + rect.height * 0.5;
  const halfHeight = spectrumMode
    ? rect.height
    : rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
  const metricRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const sampleWidth = nodeGraphModuleScopeRenderedSampleWidth(metricRect);
  const metricDrawSpan = metricRect === rect ? drawSpan : 1;
  const visibleSampleWidth = sampleWidth * metricDrawSpan;
  const minPointSpacingPx = clampNodeSliderValue(Number(buffer.nodeGraphScopeMinPointSpacingPx) || 0.5, 0.25, 32);
  const visualPointLimit = Math.max(2, Math.min(32768, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || 32768)));
  const pointCount = spectrumMode
    ? Math.max(2, Math.min(visualPointLimit, Math.ceil(visibleSamples)))
    : holdPointMode
      ? 1
      : Math.max(2, Math.min(
      visualPointLimit,
      Math.ceil(visibleSampleWidth / minPointSpacingPx),
    ));
  const rawValues = [];
  const skippedPoints = [];
  const discontinuitySkipDisabled = buffer?.nodeGraphScopeDisableDiscontinuitySkip === true;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer);
  const holdPointX = clampNodeSliderValue(Number(buffer.nodeGraphScopeHoldPointX) || 0.5, 0, 1);
  const holdPointSamplePosition = Number(buffer.nodeGraphScopeHoldPointSamplePosition);
  const holdSample = Number.isFinite(holdPointSamplePosition)
    ? clampNodeSliderValue(holdPointSamplePosition, 0, Math.max(0, buffer.length - 1))
    : view.start;
  const pointGenerationStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const progress = holdPointMode
      ? holdPointX
      : spectrumMode
      ? start + (pointIndex / Math.max(1, pointCount - 1)) * drawSpan
      : start + ((pointIndex + 0.5) / pointCount) * drawSpan;
    const samplePosition = holdPointMode
      ? holdSample
      : spectrumMode
      ? view.start + progress * Math.max(0, visibleSamples - 1)
      : view.start + progress * visibleSamples;
    const x = rect.left + progress * rect.width;
    const sampleInfo = nodeGraphModuleScopeSampleInfo(buffer, samplePosition);
    const rawValue = sampleInfo.value;
    const value = spectrumMode
      ? clampNodeSliderValue(rawValue, 0, 1)
      : clampNodeSliderValue((rawValue * view.gain) + view.offset, -1, 1);
    const y = midY - value * halfHeight;
    rawValues.push(Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0);
    skippedPoints.push(!spectrumMode && skipSamples > 0 && sampleInfo.discontinuity);
    points.push(
      ((x * pixelRatio) / canvas.width) * 2 - 1,
      1 - ((y * pixelRatio) / canvas.height) * 2,
    );
  }
  if (timing) {
    timing.pointGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - pointGenerationStartMs);
  }
  if (!spectrumMode) {
    points.nodeGraphScopeRawValues = rawValues;
    points.nodeGraphScopeSkippedPoints = skippedPoints;
    points.nodeGraphScopeUniformAge = false;
    points.nodeGraphScopeDisableDiscontinuitySkip = discontinuitySkipDisabled;
    points.nodeGraphScopeDiscontinuitySkipSamples = skipSamples;
  }
  return points;
}

function nodeGraphModuleScopeBufferPoints(buffer, rect, canvas, pixelRatio, slot) {
  const range = nodeGraphModuleScopeBufferProgressRanges(buffer)[0] || [0, 1];
  return nodeGraphModuleScopeBufferSegmentPoints(buffer, rect, canvas, pixelRatio, slot, range[0], range[1]);
}

function nodeGraphModuleScopeCenteredSquareRect(rect) {
  const size = Math.max(1, Math.min(Number(rect?.width) || 0, Number(rect?.height) || 0));
  return {
    height: size,
    left: (Number(rect?.left) || 0) + ((Number(rect?.width) || size) - size) * 0.5,
    top: (Number(rect?.top) || 0) + ((Number(rect?.height) || size) - size) * 0.5,
    width: size,
  };
}

function nodeGraphModuleScopePaddedRect(rect, padding = 0) {
  const width = Math.max(1, Number(rect?.width) || 0);
  const height = Math.max(1, Number(rect?.height) || 0);
  const safePadding = clampNodeSliderValue(Number(padding) || 0, 0, 0.45);
  const inset = Math.min(width, height) * safePadding;
  return {
    height: Math.max(1, height - inset * 2),
    left: (Number(rect?.left) || 0) + inset,
    top: (Number(rect?.top) || 0) + inset,
    width: Math.max(1, width - inset * 2),
  };
}

function nodeGraphModuleScopeDrawingRect(rect, buffer = null, slot = null) {
  const shaderPadding = Number.isFinite(Number(buffer?.nodeGraphScopeShaderPadding))
    ? Number(buffer.nodeGraphScopeShaderPadding)
    : Number(nodeGraphModuleScopeShaderConfigForSlot(slot).padding);
  const paddedRect = nodeGraphModuleScopePaddedRect(rect, shaderPadding);
  if (buffer?.nodeGraphScopeXy) {
    return nodeGraphModuleScopeCenteredSquareRect(paddedRect);
  }
  return paddedRect;
}

function nodeGraphModuleScopeRectIntersection(rect, bounds) {
  const left = Math.max(Number(rect?.left) || 0, Number(bounds?.left) || 0);
  const top = Math.max(Number(rect?.top) || 0, Number(bounds?.top) || 0);
  const right = Math.min(
    (Number(rect?.left) || 0) + (Number(rect?.width) || 0),
    (Number(bounds?.left) || 0) + (Number(bounds?.width) || 0),
  );
  const bottom = Math.min(
    (Number(rect?.top) || 0) + (Number(rect?.height) || 0),
    (Number(bounds?.top) || 0) + (Number(bounds?.height) || 0),
  );
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0
    ? { height, left, top, width }
    : null;
}

function nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale = nodeGraphModuleScopeZoomScale()) {
  if (
    !nodeGraphModuleScopeRectIntersection(screenRect, viewportRect) ||
    !Number.isFinite(Number(drawRect?.width)) ||
    !Number.isFinite(Number(drawRect?.height))
  ) {
    return null;
  }
  const visibleDrawRect = nodeGraphModuleScopeRectIntersection(drawRect, viewportRect);
  if (!visibleDrawRect) {
    return null;
  }
  const leftProgress = ((visibleDrawRect.left - drawRect.left) / Math.max(1, drawRect.width));
  const rightProgress = (((visibleDrawRect.left + visibleDrawRect.width) - drawRect.left) / Math.max(1, drawRect.width));
  const visibleProgressRange = [
    clampNodeSliderValue(leftProgress, 0, 1),
    clampNodeSliderValue(rightProgress, 0, 1),
  ];
  if (visibleProgressRange[1] - visibleProgressRange[0] <= 0.001) {
    return null;
  }
  return {
    visibleDrawRect,
    visibleProgressRange,
    visibleScopeRect: {
      height: visibleDrawRect.height,
      left: visibleDrawRect.left,
      sampleHeight: nodeGraphModuleScopeUnzoomedLength(visibleDrawRect.height, zoomScale),
      sampleWidth: nodeGraphModuleScopeUnzoomedLength(visibleDrawRect.width, zoomScale),
      top: visibleDrawRect.top,
      width: visibleDrawRect.width,
    },
  };
}

function nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot) {
  const points = [];
  if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length || rect.width <= 1 || rect.height <= 1) {
    return points;
  }
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  const gain = nodeGraphModuleScopeVisualGain(settings);
  const length = Math.min(buffer.x.length, buffer.y.length);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const centerX = square.left + square.width * 0.5;
  const centerY = square.top + square.height * 0.5;
  const radius = Math.max(1, square.width * 0.44);
  for (let index = 0; index < length; index += 1) {
    const x = centerX + clampNodeSliderValue((Number(buffer.x[index]) || 0) * gain, -1, 1) * radius;
    const y = centerY - clampNodeSliderValue((Number(buffer.y[index]) || 0) * gain, -1, 1) * radius;
    points.push(
      ((x * pixelRatio) / canvas.width) * 2 - 1,
      1 - ((y * pixelRatio) / canvas.height) * 2,
    );
  }
  return points;
}

function nodeGraphModuleScopePixelPoints(points, canvas) {
  const pixelPoints = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pixelPoints.push(
      ((points[index] + 1) * 0.5) * canvas.width,
      ((1 - points[index + 1]) * 0.5) * canvas.height,
    );
  }
  return pixelPoints;
}

function appendNodeGraphModuleScopeVertices(target, source) {
  if (!Array.isArray(target) || !source?.length) {
    return target;
  }
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index]);
  }
  return target;
}

function nodeGraphModuleScopeBeamVertices(points, canvas) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const segmentCount = Math.max(1, (pixelPoints.length / 2) - 1);
  const corners = [0, 1, 2, 2, 1, 3];
  const rawValues = Array.isArray(points?.nodeGraphScopeRawValues)
    ? points.nodeGraphScopeRawValues
    : null;
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points);
  let skipThroughSegment = -1;
  for (let index = 0; index + 3 < pixelPoints.length; index += 2) {
    const segmentIndex = index / 2;
    if (skippedPoints?.[segmentIndex] || skippedPoints?.[segmentIndex + 1]) {
      continue;
    }
    if (skipSamples > 0 && rawValues && segmentIndex + 1 < rawValues.length) {
      const previousRaw = Number(rawValues[segmentIndex]);
      const currentRaw = Number(rawValues[segmentIndex + 1]);
      if (
        Number.isFinite(previousRaw) &&
        Number.isFinite(currentRaw) &&
        Math.abs(currentRaw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold
      ) {
        skipThroughSegment = Math.max(skipThroughSegment, segmentIndex + skipSamples - 1);
      }
    }
    if (segmentIndex <= skipThroughSegment) {
      continue;
    }
    const x1 = pixelPoints[index];
    const y1 = pixelPoints[index + 1];
    const x2 = pixelPoints[index + 2];
    const y2 = pixelPoints[index + 3];
    const lengthPx = Math.hypot(x2 - x1, y2 - y1);
    if (lengthPx < 0.001) {
      continue;
    }
    const segmentProgress = points?.nodeGraphScopeUniformAge === true ? 1 : (index / 2) / segmentCount;
    for (const corner of corners) {
      vertices.push(x1, y1, x2, y2, corner, segmentProgress);
    }
  }
  return vertices;
}

function nodeGraphTraceDisplayScratchForSlot(slot, requiredFloats) {
  const nodeId = String(slot?.nodeId || "traceDisplay");
  const scratch = nodeGraphModuleScopeState.traceDisplayScratch;
  let entry = scratch.get(nodeId);
  const required = Math.max(0, Math.floor(Number(requiredFloats) || 0));
  if (!entry || entry.vertices.length < required) {
    let capacity = Math.max(1024, entry?.vertices?.length || 0);
    while (capacity < required) {
      capacity *= 2;
    }
    entry = {
      vertices: new Float32Array(capacity),
    };
    scratch.set(nodeId, entry);
  }
  return entry;
}

function appendNodeGraphTraceDisplayBeamSegment(vertices, offset, x1, y1, x2, y2, age) {
  const corners = [0, 1, 2, 2, 1, 3];
  let cursor = offset;
  for (let index = 0; index < corners.length; index += 1) {
    vertices[cursor] = x1;
    vertices[cursor + 1] = y1;
    vertices[cursor + 2] = x2;
    vertices[cursor + 3] = y2;
    vertices[cursor + 4] = corners[index];
    vertices[cursor + 5] = age;
    cursor += 6;
  }
  return cursor;
}

function nodeGraphTraceDisplayVisualPointCount(rect, buffer) {
  const visualWidth = Math.max(1, Number(rect?.width) || 0);
  const visualPointLimit = Math.max(
    2,
    Math.min(32768, Math.floor(Number(buffer?.nodeGraphScopeVisualPointLimit) || 32768)),
  );
  return Math.max(2, Math.min(visualPointLimit, Math.ceil(visualWidth * 2)));
}

function buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options = {}) {
  const clippedRange = nodeGraphModuleScopeProgressRangeIntersection([0, 1], options.visibleProgressRange);
  if (!buffer?.length || rect.width <= 1 || rect.height <= 1 || !clippedRange) {
    return null;
  }
  const timing = options.traceTiming || null;
  const [start, end] = clippedRange;
  const drawSpan = end - start;
  if (drawSpan <= 0.001) {
    return null;
  }
  const bufferViewStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  const view = nodeGraphModuleScopeBufferView(buffer, slot);
  if (timing) {
    timing.bufferViewMs += Math.max(0, nodeGraphModuleScopeNowMs() - bufferViewStartMs);
  }
  if (view.end <= view.start) {
    const sampleIndex = Math.max(0, Math.min(buffer.length - 1, buffer.length - 1));
    const sampleInfo = nodeGraphModuleScopeSampleInfo(buffer, sampleIndex);
    const rawValue = Number.isFinite(Number(sampleInfo.value)) ? Number(sampleInfo.value) : 0;
    const value = clampNodeSliderValue((rawValue * view.gain) + view.offset, -1, 1);
    const midY = rect.top + rect.height * 0.5;
    const halfHeight = rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
    const y = (midY - value * halfHeight) * pixelRatio;
    const scratch = nodeGraphTraceDisplayScratchForSlot(slot, 36);
    const vertices = scratch.vertices;
    const vertexOffset = appendNodeGraphTraceDisplayBeamSegment(
      vertices,
      0,
      rect.left * pixelRatio,
      y,
      (rect.left + rect.width) * pixelRatio,
      y,
      0,
    );
    return {
      pointCount: 1,
      vertexCount: vertexOffset / 6,
      vertices,
      vertexFloatCount: vertexOffset,
    };
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const midY = rect.top + rect.height * 0.5;
  const halfHeight = rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
  const metricRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const pointCount = nodeGraphTraceDisplayVisualPointCount(metricRect, buffer);
  const scratch = nodeGraphTraceDisplayScratchForSlot(slot, Math.max(0, pointCount - 1) * 36);
  const vertices = scratch.vertices;
  const pointGenerationStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  let previousX = 0;
  let previousY = 0;
  let hasPrevious = false;
  let vertexOffset = 0;
  let segmentCount = 0;
  const samplesPerPoint = (visibleSamples * drawSpan) / Math.max(1, pointCount);
  const progressFn = (index, count) => start + ((index + 0.5) / count) * drawSpan;
  const traceSamples = buildNodeGraphTraceDisplaySamples(buffer, slot, pointCount, progressFn, samplesPerPoint);
  for (let pointIndex = 0; pointIndex < (traceSamples?.length ?? 0); pointIndex += 1) {
    const s = traceSamples[pointIndex];
    const x = rect.left + s.progress * rect.width;
    const y = midY - s.value * halfHeight;
    if (hasPrevious && !s.breakBefore) {
      const segmentIndex = pointIndex - 1;
      const x1 = previousX * pixelRatio;
      const y1 = previousY * pixelRatio;
      const x2 = x * pixelRatio;
      const y2 = y * pixelRatio;
      if (Math.hypot(x2 - x1, y2 - y1) >= 0.001) {
        const age = segmentIndex / Math.max(1, pointCount - 1);
        vertexOffset = appendNodeGraphTraceDisplayBeamSegment(vertices, vertexOffset, x1, y1, x2, y2, age);
        segmentCount += 1;
      }
    }
    previousX = x;
    previousY = y;
    hasPrevious = true;
  }
  if (timing) {
    timing.pointGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - pointGenerationStartMs);
  }
  if (vertexOffset < 36) {
    return null;
  }
  return {
    pointCount,
    vertexCount: vertexOffset / 6,
    vertices,
    vertexFloatCount: vertexOffset,
  };
}

function nodeGraphModuleScopeXyBeamVertices(points, canvas, sparkSizePx = 2) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const radius = clampNodeSliderValue(Number(sparkSizePx) || 2, 1, 10) * 0.5;
  for (let index = 0; index + 1 < pixelPoints.length; index += 2) {
    const x = pixelPoints[index];
    const y = pixelPoints[index + 1];
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices([
      (((x - radius) / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
      (((x + radius) / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
    ], canvas));
  }
  return vertices;
}

function nodeGraphModuleScopeDotVertices(points, canvas, ageStart = 0, ageEnd = 1) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const count = Math.max(1, (pixelPoints.length / 2) - 1);
  const start = clampNodeSliderValue(Number(ageStart) || 0, 0, 1);
  const end = clampNodeSliderValue(Number(ageEnd) || 0, 0, 1);
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  for (let index = 0; index + 1 < pixelPoints.length; index += 2) {
    const pointIndex = index / 2;
    if (skippedPoints?.[pointIndex]) {
      continue;
    }
    const progress = pointIndex / count;
    const age = start + (end - start) * progress;
    vertices.push(pixelPoints[index], pixelPoints[index + 1], clampNodeSliderValue(age, 0, 1));
  }
  return vertices;
}

function nodeGraphModuleScopeBufferDotVertices(buffer, rect, canvas, pixelRatio, slot, options = {}) {
  const vertices = [];
  const xyPoints = nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot);
  if (xyPoints.length >= 2) {
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeDotVertices(xyPoints, canvas, 0.72, 1));
    return vertices;
  }
  for (const [start, end] of nodeGraphModuleScopeBufferProgressRanges(buffer)) {
    const points = nodeGraphModuleScopeBufferSegmentPoints(buffer, rect, canvas, pixelRatio, slot, start, end, options);
    if (points.length >= 2) {
      appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeDotVertices(points, canvas, start, end));
    }
  }
  return vertices;
}

function nodeGraphModuleScopeSpectrumBarVertices(buffer, rect, canvas, options = {}) {
  const vertices = [];
  const length = Math.max(0, buffer?.length || 0);
  if (!buffer?.nodeGraphScopeSpectrum || length <= 0 || rect.width <= 1 || rect.height <= 1) {
    return vertices;
  }
  const visibleRange = Array.isArray(options.visibleProgressRange)
    ? [
      clampNodeSliderValue(Number(options.visibleProgressRange[0]) || 0, 0, 1),
      clampNodeSliderValue(Number(options.visibleProgressRange[1]) || 0, 0, 1),
    ]
    : [0, 1];
  if (visibleRange[1] - visibleRange[0] <= 0.001) {
    return vertices;
  }
  const left = Number(rect.left) || 0;
  const right = left + (Number(rect.width) || 0);
  const bottom = (Number(rect.top) || 0) + (Number(rect.height) || 0);
  const top = Number(rect.top) || 0;
  const pushVertex = (x, y) => {
    vertices.push(
      ((x / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
    );
  };
  const firstIndex = Math.max(0, Math.floor(length * visibleRange[0]));
  const lastIndex = Math.min(length, Math.ceil(length * visibleRange[1]));
  for (let index = firstIndex; index < lastIndex; index += 1) {
    const value = clampNodeSliderValue(Number(buffer[index]) || 0, 0, 1);
    const x1 = left + (index / length) * (right - left);
    const x2 = left + ((index + 1) / length) * (right - left);
    const y = bottom - value * (bottom - top);
    pushVertex(x1, bottom);
    pushVertex(x1, y);
    pushVertex(x2, y);
    pushVertex(x1, bottom);
    pushVertex(x2, y);
    pushVertex(x2, bottom);
  }
  return vertices;
}

function applyNodeGraphModuleScopeTraceBlendMode(gl, blendMode = "laser") {
  switch (String(blendMode || "laser").trim().toLowerCase()) {
    case "solid":
      gl.blendFunc(gl.ONE, gl.ZERO);
      break;
    case "paint":
    case "led":
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      break;
    case "light":
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      break;
    case "heatmap":
    case "laser":
    default:
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
  }
}

function nodeGraphModuleScopeTraceBlendMode(slot) {
  return nodeGraphModuleScopeShaderConfigForSlot(slot).blendMode || "laser";
}

function nodeGraphModuleScopeHeatmapEnabled(slot) {
  return nodeGraphModuleScopeTraceBlendMode(slot) === "heatmap";
}

function nodeGraphModuleScopeTraceBrightness(slot, settings) {
  const brightness = settings?.brightness ?? settings?.dot1Brightness ?? nodeGraphModuleScopeDefaultSettings.brightness;
  return clampNodeSliderValue(brightness, 0, 16);
}

function nodeGraphModuleScopeTraceLineThickness(slot, settings) {
  const masterLineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const lineThickness = settings?.lineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness;
  return clampNodeSliderValue(lineThickness * masterLineThickness, 0.25, 32);
}

function invalidateNodeGraphModuleScopeTraceImageTexture() {
  const state = nodeGraphModuleScopeState.traceImageTexture;
  state.dataUrl = "";
  state.generatedKey = "";
  state.image = null;
}

function nodeGraphModuleScopeDotTextureOptions(
  core1SizeValue,
  core1BrightnessValue,
  size = 64,
  core1ColorValue = nodeGraphModuleScopeDefaultDotCores.dot1.color,
  core1BlurValue = 0,
  lineThicknessValue = nodeGraphMvp?.moduleScopeLineThickness,
) {
  if (core1SizeValue && typeof core1SizeValue === "object" && !Array.isArray(core1SizeValue)) {
    return core1SizeValue;
  }
  return {
    core1Blur: core1BlurValue,
    core1Brightness: core1BrightnessValue,
    core1Color: core1ColorValue,
    core1Size: core1SizeValue,
    lineThickness: lineThicknessValue,
    size,
  };
}

function nodeGraphModuleScopeGeneratedDotTextureData(...args) {
  const options = nodeGraphModuleScopeDotTextureOptions(...args);
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(options.core1Size, nodeGraphModuleScopeDefaultDotCores.dot1.size);
  const core1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(options.core1Brightness, nodeGraphModuleScopeDefaultDotCores.dot1.brightness);
  const core1Color = nodeGraphScopeHexColorToRgb(
    normalizeNodeGraphModuleScopeDotCoreColor(
      options.core1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
      nodeGraphModuleScopeDefaultDotCores.dot1.color,
    ),
  );
  const core1Blur = normalizeNodeGraphModuleScopeDotBlur(options.core1Blur, 0);
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    options.lineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const size = Math.max(1, Math.min(512, Math.round(Number(options.size) || 64)));
  const finalCore1Size = core1Size * lineThickness;
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) * 0.5;
  const dotDiameterPx = Math.max(1, core1Size);
  const core1Radius = clampNodeSliderValue(finalCore1Size * 0.5, 0.005, 20);
  const core1Falloff = 2.6 / Math.max(0.0001, core1Radius * core1Radius);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x - center) / center) * dotDiameterPx * 0.5;
      const dy = ((y - center) / center) * dotDiameterPx * 0.5;
      const distanceSquared = dx * dx + dy * dy;
      const core1Mask = nodeGraphModuleScopeDotBlurMask(distanceSquared, core1Radius, core1Blur);
      const core1Energy = Math.exp(-distanceSquared * core1Falloff) * core1Brightness * core1Mask;
      const energy = clampNodeSliderValue(core1Energy, 0, 1);
      const red = clampNodeSliderValue(core1Color[0], 0, 1);
      const green = clampNodeSliderValue(core1Color[1], 0, 1);
      const blue = clampNodeSliderValue(core1Color[2], 0, 1);
      const alpha = Math.round(energy * 255);
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(red * 255);
      pixels[index + 1] = Math.round(green * 255);
      pixels[index + 2] = Math.round(blue * 255);
      pixels[index + 3] = alpha;
    }
  }
  return pixels;
}

function nodeGraphModuleScopeGeneratedDotTexture(renderer) {
  const state = nodeGraphModuleScopeState.traceImageTexture;
  const core1Enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(
    nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
    nodeGraphModuleScopeDefaultDotCores.dot1.size,
  );
  const core1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(
    nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
    nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
  );
  const core1Color = normalizeNodeGraphModuleScopeDotCoreColor(
    nodeGraphMvp?.moduleScopeDotCore1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
    nodeGraphModuleScopeDefaultDotCores.dot1.color,
  );
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const core1Blur = 0;
  const key = `generated:${core1Enabled}:${core1Size.toFixed(3)}:${core1Brightness.toFixed(3)}:${core1Color}:${core1Blur.toFixed(3)}:${lineThickness.toFixed(3)}`;
  if (state.generatedKey === key && state.texture) {
    return state.texture;
  }
  const { gl } = renderer;
  if (!state.texture) {
    state.texture = gl.createTexture();
  }
  state.dataUrl = "";
  state.generatedKey = key;
  state.image = null;
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    64,
    64,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    nodeGraphModuleScopeGeneratedDotTextureData({
      core1Blur,
      core1Brightness: core1Enabled ? core1Brightness : 0,
      core1Color,
      core1Size,
      lineThickness,
      size: 64,
    }),
  );
  return state.texture;
}

function nodeGraphModuleScopeTraceImageTexture(renderer) {
  const dataUrl = typeof nodeGraphTraceImageDataUrl === "function" ? nodeGraphTraceImageDataUrl() : "";
  const state = nodeGraphModuleScopeState.traceImageTexture;
  if (!dataUrl) {
    return nodeGraphModuleScopeGeneratedDotTexture(renderer);
  }
  const { gl } = renderer;
  state.generatedKey = "";
  if (state.dataUrl === dataUrl && state.texture && state.image?.complete) {
    return state.texture;
  }
  if (state.dataUrl !== dataUrl) {
    state.dataUrl = dataUrl;
    state.image = new Image();
    state.image.onload = () => {
      if (state.dataUrl !== dataUrl) {
        return;
      }
      if (!state.texture) {
        state.texture = gl.createTexture();
      }
      gl.bindTexture(gl.TEXTURE_2D, state.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.image);
      scheduleNodeGraphModuleScopeDraw();
    };
    state.image.src = dataUrl;
  }
  return state.image?.complete ? state.texture : null;
}

function nodeGraphModuleScopeDotSizeScale() {
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(
    nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
    nodeGraphModuleScopeDefaultDotCores.dot1.size,
  );
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  return clampNodeSliderValue(core1Size * lineThickness, 0.01, 40);
}

function nodeGraphModuleScopeTraceDotSizeScale(dotSize, fallback = 1) {
  const size = normalizeNodeGraphModuleScopeDotCoreSize(dotSize, fallback);
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  return clampNodeSliderValue(size * lineThickness, 0.01, 40);
}

function nodeGraphModuleScopeDotBlurMask(distanceSquared, radius, blurValue = 0) {
  const radiusValue = Math.max(0.0001, Number(radius) || 0.0001);
  const blur = normalizeNodeGraphModuleScopeDotBlur(blurValue, 0);
  const normalizedDistance = Math.sqrt(Math.max(0, Number(distanceSquared) || 0)) / radiusValue;
  if (normalizedDistance >= 1) {
    return 0;
  }
  if (blur <= 0) {
    return 1;
  }
  const crispEdge = Math.max(0.0001, blur * 0.35);
  const crispStart = 1 - crispEdge;
  const edgeProgress = clampNodeSliderValue((normalizedDistance - crispStart) / crispEdge, 0, 1);
  const crisp = 1 - (edgeProgress * edgeProgress * (3 - 2 * edgeProgress));
  const gaussianSharpness = 2.2 + (1 - blur) * 10;
  const edgeEnergy = Math.exp(-gaussianSharpness);
  const gaussian = clampNodeSliderValue(
    (Math.exp(-gaussianSharpness * normalizedDistance * normalizedDistance) - edgeEnergy) /
      Math.max(0.0001, 1 - edgeEnergy),
    0,
    1,
  );
  return crisp * (1 - blur) + gaussian * blur;
}

function nodeGraphModuleScopeClippedPixelRect(canvas, rect, pixelRatio = window.devicePixelRatio || 1) {
  const rectLeft = Number(rect?.left) || 0;
  const rectTop = Number(rect?.top) || 0;
  const rectRight = rectLeft + (Number(rect?.width) || 0);
  const rectBottom = rectTop + (Number(rect?.height) || 0);
  const left = Math.max(0, Math.min(canvas.width, Math.floor(rectLeft * pixelRatio)));
  const top = Math.max(0, Math.min(canvas.height, Math.floor(rectTop * pixelRatio)));
  const right = Math.max(0, Math.min(canvas.width, Math.ceil(rectRight * pixelRatio)));
  const bottom = Math.max(0, Math.min(canvas.height, Math.ceil(rectBottom * pixelRatio)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
  };
}

function drawNodeGraphModuleScopeBufferWebGl(renderer, rect, buffer, pixelRatio, slot, options = {}) {
  const { canvas, gl } = renderer;
  const visibleRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const clipRect = nodeGraphModuleScopeClippedPixelRect(canvas, visibleRect, pixelRatio);
  if (!clipRect) {
    return;
  }
  if (buffer?.nodeGraphScopeSpectrum) {
    drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options);
    return;
  }
  const traceThicknessPx = Math.max(1, Number(options.thicknessPx) || 1);
  const fixedDotSizeRatio = Number(buffer?.nodeGraphScopeFixedDotSizeRatio);
  const fixedDotSizePx = Number.isFinite(fixedDotSizeRatio) && fixedDotSizeRatio > 0
    ? Math.max(1, Math.min(visibleRect.width, visibleRect.height) * clampNodeSliderValue(fixedDotSizeRatio, 0.01, 1))
    : 0;
  const requestedDotSizeScale = Number(options.dotSizeScale);
  const dotSizeScale = Number.isFinite(requestedDotSizeScale) && requestedDotSizeScale > 0
    ? requestedDotSizeScale
    : nodeGraphModuleScopeDotSizeScale();
  const dotThicknessPx = Math.max(
    1,
    fixedDotSizePx || (traceThicknessPx * dotSizeScale),
  );
  const safeDotThicknessPx = Math.min(512, dotThicknessPx * pixelRatio);
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace" && !buffer?.nodeGraphScopeXy && !buffer?.nodeGraphScopeSpectrum) {
    const traceGeometry = buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options);
    if (!traceGeometry) {
      return;
    }
    recordNodeGraphModuleScopeRenderMetrics(traceGeometry.pointCount, traceGeometry.vertexCount);
    if (options.traceTiming) {
      options.traceTiming.passes += 1;
      options.traceTiming.points += traceGeometry.pointCount;
      options.traceTiming.vertices += traceGeometry.vertexCount;
    }
    gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
    gl.useProgram(renderer.beamProgram);
    gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
    gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1));
    gl.uniform1f(renderer.beamSizeLocation, safeDotThicknessPx);
    const intensity = Number(options.intensity);
    gl.uniform1f(renderer.beamIntensityLocation, Number.isFinite(intensity) ? Math.max(0, intensity) : 0.1);
    const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
    gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    const glBufferDataStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    gl.bufferData(
      gl.ARRAY_BUFFER,
      traceGeometry.vertices.subarray(0, traceGeometry.vertexFloatCount),
      gl.STREAM_DRAW,
    );
    if (options.traceTiming) {
      options.traceTiming.glBufferDataMs += Math.max(0, nodeGraphModuleScopeNowMs() - glBufferDataStartMs);
    }
    gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(renderer.beamStartLocation);
    gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(renderer.beamEndLocation);
    gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
    gl.enableVertexAttribArray(renderer.beamCornerLocation);
    gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
    gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
    const drawArraysStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    gl.drawArrays(gl.TRIANGLES, 0, traceGeometry.vertexCount);
    if (options.traceTiming) {
      options.traceTiming.drawArraysMs += Math.max(0, nodeGraphModuleScopeNowMs() - drawArraysStartMs);
    }
    return;
  }
  const vertices = [];
  let pointCount = 0;
  const xyPoints = nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot);
  if (xyPoints.length >= 4) {
    pointCount += xyPoints.length / 2;
    const vertexStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices(xyPoints, canvas));
    if (options.traceTiming) {
      options.traceTiming.vertexGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - vertexStartMs);
    }
  } else {
    for (const [start, end] of nodeGraphModuleScopeBufferProgressRanges(buffer)) {
      const points = nodeGraphModuleScopeBufferSegmentPoints(
        buffer,
        rect,
        canvas,
        pixelRatio,
        slot,
        start,
        end,
        options,
      );
      if (points.length >= 4) {
        pointCount += points.length / 2;
        const vertexStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
        appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices(points, canvas));
        if (options.traceTiming) {
          options.traceTiming.vertexGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - vertexStartMs);
        }
      }
    }
  }
  if (vertices.length < 36) {
    return;
  }
  if (options.traceTiming) {
    options.traceTiming.passes += 1;
    options.traceTiming.points += pointCount;
    options.traceTiming.vertices += vertices.length / 6;
  }
  recordNodeGraphModuleScopeRenderMetrics(pointCount, vertices.length / 6);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.beamProgram);
  gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
  gl.uniform1f(renderer.beamBlurLocation, 1);
  gl.uniform1f(renderer.beamSizeLocation, safeDotThicknessPx);
  const intensity = Number(options.intensity);
  gl.uniform1f(renderer.beamIntensityLocation, Number.isFinite(intensity) ? Math.max(0, intensity) : 0.1);
  const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
  gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  const glBufferDataStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  if (options.traceTiming) {
    options.traceTiming.glBufferDataMs += Math.max(0, nodeGraphModuleScopeNowMs() - glBufferDataStartMs);
  }
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
  gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
  const drawArraysStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  if (options.traceTiming) {
    options.traceTiming.drawArraysMs += Math.max(0, nodeGraphModuleScopeNowMs() - drawArraysStartMs);
  }
}

function drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options = {}) {
  const { canvas, gl } = renderer;
  const visibleRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const clipRect = nodeGraphModuleScopeClippedPixelRect(canvas, visibleRect, pixelRatio);
  if (!clipRect) {
    return;
  }
  const vertices = nodeGraphModuleScopeSpectrumBarVertices(buffer, {
    height: rect.height * pixelRatio,
    left: rect.left * pixelRatio,
    top: rect.top * pixelRatio,
    width: rect.width * pixelRatio,
  }, canvas, options);
  if (vertices.length < 6) {
    return;
  }
  recordNodeGraphModuleScopeRenderMetrics(vertices.length / 12, vertices.length / 2);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.colorProgram);
  const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
  const intensity = clampNodeSliderValue(Number(options.intensity) || 0.1, 0, 4);
  gl.uniform4f(
    renderer.colorLocation,
    color[0] * intensity,
    color[1] * intensity,
    color[2] * intensity,
    intensity,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colorPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  gl.vertexAttribPointer(renderer.colorPositionLocation, 2, gl.FLOAT, false, 8, 0);
  gl.enableVertexAttribArray(renderer.colorPositionLocation);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
}

function drawNodeGraphModuleScopeLightShape(context, shape, centerX, centerY, radius) {
  context.beginPath();
  if (shape === "square") {
    context.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else if (shape === "diamond") {
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX + radius, centerY);
    context.lineTo(centerX, centerY + radius);
    context.lineTo(centerX - radius, centerY);
    context.closePath();
  } else {
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  }
}

function nodeGraphModuleScopeLightFillStyle(context, centerX, centerY, radius, rgb, alpha, blurValue = 0) {
  const alphaValue = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  const blur = normalizeNodeGraphModuleScopeDotBlur(blurValue, 0);
  if (blur <= 0) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`;
  }
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(0.0001, radius));
  const middleStop = clampNodeSliderValue(0.22 + (1 - blur) * 0.58, 0.22, 0.8);
  gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`);
  gradient.addColorStop(middleStop, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`);
  gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  return gradient;
}

// Persistent canvas cache — canvases survive DOM rebuilds (parameter changes,
// module re-renders). Keyed by nodeId so when a module's DOM is torn down and
// rebuilt, the same canvas is re-attached instead of creating a fresh blank one.
const nodeGraphModuleScopePersistentCanvases = new Map();

// Watch for canvas removals (module DOM rebuilds) and immediately re-attach
// so there's no visual gap between rebuild and next scope snapshot.
(function setupNodeGraphModuleScopeCanvasRescue() {
  if (typeof MutationObserver === "undefined") return;
  const rescue = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        // Find any cached canvases that were just removed
        for (const el of [node, ...(node.querySelectorAll?.(".node-module-scope-local-fallback-canvas") || [])]) {
          if (el.className !== "node-module-scope-local-fallback-canvas" && el.nodeName !== "CANVAS") continue;
          for (const [nid, cached] of nodeGraphModuleScopePersistentCanvases) {
            if (cached !== el) continue;
            // Find the node's current scope element and re-attach the canvas immediately
            const scopeEl = document.querySelector(`[data-node-id="${nid}"] .node-module-scope`);
            if (scopeEl && cached.parentNode !== scopeEl) {
              scopeEl.appendChild(cached);
            }
            break;
          }
        }
      }
    }
  });
  // Observe the wiring panel (workspace root) for any DOM changes
  const root = document.getElementById("nodeWiringPanel") || document.body;
  rescue.observe(root, { childList: true, subtree: true });
})();

function nodeGraphModuleScopeLocalFallbackCanvas(slot) {
  const screenElement = slot?.scopeElement;
  const nodeId = slot?.nodeId;
  if (!screenElement) {
    return null;
  }
  // Try to find an existing canvas in the DOM first.
  let canvas = screenElement.querySelector(":scope > .node-module-scope-local-fallback-canvas");
  if (canvas) {
    return canvas;
  }
  // DOM rebuild may have destroyed the old canvas — re-attach the cached one.
  if (nodeId && nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
    canvas = nodeGraphModuleScopePersistentCanvases.get(nodeId);
    screenElement.appendChild(canvas);
    return canvas;
  }
  // Brand new canvas — create and cache it.
  canvas = document.createElement("canvas");
  canvas.className = "node-module-scope-local-fallback-canvas";
  canvas.setAttribute("aria-hidden", "true");
  screenElement.appendChild(canvas);
  if (nodeId) {
    nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
  }
  return canvas;
}

function syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return false;
  }
  const { width, height } = size;
  if (canvas.width !== width || canvas.height !== height) {
    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    let previousCanvas = null;
    if (previousWidth > 0 && previousHeight > 0) {
      previousCanvas = document.createElement("canvas");
      previousCanvas.width = previousWidth;
      previousCanvas.height = previousHeight;
      const previousContext = previousCanvas.getContext("2d");
      if (previousContext) {
        previousContext.drawImage(canvas, 0, 0);
      }
    }
    canvas.width = width;
    canvas.height = height;
    const context = previousCanvas ? canvas.getContext("2d") : null;
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(previousCanvas, 0, 0, previousWidth, previousHeight, 0, 0, width, height);
    }
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}

function clearNodeGraphModuleScopeLocalFallback(slot) {
  const canvas = slot?.scopeElement?.querySelector?.(":scope > .node-module-scope-local-fallback-canvas");
  const context = canvas?.getContext?.("2d");
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function clearNodeGraphModuleScopeLocalFallbackForNode(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  clearNodeGraphModuleScopeLocalFallback(nodeGraphModuleScopeState.slots.get(id));
}

function applyNodeGraphModuleScopeCanvasAnalogFade(context, canvas, settings) {
  if (!canvas?.width || !canvas?.height || !context) {
    return;
  }
  const fadeAlpha = clampNodeSliderValue(Number(settings?.fadeAlpha) || 0.08, 0.006, 0.18);
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function nodeGraphModuleScopeFallbackBufferView(buffer, limit = 2048) {
  if (!buffer) {
    return buffer;
  }
  const safeLimit = Math.max(16, Math.min(1024, Math.floor(Number(limit) || 384)));
  if (buffer.nodeGraphScopeXy) {
    return {
      ...buffer,
      nodeGraphScopeVisualPointLimit: Math.min(
        safeLimit,
        Math.max(2, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || safeLimit)),
      ),
    };
  }
  buffer.nodeGraphScopeVisualPointLimit = Math.min(
    safeLimit,
    Math.max(2, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || safeLimit)),
  );
  return buffer;
}

function nodeGraphModuleScopeCanvasRgba(rgb, alpha) {
  const color = Array.isArray(rgb) ? rgb : [1, 1, 1];
  const opacity = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${opacity})`;
}

function drawNodeGraphModuleScopeCanvasDotPath(context, points, proxyCanvas, pixelRatio, heatmapMode = false, slot = null) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, proxyCanvas);
  if (pixelPoints.length < 4) {
    return false;
  }
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const strokeUnit = Math.max(1, lineThickness * Math.max(1, pixelRatio));
  const rawValues = Array.isArray(points?.nodeGraphScopeRawValues)
    ? points.nodeGraphScopeRawValues
    : null;
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points);
  const colors = heatmapMode ? nodeGraphModuleScopeHeatmapTraceColors() : nodeGraphModuleScopeDotStyle(slot, null);
  const coreBrightness = heatmapMode
    ? (nodeGraphMvp?.moduleScopeDotCore1Enabled === false ? 0 : 1)
    : colors.coreBrightness / nodeGraphModuleScopeDefaultDotCores.dot1.brightness;
  let segmentCount = 0;

  context.save();
  context.globalCompositeOperation = "lighter";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const drawConnectedStroke = (lineWidth, shadowBlur, rgb, alpha) => {
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = lineWidth;
    context.shadowBlur = shadowBlur;
    context.shadowColor = nodeGraphModuleScopeCanvasRgba(rgb, alpha * 0.65);
    context.strokeStyle = nodeGraphModuleScopeCanvasRgba(rgb, alpha);
    let pathOpen = false;
    let localSkipThroughSegment = -1;
    for (let index = 0; index + 3 < pixelPoints.length; index += 2) {
      const segmentIndex = index / 2;
      if (skippedPoints?.[segmentIndex] || skippedPoints?.[segmentIndex + 1]) {
        pathOpen = false;
        continue;
      }
      if (skipSamples > 0 && rawValues && segmentIndex + 1 < rawValues.length) {
        const previousRaw = Number(rawValues[segmentIndex]);
        const currentRaw = Number(rawValues[segmentIndex + 1]);
        if (
          Number.isFinite(previousRaw) &&
          Number.isFinite(currentRaw) &&
          Math.abs(currentRaw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold
        ) {
          localSkipThroughSegment = Math.max(localSkipThroughSegment, segmentIndex + skipSamples - 1);
        }
      }
      if (segmentIndex <= localSkipThroughSegment) {
        pathOpen = false;
        continue;
      }
      const x1 = pixelPoints[index];
      const y1 = pixelPoints[index + 1];
      const x2 = pixelPoints[index + 2];
      const y2 = pixelPoints[index + 3];
      if (Math.hypot(x2 - x1, y2 - y1) < 0.001) {
        continue;
      }
      if (!pathOpen) {
        context.moveTo(x1, y1);
        pathOpen = true;
      }
      context.lineTo(x2, y2);
      segmentCount += 1;
    }
    context.stroke();
  };

  if (coreBrightness > 0) {
    drawConnectedStroke(
      strokeUnit * 1.65,
      strokeUnit * 1.25,
      colors.coreColor ?? colors.core,
      (heatmapMode ? 0.5 : 0.76) * coreBrightness,
    );
  }
  context.restore();
  recordNodeGraphModuleScopeRenderMetrics(points.length / 2, segmentCount);
  return segmentCount > 0;
}

function nodeGraphModuleScopeLightSpriteKey(options) {
  return [
    options.shape,
    Math.round(options.radius * 1000) / 1000,
    options.centerRgb.join(","),
    Math.round(options.centerAlphaFactor * 1000) / 1000,
    Math.round(options.centerBlur * 1000) / 1000,
    options.usesShader ? "shader" : "normal",
  ].join("|");
}

function nodeGraphModuleScopeTrimLightSpriteCache() {
  const cache = nodeGraphModuleScopeState.lightSpriteTextures;
  const maxSprites = 96;
  while (cache.size > maxSprites) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) {
      break;
    }
    cache.delete(firstKey);
  }
}

function nodeGraphModuleScopeLightSpriteTexture(options) {
  const radius = Math.max(0.5, Number(options.radius) || 0.5);
  const size = Math.max(2, Math.ceil(radius * 2));
  const key = nodeGraphModuleScopeLightSpriteKey({ ...options, radius });
  const cached = nodeGraphModuleScopeState.lightSpriteTextures.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const center = size * 0.5;
  const drawRadius = Math.max(0.5, Math.min(center, radius));
  context.save();
  context.globalCompositeOperation = options.usesShader ? "source-over" : "lighter";
  context.fillStyle = nodeGraphModuleScopeLightFillStyle(
    context,
    center,
    center,
    drawRadius,
    options.centerRgb,
    options.centerAlphaFactor,
    options.centerBlur,
  );
  drawNodeGraphModuleScopeLightShape(context, options.shape, center, center, drawRadius);
  context.fill();
  context.restore();

  const sprite = { canvas, size };
  nodeGraphModuleScopeState.lightSpriteTextures.set(key, sprite);
  nodeGraphModuleScopeTrimLightSpriteCache();
  return sprite;
}

function nodeGraphModuleScopeEmissiveShaderRgb(rgb, brightness) {
  const values = (rgb || []).map((component) => Math.round(clampNodeSliderValue(component, 0, 255)));
  const maxChannel = Math.max(0, ...values);
  if (maxChannel <= 0) {
    return values;
  }
  const targetMax = clampNodeSliderValue(72 + Math.max(0, Number(brightness) || 0) * 144, 72, 255);
  const scale = Math.max(1, targetMax / maxChannel);
  return values.map((component) => Math.round(clampNodeSliderValue(component * scale, 0, 255)));
}

function drawNodeGraphModuleScopeLightDisplay(context, rect, buffer, pixelRatio, slot) {
  if (!context || !buffer?.nodeGraphScopeLightDisplay) {
    return;
  }
  const nodeId = String(slot?.nodeId || "");
  const settings = nodeGraphModuleScopeSetting(nodeId);
  const dt = clampNodeSliderValue(Number(nodeGraphModuleScopeState.animationDeltaSeconds) || (1 / 60), 1 / 240, 1 / 15);
  const target = clampNodeSliderValue(Number(buffer.nodeGraphScopeLightTarget) || 0, 0, 1);
  const releaseSeconds = Number(buffer.nodeGraphScopeLightReleaseSeconds);
  const hasRelease = Number.isFinite(releaseSeconds) && releaseSeconds > 0;
  let brightness = target;
  if (hasRelease) {
    const state = nodeGraphModuleScopeState.lightDisplayStates.get(nodeId) || { brightness: 0 };
    if (target >= state.brightness) {
      state.brightness = target;
    } else {
      const coefficient = 1 - Math.exp(-dt / Math.max(0.001, releaseSeconds));
      state.brightness = clampNodeSliderValue(state.brightness + (target - state.brightness) * coefficient, 0, 1);
    }
    nodeGraphModuleScopeState.lightDisplayStates.set(nodeId, state);
    brightness = state.brightness;
  } else if (!buffer.nodeGraphScopeLightInstant) {
    const state = nodeGraphModuleScopeState.lightDisplayStates.get(nodeId) || { brightness: 0 };
    const tau = target > state.brightness ? 0.008 : 0.018;
    const coefficient = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    state.brightness = clampNodeSliderValue(state.brightness + (target - state.brightness) * coefficient, 0, 1);
    nodeGraphModuleScopeState.lightDisplayStates.set(nodeId, state);
    brightness = state.brightness;
  } else {
    nodeGraphModuleScopeState.lightDisplayStates.delete(nodeId);
  }
  if (brightness <= 0.002) {
    return;
  }

  const lightStyle = nodeGraphModuleScopeLightShaderStyle(slot, buffer);
  const centerColor = lightStyle.centerColor;
  const centerRgb = nodeGraphScopeHexColorToRgb(centerColor)
    .map((component) => Math.round(clampNodeSliderValue(component, 0, 1) * 255));
  const core1Size = lightStyle.centerSize;
  const core1Brightness = lightStyle.centerBrightness;
  const core1Blur = lightStyle.centerBlur;
  const availableSize = Math.max(1, Math.min(rect.width, rect.height));
  const centerSizeRatio = clampNodeSliderValue(core1Size, 0, 1);
  const size = Math.max(1, availableSize * centerSizeRatio);
  const centerX = (rect.left + rect.width * 0.5) * pixelRatio;
  const centerY = (rect.top + rect.height * 0.5) * pixelRatio;
  const radius = size * pixelRatio * 0.5;
  const masterBrightness = nodeGraphModuleScopeTraceBrightness(slot, settings);
  const alpha = clampNodeSliderValue(brightness * masterBrightness, 0, 1);
  const frameBrightnessMode = buffer.nodeGraphScopeFrameBrightness === true;
  const shape = ["circle", "square", "diamond"].includes(buffer.nodeGraphScopeLightShape)
    ? buffer.nodeGraphScopeLightShape
    : "circle";
  const centerAlphaScale = Number.isFinite(Number(buffer.nodeGraphScopeLightCenterAlphaScale))
    ? clampNodeSliderValue(Number(buffer.nodeGraphScopeLightCenterAlphaScale), 0, 4)
    : lightStyle.usesShader ? 1 : 0.5;
  const sharedFrameAlphaFactor = frameBrightnessMode ? 1 : null;
  const centerAlphaFactor = sharedFrameAlphaFactor ?? clampNodeSliderValue(core1Brightness * centerAlphaScale, 0, 1);
  const visibleCenterRgb = lightStyle.usesShader
    ? nodeGraphModuleScopeEmissiveShaderRgb(centerRgb, core1Brightness)
    : centerRgb;
  const sprite = nodeGraphModuleScopeLightSpriteTexture({
    centerAlphaFactor,
    centerBlur: core1Blur,
    centerRgb: visibleCenterRgb,
    radius,
    shape,
    usesShader: lightStyle.usesShader,
  });
  if (!sprite) {
    return;
  }

  context.save();
  context.globalCompositeOperation = lightStyle.usesShader ? "source-over" : "lighter";
  context.globalAlpha = alpha;
  context.drawImage(sprite.canvas, centerX - sprite.size * 0.5, centerY - sprite.size * 0.5);
  context.restore();
}

function drawNodeGraphModuleScopeLightDisplays(items, pixelRatio) {
  const canvas = nodeGraphModuleScopeLightCanvas();
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const item of items || []) {
    drawNodeGraphModuleScopeLightDisplay(context, item.scopeRect, item.buffer, pixelRatio, item.slot);
  }
}

function nodeGraphModuleScopeScreenItems(workspace, canvas, pixelRatio) {
  const workspaceRect = workspace.getBoundingClientRect();
  const viewportRect = {
    height: workspaceRect.height,
    left: 0,
    top: 0,
    width: workspaceRect.width,
  };
  const slotDebug = [];
  const items = nodeGraphVisibleModuleScopeSlots()
    .map((slot) => {
      const buffer = nodeGraphModuleScopeDisplayBuffer(
        slot,
        nodeGraphModuleScopeCapturedBufferForSlot(slot),
      );
      const entry = {
        bufferLength: buffer?.length || 0,
        displayType: nodeGraphModuleDisplayRendererForSlot(slot),
        nodeId: slot.nodeId,
        rectHeight: 0,
        rectWidth: 0,
        type: slot.type,
      };
      if (!buffer) {
        entry.skip = "no-buffer";
        slotDebug.push(entry);
        renderNodeGraphModuleScopeAnalyzer(slot, null);
        clearNodeGraphModuleScopeLocalFallback(slot);
        return null;
      }
      const rect = slot.scopeElement.getBoundingClientRect();
      entry.rectHeight = rect.height;
      entry.rectWidth = rect.width;
      const screenRect = {
        height: rect.height,
        left: rect.left - workspaceRect.left,
        top: rect.top - workspaceRect.top,
        width: rect.width,
      };
      const drawRect = nodeGraphModuleScopeDrawingRect(screenRect, buffer, slot);
      const zoomScale = nodeGraphModuleScopeZoomScale();
      const visibleGeometry = nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale);
      if (!visibleGeometry) {
        entry.skip = "offscreen";
        slotDebug.push(entry);
        renderNodeGraphModuleScopeAnalyzer(slot, null);
        clearNodeGraphModuleScopeLocalFallback(slot);
        return null;
      }
      entry.skip = "";
      slotDebug.push(entry);
      return {
        buffer,
        displayRect: screenRect,
        drawRect,
        fullDrawRect: drawRect,
        nodeId: slot.nodeId,
        screenElement: slot.scopeElement,
        screenRect,
        scopeRect: {
          height: drawRect.height,
          left: drawRect.left,
          sampleHeight: nodeGraphModuleScopeUnzoomedLength(drawRect.height, zoomScale),
          sampleWidth: nodeGraphModuleScopeUnzoomedLength(drawRect.width, zoomScale),
          top: drawRect.top,
          width: drawRect.width,
        },
        settings: nodeGraphModuleScopeEffectiveSettingForSlot(slot),
        slot,
        type: slot.type,
        visibleDrawRect: visibleGeometry.visibleDrawRect,
        visibleProgressRange: visibleGeometry.visibleProgressRange,
        visibleScopeRect: visibleGeometry.visibleScopeRect,
      };
    })
    .filter(Boolean);
  if (nodeGraphModuleScopeState.renderDebug) {
    nodeGraphModuleScopeState.renderDebug.scopeSlots = slotDebug;
  }
  return items;
}

function nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems) {
  if (!Array.isArray(visibleItems) || !visibleItems.length) {
    return false;
  }
  let traceCount = 0;
  for (const item of visibleItems) {
    const slot = item?.slot;
    if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
      return false;
    }
    traceCount += 1;
    const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
    if (!nodeGraphTraceDisplaySignatureUnchanged(slot, item, item.buffer, settings)) {
      return false;
    }
  }
  return traceCount > 0;
}

function drawNodeGraphTraceDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  if (!slot || !buffer?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, buffer);
  drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio);
}

function nodeGraphOscilloscopeLatestSample(buffer, fallback = 0) {
  if (buffer?.nodeGraphScopeXy) {
    return fallback;
  }
  for (let index = (buffer?.length || 0) - 1; index >= 0; index -= 1) {
    const sample = Number(buffer[index]);
    if (Number.isFinite(sample)) {
      return sample;
    }
  }
  return fallback;
}

// The beam fragment shader converts its uSize uniform into a core radius via
// `radius = max(uSize * 0.34, 0.0001)`. Callers that want a specific on-screen
// radius have to divide by this; keep the two in step.
const NODE_GRAPH_BEAM_SIZE_TO_RADIUS = 0.34;

function drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y1, x2, y2, options = {}) {
  const { canvas, gl } = renderer;
  const clipRect = nodeGraphModuleScopeClippedPixelRect(
    canvas,
    item.visibleScopeRect || item.scopeRect,
    pixelRatio,
  );
  if (!clipRect) {
    return;
  }
  const vertices = new Float32Array(36);
  appendNodeGraphTraceDisplayBeamSegment(
    vertices,
    0,
    x1 * pixelRatio,
    y1 * pixelRatio,
    x2 * pixelRatio,
    y2 * pixelRatio,
    1,
  );
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.beamProgram);
  gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
  gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1));
  gl.uniform1f(renderer.beamSizeLocation, Math.max(1, (Number(options.thicknessPx) || 1) * pixelRatio));
  gl.uniform1f(renderer.beamIntensityLocation, Math.max(0, Number(options.intensity) || 0));
  const color = Array.isArray(options.color) ? options.color : [0.45, 0.92, 1];
  gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
  gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  recordNodeGraphModuleScopeRenderMetrics(1, 6);
}

function drawNodeGraphDotOscilloscopeItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  const rect = item?.scopeRect;
  if (!buffer || !rect) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const settings = nodeGraphZeroDBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  clearNodeGraphModuleScopeLocalFallback(item.slot);
  const brightness = clampNodeSliderValue(
    Number(settings.bipolarBrightness ? buffer.nodeGraphScopeBipolarLightTarget : buffer.nodeGraphScopeLightTarget) || 0,
    0,
    1,
  );
  if (brightness <= 0.002) {
    return;
  }
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const centerX = square.left + square.width * 0.5;
  const centerY = square.top + square.height * 0.5;
  const dotSpace = Math.min(square.width, square.height);
  // The beam shader turns uSize into a core RADIUS of uSize * 0.34 (see the
  // beam fragment shader: `radius = max(uSize * 0.34, 0.0001)`), so passing
  // the square's side straight through as the thickness lit a disc only about
  // 0.68 of the side across -- Dot size 1 visibly failed to fill the display.
  //
  // Size 1 = the INSCRIBED circle: radius on the half-side, so the disc is
  // exactly as wide as the display and just touches all four edges. Going
  // further (out to the half-diagonal, which would light the corners too)
  // only buys those corners at the cost of the scissor slicing flat chords
  // off the disc, which reads as harsh clipping rather than a bigger dot.
  const halfSide = dotSpace * 0.5;
  const innerThickness = Math.max(
    0,
    (clampNodeSliderValue(settings.dot1Size, 0, 1) * halfSide) / NODE_GRAPH_BEAM_SIZE_TO_RADIUS,
  );
  const dotHalfLength = 0.01;
  if (settings.dot1Enabled !== false && settings.dot1Brightness > 0 && innerThickness > 0) {
    drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, centerX - dotHalfLength, centerY, centerX + dotHalfLength, centerY, {
      blur: settings.lineThickness,
      color: nodeGraphScopeHexColorToRgb(settings.dot1Color),
      intensity: brightness * settings.dot1Brightness,
      thicknessPx: innerThickness,
    });
  }
}

function drawNodeGraphValueOscilloscopeCanvasLine(context, points, color, brightness, thickness, blur) {
  if (!context || !points || !(brightness > 0) || !(thickness > 0)) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(color);
  const alpha = clampNodeSliderValue(Number(brightness) || 0, 0, 4);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "butt";
  context.lineJoin = "round";
  context.lineWidth = thickness;
  context.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, alpha).toFixed(4)})`;
  context.shadowColor = context.strokeStyle;
  context.shadowBlur = Math.max(0, thickness * clampNodeSliderValue(Number(blur) || 0, 0, 1) * 2.5);
  context.beginPath();
  context.moveTo(points.x1, points.y1);
  context.lineTo(points.x2, points.y2);
  context.stroke();
  context.restore();
}

function nodeGraphValueOscilloscopeTrailSamples(buffer) {
  if (!buffer?.length) {
    return [];
  }
  const samples = [];
  for (let index = 0; index < buffer.length; index += 1) {
    samples.push(clampNodeSliderValue(Number(buffer[index]) || 0, -1, 1));
  }
  return samples;
}

function drawNodeGraphValueOscilloscopeTrail(item, pixelRatio, geometry, settings) {
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings);
  const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1);
  if (burn <= 0 || !geometry) {
    return;
  }
  const screenRect = item?.screenRect;
  if (!screenRect || !(screenRect.width > 0) || !(screenRect.height > 0)) {
    return;
  }
  // Map workspace/screen face coords → buffer pixels. Multiplying by dpr alone
  // is wrong under zoom (screen rect grows, buffer stays layout×dpr).
  const toCanvas = (x, y) => ({
    x: ((x - screenRect.left) / screenRect.width) * canvas.width,
    y: ((y - screenRect.top) / screenRect.height) * canvas.height,
  });
  const samples = nodeGraphValueOscilloscopeTrailSamples(item?.buffer);
  if (!samples.length) {
    return;
  }
  const sampleLines = samples.map((sample) => {
    const y = geometry.squareTop + geometry.squareHeight * 0.5 - sample * geometry.squareHeight * 0.44;
    return {
      end: toCanvas(geometry.x2, y),
      start: toCanvas(geometry.x1, y),
    };
  });
  const lineBase = Math.max(1, Math.min(canvas.width, canvas.height));
  const innerThickness = Math.max(0, lineBase * clampNodeSliderValue(settings.dot1Size, 0, 1));
  const capThickness = Math.max(0, lineBase * clampNodeSliderValue(settings.capSize, 0, 1));
  const trailIntensity = (0.04 + burn * 0.22) / Math.max(1, Math.sqrt(sampleLines.length));
  if (settings.dot1Enabled !== false) {
    for (const line of sampleLines) {
      drawNodeGraphValueOscilloscopeCanvasLine(
        context,
        { x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y },
        nodeGraphScopeHexColorToRgb(settings.color),
        settings.brightness * trailIntensity,
        innerThickness,
        settings.lineThickness,
      );
    }
  }
  if (settings.capEnabled === false || !(geometry.capLength > 0) || !(capThickness > 0)) {
    return;
  }
  for (const sample of samples) {
    const y = geometry.squareTop + geometry.squareHeight * 0.5 - sample * geometry.squareHeight * 0.44;
    for (const capX of [geometry.x1, geometry.x2]) {
      const capStart = toCanvas(capX, y - geometry.capLength);
      const capEnd = toCanvas(capX, y + geometry.capLength);
      if (settings.dot1Enabled !== false) {
        drawNodeGraphValueOscilloscopeCanvasLine(
          context,
          { x1: capStart.x, y1: capStart.y, x2: capEnd.x, y2: capEnd.y },
          nodeGraphScopeHexColorToRgb(settings.color),
          settings.brightness * trailIntensity,
          capThickness,
          settings.lineThickness,
        );
      }
    }
  }
}

function drawNodeGraphValueOscilloscopeItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  if (!rect) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, item.buffer);
  const node = nodeGraphModuleScopeNodeForSlot(item.slot);
  const settings = nodeGraphTraceDisplaySettingsForNode(node);
  const value = clampNodeSliderValue(nodeGraphOscilloscopeLatestSample(item?.buffer, 0), -1, 1);
  const lineLength = clampNodeSliderValue(settings.lineLength, 0, 1);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const displayLeft = Number(rect.left) || 0;
  const displayWidth = Math.max(1, Number(rect.width) || 1);
  const centerX = displayLeft + displayWidth * 0.5;
  const halfLine = displayWidth * 0.5 * lineLength;
  const x1 = centerX - halfLine;
  const x2 = centerX + halfLine;
  const y = square.top + square.height * 0.5 - value * square.height * 0.44;
  const span = Math.max(1, x2 - x1);
  const lineBase = Math.max(1, Math.min(square.width, square.height));
  const innerThickness = Math.max(0, lineBase * clampNodeSliderValue(settings.dot1Size, 0, 1));
  const capLength = square.height * clampNodeSliderValue(settings.capLength, 0, 1) * 0.5;
  const capThickness = Math.max(0, lineBase * clampNodeSliderValue(settings.capSize, 0, 1));
  drawNodeGraphValueOscilloscopeTrail(item, pixelRatio, {
    capLength,
    squareTop: square.top,
    squareHeight: square.height,
    squareWidth: square.width,
    x1,
    x2,
    y,
  }, settings);
  if (settings.dot1Enabled !== false && settings.brightness > 0 && innerThickness > 0) {
    const options = {
      blur: settings.lineThickness,
      color: nodeGraphScopeHexColorToRgb(settings.color),
      intensity: settings.brightness,
      thicknessPx: innerThickness,
    };
    drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y, x2, y, options);
  }
  if (settings.capEnabled !== false && capLength > 0 && capThickness > 0) {
    if (settings.dot1Enabled !== false && settings.brightness > 0) {
      const options = {
        blur: settings.lineThickness,
        color: nodeGraphScopeHexColorToRgb(settings.color),
        intensity: settings.brightness,
        thicknessPx: capThickness,
      };
      drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y - capLength, x1, y + capLength, options);
      drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x2, y - capLength, x2, y + capLength, options);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared 0–1 energy phosphor (foundation for LCD + scope burn surfaces)
//
// Burn light as a single energy channel (grayscale canvas), then map 0–1 → RGB
// with a gradient at present time. Soft edges are trivial (blur the deposit);
// color is a cheap colormap, not RGB trails.
//
// Energy buffer: R=G=B = energy*255 (luma). Decay uses destination-out.
// Deposit uses soft white ink (shadowBlur). Present samples luma → gradient.
//
// Number Readout is the first consumer; other burn paths can migrate later.
// ─────────────────────────────────────────────────────────────────────────────

function nodeGraphPhosphorEnergyEnsureCanvas(host, key, width, height) {
  if (!host || !(width > 0) || !(height > 0)) {
    return null;
  }
  let canvas = host[key];
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    host[key] = canvas;
  }
  return canvas;
}

/**
 * Per-frame energy erase amount in 0–1 (destination-out alpha).
 * Decay alone drives fade rate. Burn is deposit gain only — do not cancel fade
 * with burn or small decay values become invisible under continuous re-deposit.
 */
function nodeGraphPhosphorEnergyFadeAmount(decay) {
  const d = clampNodeSliderValue(Number(decay) || 0, 0, 1);
  if (d <= 0.001) {
    return 0;
  }
  // Gentler floor so low burn can still accumulate a dim continuous trail
  // (old 0.025 min erase created a dead band near burn ~0.04).
  // At ~60fps: decay 0.3 → ~0.07/frame; decay 1 → dies in a few frames.
  return clampNodeSliderValue(0.006 + d * 0.11 + d * d * 0.32, 0.006, 0.55);
}

/**
 * Smooth mono-energy deposit gain from burn × brightness × size.
 * Monotonic, no dead zone: low burn is dim, high burn is hot — not off/on.
 */
function nodeGraphScope2dEnergyBurnDepositGain(burn, brightness, size01) {
  const b = clampNodeSliderValue(Number(burn) || 0, 0, 1);
  const br = Math.max(0, Number(brightness) || 0);
  const s = clampNodeSliderValue(Number(size01) || 0, 0, 1);
  // Slight low-end lift (pow < 1) so scrubbing 0.02→0.08 feels continuous.
  // Floor keeps a faint tip at burn 0; span covers strong dwell at burn 1.
  const burnShape = Math.pow(b, 0.78);
  const sizeFactor = 1.12 - s * 0.42;
  return Math.max(0, br * (0.022 + burnShape * 0.10) * sizeFactor);
}

/** Soft present exposure — mostly stable so burn doesn't double-attenuate. */
function nodeGraphScope2dEnergyBurnExposure(burn) {
  const b = clampNodeSliderValue(Number(burn) || 0, 0, 1);
  // Base exposure keeps low residual visible; burn only gently opens the film.
  return 1.85 + b * 2.1;
}

function nodeGraphPhosphorEnergyFade(context, width, height, burn, decay) {
  if (!context || !(width > 0) || !(height > 0)) {
    return;
  }
  const fadeAlpha = nodeGraphPhosphorEnergyFadeAmount(decay);
  if (fadeAlpha <= 0) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, width, height);
  context.restore();
}

/** Softness in buffer px for energy deposits (scales with face/font + burn). */
function nodeGraphPhosphorEnergySoftnessPx(sizePx, burn = 0.5) {
  const size = Math.max(1, Number(sizePx) || 1);
  const b = clampNodeSliderValue(Number(burn) || 0, 0, 1);
  // Always a bit of blur so residual never stamps harsh 1-bit edges.
  return Math.max(1.25, size * (0.1 + b * 0.22));
}

/**
 * Build a 0–1 → RGB gradient for phosphor presentation.
 * peakRgb: 0–255 triple (or 0–1 floats — both accepted).
 * Stops: floor → dim body → peak → hot shoulder.
 */
function nodeGraphPhosphorBuildGradientStops(peakRgb, backgroundHex = "#000000") {
  const peak = Array.isArray(peakRgb) ? peakRgb : [120, 255, 170];
  const toByte = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? Math.round(clampNodeSliderValue(n, 0, 1) * 255) : Math.round(clampNodeSliderValue(n, 0, 255));
  };
  const pr = toByte(peak[0]);
  const pg = toByte(peak[1]);
  const pb = toByte(peak[2]);
  const bg = normalizeNodeGraphTraceDisplayColor(backgroundHex, "#000000");
  const br = parseInt(bg.slice(1, 3), 16) || 0;
  const bg_ = parseInt(bg.slice(3, 5), 16) || 0;
  const bb = parseInt(bg.slice(5, 7), 16) || 0;
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  // No hot-white clip — residual stays in the phosphor hue, not harsh RGB white.
  return Object.freeze([
    Object.freeze({ t: 0, r: br, g: bg_, b: bb }),
    Object.freeze({ t: 0.18, r: mix(br, pr, 0.28), g: mix(bg_, pg, 0.28), b: mix(bb, pb, 0.28) }),
    Object.freeze({ t: 0.55, r: mix(br, pr, 0.7), g: mix(bg_, pg, 0.7), b: mix(bb, pb, 0.7) }),
    Object.freeze({ t: 1, r: pr, g: pg, b: pb }),
  ]);
}

function nodeGraphPhosphorSampleGradient(energy01, stops) {
  const e = clampNodeSliderValue(Number(energy01) || 0, 0, 1);
  const list = Array.isArray(stops) && stops.length ? stops : nodeGraphPhosphorBuildGradientStops([120, 255, 170]);
  if (e <= list[0].t) {
    return list[0];
  }
  const last = list[list.length - 1];
  if (e >= last.t) {
    return last;
  }
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    if (e <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const u = (e - a.t) / span;
      return {
        r: Math.round(a.r + (b.r - a.r) * u),
        g: Math.round(a.g + (b.g - a.g) * u),
        b: Math.round(a.b + (b.b - a.b) * u),
      };
    }
  }
  return last;
}

/**
 * Map grayscale energy canvas → colored RGBA into colorCanvas (same size).
 * Energy luma is max(R,G,B)/255. Output alpha tracks energy for lighter blit.
 */
function nodeGraphPhosphorMapEnergyToColorCanvas(energyCanvas, colorCanvas, stops) {
  if (!energyCanvas || !colorCanvas) {
    return false;
  }
  const w = energyCanvas.width;
  const h = energyCanvas.height;
  if (colorCanvas.width !== w || colorCanvas.height !== h) {
    colorCanvas.width = w;
    colorCanvas.height = h;
  }
  const ectx = energyCanvas.getContext("2d", { willReadFrequently: true });
  const cctx = colorCanvas.getContext("2d");
  if (!ectx || !cctx) {
    return false;
  }
  const src = ectx.getImageData(0, 0, w, h);
  let out = colorCanvas._phosphorMappedImageData;
  if (!out || out.width !== w || out.height !== h) {
    out = cctx.createImageData(w, h);
    colorCanvas._phosphorMappedImageData = out;
  }
  const s = src.data;
  const d = out.data;
  const gradient = stops || nodeGraphPhosphorBuildGradientStops([120, 255, 170]);
  for (let i = 0; i < s.length; i += 4) {
    // Mild gamma so mid-energy soft edges stay soft instead of posterizing bright.
    const raw = Math.max(s[i], s[i + 1], s[i + 2]) / 255;
    const energy = Math.pow(raw, 1.15);
    if (energy < 0.006) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }
    const c = nodeGraphPhosphorSampleGradient(energy, gradient);
    d[i] = c.r;
    d[i + 1] = c.g;
    d[i + 2] = c.b;
    d[i + 3] = Math.min(255, Math.round(energy * 230));
  }
  cctx.putImageData(out, 0, 0);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Readout — energy phosphor + hard LCD plate / live digits
// DSEG7 Classic: https://github.com/keshikan/DSEG (SIL OFL 1.1)
//
// Layers:
//   1) energy buffer — soft white deposits, burn/decay (0–1 luma)
//   2) gradient map of energy → phosphor color
//   3) hard LCD plate + hard current value (artist-correct segments)
//   4) unit, inner glow, inner shadow
// ─────────────────────────────────────────────────────────────────────────────
let nodeGraphNumberReadoutDsegReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphNumberReadoutDsegReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Monospace stack below if the font fails to load.
});

function nodeGraphNumberReadoutCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-number-readout-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-number-readout-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

function syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  // Fixed layout pixel grid (clientWidth × dpr). Do NOT use getBoundingClientRect
  // — that is screen-space and grows with workspace zoom (FPS death on energy
  // FBOs). CSS width/height:100% rides the zoom transform; pixelated-canvas-zoom
  // keeps the grid crisp. Never set style.width from a screen rect.
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return false;
  }
  const { width, height } = size;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    // Soft deposit mask is one-frame only. Energy residual survives real face
    // resizes via nodeGraphPhosphorEnergyGlEnsure resize+copy.
    canvas._numberReadoutEnergyMask = null;
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}

function nodeGraphNumberReadoutEnergyMaskCanvas(canvas) {
  return nodeGraphPhosphorEnergyEnsureCanvas(
    canvas,
    "_numberReadoutEnergyMask",
    canvas?.width || 0,
    canvas?.height || 0,
  );
}

function nodeGraphNumberReadoutEnergyGl(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return null;
  }
  if (typeof nodeGraphPhosphorEnergyGlEnsure !== "function") {
    return null;
  }
  return nodeGraphPhosphorEnergyGlEnsure(canvas, canvas.width, canvas.height, "_phosphorEnergyGl");
}

function nodeGraphNumberReadoutSafeDecimals(decimals) {
  // toFixed(NaN) throws RangeError and can take down the rAF draw loop.
  const n = Math.round(Number(decimals));
  if (!Number.isFinite(n)) {
    return 2;
  }
  return Math.max(0, Math.min(8, n));
}

function nodeGraphNumberReadoutFormatValue(sample, decimals) {
  const value = Number(sample);
  if (!Number.isFinite(value)) {
    return "--";
  }
  const places = nodeGraphNumberReadoutSafeDecimals(decimals);
  let fixed;
  try {
    fixed = value.toFixed(places);
  } catch {
    fixed = value.toFixed(2);
  }
  // Reserve a sign column so width stays stable across zero (DSEG space =
  // colon advance — keshikan/DSEG usage notes).
  return fixed.startsWith("-") ? fixed : ` ${fixed}`;
}

// DSEG period has zero advance; every other character is one equal LCD cell
// (width of "8"). Fixed cells keep lit digits and ghost plate locked together.
// https://github.com/keshikan/DSEG#usage
function nodeGraphNumberReadoutDsegWidthChars(text) {
  return Math.max(1, String(text || "").replace(/\./g, "").length);
}

// Ghost plate: full-width cells only. Digits / all-off "!" → all-on "8".
// Spaces stay blank cells (drawn as "!" under the plate path). Do NOT map
// space→"8" — space is narrower than a digit in DSEG and shifts the plate.
function nodeGraphNumberReadoutGhostPlateText(valueText) {
  return String(valueText || "").replace(/[0-9!]/g, "8");
}

function nodeGraphNumberReadoutUnitForSlot(slot) {
  const connection = nodeGraphModuleScopeConnectionsTo(slot?.nodeId, "In")
    .find((candidate) => candidate?.sourceNode && candidate?.sourcePort);
  if (!connection) {
    return "";
  }
  const sourceNode = nodeGraphPatchNode(connection.sourceNode);
  return sourceNode?.type === "helmholtzPitch" && connection.sourcePort === "Frequency"
    ? "Hz"
    : "";
}

function nodeGraphNumberReadoutSettingsSignature(settings) {
  return [
    settings.background,
    settings.brightness,
    settings.burn,
    settings.color,
    settings.decay,
    settings.decimals,
    settings.ghost,
    settings.innerGlow,
    settings.innerShadow,
  ].join("|");
}

/**
 * Natural (unskewed) DSEG layout for the face.
 * Height-first em size from the font; uniform shrink only if the block would
 * overflow the face width. Never non-uniform scale to fill the module.
 */
function nodeGraphNumberReadoutComputeLayout(context, valueText, fontFamily, faceW, faceH, hasUnit) {
  const labelH = hasUnit ? Math.max(0, faceH * 0.18) : 0;
  const digitAreaH = Math.max(1, faceH - labelH);
  // Designed em height — original DSEG proportions, not stretched to width.
  let fontSize = Math.max(1, digitAreaH * 0.78);
  context.font = `700 ${fontSize}px ${fontFamily}`;
  let cellW = Math.max(1, context.measureText("8").width);
  const cells = nodeGraphNumberReadoutDsegWidthChars(valueText);
  let totalW = cells * cellW;
  const maxW = Math.max(1, faceW * 0.94);
  if (totalW > maxW) {
    const scale = maxW / totalW;
    fontSize = Math.max(1, fontSize * scale);
    context.font = `700 ${fontSize}px ${fontFamily}`;
    cellW = Math.max(1, context.measureText("8").width);
    totalW = cells * cellW;
  }
  return {
    cellW,
    cells,
    digitAreaH,
    fontSize,
    labelH,
    totalW,
  };
}

// Draw DSEG on a fixed cell grid (cell = natural advance of "8" at fontSize).
// Ghost plate and lit value share the same pen positions. No X/Y stretch.
// softBlurPx: when set, deposits a soft energy/glow edge (for 0–1 phosphor).
function nodeGraphNumberReadoutDrawDigits(context, {
  text,
  centerX,
  centerY,
  fontFamily,
  fontSize,
  cellW: cellWIn,
  rgb,
  alpha,
  glow = 0,
  softBlurPx = 0,
  plate = false,
  // energy: force white ink (luma) for the 0–1 energy buffer
  energy = false,
}) {
  const raw = String(text || "");
  const ink = energy ? [255, 255, 255] : rgb;
  context.save();
  // Identity geometry in canvas pixels — never scaleX ≠ scaleY for glyphs.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.font = `700 ${fontSize}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const cellW = Math.max(1, Number(cellWIn) || context.measureText("8").width);
  let cellCount = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== ".") {
      cellCount += 1;
    }
  }
  cellCount = Math.max(1, cellCount);
  let penX = centerX - (cellCount * cellW) * 0.5 + cellW * 0.5;
  const blurPx = Math.max(
    0,
    Number(softBlurPx) || (glow > 0.001 ? fontSize * (0.08 + glow * 0.55) : 0),
  );

  const drawGlyph = (glyph, x) => {
    if (blurPx > 0.001) {
      context.shadowColor = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${(alpha * 0.95).toFixed(4)})`;
      context.shadowBlur = blurPx;
    } else {
      context.shadowBlur = 0;
    }
    context.fillStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${alpha.toFixed(4)})`;
    context.fillText(glyph, x, centerY);
    // Crisp core under soft deposit (still white when energy=true).
    if (blurPx > 0.001 && !energy) {
      context.shadowBlur = 0;
      context.fillStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${Math.min(1, alpha * 1.05).toFixed(4)})`;
      context.fillText(glyph, x, centerY);
    } else if (blurPx > 0.001 && energy) {
      // Soft energy: second lighter core without killing the soft edge.
      context.shadowBlur = blurPx * 0.35;
      context.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha).toFixed(4)})`;
      context.fillText(glyph, x, centerY);
    }
  };

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === ".") {
      // Zero advance — sit at the boundary between the previous and next cell.
      drawGlyph(".", penX - cellW * 0.5);
      continue;
    }
    let glyph = ch;
    if (plate) {
      // Unlit LCD grid: every full cell is all-on "8".
      glyph = "8";
    } else if (ch === " ") {
      // Lit path: leave sign column empty (still advance a full cell).
      penX += cellW;
      continue;
    } else if (ch === "!") {
      // All-off placeholder cell — skip draw, keep spacing.
      penX += cellW;
      continue;
    }
    drawGlyph(glyph, penX);
    penX += cellW;
  }
  context.restore();
}

function nodeGraphNumberReadoutDrawInnerShadow(context, left, top, width, height, amount) {
  if (!(amount > 0.001) || width < 2 || height < 2) {
    return;
  }
  const depth = Math.max(2, Math.min(width, height) * (0.06 + amount * 0.18));
  const edge = Math.max(0.12, Math.min(0.85, amount * 0.72));
  context.save();
  // Top + left (darker lip), bottom + right (softer).
  let grad = context.createLinearGradient(left, top, left, top + depth);
  grad.addColorStop(0, `rgba(0, 0, 0, ${edge.toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top, width, depth);

  grad = context.createLinearGradient(left, top, left + depth, top);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.9).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top, depth, height);

  grad = context.createLinearGradient(left, top + height, left, top + height - depth);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.55).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top + height - depth, width, depth);

  grad = context.createLinearGradient(left + width, top, left + width - depth, top);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.5).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left + width - depth, top, depth, height);
  context.restore();
}

function drawNodeGraphNumberReadoutItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const slot = item?.slot;
  if (!rect || !slot) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, item.buffer);
  const screenElement = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphNumberReadoutCanvasForSlot(slot);
  if (!canvas || !syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const hasSample = item?.buffer?.length > 0 && !item.buffer?.nodeGraphScopeXy;
  const unit = nodeGraphNumberReadoutUnitForSlot(slot);
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings.decimals);
  // No input: DSEG all-off ("!") placeholders.
  // https://github.com/keshikan/DSEG#usage
  const valueText = hasSample
    ? nodeGraphNumberReadoutFormatValue(nodeGraphOscilloscopeLatestSample(item.buffer, 0), decimals)
    : (decimals > 0 ? ` !.${"!".repeat(decimals)}` : " !");
  const text = unit ? `${valueText} ${unit}` : valueText;
  const burn = clampNodeSliderValue(Number(settings.burn) || 0, 0, 1);
  const decay = clampNodeSliderValue(Number(settings.decay) || 0, 0, 1);
  const ghost = clampNodeSliderValue(Number(settings.ghost) || 0, 0, 1);
  const innerGlow = clampNodeSliderValue(Number(settings.innerGlow) || 0, 0, 1);
  const innerShadow = clampNodeSliderValue(Number(settings.innerShadow) || 0, 0, 1);
  const settingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
  const styleChanged =
    canvas._nodeGraphNumberReadoutSettingsSig !== settingsSig ||
    canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady ||
    canvas._nodeGraphNumberReadoutWidth !== canvas.width ||
    canvas._nodeGraphNumberReadoutHeight !== canvas.height;
  const textChanged = canvas._nodeGraphNumberReadoutText !== text;
  // Burn/decay need every frame (fade residual). Static LCD can skip when idle.
  const needsContinuous = burn > 0.001 || decay > 0.001;
  if (!textChanged && !styleChanged && !needsContinuous) {
    return;
  }
  const now = performance.now?.() || Date.now();
  const lastPaint = Number(canvas._nodeGraphNumberReadoutPaintAt) || 0;
  // Soft-cap digit deposit rate when only the live sample is thrashing text.
  if (textChanged && !styleChanged && !needsContinuous && lastPaint > 0 && now - lastPaint < 33) {
    return;
  }

  // Draw in full canvas buffer pixels (layout face × dpr — fixed under zoom).
  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.color));
  const bg = normalizeNodeGraphTraceDisplayColor(settings.background, "#020608");
  const bright = Number(settings.brightness);
  const alpha = Math.max(0.15, (Number.isFinite(bright) ? Math.max(0, Math.min(2, bright)) : 0.92) / 2);
  const digitFontFamily = nodeGraphNumberReadoutDsegReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const hasUnit = Boolean(unit);
  // Natural DSEG metrics — face only letterboxes; never skews glyphs to fill it.
  context.setTransform(1, 0, 0, 1, 0, 0);
  const layout = nodeGraphNumberReadoutComputeLayout(
    context,
    valueText,
    digitFontFamily,
    width,
    height,
    hasUnit,
  );
  const digitFontSize = layout.fontSize;
  const cellW = layout.cellW;
  const labelHeight = layout.labelH;
  const digitAreaHeight = layout.digitAreaH;
  const digitX = left + width * 0.5;
  const digitY = top + digitAreaHeight * 0.5;

  // ── 0–1 energy phosphor (WebGL: R texture + 1D LUT — no CPU ImageData) ──
  // Fade every frame; soft-deposit mask only on value change. Live reading is
  // hard DSEG on top. GPU path scales with fill-rate, not JS per-pixel loops.
  const softnessPx = typeof nodeGraphPhosphorEnergyGlSoftnessPx === "function"
    ? nodeGraphPhosphorEnergyGlSoftnessPx(digitFontSize, burn)
    : nodeGraphPhosphorEnergySoftnessPx(digitFontSize, burn);
  const energyActive = burn > 0.001 || decay > 0.001;
  const energyGl = energyActive ? nodeGraphNumberReadoutEnergyGl(canvas) : null;
  let maskCanvas = null;
  let depositGain = 0;
  const shouldDeposit = energyActive
    && (textChanged || styleChanged || !canvas._numberReadoutEnergyPrimed);
  if (shouldDeposit) {
    maskCanvas = nodeGraphNumberReadoutEnergyMaskCanvas(canvas);
    if (maskCanvas) {
      const mctx = maskCanvas.getContext("2d");
      if (mctx) {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        const rapid = textChanged && lastPaint > 0 && now - lastPaint < 40;
        mctx.save();
        mctx.globalCompositeOperation = "lighter";
        nodeGraphNumberReadoutDrawDigits(mctx, {
          text: valueText,
          centerX: digitX,
          centerY: digitY,
          fontFamily: digitFontFamily,
          fontSize: digitFontSize,
          cellW,
          rgb: [255, 255, 255],
          alpha: 1,
          softBlurPx: softnessPx,
          energy: true,
          plate: false,
        });
        mctx.restore();
        depositGain = clampNodeSliderValue(
          (rapid ? 0.05 + burn * 0.14 : 0.1 + burn * 0.32) * alpha,
          0.04,
          rapid ? 0.22 : 0.42,
        );
      }
    }
    canvas._numberReadoutEnergyPrimed = true;
  }
  if (energyGl && typeof nodeGraphPhosphorEnergyGlStep === "function") {
    if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
      nodeGraphPhosphorEnergyGlSetLutFromPeak(energyGl, rgb, bg);
    }
    nodeGraphPhosphorEnergyGlStep(energyGl, {
      decay: decay > 0.001 ? decay : 0,
      depositGain: maskCanvas && depositGain > 0 ? depositGain : 0,
      maskCanvas: maskCanvas && depositGain > 0 ? maskCanvas : null,
    });
  } else if (!energyActive) {
    canvas._numberReadoutEnergyPrimed = false;
  }

  // ── Present ──
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  // LCD cavity background (user-selectable). Fills the face; digits stay natural.
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // Hard unlit segment plate (artist grid — not energy-blurred).
  if (ghost > 0.001) {
    nodeGraphNumberReadoutDrawDigits(context, {
      text: valueText,
      centerX: digitX,
      centerY: digitY,
      fontFamily: digitFontFamily,
      fontSize: digitFontSize,
      cellW,
      rgb,
      alpha: Math.max(0.04, ghost * (nodeGraphNumberReadoutDsegReady ? 0.38 : 0.28)),
      softBlurPx: 0,
      plate: true,
    });
  }

  // GPU energy × LUT → soft residual trails (drawImage of WebGL canvas).
  if (energyGl && energyActive && typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    nodeGraphPhosphorEnergyGlPresent(energyGl, 0.8);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.imageSmoothingEnabled = true;
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
  }

  // Hard live value on top (crisp segments; optional cosmetic inner glow).
  nodeGraphNumberReadoutDrawDigits(context, {
    text: valueText,
    centerX: digitX,
    centerY: digitY,
    fontFamily: digitFontFamily,
    fontSize: digitFontSize,
    cellW,
    rgb,
    alpha,
    softBlurPx: 0,
    glow: innerGlow,
    plate: false,
  });

  if (hasUnit) {
    const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, width * 0.14, digitFontSize * 0.35));
    context.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(alpha * 0.55).toFixed(4)})`;
    context.fillText(unit, left + width * 0.5, top + digitAreaHeight + labelHeight * 0.5);
  }

  nodeGraphNumberReadoutDrawInnerShadow(context, left, top, width, height, innerShadow);
  context.restore();

  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = settingsSig;
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = canvas.width;
  canvas._nodeGraphNumberReadoutHeight = canvas.height;
  canvas._nodeGraphNumberReadoutPaintAt = now;
}

function nodeGraphCustomDisplayCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-custom-display-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-custom-display-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

function syncNodeGraphCustomDisplayCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  const rect = screenElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * pixelRatio));
  const height = Math.max(1, Math.floor(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  return true;
}

function nodeGraphCustomDisplayInputApi(node, displayScript, primaryBuffer) {
  const inputs = {};
  for (const port of displayScript.inputs || []) {
    const buffer = nodeGraphModuleScopeState.buffers.get(`${node.id}:${port}`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(node.id, port) ||
      (port === displayScript.inputs[0] ? primaryBuffer : null);
    inputs[port] = {
      buffer: buffer || new Float32Array(0),
      latest: buffer?.length ? Number(buffer[buffer.length - 1]) || 0 : 0,
      length: buffer?.length || 0,
    };
  }
  return inputs;
}

function drawNodeGraphCustomDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!node || !screenElement) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, item?.buffer || null);
  const canvas = nodeGraphCustomDisplayCanvasForSlot(slot);
  if (!canvas || !syncNodeGraphCustomDisplayCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const displayScript = normalizeNodeGraphCustomDisplay(node.customDisplay);
  const compiled = compiledNodeGraphCustomDisplayFunction(node);
  if (!compiled?.fn) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.fillStyle = "rgba(255, 126, 126, 0.9)";
    context.font = `${Math.max(10, Math.min(18, canvas.height * 0.12))}px var(--node-mono-font, monospace)`;
    context.fillText(compiled?.error || "compile error", 4 * pixelRatio, 16 * pixelRatio);
    context.restore();
    return;
  }
  try {
    compiled.fn({
      buffer: item?.buffer || new Float32Array(0),
      canvas,
      ctx: context,
      frame: nodeGraphModuleScopeState.frames,
      height: canvas.height,
      inputs: nodeGraphCustomDisplayInputApi(node, displayScript, item?.buffer || null),
      node,
      pixelRatio,
      time: (Number(nodeGraphModuleScopeState.frames) || 0) / 60,
      width: canvas.width,
    }, ...nodeGraphPortScriptHelperValues);
  } catch (error) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.fillStyle = "rgba(255, 126, 126, 0.9)";
    context.font = `${Math.max(10, Math.min(18, canvas.height * 0.12))}px var(--node-mono-font, monospace)`;
    context.fillText(error?.message || "runtime error", 4 * pixelRatio, 16 * pixelRatio);
    context.restore();
  }
}

function nodeGraphOneDimensionalBurnSampleToY(sample, rect) {
  return rect.top + rect.height * 0.5 - clampNodeSliderValue(sample, -1, 1) * rect.height * 0.44;
}

function nodeGraphOneDimensionalBurnViewportPointToCanvas(item, pixelRatio, point) {
  const screenRect = item?.screenRect;
  if (!screenRect || !point) {
    return null;
  }
  return {
    x: (point.x - screenRect.left) * pixelRatio,
    y: (point.y - screenRect.top) * pixelRatio,
  };
}

function nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings) {
  if (!context || !canvas?.width || !canvas?.height) {
    return;
  }
  const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1);
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  if (decay <= 0) {
    return;
  }
  const fadeAlpha = clampNodeSliderValue(0.012 + decay * 0.3 - burn * 0.006, 0.002, 0.34);
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function nodeGraphScopeRgbFloatsToCanvasRgb(color) {
  const rgb = Array.isArray(color) ? color : [1, 1, 1];
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(clampNodeSliderValue(Number(value) || 0, 0, 1) * 255))));
}

function nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count) {
  const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const startFrame = Number(buffer?.nodeGraphScopeStartFrame);
  if (
    Number.isFinite(startFrame) &&
    Number.isFinite(endFrame) &&
    endFrame > startFrame
  ) {
    return { startFrame, endFrame };
  }
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const totalSamples = Number(buffer?.nodeGraphScopeTotalSampleCount);
  if (Number.isFinite(totalSamples) && totalSamples > 0) {
    return {
      startFrame: Math.max(0, totalSamples - safeCount),
      endFrame: totalSamples,
    };
  }
  const fallbackEndFrame = Number(buffer?.nodeGraphScopeVersion);
  const end = Number.isFinite(fallbackEndFrame)
    ? fallbackEndFrame
    : 0;
  return {
    startFrame: Math.max(0, end - safeCount),
    endFrame: end,
  };
}

function nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count) {
  const frameInfo = nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count);
  const lastFrame = Number(canvas?._nodeGraphOneDimensionalBurnLastDrawnFrame ?? canvas?._nodeGraphScope2dLastDrawnFrame);
  if (
    !Number.isFinite(frameInfo.startFrame) ||
    !Number.isFinite(frameInfo.endFrame) ||
    !Number.isFinite(lastFrame) ||
    frameInfo.endFrame <= frameInfo.startFrame
  ) {
    return 0;
  }
  if (lastFrame >= frameInfo.endFrame) {
    return count;
  }
  if (lastFrame <= frameInfo.startFrame) {
    return 0;
  }
  const frameOffset = Math.max(0, Math.floor(lastFrame - frameInfo.startFrame) - 1);
  return Math.min(Math.max(0, Math.floor(Number(count) || 0) - 1), frameOffset);
}

const nodeGraphOneDimensionalBurnTriggerHigh = 0.02;
const nodeGraphOneDimensionalBurnTriggerLow = -0.02;
const nodeGraphOneDimensionalBurnMinSweepHz = 20000;

function nodeGraphOneDimensionalBurnInitTriggerState(buffer, sampleRate) {
  if (!Number.isFinite(buffer.nodeGraphScopeBurnSweepLength) || buffer.nodeGraphScopeBurnSweepLength <= 0) {
    buffer.nodeGraphScopeBurnSweepLength = Math.max(1, Math.round(sampleRate * nodeGraphLineBurnSettingsDefaults.zoomSeconds));
  }
  if (!Number.isFinite(buffer.nodeGraphScopeBurnCrossings)) {
    buffer.nodeGraphScopeBurnCrossings = 0;
  }
  if (!Number.isFinite(buffer.nodeGraphScopeBurnLastSample)) {
    buffer.nodeGraphScopeBurnLastSample = 0;
  }
  if (!Number.isFinite(buffer.nodeGraphScopeBurnArmed)) {
    buffer.nodeGraphScopeBurnArmed = 1;
  }
}

function nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, rect, settings) {
  if (!buffer?.length || !rect) {
    return [];
  }
  const count = Math.max(1, Math.min(
    buffer.length,
    Math.floor(Number(buffer.nodeGraphScopeRecentSampleCount) || 1),
  ));
  const start = Math.max(0, buffer.length - count);
  const drawStartIndex = nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count);
  if (drawStartIndex >= count) {
    return [];
  }
  const points = [];
  const frameInfo = nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count);
  const sampleRate = nodeGraphScopeSampleRate(buffer);
  const targetCycles = Math.max(1, Math.round(
    Number(settings?.cycles) || nodeGraphLineBurnSettingsDefaults.cycles,
  ));
  nodeGraphOneDimensionalBurnInitTriggerState(buffer, sampleRate);
  if (!Number.isFinite(buffer.nodeGraphScopeBurnSweepStart)) {
    buffer.nodeGraphScopeBurnSweepStart = frameInfo.startFrame;
  }
  const minSweepLength = Math.max(1, Math.round(sampleRate / nodeGraphOneDimensionalBurnMinSweepHz));
  let previousProgress = null;
  let prevSample = buffer.nodeGraphScopeBurnLastSample;
  for (let index = drawStartIndex; index < count; index += 1) {
    const frame = frameInfo.startFrame + index;
    const sample = buffer[start + index];
    if (buffer.nodeGraphScopeBurnArmed && sample > nodeGraphOneDimensionalBurnTriggerHigh) {
      buffer.nodeGraphScopeBurnArmed = 0;
      buffer.nodeGraphScopeBurnCrossings += 1;
      if (buffer.nodeGraphScopeBurnCrossings >= targetCycles) {
        const sweepLength = frame - buffer.nodeGraphScopeBurnSweepStart;
        if (sweepLength >= minSweepLength) {
          buffer.nodeGraphScopeBurnSweepLength = sweepLength;
        }
        buffer.nodeGraphScopeBurnSweepStart = frame;
        buffer.nodeGraphScopeBurnCrossings = 0;
      }
    } else if (!buffer.nodeGraphScopeBurnArmed && sample < nodeGraphOneDimensionalBurnTriggerLow) {
      buffer.nodeGraphScopeBurnArmed = 1;
    }
    prevSample = sample;
    const progress = wrapNodeSliderValue(
      (frame - buffer.nodeGraphScopeBurnSweepStart) / Math.max(1, buffer.nodeGraphScopeBurnSweepLength),
      0,
      1,
    );
    if (previousProgress !== null && progress < previousProgress) {
      breakNodeGraphScope2dPath(points);
    }
    points.push({
      x: rect.left + rect.width * progress,
      y: nodeGraphOneDimensionalBurnSampleToY(sample, rect),
    });
    previousProgress = progress;
  }
  buffer.nodeGraphScopeBurnLastSample = prevSample;
  return points;
}

function nodeGraphOneDimensionalBurnPointBudget(canvas) {
  const width = Math.max(1, Number(canvas?.width) || 1);
  return Math.max(64, Math.min(2048, Math.ceil(width * 4)));
}

function reduceNodeGraphOneDimensionalBurnSubpath(points, start, end, budget, output) {
  const length = end - start;
  if (length <= 0) {
    return;
  }
  if (length <= budget) {
    for (let index = start; index < end; index += 1) {
      output.push(points[index]);
    }
    return;
  }
  const bucketCount = Math.max(1, Math.floor(budget / 4));
  const bucketStep = length / bucketCount;
  let lastPushedIndex = -1;
  const pushUnique = (index) => {
    if (index < start || index >= end || index === lastPushedIndex) {
      return;
    }
    output.push(points[index]);
    lastPushedIndex = index;
  };
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = start + Math.floor(bucket * bucketStep);
    const bucketEnd = Math.min(end, start + Math.max(1, Math.floor((bucket + 1) * bucketStep)));
    let minIndex = bucketStart;
    let maxIndex = bucketStart;
    for (let index = bucketStart + 1; index < bucketEnd; index += 1) {
      const y = Number(points[index]?.y);
      if (!Number.isFinite(y)) {
        continue;
      }
      if (y < Number(points[minIndex]?.y)) {
        minIndex = index;
      }
      if (y > Number(points[maxIndex]?.y)) {
        maxIndex = index;
      }
    }
    const important = [bucketStart, minIndex, maxIndex, bucketEnd - 1]
      .filter((index) => index >= bucketStart && index < bucketEnd)
      .sort((a, b) => a - b);
    for (const index of important) {
      pushUnique(index);
    }
  }
}

function reduceNodeGraphOneDimensionalBurnPoints(points, budget) {
  if (!Array.isArray(points) || points.length <= budget) {
    return points;
  }
  const reduced = [];
  let subpathStart = 0;
  const flushSubpath = (end) => {
    reduceNodeGraphOneDimensionalBurnSubpath(points, subpathStart, end, budget, reduced);
  };
  for (let index = 0; index < points.length; index += 1) {
    if (points[index]) {
      continue;
    }
    flushSubpath(index);
    reduced.push(null);
    subpathStart = index + 1;
  }
  flushSubpath(points.length);
  return reduced;
}

function drawNodeGraphScopeCanvasSmoothPath(context, points) {
  let subpath = [];
  const flushSubpath = () => {
    if (subpath.length < 2) {
      subpath = [];
      return;
    }
    context.moveTo(subpath[0].x, subpath[0].y);
    if (subpath.length === 2) {
      context.lineTo(subpath[1].x, subpath[1].y);
    } else {
      for (let index = 1; index < subpath.length - 1; index += 1) {
        const point = subpath[index];
        const next = subpath[index + 1];
        context.quadraticCurveTo(point.x, point.y, (point.x + next.x) * 0.5, (point.y + next.y) * 0.5);
      }
      const last = subpath[subpath.length - 1];
      context.lineTo(last.x, last.y);
    }
    subpath = [];
  };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      flushSubpath();
      continue;
    }
    subpath.push(point);
  }
  flushSubpath();
}

function nodeGraphScope2dStrokeSpace(canvas) {
  return Math.min(canvas?.width || 0, canvas?.height || 0);
}

// Energy mono + LUT present (shared phosphor device). Soft GPU segment beams
// unchanged — only storage/composite moved off RGB burn.
const nodeGraphScope2dBurnRendererVersion = "energy-mono-lut-soft-beam-1";

// Explicit, deterministic teardown of a burn-renderer's GL resources
// (buffers, programs, framebuffers, textures) instead of waiting on GC.
// The canvas itself is left to the WeakMap + GC to reclaim -- forcing
// WEBGL_lose_context here was tried and reliably stalled for multiple
// seconds per call in some environments, which is worse than the leak it
// was meant to speed up; freeing the individual resources plus not holding
// the canvas alive in a strong Map is enough to keep the live-context count
// bounded.
function disposeNodeGraphScope2dBurnRendererForCanvas(canvas) {
  if (!canvas) {
    return;
  }
  const renderer = nodeGraphModuleScopeState.scope2dBurnRenderers.get(canvas);
  if (!renderer) {
    return;
  }
  nodeGraphModuleScopeState.scope2dBurnRenderers.delete(canvas);
  const { gl } = renderer;
  if (!gl) {
    return;
  }
  deleteNodeGraphScope2dBurnSurface(gl, renderer.readSurface);
  deleteNodeGraphScope2dBurnSurface(gl, renderer.writeSurface);
  for (const buffer of [renderer.quadBuffer, renderer.beamBuffer]) {
    if (buffer) {
      gl.deleteBuffer(buffer);
    }
  }
  for (const program of [
    renderer.decayProgram,
    renderer.compositeProgram,
    renderer.copyProgram,
    renderer.beamProgram,
  ]) {
    if (program) {
      gl.deleteProgram(program);
    }
  }
}

function nodeGraphScope2dBurnCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-module-scope-local-fallback-canvas");
  if (canvas && canvas.dataset.scope2dRenderer !== nodeGraphScope2dBurnRendererVersion) {
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    canvas.remove();
    canvas = null;
  }
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-module-scope-local-fallback-canvas";
    canvas.dataset.scope2dRenderer = nodeGraphScope2dBurnRendererVersion;
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

/**
 * Resolve face pixel density 0–4 to an effective scale.
 * 0 must NOT collapse the buffer to 1×1 (that reads as "max chunk" jump).
 * Floor keeps a usable lo-fi grid (~1/16 layout); 1 = full layout×dpr; 4 = AA.
 */
function nodeGraphScope2dResolvePixelDensity(pixelDensity, layoutWidth = 1, layoutHeight = 1) {
  const raw = Number(pixelDensity);
  const density = Number.isFinite(raw) ? Math.max(0, Math.min(4, raw)) : 1;
  const minSide = Math.max(1, Math.min(layoutWidth, layoutHeight));
  // ~1/16 of layout, but never below 8px short side (or the full face if tinier).
  const minDensity = Math.min(1, Math.max(8, Math.min(minSide, 16)) / minSide);
  const effective = density < minDensity ? minDensity : density;
  return { density, effective, minDensity };
}

function syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) {
    return { resized: false, synced: false };
  }
  // Layout pixel grid × density — not screen-space getBoundingClientRect.
  // Workspace zoom must not reallocate burn FBOs (that was the FPS cliff).
  // pixelDensity 2–4 supersamples so zoomed-in views stay soft, not blocky.
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return { resized: false, synced: false };
  }
  const resolved = nodeGraphScope2dResolvePixelDensity(pixelDensity, size.width, size.height);
  const density = resolved.effective;
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
  const resized = canvas.width !== width || canvas.height !== height;
  if (resized) {
    canvas.width = width;
    canvas.height = height;
  }
  // Below 1: intentional chunk. At/above 1: smooth CSS scale (AA when density > 1).
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return { resized, synced: true, density, userDensity: resolved.density };
}

function nodeGraphScope2dBurnTextureFormats(gl) {
  if (!gl) {
    return [];
  }
  if (!gl._nodeGraphScope2dBurnTextureFormats) {
    const halfFloat = gl.getExtension("OES_texture_half_float");
    const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
    const colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
    const formats = [];
    if (halfFloat && colorBufferHalfFloat) {
      formats.push({
        filter: halfFloatLinear ? gl.LINEAR : gl.NEAREST,
        label: "rgba16f",
        type: halfFloat.HALF_FLOAT_OES,
      });
    }
    formats.push({
      filter: gl.LINEAR,
      label: "rgba8",
      type: gl.UNSIGNED_BYTE,
    });
    gl._nodeGraphScope2dBurnTextureFormats = formats;
  }
  return gl._nodeGraphScope2dBurnTextureFormats;
}

function createNodeGraphScope2dBurnTexture(gl, width, height, format = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format.filter || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format.filter || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    Math.max(1, width),
    Math.max(1, height),
    0,
    gl.RGBA,
    format.type || gl.UNSIGNED_BYTE,
    null,
  );
  return texture;
}

function createNodeGraphScope2dBurnFramebuffer(gl, texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return framebuffer;
}

function createNodeGraphScope2dBurnSurface(gl, width, height) {
  for (const format of nodeGraphScope2dBurnTextureFormats(gl)) {
    const texture = createNodeGraphScope2dBurnTexture(gl, width, height, format);
    const framebuffer = createNodeGraphScope2dBurnFramebuffer(gl, texture);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      return {
        format: format.label,
        framebuffer,
        texture,
      };
    }
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }
  const texture = createNodeGraphScope2dBurnTexture(gl, width, height);
  return {
    format: "rgba8",
    framebuffer: createNodeGraphScope2dBurnFramebuffer(gl, texture),
    texture,
  };
}

function deleteNodeGraphScope2dBurnSurface(gl, surface) {
  if (!gl || !surface) {
    return;
  }
  if (surface.framebuffer) {
    gl.deleteFramebuffer(surface.framebuffer);
  }
  if (surface.texture) {
    gl.deleteTexture(surface.texture);
  }
}

function createNodeGraphScope2dBurnRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  }) || canvas.getContext("experimental-webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }
  const quadVertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const decayProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uDecayFast;
    uniform float uDecaySlow;
    uniform float uFloor;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(uTexture, vUv).rgb;
      float luma = max(max(color.r, color.g), color.b);
      float brightWeight = smoothstep(0.08, 0.7, luma);
      float decay = mix(uDecaySlow, uDecayFast, brightWeight);
      color = color * decay;
      color = max(color - vec3(uFloor), vec3(0.0));
      color *= smoothstep(0.0, uFloor * 10.0, max(max(color.r, color.g), color.b));
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  const compositeProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uExposure;
    varying vec2 vUv;
    void main() {
      vec3 energy = texture2D(uTexture, vUv).rgb * uExposure;
      vec3 mapped = vec3(1.0) - exp(-energy);
      mapped = pow(mapped, vec3(0.72));
      float alpha = clamp(max(max(mapped.r, mapped.g), mapped.b), 0.0, 1.0);
      gl_FragColor = vec4(mapped, alpha);
    }
  `);
  const copyProgram = createNodeGraphModuleScopeProgram(gl, quadVertexSource, `
    precision highp float;
    uniform sampler2D uTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(uTexture, vUv);
    }
  `);
  const beamProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    uniform vec2 uCanvasSize;
    uniform float uRadius;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    void main() {
      vec2 segment = aEnd - aStart;
      float segmentLength = max(length(segment), 0.0001);
      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2(-tangent.y, tangent.x);
      float side = (aCorner == 0.0 || aCorner == 2.0) ? 1.0 : -1.0;
      float endpointMix = aCorner < 2.0 ? 0.0 : 1.0;
      float cap = aCorner < 2.0 ? -1.0 : 1.0;
      float padding = max(uRadius * 3.45, 2.0);
      vec2 endpoint = mix(aStart, aEnd, endpointMix);
      vec2 position = endpoint + normal * side * padding + tangent * cap * padding;
      vStart = aStart;
      vEnd = aEnd;
      vPosition = position;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `, `
    precision highp float;
    uniform vec3 uColor;
    uniform float uBrightness;
    uniform float uBlur;
    uniform float uRadius;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    void main() {
      vec2 segment = vEnd - vStart;
      float blur = clamp(uBlur, 0.0, 1.0);
      float sigma = max(uRadius * mix(0.34, 1.0, blur), 0.55);
      float segmentLengthSquared = dot(segment, segment);
      float t = segmentLengthSquared > 0.000001
        ? clamp(dot(vPosition - vStart, segment) / segmentLengthSquared, 0.0, 1.0)
        : 0.0;
      vec2 closest = vStart + segment * t;
      float distanceToBeam = length(vPosition - closest);
      float profile = exp(-(distanceToBeam * distanceToBeam) / (2.0 * sigma * sigma));
      float energy = profile * uBrightness;
      gl_FragColor = vec4(uColor * energy, energy);
    }
  `);
  if (!decayProgram || !compositeProgram || !copyProgram || !beamProgram) {
    if (decayProgram) {
      gl.deleteProgram(decayProgram);
    }
    if (compositeProgram) {
      gl.deleteProgram(compositeProgram);
    }
    if (copyProgram) {
      gl.deleteProgram(copyProgram);
    }
    if (beamProgram) {
      gl.deleteProgram(beamProgram);
    }
    return null;
  }
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]), gl.STATIC_DRAW);
  const renderer = {
    beamBuffer: gl.createBuffer(),
    beamBlurLocation: gl.getUniformLocation(beamProgram, "uBlur"),
    beamBrightnessLocation: gl.getUniformLocation(beamProgram, "uBrightness"),
    beamCanvasSizeLocation: gl.getUniformLocation(beamProgram, "uCanvasSize"),
    beamColorLocation: gl.getUniformLocation(beamProgram, "uColor"),
    beamCornerLocation: gl.getAttribLocation(beamProgram, "aCorner"),
    beamEndLocation: gl.getAttribLocation(beamProgram, "aEnd"),
    beamProgram,
    beamRadiusLocation: gl.getUniformLocation(beamProgram, "uRadius"),
    beamStartLocation: gl.getAttribLocation(beamProgram, "aStart"),
    canvas,
    compositeExposureLocation: gl.getUniformLocation(compositeProgram, "uExposure"),
    compositePositionLocation: gl.getAttribLocation(compositeProgram, "aPosition"),
    compositeProgram,
    compositeTextureLocation: gl.getUniformLocation(compositeProgram, "uTexture"),
    copyPositionLocation: gl.getAttribLocation(copyProgram, "aPosition"),
    copyProgram,
    copyTextureLocation: gl.getUniformLocation(copyProgram, "uTexture"),
    decayFastLocation: gl.getUniformLocation(decayProgram, "uDecayFast"),
    decayFloorLocation: gl.getUniformLocation(decayProgram, "uFloor"),
    decayPositionLocation: gl.getAttribLocation(decayProgram, "aPosition"),
    decayProgram,
    decaySlowLocation: gl.getUniformLocation(decayProgram, "uDecaySlow"),
    decayTextureLocation: gl.getUniformLocation(decayProgram, "uTexture"),
    gl,
    height: 0,
    lastFrame: NaN,
    lastPoint: null,
    quadBuffer,
    readSurface: null,
    segmentScratch: new Float32Array(0),
    width: 0,
    writeSurface: null,
  };
  return renderer;
}

function nodeGraphScope2dBurnRendererForCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  const cached = nodeGraphModuleScopeState.scope2dBurnRenderers.get(canvas);
  if (cached?.canvas === canvas) {
    return cached;
  }
  const renderer = createNodeGraphScope2dBurnRenderer(canvas);
  if (renderer) {
    nodeGraphModuleScopeState.scope2dBurnRenderers.set(canvas, renderer);
  }
  return renderer;
}

function resizeNodeGraphScope2dBurnRenderer(renderer, width, height) {
  if (!renderer?.gl) {
    return false;
  }
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  if (renderer.width === safeWidth && renderer.height === safeHeight && renderer.readSurface && renderer.writeSurface) {
    return false;
  }
  const gl = renderer.gl;
  const previousReadSurface = renderer.readSurface;
  const previousWriteSurface = renderer.writeSurface;
  const nextReadSurface = createNodeGraphScope2dBurnSurface(gl, safeWidth, safeHeight);
  const nextWriteSurface = createNodeGraphScope2dBurnSurface(gl, safeWidth, safeHeight);
  const copiedRead = copyNodeGraphScope2dBurnSurface(renderer, previousReadSurface, nextReadSurface, safeWidth, safeHeight);
  const copiedWrite = copyNodeGraphScope2dBurnSurface(renderer, previousWriteSurface, nextWriteSurface, safeWidth, safeHeight);
  renderer.readSurface = nextReadSurface;
  renderer.writeSurface = nextWriteSurface;
  renderer.width = safeWidth;
  renderer.height = safeHeight;
  renderer.lastPoint = null;
  for (const surface of [
    copiedRead ? null : renderer.readSurface,
    copiedWrite ? null : renderer.writeSurface,
  ]) {
    if (!surface) {
      continue;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.viewport(0, 0, safeWidth, safeHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  deleteNodeGraphScope2dBurnSurface(gl, previousReadSurface);
  deleteNodeGraphScope2dBurnSurface(gl, previousWriteSurface);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}

function bindNodeGraphScope2dQuad(renderer, program, positionLocation) {
  const gl = renderer.gl;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 8, 0);
}

function copyNodeGraphScope2dBurnSurface(renderer, sourceSurface, targetSurface, width, height) {
  const gl = renderer?.gl;
  if (!gl || !sourceSurface?.texture || !targetSurface?.framebuffer || !renderer.copyProgram) {
    return false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetSurface.framebuffer);
  gl.viewport(0, 0, Math.max(1, width), Math.max(1, height));
  gl.disable(gl.BLEND);
  bindNodeGraphScope2dQuad(renderer, renderer.copyProgram, renderer.copyPositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceSurface.texture);
  gl.uniform1i(renderer.copyTextureLocation, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return true;
}

function nodeGraphScope2dBurnDecayValues(settings) {
  const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1);
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  return {
    decayFast: decay > 0 ? 1 - decay * 0.38 : 1,
    decaySlow: decay > 0 ? 1 - decay * 0.1 : 1,
    exposure: nodeGraphScope2dEnergyBurnExposure(burn),
    floor: decay > 0 ? decay * 0.0035 : 0,
  };
}

function decayNodeGraphScope2dBurn(renderer, settings) {
  const gl = renderer?.gl;
  if (!gl || !renderer.readSurface || !renderer.writeSurface) {
    return;
  }
  const values = nodeGraphScope2dBurnDecayValues(settings);
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.writeSurface.framebuffer);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.BLEND);
  bindNodeGraphScope2dQuad(renderer, renderer.decayProgram, renderer.decayPositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.readSurface.texture);
  gl.uniform1i(renderer.decayTextureLocation, 0);
  gl.uniform1f(renderer.decayFastLocation, values.decayFast);
  gl.uniform1f(renderer.decaySlowLocation, values.decaySlow);
  gl.uniform1f(renderer.decayFloorLocation, values.floor);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function nodeGraphScope2dBurnLayers(settings, dotSpace) {
  const layers = [];
  if (settings?.dot1Enabled !== false) {
    // Size 0–1 of face min side: diameter = size * minSide (radius = half).
    // Blur 0–1: hard-ish core → soft wide skirt (shader), not geometric size.
    const size01 = clampNodeSliderValue(settings.dot1Size, 0, 1);
    const side = Math.max(1, Number(dotSpace) || 1);
    layers.push({
      // Blur 0 hard disc … 1 full soft gaussian.
      blur: nodeGraphTraceDisplayClampStampBlur(settings.lineThickness),
      brightness: Math.max(0, Number(settings.dot1Brightness) || 0),
      color: nodeGraphScopeHexColorToRgb(settings.dot1Color),
      radius: Math.max(0.5, side * size01 * 0.5),
    });
  }
  return layers.filter((layer) => layer.brightness > 0 && layer.radius > 0);
}

function appendNodeGraphScope2dBurnSegment(vertices, from, to) {
  if (!from || !to) {
    return;
  }
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  let distance = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(distance)) {
    return;
  }
  const end = { x: to.x, y: to.y };
  if (distance < 0.01) {
    end.x = from.x + 0.01;
    end.y = from.y;
    dx = end.x - from.x;
    dy = end.y - from.y;
    distance = 0.01;
  }
  const corners = [0, 1, 2, 1, 3, 2];
  for (const corner of corners) {
    vertices.push(from.x, from.y, end.x, end.y, corner);
  }
}

function buildNodeGraphScope2dBurnVertices(pathPoints) {
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const vertices = [];
  let previousPoint = null;
  for (const point of points) {
    if (!point) {
      previousPoint = null;
      continue;
    }
    if (previousPoint) {
      appendNodeGraphScope2dBurnSegment(vertices, previousPoint, point);
    }
    previousPoint = point;
  }
  return vertices;
}

function drawNodeGraphScope2dBurnBeamLayer(renderer, vertices, layer, burn) {
  const gl = renderer?.gl;
  const vertexCount = Math.floor((vertices?.length || 0) / 5);
  if (!gl || vertexCount <= 0 || !layer || layer.radius <= 0 || layer.brightness <= 0) {
    return;
  }
  if (renderer.segmentScratch.length < vertices.length) {
    renderer.segmentScratch = new Float32Array(vertices.length);
  }
  renderer.segmentScratch.set(vertices);
  gl.useProgram(renderer.beamProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, renderer.segmentScratch.subarray(0, vertices.length), gl.STREAM_DRAW);
  const stride = 5 * 4;
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, stride, 4 * 4);
  gl.uniform2f(renderer.beamCanvasSizeLocation, renderer.width, renderer.height);
  gl.uniform1f(renderer.beamRadiusLocation, Math.max(0.5, layer.radius));
  gl.uniform3f(renderer.beamColorLocation, layer.color[0], layer.color[1], layer.color[2]);
  gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(layer.blur, 0, 1));
  gl.uniform1f(renderer.beamBrightnessLocation, layer.brightness * (0.012 + burn * 0.052));
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  recordNodeGraphModuleScopeRenderMetrics(vertexCount, vertexCount);
}

function compositeNodeGraphScope2dBurn(renderer, settings, options = {}) {
  const gl = renderer?.gl;
  const surface = options.sourceSurface || renderer.writeSurface;
  if (!gl || !surface) {
    return;
  }
  const values = nodeGraphScope2dBurnDecayValues(settings);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  bindNodeGraphScope2dQuad(renderer, renderer.compositeProgram, renderer.compositePositionLocation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, surface.texture);
  gl.uniform1i(renderer.compositeTextureLocation, 0);
  gl.uniform1f(renderer.compositeExposureLocation, values.exposure);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (options.swap === false) {
    return;
  }
  const nextRead = renderer.writeSurface;
  renderer.writeSurface = renderer.readSurface;
  renderer.readSurface = nextRead;
}

/**
 * Beautiful soft-beam retained burn on mono energy + gradient LUT.
 * Same continuous gaussian segment ribbons as classic scope2d; storage is
 * scalar energy (shared phosphor device), color only at present via LUT.
 * Returns true if handled (caller should not run legacy RGB WebGL burn).
 */
function drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, options = {}) {
  if (typeof nodeGraphPhosphorEnergyGlEnsure !== "function"
    || typeof nodeGraphPhosphorEnergyGlStepBeams !== "function"
    || typeof nodeGraphPhosphorEnergyGlPresent !== "function") {
    return false;
  }
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const density = Number(settings?.pixelDensity);
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    Number.isFinite(density) ? density : 1,
  );
  if (!sync.synced || !canvas) {
    return false;
  }
  // Face must be 2D — dispose any leftover RGB WebGL burn on this canvas once.
  if (nodeGraphModuleScopeState.scope2dBurnRenderers?.get?.(canvas)) {
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
  }
  const context = canvas.getContext("2d");
  if (!context) {
    // Canvas already has a lost/foreign WebGL context — recreate the face.
    disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    canvas.remove();
    return false;
  }

  const width = canvas.width;
  const height = canvas.height;
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const endFrame = Number(options.endFrame);
  if (Number.isFinite(endFrame)) {
    canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
    canvas._phosphorScope2dLastFrame = endFrame;
  }

  const energyGl = nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl");
  if (!energyGl) {
    return false;
  }

  const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1);
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  const dotSpace = nodeGraphScope2dStrokeSpace(canvas);
  const layers = nodeGraphScope2dBurnLayers(settings, dotSpace);
  const layer = layers[0] || null;
  const peakRgb = typeof nodeGraphScopeRgbFloatsToCanvasRgb === "function"
    && typeof nodeGraphScopeHexColorToRgb === "function"
    ? nodeGraphScopeRgbFloatsToCanvasRgb(
      nodeGraphScopeHexColorToRgb(settings?.dot1Color || settings?.color || "#75ebff"),
    )
    : [117, 235, 255];
  // Dark zero-energy stop; face CSS/background shows around the trail
  // (local-fallback uses mix-blend-mode: screen over the module face).
  const bgHex = "#000000";
  if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
    nodeGraphPhosphorEnergyGlSetLutFromPeak(energyGl, peakRgb, bgHex);
  }

  const paused = nodeGraphModuleScopePaused();
  if (!paused && layer) {
    // Soft circular hits on NEW motion only. Burn gain is smooth (no dead band).
    const size01 = clampNodeSliderValue(settings?.dot1Size, 0, 1);
    const beamBrightness = nodeGraphScope2dEnergyBurnDepositGain(
      burn,
      layer.brightness,
      size01,
    );
    nodeGraphPhosphorEnergyGlStepBeams(energyGl, {
      decay,
      pathPoints: points,
      radius: Math.max(0.35, layer.radius),
      brightness: beamBrightness,
      blur: nodeGraphTraceDisplayClampStampBlur(layer.blur),
      mode: "dots",
      // User / face ceiling. Under load: even skips across full path (not head-only).
      maxDots: Math.max(
        64,
        Math.min(
          8192,
          Math.round(Number(settings?.dotBudget) || nodeGraphScope2dMaxSamplesPerFrame(canvas)),
        ),
      ),
    });
  } else if (!paused && typeof nodeGraphPhosphorEnergyGlStep === "function") {
    // Fade + bleed when no drawable layer (trail still softens outward).
    nodeGraphPhosphorEnergyGlStep(energyGl, { decay, depositGain: 0, bleed: 0.1 });
  }

  const lastPoint = lastNodeGraphScope2dPathPoint(points);
  if (lastPoint) {
    canvas._nodeGraphScope2dLastDrawnPoint = lastPoint;
  }

  // Soft film exposure — stable base so low burn stays dim, not blank.
  const exposure = nodeGraphScope2dEnergyBurnExposure(burn);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  if (nodeGraphPhosphorEnergyGlPresent(energyGl, 1, { exposure })) {
    context.save();
    context.globalCompositeOperation = "lighter";
    // Smooth when density ≥ 1 (supersample AA); nearest when intentionally chunky.
    context.imageSmoothingEnabled = (sync.density || 1) >= 0.999;
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
  }
  return true;
}

function drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings) {
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const density = Number(settings?.pixelDensity);
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    Number.isFinite(density) ? density : 1,
  );
  if (!sync.synced) {
    return;
  }
  const canvasSquare = nodeGraphScope2dBurnCanvasSquare(canvas);
  if (!canvasSquare) {
    return;
  }
  if (nodeGraphModuleScopePaused()) {
    drawNodeGraphRetainedBurnPath(item, pixelRatio, [], settings);
    return;
  }
  // Deposit only samples since last draw (+ bridge). Phosphor residual is the
  // lagging trail — do not re-stamp the full history every frame.
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  const budget = nodeGraphScope2dMaxSamplesPerFrame(canvas);
  const rawStart = nodeGraphScope2dDrawStartIndex(canvas, buffer, count);
  const drawStartIndex = nodeGraphScope2dClampDrawStartIndex(rawStart, count, budget);
  let pathPoints = drawStartIndex < count
    ? buildNodeGraphScope2dPathPoints(canvasSquare, buffer, drawStartIndex, {
      interpolate: false,
      settings,
    })
    : [];
  pathPoints = bridgeNodeGraphScope2dAdjacentFramePath(
    canvas,
    pathPoints,
    nodeGraphScope2dTraceMaxSegmentPixels(canvasSquare),
    nodeGraphScope2dInterpolationSpacingPx(
      settings,
      Math.min(canvasSquare.width, canvasSquare.height),
    ),
  );
  drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, {
    endFrame: Number(buffer.nodeGraphScopeAbsoluteFrame),
  });
}

function drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, options = {}) {
  // Canonical: mono energy + LUT phosphor drawer (the one burn path).
  if (drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, options)) {
    return;
  }

  // Legacy RGB retained burn only if energy GL unavailable.
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const density = Number(settings?.pixelDensity);
  const sync = syncNodeGraphScope2dBurnCanvas(
    canvas,
    screenElement,
    pixelRatio,
    Number.isFinite(density) ? density : 1,
  );
  if (!sync.synced) {
    return;
  }
  const renderer = nodeGraphScope2dBurnRendererForCanvas(canvas);
  if (!renderer) {
    return;
  }
  resizeNodeGraphScope2dBurnRenderer(renderer, canvas.width, canvas.height);
  if (nodeGraphModuleScopePaused()) {
    compositeNodeGraphScope2dBurn(renderer, settings, {
      sourceSurface: renderer.readSurface,
      swap: false,
    });
    return;
  }
  decayNodeGraphScope2dBurn(renderer, settings);
  const points = Array.isArray(pathPoints) ? pathPoints : [];
  const dotSpace = nodeGraphScope2dStrokeSpace(canvas);
  const layers = nodeGraphScope2dBurnLayers(settings, dotSpace);
  if (!layers.length) {
    compositeNodeGraphScope2dBurn(renderer, settings);
    return;
  }
  const vertices = buildNodeGraphScope2dBurnVertices(points);
  const endFrame = Number(options.endFrame);
  if (Number.isFinite(endFrame)) {
    renderer.lastFrame = endFrame;
    renderer._nodeGraphScope2dLastDrawnFrame = endFrame;
    canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
  }
  if (vertices.length > 0) {
    const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1);
    const gl = renderer.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.writeSurface.framebuffer);
    gl.viewport(0, 0, renderer.width, renderer.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const layer of layers) {
      drawNodeGraphScope2dBurnBeamLayer(renderer, vertices, layer, burn);
    }
    gl.disable(gl.BLEND);
  }
  const lastPoint = lastNodeGraphScope2dPathPoint(points);
  if (lastPoint) {
    canvas._nodeGraphScope2dLastDrawnPoint = lastPoint;
  }
  compositeNodeGraphScope2dBurn(renderer, settings);
}

function drawNodeGraphOneDimensionalBurnTrail(item, pixelRatio, points, settings, buffer = null) {
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const reducedPoints = reduceNodeGraphOneDimensionalBurnPoints(
    Array.isArray(points) ? points : [points],
    nodeGraphOneDimensionalBurnPointBudget(canvas),
  );
  const canvasPoints = reducedPoints.map((point) => (
    point ? nodeGraphOneDimensionalBurnViewportPointToCanvas(item, pixelRatio, point) : null
  ));
  drawNodeGraphRetainedBurnPath(item, pixelRatio, canvasPoints, settings, {
    endFrame: Number(buffer?.nodeGraphScopeAbsoluteFrame),
  });
}

function drawNodeGraphLineBurnOscilloscopeItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  const rect = item?.scopeRect;
  if (!buffer?.length || !rect) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const settings = nodeGraphLineBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  if (!canvas) {
    return;
  }
  drawNodeGraphOneDimensionalBurnTrail(
    item,
    pixelRatio,
    nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, rect, settings),
    settings,
    buffer,
  );
}

// Draws one vertical line per Hypersaw voice, at x = that voice's current
// phase (0..1) across the face. Canonical mono energy phosphor drawer
// (same soft/hard stamps as 2D Burn / Lorenz).
function drawNodeGraphHypersawBurnItem(renderer, item, pixelRatio) {
  // Vertical voice stems on the canonical mono energy phosphor drawer.
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = nodeGraphScope2dBurnCanvasForSlot(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const sync = syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, 1);
  if (!sync.synced || !canvas) {
    return;
  }
  const phases = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(String(nodeId), "Phases"))
    : null;
  const pathPoints = [];
  if (Array.isArray(phases) && phases.length && typeof PhosphorDrawer !== "undefined") {
    const spacing = Math.max(1.5, canvas.height / 48);
    for (const phase of phases) {
      const p = Number(phase);
      if (!Number.isFinite(p)) continue;
      const x = clampNodeSliderValue(p, 0, 1) * canvas.width;
      PhosphorDrawer.appendSegment(pathPoints, x, 0, x, canvas.height, spacing);
    }
  }
  const minSide = Math.max(1, Math.min(canvas.width, canvas.height));
  const settings = {
    burn: 0.55,
    decay: 0.22,
    dot1Brightness: 0.95,
    dot1Color: "#3de0ff",
    dot1Enabled: true,
    dot1Size: Math.max(0.012, Math.min(0.06, 5 / minSide)),
    lineThickness: 0.25,
    pixelDensity: 1,
    dotBudget: 4096,
  };
  drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, {
    endFrame: Number(item?.buffer?.nodeGraphScopeAbsoluteFrame),
  });
}

// Oscilloscope Bank -- a standalone, reusable "phase x amplitude" scope for
// any voice-bank-shaped source (Hypersaw today, anything else that
// publishes the same {phases, amplitudes, pans} snapshot shape later).
// Unlike hypersawBurn (a fixed 1D dispersion-position display hardcoded to
// Hypersaw), this node discovers ITS source at render time by looking at
// what's actually wired into its own Phases/Amplitudes/Pans input ports --
// "1 wire per major data array" is the whole patching model: the wire's
// existence tells this renderer which node's published snapshot to read,
// the real array payload rides the same lightweight scope-state relay
// Hypersaw's own display already uses (worklet -> main thread), not the
// per-sample audio-rate signal graph.
//
// x = phase (0..1 across the canvas), y = amplitude (bipolar stem around
// vertical center), color = pan (red at -1/left, green at 0/center, blue
// at +1/right), additive blending so overlapping voices actually brighten
// rather than overpaint, and phosphor persistence via painting a
// translucent black rect instead of clearing -- so the ghost of where
// each line has been stays visible while it fades, same technique as
// hypersawBurn and lineBurn.
// oscilloscopeBankBurn's renderer moved to
// public/modules/oscilloscopeBank/oscilloscope-bank-display.js (self-registers
// onto nodeGraphModuleScopeCustomRenderers on load).

function nodeGraphScope2dFiniteSample(value) {
  const sample = Number(value);
  return Number.isFinite(sample) ? sample : null;
}

function nodeGraphScope2dPointFromSamples(square, x, y, settings = {}) {
  const sampleX = nodeGraphScope2dFiniteSample(x);
  const sampleY = nodeGraphScope2dFiniteSample(y);
  if (sampleX === null || sampleY === null) {
    return null;
  }
  const scale = Math.max(0, Number(settings?.scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sampleX * scale * square.width * 0.5,
    y: square.top + square.height * 0.5 - sampleY * scale * square.height * 0.5,
  };
}

function nodeGraphScope2dTracePointFromSamples(square, x, y, settings) {
  const sampleX = nodeGraphScope2dFiniteSample(x);
  const sampleY = nodeGraphScope2dFiniteSample(y);
  if (sampleX === null || sampleY === null) {
    return null;
  }
  const scale = Math.max(0, Number(settings?.scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sampleX * scale * square.width * 0.5,
    y: square.top + square.height * 0.5 - sampleY * scale * square.height * 0.5,
  };
}

function nodeGraphScope2dSampleIsFinite(x, y) {
  return nodeGraphScope2dFiniteSample(x) !== null && nodeGraphScope2dFiniteSample(y) !== null;
}

/**
 * Map a face-local canvas into a centered square in **buffer pixels**.
 * Do NOT use workspace/screen rects here — those scale with zoom while the
 * local-fallback canvas buffer is layout×dpr (fixed under zoom). Mixing the
 * two made 2D Trace walk outside the face and clip into the walls.
 */
function nodeGraphScope2dTraceCanvasSquare(canvas) {
  return nodeGraphScope2dBurnCanvasSquare(canvas);
}

function nodeGraphScope2dBurnCanvasSquare(canvas) {
  const width = Math.max(1, Number(canvas?.width) || 1);
  const height = Math.max(1, Number(canvas?.height) || 1);
  const size = Math.max(1, Math.min(width, height));
  return {
    height: size,
    left: (width - size) * 0.5,
    top: (height - size) * 0.5,
    width: size,
  };
}

function nodeGraphScope2dTraceMaxSegmentPixels(square) {
  const size = Math.max(1, Math.min(Number(square?.width) || 0, Number(square?.height) || 0));
  return Math.max(8, size * 0.08);
}

function nodeGraphScope2dLayerRadiusPx(settings, dotSpace) {
  if (settings?.dot1Enabled === false) {
    return 0;
  }
  const sizeValue = Number(settings?.dot1Size);
  const size = Number.isFinite(sizeValue) ? clampNodeSliderValue(sizeValue, 0, 1) : 0;
  return Math.max(0, (Number(dotSpace) || 0) * size * 0.5);
}

function nodeGraphScope2dContinuitySpacingPx(settings, dotSpace) {
  const rawRadius = nodeGraphScope2dLayerRadiusPx(settings, dotSpace);
  const radius = rawRadius > 0 ? rawRadius : 1;
  return Math.max(0.5, radius * 0.18);
}

function nodeGraphScope2dTraceSegmentIsContinuous(previousPoint, point, maxSegmentPixels) {
  if (!previousPoint || !point) {
    return true;
  }
  const dx = point.x - previousPoint.x;
  const dy = point.y - previousPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= Math.max(1, Number(maxSegmentPixels) || 1);
}

function buildNodeGraphScope2dTraceCanvasPoints(canvasSquare, buffer, settings) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!canvasSquare || count <= 0) {
    return [];
  }
  // Control-point budget only — canvas stroke fills segments (no densify loop).
  const budget = typeof TraceStroke !== "undefined" && TraceStroke.pointBudget
    ? TraceStroke.pointBudget(canvasSquare.width, canvasSquare.height)
    : Math.max(256, Math.min(4096, Math.floor(Math.sqrt(canvasSquare.width * canvasSquare.height) * 8)));
  const indices = typeof nodeGraphScope2dEvenSampleIndices === "function"
    ? nodeGraphScope2dEvenSampleIndices(count, budget)
    : null;
  const points = [];
  const maxSegmentPixels = nodeGraphScope2dTraceMaxSegmentPixels(canvasSquare);
  let previousPoint = null;
  const visit = (index) => {
    const point = nodeGraphScope2dTracePointFromSamples(
      canvasSquare,
      buffer.x[index],
      buffer.y[index],
      settings,
    );
    if (!point) {
      breakNodeGraphScope2dPath(points);
      previousPoint = null;
      return;
    }
    if (!nodeGraphScope2dTraceSegmentIsContinuous(previousPoint, point, maxSegmentPixels)) {
      breakNodeGraphScope2dPath(points);
      previousPoint = null;
    }
    points.push(point);
    previousPoint = point;
  };
  if (indices && indices.length) {
    for (let i = 0; i < indices.length; i += 1) {
      visit(indices[i]);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      visit(index);
    }
  }
  return points;
}

function drawNodeGraphScope2dTraceLayer(context, points, dotSpace, settings) {
  if (!context || !Array.isArray(points) || !points.length) {
    return;
  }
  if (settings.dot1Enabled === false) {
    return;
  }
  // Instant core+skirt stroke (no burn/bleed). Blur 0 hard … 1 soft skirt.
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    const count = TraceStroke.draw(context, points, {
      size: settings.dot1Size,
      blur: settings.lineThickness,
      brightness: settings.dot1Brightness,
      color: settings.dot1Color,
      faceMinSide: Math.max(1, Number(dotSpace) || 1),
    });
    if (count > 0) {
      recordNodeGraphModuleScopeRenderMetrics(count, count);
    }
    return;
  }
  const size = clampNodeSliderValue(settings.dot1Size, 0, 1);
  const brightness = Math.max(0, Number(settings.dot1Brightness) || 0);
  if (size <= 0 || brightness <= 0) {
    return;
  }
  const blur = clampNodeSliderValue(settings.lineThickness, 0, 1);
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.dot1Color));
  const radius = Math.max(0.5, Math.max(1, Number(dotSpace) || 1) * size * 0.5);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = radius * 2;
  context.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, brightness)})`;
  context.shadowBlur = blur > 0.02 ? radius * blur * 2 : 0;
  context.beginPath();
  drawNodeGraphScopeCanvasSmoothPath(context, points);
  context.stroke();
  context.restore();
}

function drawNodeGraphScope2dTraceItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  if (canvas.dataset.scope2dRenderer !== "sample-history-trace-1") {
    canvas.dataset.scope2dRenderer = "sample-history-trace-1";
  }
  // Buffer-local square (layout×dpr). Never use item.scopeRect/screenRect —
  // those are workspace screen coords and grow with zoom, so the stroke would
  // walk out of the face and clip into the module chrome.
  const canvasSquare = nodeGraphScope2dTraceCanvasSquare(canvas);
  const settings = nodeGraphScope2dTraceSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  const points = buildNodeGraphScope2dTraceCanvasPoints(canvasSquare, buffer, settings);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!points.some(Boolean)) {
    return;
  }
  const dotSpace = Math.min(canvas.width, canvas.height);
  drawNodeGraphScope2dTraceLayer(context, points, dotSpace, settings);
}

function buildNodeGraphTraceDisplaySamples(buffer, slot, pointCount, progressFn, samplesPerPoint) {
  const view = nodeGraphTraceDisplayBufferView(buffer, slot);
  if (!view || view.end <= view.start) {
    return null;
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const spPt = Number.isFinite(Number(samplesPerPoint))
    ? samplesPerPoint
    : visibleSamples / Math.max(1, pointCount - 1);
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer);
  const samples = [];
  let previousRaw = null;
  let skipThroughIndex = -1;
  for (let index = 0; index < pointCount; index += 1) {
    const progress = progressFn(index, pointCount);
    const samplePosition = view.start + progress * Math.max(0, visibleSamples - 1);
    const sampleInfo = nodeGraphTraceDisplaySampleInfo(buffer, samplePosition, spPt);
    const raw = Number.isFinite(Number(sampleInfo.value)) ? Number(sampleInfo.value) : 0;
    const value = clampNodeSliderValue((raw * view.gain) + view.offset, -1, 1);
    if (skipSamples > 0 && previousRaw !== null) {
      if (sampleInfo.discontinuity) {
        skipThroughIndex = Math.max(skipThroughIndex, index + skipSamples);
      }
      if (Math.abs(raw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold) {
        skipThroughIndex = Math.max(skipThroughIndex, index + skipSamples - 1);
      }
    }
    samples.push({ progress, samplePosition, raw, value, breakBefore: index <= skipThroughIndex });
    previousRaw = raw;
  }
  return samples;
}

function buildNodeGraphTraceDisplayCanvasPoints(buffer, canvas, slot) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const view = nodeGraphTraceDisplayBufferView(buffer, slot);
  const halfHeight = canvas.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, { height: canvas.height });
  if (!view || view.end <= view.start) {
    const sample = nodeGraphModuleScopeInterpolatedSample(buffer, Math.max(0, buffer.length - 1));
    const value = clampNodeSliderValue((sample * (Number(view?.gain) || 1)) + (Number(view?.offset) || 0), -1, 1);
    return [{
      x: 0,
      y: (canvas.height * 0.5) - value * halfHeight,
    }, {
      x: canvas.width,
      y: (canvas.height * 0.5) - value * halfHeight,
    }];
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const width = Math.max(1, canvas.width);
  const budget = typeof TraceStroke !== "undefined" && TraceStroke.pointBudget
    ? TraceStroke.pointBudget(canvas.width, canvas.height, nodeGraphTraceDisplayRenderPointBudget())
    : Math.max(2, Math.min(width, nodeGraphTraceDisplayRenderPointBudget()));
  const pointCount = Math.max(2, Math.min(width, Math.ceil(visibleSamples), budget));
  const midY = canvas.height * 0.5;
  const samplesPerPoint = visibleSamples / Math.max(1, pointCount - 1);
  const progressFn = (index, count) => count <= 1 ? 0 : index / (count - 1);
  const samples = buildNodeGraphTraceDisplaySamples(buffer, slot, pointCount, progressFn, samplesPerPoint);
  if (!samples) {
    return [];
  }
  const points = [];
  for (const s of samples) {
    if (s.breakBefore) {
      if (points.length > 0 && points[points.length - 1] !== null) {
        points.push(null);
      }
    } else {
      points.push({ x: s.progress * width, y: midY - s.value * halfHeight });
    }
  }
  return points;
}

function drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas, options = {}) {
  if (!context || !Array.isArray(points) || points.length < 1 || !canvas) {
    return;
  }
  if (layer.enabled === false) {
    return;
  }
  const face = Math.min(canvas.width, canvas.height);
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    // Instant core+skirt (no burn). options.glow false → hard core only.
    TraceStroke.draw(context, points, {
      size: layer.size,
      blur: options.glow === false ? 0 : layer.blur,
      brightness: layer.brightness,
      color: layer.color,
      faceMinSide: face,
    });
    return;
  }
  const size = clampNodeSliderValue(layer.size, 0, 1);
  const brightness = Math.max(0, Number(layer.brightness) || 0);
  if (size <= 0 || brightness <= 0) {
    return;
  }
  const blur = clampNodeSliderValue(layer.blur, 0, 1);
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(layer.color));
  const lineWidth = Math.max(1, face * size);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, brightness)})`;
  context.shadowBlur = (options.glow !== false && blur > 0.02) ? lineWidth * blur * 1.5 : 0;
  context.beginPath();
  drawNodeGraphScopeCanvasSmoothPath(context, points);
  context.stroke();
  context.restore();
}

// Output stereo color model (see TraceStroke.drawStereoRedBlueGreen):
//   Left-only  → red   (255, 0, 0)
//   Right-only → blue  (0, 0, 255)
//   Both meet  → green (0, 255, 0)
// Size/blur/brightness still come from primary vs secondary trace settings.
const nodeGraphOutputTraceLeftColor = "#ff0000";
const nodeGraphOutputTraceRightColor = "#0000ff";

function nodeGraphOutputStereoTraceBuffers(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return null;
  }
  const left = nodeGraphModuleScopeState.buffers.get(`${id}:Left`);
  const right = nodeGraphModuleScopeState.buffers.get(`${id}:Right`);
  if (!left?.length || !right?.length) {
    return null;
  }
  return { left, right };
}

function nodeGraphTraceDisplayPrimaryLayer(settings, color) {
  return {
    enabled: settings.dot1Enabled,
    size: settings.dot1Size,
    brightness: settings.brightness,
    blur: settings.lineThickness,
    color,
  };
}

function drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!slot || !buffer?.length || !screenElement) {
    return false;
  }
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(slot);
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return false;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const stereoBuffers = slot?.type === "output" ? nodeGraphOutputStereoTraceBuffers(slot.nodeId) : null;
  if (stereoBuffers) {
    const leftBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.left, settings);
    const rightBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.right, settings);
    const leftPoints = buildNodeGraphTraceDisplayCanvasPoints(leftBuffer, canvas, slot);
    const rightPoints = buildNodeGraphTraceDisplayCanvasPoints(rightBuffer, canvas, slot);
    const leftLayer = nodeGraphTraceDisplayPrimaryLayer(settings, nodeGraphOutputTraceLeftColor);
    const rightLayer = {
      enabled: settings.secondaryEnabled !== false,
      size: settings.secondarySize,
      brightness: settings.secondaryBrightness,
      blur: settings.secondaryLineThickness,
      color: nodeGraphOutputTraceRightColor,
    };
    context.clearRect(0, 0, canvas.width, canvas.height);
    const face = Math.min(canvas.width, canvas.height);
    let painted = 0;
    if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereoRedBlueGreen) {
      // Red + blue masks; overlap becomes green (not magenta).
      painted = TraceStroke.drawStereoRedBlueGreen(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: leftLayer.blur,
          brightness: leftLayer.brightness,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: rightLayer.blur,
          brightness: rightLayer.brightness,
          faceMinSide: face,
        },
      );
    } else {
      // Fallback: layered RGB (overlap will look magenta, not green).
      drawNodeGraphTraceDisplayCanvasLayer(context, rightPoints, rightLayer, canvas, { glow: false });
      drawNodeGraphTraceDisplayCanvasLayer(context, leftPoints, leftLayer, canvas, { glow: false });
      painted = leftPoints.length + rightPoints.length;
    }
    recordNodeGraphModuleScopeRenderMetrics(painted, painted);
    rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
    return true;
  }
  const points = buildNodeGraphTraceDisplayCanvasPoints(buffer, canvas, slot);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const layer = nodeGraphTraceDisplayPrimaryLayer(settings, settings.color);
  drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas);
  recordNodeGraphModuleScopeRenderMetrics(points.length, points.length);
  rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
  return true;
}

function appendNodeGraphScope2dInterpolatedPoint(points, point, spacingPx = 0.5) {
  if (!point) {
    return;
  }
  const previous = points[points.length - 1];
  if (!previous) {
    points.push(point);
    return;
  }
  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(distance)) {
    return;
  }
  const safeSpacing = Math.max(0.25, Number(spacingPx) || 0.5);
  if (distance < safeSpacing) {
    points.push(point);
    return;
  }
  const steps = Math.max(1, Math.ceil(distance / safeSpacing));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    points.push({
      x: previous.x + dx * t,
      y: previous.y + dy * t,
    });
  }
}

function appendNodeGraphScope2dSegment(points, previousPoint, point, spacingPx = 0.5) {
  if (!point) {
    return point || previousPoint;
  }
  if (!previousPoint) {
    points.push(point);
    return point;
  }
  const segmentPoints = [previousPoint];
  appendNodeGraphScope2dInterpolatedPoint(segmentPoints, point, spacingPx);
  if (segmentPoints.length <= 1) {
    return previousPoint;
  }
  points.push(...segmentPoints.slice(1));
  return point;
}

function nodeGraphScope2dInterpolationSpacingPx(settings = {}, dotSpace = 1) {
  return nodeGraphScope2dContinuitySpacingPx(settings, dotSpace);
}

function breakNodeGraphScope2dPath(points) {
  if (Array.isArray(points) && points.length && points[points.length - 1] !== null) {
    points.push(null);
  }
}

function firstNodeGraphScope2dPathPoint(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  return points.find(Boolean) || null;
}

function lastNodeGraphScope2dPathPoint(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index]) {
      return points[index];
    }
  }
  return null;
}

function nodeGraphScope2dPointDistance(a, b) {
  if (!a || !b) {
    return Infinity;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Number.isFinite(distance) ? distance : Infinity;
}

function bridgeNodeGraphScope2dAdjacentFramePath(canvas, pathPoints, maxDistancePx, spacingPx) {
  const previousPoint = canvas?._nodeGraphScope2dLastDrawnPoint || null;
  const firstPoint = firstNodeGraphScope2dPathPoint(pathPoints);
  if (!previousPoint || !firstPoint || nodeGraphScope2dPointDistance(previousPoint, firstPoint) > maxDistancePx) {
    return pathPoints;
  }
  // One bridge vertex only — soft GPU beam segments already fill the gap
  // (prettyscope/woscope style). Dense CPU interpolation here multiplies
  // segment count and tanks FPS at high speed without improving softness.
  void spacingPx;
  return [previousPoint, ...pathPoints];
}

/**
 * Hard cap path control points / stamps per visual frame for retained 2D burn.
 * Cost stays O(budget); quality for slow orbits comes from even coverage of the
 * full history window, not from densifying one short arc of newest samples.
 */
function nodeGraphScope2dMaxSamplesPerFrame(canvas) {
  const area = Math.max(1, (canvas?.width || 1) * (canvas?.height || 1));
  return Math.max(768, Math.min(4096, Math.floor(Math.sqrt(area) * 6)));
}

/**
 * Evenly pick up to maxPoints indices across [0, count) for path geometry.
 * This is a control-point cap for the polyline — stamp count is decided later
 * by ideal spacing (may be far below maxPoints).
 */
function nodeGraphScope2dEvenSampleIndices(count, maxPoints) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount <= 0) {
    return [];
  }
  const cap = Math.max(2, Math.floor(Number(maxPoints) || 2));
  if (safeCount <= cap) {
    const all = new Array(safeCount);
    for (let i = 0; i < safeCount; i += 1) {
      all[i] = i;
    }
    return all;
  }
  const indices = new Array(cap);
  const last = safeCount - 1;
  for (let i = 0; i < cap; i += 1) {
    indices[i] = Math.min(last, Math.round((i * last) / (cap - 1)));
  }
  return indices;
}

/**
 * Build path polyline from the capture window. Prefer enough control points to
 * follow the curve; do NOT force maxPoints when fewer samples exist.
 * Stamp budget is applied separately (ideal spacing, stop when empty).
 */
function buildNodeGraphScope2dEvenPathPoints(square, buffer, maxPoints, settings) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count || !square) {
    return [];
  }
  // Control points: use all samples if modest; otherwise even-subsample.
  // Cap control verts so we don't iterate 44k points — stamps are budgeted later.
  const controlCap = Math.min(
    count,
    Math.max(256, Math.min(Math.floor(Number(maxPoints) || 2048) * 2, 8192)),
  );
  const indices = nodeGraphScope2dEvenSampleIndices(count, controlCap);
  const pathPoints = [];
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {
      breakNodeGraphScope2dPath(pathPoints);
      continue;
    }
    const point = nodeGraphScope2dPointFromSamples(
      square,
      buffer.x[index],
      buffer.y[index],
      settings,
    );
    if (!point) {
      breakNodeGraphScope2dPath(pathPoints);
      continue;
    }
    pathPoints.push(point);
  }
  return pathPoints;
}

/**
 * If more samples arrived than we can afford this frame, skip the middle and
 * start from the newest window so we never fall into a catch-up death spiral.
 * (Used by segment / incremental modes.)
 */
function nodeGraphScope2dClampDrawStartIndex(startIndex, count, maxSamples) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const safeStart = Math.max(0, Math.min(safeCount, Math.floor(Number(startIndex) || 0)));
  const cap = Math.max(64, Math.floor(Number(maxSamples) || 2048));
  if (safeCount - safeStart <= cap) {
    return safeStart;
  }
  return Math.max(0, safeCount - cap);
}

function nodeGraphScope2dCanvasSettingsSignature(settings) {
  const safeSettings = normalizeNodeGraphScope2dSettings(settings);
  return [
    safeSettings.burn,
    safeSettings.decay,
    safeSettings.dot1Enabled ? 1 : 0,
    safeSettings.dot1Size,
    safeSettings.dot1Brightness,
    safeSettings.dot1Color,
    safeSettings.lineThickness,
  ].join("|");
}

function nodeGraphScope2dDrawStartIndex(state, buffer, count) {
  const startFrame = Number(buffer?.nodeGraphScopeStartFrame);
  const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const lastFrame = Number(state?._nodeGraphScope2dLastDrawnFrame);
  if (
    !Number.isFinite(startFrame) ||
    !Number.isFinite(endFrame) ||
    !Number.isFinite(lastFrame) ||
    endFrame <= startFrame
  ) {
    return 0;
  }
  if (lastFrame >= endFrame) {
    return count;
  }
  if (lastFrame <= startFrame) {
    return 0;
  }
  const frameOffset = Math.max(0, Math.floor(lastFrame - startFrame) - 1);
  return Math.min(Math.max(0, Math.floor(Number(count) || 0) - 1), frameOffset);
}

function buildNodeGraphScope2dPathPoints(square, buffer, startIndex = 0, options = {}) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count) {
    return [];
  }
  const pathPoints = [];
  const interpolationSpacingPx = nodeGraphScope2dInterpolationSpacingPx(
    options.settings,
    Math.min(Number(square?.width) || 1, Number(square?.height) || 1),
  );
  const interpolate = options.interpolate !== false;
  let previousPoint = null;
  for (let index = Math.max(0, Math.floor(Number(startIndex) || 0)); index < count; index += 1) {
    if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {
      breakNodeGraphScope2dPath(pathPoints);
      previousPoint = null;
      continue;
    }
    const point = nodeGraphScope2dPointFromSamples(square, buffer.x[index], buffer.y[index], options.settings);
    if (!point) {
      breakNodeGraphScope2dPath(pathPoints);
      previousPoint = null;
      continue;
    }
    if (interpolate) {
      previousPoint = appendNodeGraphScope2dSegment(pathPoints, previousPoint, point, interpolationSpacingPx);
    } else {
      pathPoints.push(point);
      previousPoint = point;
    }
  }
  return pathPoints;
}

function drawNodeGraphScope2dItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const buffer = item?.buffer;
  if (!rect || !buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const settings = nodeGraphScope2dSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings);
}

// Registry of displayType -> renderer function, checked by
// drawNodeGraphModuleScopeTypedItem below. New bespoke display types (e.g.
// a module's own dedicated file) can call
// nodeGraphModuleScopeCustomRenderers.yourType = yourRenderFn to register
// without editing this file, once they've also been added to the
// nodeGraphDisplayModeRenderers allow-list above (that list stays a
// separate validation step, not a dispatch mechanism).
const nodeGraphModuleScopeCustomRenderers = {
  trace: drawNodeGraphTraceDisplayItem,
  dot: drawNodeGraphDotOscilloscopeItem,
  value: drawNodeGraphValueOscilloscopeItem,
  lineBurn: drawNodeGraphLineBurnOscilloscopeItem,
  hypersawBurn: drawNodeGraphHypersawBurnItem,
  scope2dTrace: drawNodeGraphScope2dTraceItem,
  scope2d: drawNodeGraphScope2dItem,
  numberReadout: drawNodeGraphNumberReadoutItem,
  customDisplay: drawNodeGraphCustomDisplayItem,
  // oscilloscopeBankBurn self-registers from
  // public/modules/oscilloscopeBank/oscilloscope-bank-display.js
  // videoscopeBurn self-registers from
  // public/modules/videoscope/videoscope-display.js
  // ledLamp self-registers from public/modules/led/led-display.js
};

function drawNodeGraphModuleScopeTypedItem(renderer, item, pixelRatio) {
  const displayRenderer = nodeGraphModuleDisplayRendererForSlot(item?.slot);
  const customRenderer = nodeGraphModuleScopeCustomRenderers[displayRenderer];
  if (customRenderer) {
    customRenderer(renderer, item, pixelRatio);
    return true;
  }
  return false;
}

function drawNodeGraphModuleScopes() {
  const debug = setNodeGraphModuleScopeDebugPhase("enter", {
    drawAttempts: (Number(nodeGraphModuleScopeState.renderDebug?.drawAttempts) || 0) + 1,
    lastFrameStartMs: nodeGraphModuleScopeNowMs(),
    zoom: nodeGraphModuleScopeZoomScale(),
  });
  const canvas = nodeGraphModuleScopeCanvas();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!nodeGraphModuleScopeHasDrawableSlots()) {
    setNodeGraphModuleScopesEnabled(false);
    markNodeGraphModuleScopeDebugSkip("no-drawable-slots");
    return;
  }
  if (!canvas || !workspace || !nodeGraphModuleScopeBuffersCurrent()) {
    markNodeGraphModuleScopeDebugSkip(!canvas ? "no-canvas" : !workspace ? "no-workspace" : "stale-buffers");
    return;
  }
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  debug.totalSlots = nodeGraphModuleScopeSlots().length;
  setNodeGraphModuleScopesEnabled(true);
  setNodeGraphModuleScopeDebugPhase("sync-canvas");
  if (!syncNodeGraphModuleScopeCanvas()) {
    markNodeGraphModuleScopeDebugSkip("canvas-sync");
    return;
  }
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  const renderer = nodeGraphModuleScopeRenderer(canvas);
  if (!renderer) {
    setNodeGraphModuleScopesEnabled(false);
    markNodeGraphModuleScopeDebugSkip("no-renderer");
    return;
  }
  setNodeGraphModuleScopeDebugPhase("ready");
  // Read workspace layout BEFORE flushing readouts to avoid forced reflow
  const workspaceRect = workspace.getBoundingClientRect();
  const prePixelRatio = nodeGraphModuleScopeBackingPixelRatio(workspaceRect);
  flushNodeSliderReadoutUpdates();
  // Do NOT schedule filter-curve redraws from the scope loop. That forced
  // getBoundingClientRect on every filter every frame, layout-thrashed the
  // main thread, and made module dragging feel dead. Filter faces update from
  // slider flush / param sync only (still live while you drag cutoffs).
  if (nodeGraphModuleScopeTracesOff()) {
    if (!nodeGraphModuleScopeState.scopeTracesOffActive) {
      clearNodeGraphModuleScopeCanvas();
    }
    nodeGraphModuleScopeState.scopeTracesOffActive = true;
    markNodeGraphModuleScopeDebugSkip("traces-off");
    return;
  }
  nodeGraphModuleScopeState.scopeTracesOffActive = false;
  const scopePaused = nodeGraphModuleScopePaused();
  if (scopePaused && !nodeGraphModuleScopeHasModelDisplay()) {
    nodeGraphModuleScopeState.animationLastTime = (performance.now?.() || Date.now()) / 1000;
    markNodeGraphModuleScopeDebugSkip("paused");
    return;
  }
  const animationTime = (performance.now?.() || Date.now()) / 1000;
  const previousAnimationTime = Number(nodeGraphModuleScopeState.animationLastTime) || animationTime;
  nodeGraphModuleScopeState.animationDeltaSeconds = clampNodeSliderValue(
    animationTime - previousAnimationTime,
    1 / 240,
    1 / 15,
  );
  nodeGraphModuleScopeState.animationLastTime = animationTime;
  nodeGraphModuleScopeState.animationTime = animationTime;
  beginNodeGraphModuleScopeRenderMetricsFrame();
  const pixelRatio = Number(renderer.pixelRatio) ||
    Number(nodeGraphModuleScopeState.backingPixelRatio) ||
    nodeGraphModuleScopeBackingPixelRatio(workspace.getBoundingClientRect());
  debug.pixelRatio = pixelRatio;
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  const gl = renderer.gl;
  setNodeGraphModuleScopeDebugPhase("collect");
  const visibleItems = nodeGraphModuleScopeScreenItems(workspace, canvas, pixelRatio);
  debug.visibleItems = visibleItems.length;
  const firstVisibleSlot = visibleItems[0]?.slot;
  flushNodeSliderReadoutUpdates();
  if (!scopePaused && nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems)) {
    setNodeGraphModuleScopeDebugPhase("trace-unchanged");
    commitNodeGraphModuleScopeRenderMetricsFrame(animationTime);
    return;
  }
  if (!nodeGraphModuleScopePhosphorFrameReady(firstVisibleSlot)) {
    setNodeGraphModuleScopeDebugPhase("fps-gate");
    commitNodeGraphModuleScopeRenderMetricsFrame(animationTime);
    scheduleNodeGraphModuleScopeDraw();
    return;
  }
  setNodeGraphModuleScopeDebugPhase("clear-current-frame");
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  setNodeGraphModuleScopeDebugPhase("webgl-setup");
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);
  for (const item of visibleItems) {
    try {
      if (drawNodeGraphModuleScopeTypedItem(renderer, item, pixelRatio)) {
        continue;
      }
    } catch (error) {
      const slot = item?.slot;
      markNodeGraphModuleScopeDebugError(error);
      console.error("node graph typed module scope draw failed", {
        displayType: nodeGraphModuleDisplayRendererForSlot(slot),
        error,
        nodeId: slot?.nodeId,
        type: slot?.type,
      });
      continue;
    }
    const {
      buffer,
      scopeRect,
      settings: scopeSettings,
      slot,
      visibleProgressRange,
      visibleScopeRect,
    } = item;
    renderNodeGraphModuleScopeAnalyzer(slot, buffer);
    if (buffer?.nodeGraphScopeLightDisplay) {
      continue;
    }
    gl.enable(gl.SCISSOR_TEST);
    const brightness = nodeGraphModuleScopeTraceBrightness(slot, scopeSettings);
    const lineThickness = nodeGraphModuleScopeTraceLineThickness(slot, scopeSettings);
    const zoomScale = nodeGraphModuleScopeStrokeZoomScale();
    const blendMode = nodeGraphModuleScopeTraceBlendMode(slot);
    const heatmapMode = blendMode === "heatmap";
    const colors = heatmapMode
      ? nodeGraphModuleScopeHeatmapTraceColors()
      : nodeGraphModuleScopeDotStyle(slot, buffer);
    // Spectrum bars are filled shapes, not points/lines, so they shouldn't be
    // gated by the "Dot Core" enable toggle (it exists to turn off the
    // point-scope glow core) -- without this, disabling Dot Core zeroes
    // coreBrightness for every node and leaves bars invisible.
    const isSpectrumBuffer = buffer?.nodeGraphScopeSpectrum === true;
    const coreBrightness = isSpectrumBuffer
      ? 1
      : heatmapMode
        ? (nodeGraphMvp?.moduleScopeDotCore1Enabled === false ? 0 : 1)
        : colors.coreBrightness / nodeGraphModuleScopeDefaultDotCores.dot1.brightness;
    if (coreBrightness > 0) {
      setNodeGraphModuleScopeDebugPhase(`draw-core:${slot.type}`);
      applyNodeGraphModuleScopeTraceBlendMode(gl, blendMode);
      drawNodeGraphModuleScopeBufferWebGl(renderer, scopeRect, buffer, pixelRatio, slot, {
        color: colors.coreColor ?? colors.core,
        dotSizeScale: heatmapMode
          ? undefined
          : nodeGraphModuleScopeTraceDotSizeScale(colors.coreSize, nodeGraphModuleScopeDefaultDotCores.dot1.size),
        intensity: (heatmapMode ? 0.34 : 1.0) * brightness * coreBrightness,
        thicknessPx: 1.25 * zoomScale,
        visibleProgressRange,
        visibleRect: visibleScopeRect,
      });
    }
  }
  setNodeGraphModuleScopeDebugPhase("current-frame-ready");
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  setNodeGraphModuleScopeDebugPhase("lights");
  drawNodeGraphModuleScopeLightDisplays(visibleItems, pixelRatio);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  setNodeGraphModuleScopeDebugPhase("commit");
  commitNodeGraphModuleScopeRenderMetricsFrame(animationTime);
  if (!scopePaused && (visibleItems.length || nodeGraphModuleScopeHasModelDisplay())) {
    setNodeGraphModuleScopeDebugPhase("schedule-next");
    scheduleNodeGraphModuleScopeDraw();
  } else {
    setNodeGraphModuleScopeDebugPhase("idle");
  }
}

function scheduleNodeGraphModuleScopeDraw() {
  if (!nodeGraphModuleScopeHasDrawableSlots()) {
    return;
  }
  if (nodeGraphModuleScopeTracesOff()) {
    if (!nodeGraphModuleScopeState.scopeTracesOffActive) {
      nodeGraphModuleScopeState.scopeTracesOffActive = true;
      clearNodeGraphModuleScopeCanvas();
    }
    markNodeGraphModuleScopeDebugSkip("traces-off");
    return;
  }
  if (nodeGraphModuleScopePaused() && !nodeGraphModuleScopeHasModelDisplay()) {
    return;
  }
  if (nodeGraphModuleScopeState.drawFrame) {
    const now = (performance.now?.() || Date.now());
    const requestedAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
    if (requestedAt > 0 && now - requestedAt > 250) {
      window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
      nodeGraphModuleScopeState.drawFrame = 0;
      nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
      if (nodeGraphModuleScopeState.drawFrameWatchdog) {
        window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
        nodeGraphModuleScopeState.drawFrameWatchdog = 0;
      }
    } else {
      return;
    }
  }
  setNodeGraphModuleScopeDebugPhase("request-raf");
  const frameId = window.requestAnimationFrame(() => {
    if (nodeGraphModuleScopeState.drawFrameWatchdog) {
      window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
      nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    }
    nodeGraphModuleScopeState.drawFrame = 0;
    nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    runNodeGraphModuleScopeDrawFrame("raf");
  });
  nodeGraphModuleScopeState.drawFrame = frameId;
  nodeGraphModuleScopeState.drawFrameRequestedAt = (performance.now?.() || Date.now());
  nodeGraphModuleScopeState.drawFrameWatchdog = window.setTimeout(() => {
    if (nodeGraphModuleScopeState.drawFrame !== frameId) {
      return;
    }
    window.cancelAnimationFrame(frameId);
    nodeGraphModuleScopeState.drawFrame = 0;
    nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    setNodeGraphModuleScopeDebugPhase("watchdog");
    runNodeGraphModuleScopeDrawFrame("watchdog");
  }, 100);
}
