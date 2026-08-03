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
    syncButton.title = "Scope auto-trigger sync (rising edge + freerun when unlocked)";
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
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  setNodeGraphScopeNumberInputValue(
    drag.input,
    drag.startValue + axes.combined * drag.scale,
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

// nodeGraphModuleScopeCaptureMonitors → node-graph-module-scope-capture.js
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
function wipeNodeGraphModuleScopeScreensToColdBoot() {
  if (typeof document === "undefined") {
    return;
  }
  // Off-screen spectrogram history bitmaps (if the display registered a wipe).
  if (typeof clearNodeGraphSpectrogramHistory === "function") {
    try {
      clearNodeGraphSpectrogramHistory();
    } catch (_error) {
      // Best-effort.
    }
  }
  // LEDs are CSS lamps (no canvas) — force unlit + no glow.
  for (const face of document.querySelectorAll(".node-led-face")) {
    const shell = face.closest(".dsp-node") || face;
    shell.style?.setProperty?.("--node-led-face-color", "rgb(0, 0, 0)");
    shell.style?.setProperty?.("--node-led-face-glow", "none");
    if (face.dataset) {
      face.dataset.lightStrength = "0";
      delete face.dataset.ledAppearance;
    }
  }
  // Room-light emitters go dark with the simulation. Number Readout LCD keeps
  // a full hole; Knob only re-lights when face art is present (paint).
  for (const el of document.querySelectorAll("[data-light-strength], [data-light-source]")) {
    if (el.dataset && !el.classList?.contains("node-number-readout-face")) {
      el.dataset.lightStrength = "0";
    }
  }
  const phosphorKeys = ["_phosphorEnergyGl", "_xyPadPhosphorEnergyGl"];
  const canvases = new Set();
  for (const canvas of document.querySelectorAll(
    "canvas.node-module-scope-local-fallback-canvas, canvas.node-xy-pad-canvas, canvas.node-spectrogram-canvas, canvas.node-phosphor-waveform-canvas",
  )) {
    if (canvas instanceof HTMLCanvasElement) {
      canvases.add(canvas);
    }
  }
  // Any other canvas still holding a phosphor energy face (chromeless modules).
  for (const canvas of document.querySelectorAll("canvas")) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      continue;
    }
    if (canvas.classList?.contains("node-number-readout-canvas")) {
      continue;
    }
    if (phosphorKeys.some((key) => canvas[key])) {
      canvases.add(canvas);
    }
  }
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined" && nodeGraphModuleScopePersistentCanvases?.values) {
    for (const canvas of nodeGraphModuleScopePersistentCanvases.values()) {
      if (canvas instanceof HTMLCanvasElement) {
        canvases.add(canvas);
      }
    }
  }
  for (const canvas of canvases) {
    // Shared workspace overlays are cleared by clearNodeGraphModuleScopeCanvas().
    // Number Readout has its own idle-LCD wipe (do not solid-plate over it).
    if (
      canvas.id === "nodeModuleScopeCanvas"
      || canvas.classList?.contains("node-module-scope-light-canvas")
      || canvas.classList?.contains("node-room-dimmer-canvas")
      || canvas.classList?.contains("node-number-readout-canvas")
    ) {
      continue;
    }
    for (const key of phosphorKeys) {
      const face = canvas[key];
      if (face && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
        try {
          nodeGraphPhosphorEnergyGlDestroy(face);
        } catch (_error) {
          // Best-effort; a torn-down WebGL context is already dark.
        }
      }
      canvas[key] = null;
    }
    if (canvas._numberReadoutLastValueText !== undefined) {
      canvas._numberReadoutLastValueText = "";
      canvas._numberReadoutLastTextChangeAt = 0;
      canvas._nodeGraphNumberReadoutText = "";
    }
    if (canvas._numberReadoutResidualPresent) {
      const rctx = canvas._numberReadoutResidualPresent.getContext?.("2d");
      rctx?.clearRect(
        0,
        0,
        canvas._numberReadoutResidualPresent.width,
        canvas._numberReadoutResidualPresent.height,
      );
    }
    const context = canvas.getContext?.("2d");
    if (!context || !(canvas.width > 0) || !(canvas.height > 0)) {
      continue;
    }
    const bg = nodeGraphModuleScopePlateBackgroundForElement(canvas);
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(context, canvas, bg);
    } else {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = bg || "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
  }
  // Last: idle LCD plate + unlit segments + dimmer strength (not a solid blank).
  wipeNodeGraphNumberReadoutScreensToColdBoot();
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
    // Full cold-boot wipe: energy residual + painted face pixels + CSS lamps.
    // stopNodeGraphLiveAudio calls this so Stop turns the simulation off.
    wipeNodeGraphModuleScopeScreensToColdBoot();
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

// beginNodeGraphRenderedScopeCapture → node-graph-module-scope-capture.js
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

// captureNodeGraphRenderedScopeFrame → node-graph-module-scope-capture.js
// finishNodeGraphRenderedScopeCapture → node-graph-module-scope-capture.js
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

// beginNodeGraphLiveModuleScopeCapture → node-graph-module-scope-capture.js
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

// nodeGraphModuleScopeCapturedCurrentLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedCurrentPositiveLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFrameLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFramePositiveLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFrameBipolarLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedGateLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedPulseLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedBufferForSlot → node-graph-module-scope-capture.js
// secondary* is read only when a "trace"-schema node is Output's stereo
// display (drawNodeGraphTraceDisplayCanvasItem) -- Output shares this same
// formType with plain single-value Trace nodes (both declare
// displayType/renderer "trace"), so the field exists here for all of them,
// but a non-Output trace node's draw path never reads it.
// nodeGraphTraceDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// 1D Burn Dot = heart-monitor phosphor: pen takes sweepSeconds to cross left→right.
// Y = sample. Optional rising-edge Reset snaps to the left. Tune seconds to match
// the period you care about (easier UX than Hz).
// nodeGraphLineBurnSettingsDefaults → node-graph-module-scope-defaults.js
// nodeGraphTraceDisplayRenderPointBudgetDefault → node-graph-module-scope-defaults.js
function nodeGraphTraceDisplayRenderPointBudget() {
  return typeof normalizeNodeGraphModuleScopePointBudget === "function"
    ? normalizeNodeGraphModuleScopePointBudget(nodeGraphMvp?.moduleScopePointBudget ?? nodeGraphTraceDisplayRenderPointBudgetDefault)
    : nodeGraphTraceDisplayRenderPointBudgetDefault;
}

// nodeGraphZeroDBurnSettingsDefaults → node-graph-module-scope-defaults.js
// nodeGraphValueOscilloscopeSettingsDefaults → node-graph-module-scope-defaults.js
// numberReadout: independent schema. Residual is previous-digit ghosts only.
// "trail" UI = how long the last number's residual remains (0 = off, 1 = long).
// Digit color shares 2D phosphor: multi-stop gradient as energy→color LUT.
// Bright is 0…1 energy (1 = full gradient tip / full deposit — not a 0…2 overdrive).
// background = LCD back plate color (separate widget; not gradient floor).
// Unlit plate = ghostColor only (pick dim/bright there — no ghost-amount slider).
// nodeGraphNumberReadoutSettingsDefaults → node-graph-module-scope-defaults.js
/** Knob face display settings (readout precision only). */
// nodeGraphKnobFaceDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// Spectrogram display settings (not module params).
// Regular fixed STFT (RX-style). Display owns: History, FFT size, Window,
// Overlap, Freq Scale, Smooth, gradient. Dual-written to params for worklet.
// nodeGraphSpectrogramFftSizes → node-graph-module-scope-defaults.js
// nodeGraphSpectrogramSettingsDefaults → node-graph-module-scope-defaults.js
/** Snap FFT size to the allowed table (accepts legacy choice index 0…3). */
// nodeGraphSpectrogramSnapFftSize → node-graph-module-scope-normalize.js
/** Step FFT size along the table. */
// nodeGraphSpectrogramStepFftSize → node-graph-module-scope-normalize.js
/** FFT size for a spectrogram node from display settings / dual-write / defaults. */
// nodeGraphSpectrogramFftSizeFromNode → node-graph-module-scope-normalize.js
/**
 * Shared gradient stop normalize — delegates to NodeGraphGradientSelector
 * (single stop model / channels / defaults). Local parse only if the selector
 * script is not loaded yet.
 */
// normalizeNodeGraphSharedGradientStops → node-graph-module-scope-normalize.js
// normalizeNodeGraphSpectrogramGradientStops → node-graph-module-scope-normalize.js
/** Classic CRT phosphor ramp from peak hex (+ floor). */
// nodeGraphPhosphorDefaultGradientStops → node-graph-module-scope-normalize.js
/**
 * Resolve gradientStops for any phosphor display settings object.
 * Migrates legacy single color + background into a multi-stop ramp when needed.
 */
// nodeGraphPhosphorGradientStopsFromSettings → node-graph-module-scope-normalize.js
/**
 * Apply shared multi-stop gradient as the energy→color LUT on a phosphor face.
 * Prefer this over setLutFromPeak for all retained burn scopes.
 */
// nodeGraphPhosphorApplyGradientLut → node-graph-module-scope-normalize.js
/**
 * Form types that use the gradient selector for color.
 * Authority: NodeGraphGradientSelector.displayProfiles (single registry).
 */
// nodeGraphDisplaySettingsFormTypeUsesGradient → node-graph-module-scope-normalize.js
// normalizeNodeGraphSpectrogramSettings → node-graph-module-scope-normalize.js
/** Push analysis settings into params for the worklet. */
// syncNodeGraphSpectrogramDisplaySettingsToParams → node-graph-module-scope-normalize.js
// nodeGraphScope2dSettingsDefaults → node-graph-module-scope-defaults.js
// XY Pad = built-in phosphor of Out X/Y + cheap UI overlay (puck/grid).
// No "scale" — that would zoom the beam relative to unit Phase/puck and
// desync the control surface from the trail. Beam size is stamp size only;
// puck has its own size.
// nodeGraphXyPadDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// normalizeNodeGraphXyPadDisplaySettings → node-graph-module-scope-normalize.js
// nodeGraphXyPadDisplaySettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dTraceSettingsDefaults → node-graph-module-scope-defaults.js
// normalizeNodeGraphTraceDisplayColor → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplayNumber → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplayZoomSeconds → node-graph-module-scope-normalize.js
/** Clamp sweep duration: 0.01 s … 10 s (same ceiling as Trace history). */
// nodeGraphTraceDisplayClampSweepSeconds → node-graph-module-scope-normalize.js
/**
 * Resolve seconds-per-pass. Migrates legacy sweepHz (crossings/sec) and
 * older zoomSeconds/windowSeconds fields that already meant duration.
 */
// normalizeNodeGraphLineBurnSweepSeconds → node-graph-module-scope-normalize.js
// normalizeNodeGraphLineBurnSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphZeroDBurnSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplaySettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphValueOscilloscopeSettings → node-graph-module-scope-normalize.js
/**
 * Sample multi-stop gradient at energy t ∈ [0,1] → canvas RGB bytes.
 * Same energy→color model as the phosphor LUT (underlying light amount × color ramp).
 */
// nodeGraphSampleGradientStopsRgb → node-graph-module-scope-normalize.js
// normalizeNodeGraphNumberReadoutSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphKnobFaceDisplaySettings → node-graph-module-scope-normalize.js
// nodeGraphKnobFaceDisplaySettingsForNode → node-graph-module-scope-normalize.js
// normalizeNodeGraphScope2dSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphScope2dTraceSettings → node-graph-module-scope-normalize.js
// nodeGraphZeroDBurnSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphLineBurnSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphNumberReadoutSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dTraceSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphGlobalTraceSettings → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsEditingGlobal → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsEditingTraceDefaults → node-graph-module-scope-normalize.js
const nodeGraphDisplayModeRenderers = Object.freeze(["trace", "clock", "dot", "value", "lineBurn", "hypersawBurn", "oscilloscopeBankBurn", "videoscopeBurn", "spectrogramBurn", "transportBpm", "scope2d", "scope2dTrace", "phosphorLight", "numberReadout", "xyPad", "customDisplay", "spectrum", "ledLamp", "selfPaintFace", "matrixFace", "matrixWaterfallFace", "matrixDisplayFace", "knobFace", "pluginSliderFace", "toggleButtonFace", "momentaryButtonFace", "rgbShapeFace", "rgbPictureFace", "rgbFractalFace"]);
const nodeGraphDisplayModeSignalKinds = Object.freeze(["scalar", "xy", "buffer"]);

// nodeGraphDisplayModeSettingsSchemaForRenderer → node-graph-module-scope-display-mode.js
// normalizeNodeGraphDisplaySignal → node-graph-module-scope-display-mode.js
// nodeGraphModuleOutputPortsForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultScalarDisplayPort → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultXyDisplaySource → node-graph-module-scope-display-mode.js
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

// normalizeNodeGraphDisplayMode → node-graph-module-scope-display-mode.js
// nodeGraphModuleImplicitDisplayModeSource → node-graph-module-scope-display-mode.js
// nodeGraphModuleImplicitDisplayModeForType → node-graph-module-scope-display-mode.js
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

// nodeGraphModuleDisplayModesForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultDisplayModeKeyForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleSelectedDisplayMode → node-graph-module-scope-display-mode.js
// nodeGraphModuleDisplayRendererForNode → node-graph-module-scope-display-mode.js
// nodeGraphModuleDisplaySettingsSchemaForNode → node-graph-module-scope-display-mode.js
function nodeGraphModuleDisplayRendererForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  return node
    ? nodeGraphModuleDisplayRendererForNode(node)
    : nodeGraphModuleDisplayTypeForType(slot?.type);
}

// nodeGraphModuleDisplaySettingsSchemaForSlot → node-graph-module-scope-display-mode.js
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

// nodeGraphModuleDisplayTypeHasLocalSettings → node-graph-module-scope-display-mode.js
// nodeGraphNodeHasLocalDisplaySettings → node-graph-module-scope-display-mode.js
// nodeGraphNodeCanOpenDisplaySettings → node-graph-module-scope-display-mode.js
// nodeGraphTraceDisplaySettingsForSlot → node-graph-module-scope-display-mode.js
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

// nodeGraphModuleScopeClockCapturedLightTarget → node-graph-module-scope-capture.js
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

// nodeGraphModuleScopeXyTraceFrameCount → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedXyTraceFrameCount → node-graph-module-scope-capture.js
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
  ["zoomSeconds", "History (s)"],
  ["historySeconds", "History (s)"],
  ["scale", "Scale"],
  ["sweepSeconds", "Sweep (s)"],
  ["sweepHz", "Sweep (Hz)"],
  ["fftSize", "FFT size"],
  ["bins", "Bins"],
  ["ghost", "Ghost"],
  ["trail", "Trail"],
  ["pixelDensity", "Antialiasing"],
  ["dotBudget", "Dot Budget"],
  ["padding", "Amp"],
  ["cycles", "Cycles"],
  ["decimals", "Decimals"],
  ["hue", "Hue"],
  ["rounding", "Rounding"],

  ["dot1Size", "Size"],
  ["puckSize", "Puck size"],
  ["lineThickness", "Blur"],
  ["dot1Brightness", "Bright"],
  ["secondarySize", "Secondary size"],
  ["secondaryLineThickness", "Secondary blur"],
  ["secondaryBrightness", "Secondary light"],
  ["lineLength", "Line length"],
  ["capSize", "Cap size"],
  ["capLength", "Cap length"],
]);

/**
 * Shared phosphor Display Settings order (app-wide, including Lorenz).
 * Faces pick a subset; builders keep this relative order.
 * Size → Blur → Bright → Ghost → Trail → Scale → Antialiasing → Dot Budget
 */
const nodeGraphPhosphorDisplayFieldOrder = Object.freeze([
  "dot1Size",
  "lineThickness",
  "dot1Brightness",
  "ghost",
  "trail",
  "scale",
  "pixelDensity",
  "dotBudget",
]);

/** Form types that use the mono energy phosphor stack (Stamp + residual). */
function nodeGraphDisplaySettingsIsPhosphorFormType(type) {
  const key = String(type || "").trim();
  // Spectrogram is *Burn by name only — not the stamp/residual phosphor stack.
  if (key === "spectrogramBurn") {
    return false;
  }
  return key === "scope2d"
    || key === "phosphorLight"
    || key === "lineBurn"
    || key === "dot"
    || key === "xyPad"
    || key === "videoscopeBurn"
    || key === "oscilloscopeBankBurn"
    || key === "hypersawBurn"
    || key.endsWith("Burn");
}

/** Filter shared phosphor order down to keys active on this face. */
function nodeGraphPhosphorDisplayFieldsFor(keys) {
  const want = new Set(keys || []);
  return nodeGraphPhosphorDisplayFieldOrder.filter((key) => want.has(key));
}

const nodeGraphTraceDisplaySettingControlKeys = Object.freeze({
  fields: [
    ...nodeGraphTraceDisplaySettingFields.map(([key]) => key),
    "hue",
    "rounding",
  ],
  colors: ["dot1Color", "secondaryColor", "backgroundColor", "ghostColor"],
  // Every control key that exists in the shared popover MUST be listed here.
  // setNodeGraphTraceDisplaySettingsFormType only show/hides keys from these
  // lists — anything missing leaks onto every module (e.g. Output saw
  // Window / Overlap / Freq scale because those choices were unregistered).
  toggles: ["sourceSync", "skipDiscontinuities", "bipolarBrightness", "secondaryEnabled", "capEnabled", "fullDotEconomy"],
  choices: ["syncChannel", "stereoBlend", "window", "overlap", "freqOverlap", "freqScale", "cornerShape"],
});

const nodeGraphTraceDisplayActiveControlsByType = Object.freeze({
  // TRACE = VECTOR stroke into an optional lo-fi face buffer (density).
  // Density only sizes the canvas; it is not phosphor energy stamps / strip-chart.
  trace: Object.freeze({
    fields: Object.freeze([
      "zoomSeconds",
      "scale",
      "pixelDensity",
      "dot1Size",
      "dot1Brightness",
      "secondarySize",
      "secondaryBrightness",
    ]),
    colors: Object.freeze(["dot1Color", "secondaryColor", "backgroundColor"]),
    // sourceSync kept for legacy single-channel; Output uses syncChannel choice.
    toggles: Object.freeze(["sourceSync", "skipDiscontinuities", "secondaryEnabled"]),
    choices: Object.freeze(["syncChannel", "stereoBlend"]),
  }),
  // Phosphor energy faces: color via shared Gradient editor (not single swatches).
  // Field order = nodeGraphPhosphorDisplayFieldOrder (Size…Dot Budget).
  dot: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze(["bipolarBrightness"]),
    choices: Object.freeze([]),
  }),
  lineBurn: Object.freeze({
    // Heart-monitor phosphor: Sweep first, then shared phosphor stack.
    fields: Object.freeze([
      "sweepSeconds",
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "scale",
        "pixelDensity",
      ]),
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  value: Object.freeze({
    fields: Object.freeze([
      "lineLength",
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "scale",
        "pixelDensity",
      ]),
      "capSize",
      "capLength",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  // 2D Phosphor (Lorenz + friends): Size → Blur → Bright → Ghost → Trail → Scale → AA → Dot Budget
  scope2d: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // 2D Trace = VECTOR path; density = face buffer lo-fi/AA only.
  scope2dTrace: Object.freeze({
    fields: Object.freeze([
      "historySeconds",
      "scale",
      "pixelDensity",
      "dot1Size",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  numberReadout: Object.freeze({
    // Decimals first; digit color = shared phosphor gradient (energy→color);
    // backgroundColor = LCD back plate; ghostColor = unlit segment ink (no ghost slider).
    fields: Object.freeze([
      "decimals",
      "trail",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["backgroundColor", "ghostColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // LED lamp: same shared display inspector as other faces (not a separate window).
  ledLamp: Object.freeze({
    fields: Object.freeze([
      "hue",
      "dot1Brightness",
      "lineThickness",
      "rounding",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["cornerShape"]),
  }),
  // RGB Shape: gradient picker only (geometry is module params).
  rgbShapeFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // RGB Picture: load SVG/image (custom body); geometry is module params.
  rgbPictureFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // RGB Soft Fractal: gradient only (field is module params + rAF).
  rgbFractalFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Matrix faces: custom bodies (glyph / message) — no stepper fields.
  matrixFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  matrixWaterfallFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  matrixDisplayFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // XY Pad: phosphor of Out X/Y + UI puck. No scale (would desync puck/trail).
  xyPad: Object.freeze({
    fields: Object.freeze([
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "pixelDensity",
        "dotBudget",
      ]),
      "puckSize",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["fullDotEconomy"]),
    choices: Object.freeze([]),
  }),
  // Same controls as scope2d — leftover formType="phosphorLight".
  phosphorLight: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Spectrogram: history + FFT + analysis choices. Gradient separate.
  spectrogramBurn: Object.freeze({
    fields: Object.freeze([
      "historySeconds",
      "fftSize",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["window", "overlap", "freqOverlap", "freqScale"]),
  }),
  // Videoscope / bank / hypersaw: mono energy phosphor (same knobs as 2D Phosphor).
  // MUST NOT fall through to "trace" — that is Output's Left/Right page.
  // Videoscope Bright lives on the module face param — not in Display Settings.
  videoscopeBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  oscilloscopeBankBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  hypersawBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Knob face: readout precision (images / rotate stay in Module Settings).
  knobFace: Object.freeze({
    fields: Object.freeze(["decimals"]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  pluginSliderFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  toggleButtonFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  momentaryButtonFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplayActiveControlsForType(type = nodeGraphTraceDisplaySettingsFormType()) {
  const key = String(type || "").trim();
  if (nodeGraphTraceDisplayActiveControlsByType[key]) {
    return nodeGraphTraceDisplayActiveControlsByType[key];
  }
  // Energy / *Burn faces → scope2d controls. Never default unknown types to
  // "trace" (Output stereo page) — that leaked syncChannel/stereoBlend onto
  // Videoscope and friends.
  if (key.endsWith("Burn") || key === "transportBpm" || key === "clock") {
    return nodeGraphTraceDisplayActiveControlsByType.scope2d;
  }
  return nodeGraphTraceDisplayActiveControlsByType.trace;
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
  // Stamp geometry/light — order matches shared phosphor stack (Size → Blur → Bright).
  dot1: Object.freeze({
    fields: Object.freeze(["dot1Size", "lineThickness", "dot1Brightness", "puckSize"]),
    colors: Object.freeze(["dot1Color"]),
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
    // Residual + framing. Ghost once only (was listed twice → double "Ghost" rows).
    // Phosphor residual order: Ghost → Trail → Scale → Antialiasing → Dot Budget.
    // Stamp size/blur/bright live only under the Dot/Stamp section.
    fields: Object.freeze([
      "decimals",
      "sweepSeconds",
      "ghost",
      "trail",
      "zoomSeconds",
      "historySeconds",
      "scale",
      "pixelDensity",
      "dotBudget",
      "padding",
      "fftSize",
      "hue",
      "rounding",
    ]),
    // Face plate (+ number readout ghost ink) lives with Trace section.
    colors: Object.freeze(["backgroundColor", "ghostColor"]),
    toggles: Object.freeze(["sourceSync", "skipDiscontinuities", "fullDotEconomy"]),
    // window/overlap/freqOverlap/freqScale = spectrogram; syncChannel/stereoBlend = Output.
    // cornerShape = LED.
    choices: Object.freeze(["window", "overlap", "freqOverlap", "freqScale", "syncChannel", "stereoBlend", "cornerShape"]),
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

/** Open display-settings shell (singleton). All field queries should use this root. */
function nodeGraphTraceDisplaySettingsRoot() {
  return document.getElementById("nodeTraceDisplaySettingsPopover");
}

// Field labels / input modes for schema-exclusive body builders.
// Phosphor labels: Size, Blur, Bright, Ghost, Trail, Scale, Antialiasing, Dot Budget.
const nodeGraphDisplaySettingsFieldMeta = Object.freeze({
  ghost: Object.freeze({
    label: "Ghost",
    inputmode: "decimal",
    id: "nodeTraceDisplayGhost",
    title: "Dim scorched residual hang (screen burn-in). 0 = none; 1 = long low ghost. Not peak light (Bright) or hot trail length (Trail).",
  }),
  trail: Object.freeze({
    label: "Trail",
    inputmode: "decimal",
    id: "nodeTraceDisplayTrail",
    title: "Main residual length. 0 = dies immediately; 1 ≈ freeze-ish hot path. Dim scorched floor is Ghost.",
  }),
  historySeconds: Object.freeze({
    label: "History (s)",
    inputmode: "decimal",
    id: "nodeTraceDisplayHistorySeconds",
    title: "Seconds of audio across the face width (0.1–30 s). Longer = slower waterfall; shorter = faster. +/− steps whole seconds (min 1 s).",
  }),
  fftSize: Object.freeze({
    label: "FFT size",
    inputmode: "numeric",
    id: "nodeTraceDisplayFftSize",
    title: "Analysis window length (samples). Steps 128…16384. Time hop = N / time-overlap. Freq overlap zero-pads the FFT.",
  }),
  scale: Object.freeze({
    label: "Scale",
    inputmode: "decimal",
    id: "nodeTraceDisplayScale",
    title: "Amplitude zoom (1 = full-scale ±1 fills the face). Raise to enlarge quieter signals.",
  }),
  pixelDensity: Object.freeze({
    label: "Antialiasing",
    inputmode: "decimal",
    id: "nodeTraceDisplayPixelDensity",
    title: "Face buffer supersampling (higher = smoother stamps, more GPU). 1 = native; above 1 = antialiased energy grid.",
  }),
  dotBudget: Object.freeze({
    label: "Dot Budget",
    inputmode: "numeric",
    id: "nodeTraceDisplayDotBudget",
    title: "Max phosphor stamps drawn per frame. Raise for denser trails; lower to save GPU.",
  }),
  zoomSeconds: Object.freeze({ label: "History (s)", inputmode: "decimal", id: "nodeTraceDisplayZoomSeconds" }),
  sweepSeconds: Object.freeze({ label: "Sweep (s)", inputmode: "decimal", id: "nodeTraceDisplaySweepSeconds" }),
  cycles: Object.freeze({ label: "Cycles", inputmode: "decimal", id: "nodeTraceDisplayCycles" }),
  decimals: Object.freeze({
    label: "Decimals",
    inputmode: "numeric",
    id: "nodeTraceDisplayDecimals",
    title: "Digits after the decimal point (0–8).",
  }),
  hue: Object.freeze({
    label: "Hue",
    inputmode: "decimal",
    id: "nodeTraceDisplayHue",
    title: "LED lamp hue in degrees (0–360).",
  }),
  rounding: Object.freeze({
    label: "Rounding",
    inputmode: "decimal",
    id: "nodeTraceDisplayRounding",
    title: "LED corner rounding percent (0 = square tile, 100 = full capsule/circle).",
  }),
  padding: Object.freeze({ label: "Amp", inputmode: "decimal", id: "nodeTraceDisplayPadding" }),
  lineLength: Object.freeze({ label: "Line length", inputmode: "decimal", id: "nodeTraceDisplayValueLineLength" }),
  dot1Brightness: Object.freeze({
    label: "Bright",
    inputmode: "decimal",
    id: "nodeTraceDisplayBrightness",
    title: "Peak deposit / present light 0–1 (1 = full energy / gradient tip). Not Ghost or Trail.",
  }),
  lineThickness: Object.freeze({ label: "Blur", inputmode: "decimal", id: "nodeTraceDisplayLineThickness" }),
  dot1Size: Object.freeze({ label: "Size", inputmode: "decimal", id: "nodeTraceDisplayDot1Size" }),
  puckSize: Object.freeze({
    label: "Puck size",
    inputmode: "decimal",
    id: "nodeTraceDisplayPuckSize",
    title: "UI puck radius (vector overlay). Does not scale the phosphor trail or Phase mapping.",
  }),
  secondaryBrightness: Object.freeze({ label: "Bright", inputmode: "decimal", id: "nodeTraceDisplaySecondaryBrightness" }),
  secondaryLineThickness: Object.freeze({ label: "Blur", inputmode: "decimal", id: "nodeTraceDisplaySecondaryLineThickness" }),
  secondarySize: Object.freeze({ label: "Size", inputmode: "decimal", id: "nodeTraceDisplaySecondarySize" }),
  capSize: Object.freeze({ label: "Size", inputmode: "decimal", id: "nodeTraceDisplayCapSize" }),
  capLength: Object.freeze({ label: "Length", inputmode: "decimal", id: "nodeTraceDisplayCapLength" }),
});

const nodeGraphDisplaySettingsToggleMeta = Object.freeze({
  sourceSync: Object.freeze({ label: "Sync", id: "nodeTraceDisplaySourceSync" }),
  skipDiscontinuities: Object.freeze({ label: "Skip discontinuities", id: "nodeTraceDisplaySkipDiscontinuities" }),
  bipolarBrightness: Object.freeze({ label: "Bipolar", id: "nodeTraceDisplayBipolarBrightness" }),
  secondaryEnabled: Object.freeze({ label: "Secondary on", id: "nodeTraceDisplaySecondaryEnabled" }),
  capEnabled: Object.freeze({ label: "Caps on", id: "nodeTraceDisplayCapEnabled" }),
  fullDotEconomy: Object.freeze({
    label: "Full dot economy",
    id: "nodeTraceDisplayFullDotEconomy",
    title: "Always spend dense packing up to Dot Budget (default on). Off = thrifty spacing that may under-use the budget.",
  }),
});

// No side-column "Color" labels — the widget is self-evident; full-width row only.
const nodeGraphDisplaySettingsColorMeta = Object.freeze({
  backgroundColor: Object.freeze({
    label: "",
    aria: "Background color",
    defaultValue: "#000000",
    id: "nodeTraceDisplayBackgroundColor",
  }),
  ghostColor: Object.freeze({
    label: "",
    aria: "LCD unlit segment color",
    defaultValue: "#1a4a55",
    id: "nodeTraceDisplayGhostColor",
  }),
  dot1Color: Object.freeze({
    label: "",
    aria: "Primary color",
    defaultValue: "#ff0000",
    id: "nodeTraceDisplayColor",
  }),
  secondaryColor: Object.freeze({
    label: "",
    aria: "Secondary color",
    defaultValue: "#0000ff",
    id: "nodeTraceDisplaySecondaryColor",
  }),
});

const nodeGraphDisplaySettingsChoiceMeta = Object.freeze({
  syncChannel: Object.freeze({
    label: "Sync",
    aria: "Sync channel",
    id: "nodeTraceDisplaySyncChannel",
    options: Object.freeze([
      Object.freeze({ value: "off", label: "Off" }),
      Object.freeze({ value: "left", label: "Left" }),
      Object.freeze({ value: "right", label: "Right" }),
      Object.freeze({ value: "mono", label: "Mono" }),
    ]),
  }),
  stereoBlend: Object.freeze({
    label: "Blend",
    aria: "Stereo blend mode",
    id: "nodeTraceDisplayStereoBlend",
    options: Object.freeze([
      Object.freeze({ value: "combine", label: "Meet" }),
      Object.freeze({ value: "lighter", label: "Add" }),
      Object.freeze({ value: "screen", label: "Screen" }),
      Object.freeze({ value: "source-over", label: "Over" }),
      Object.freeze({ value: "multiply", label: "Multiply" }),
      Object.freeze({ value: "difference", label: "Difference" }),
      Object.freeze({ value: "exclusion", label: "Exclusion" }),
      Object.freeze({ value: "xor", label: "Xor" }),
    ]),
  }),
  cornerShape: Object.freeze({
    label: "Corners",
    aria: "LED corner shape",
    id: "nodeTraceDisplayCornerShape",
    options: Object.freeze([
      Object.freeze({ value: "square", label: "Square" }),
      Object.freeze({ value: "squircle", label: "Squircle" }),
    ]),
  }),
  window: Object.freeze({
    label: "Window",
    aria: "STFT window",
    id: "nodeTraceDisplayWindow",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "Rectangular" }),
      Object.freeze({ value: "1", label: "Hann" }),
      Object.freeze({ value: "2", label: "Hamming" }),
      Object.freeze({ value: "3", label: "Blackman" }),
      Object.freeze({ value: "4", label: "Blackman-Harris" }),
    ]),
  }),
  overlap: Object.freeze({
    label: "Time overlap",
    aria: "STFT time hop overlap",
    id: "nodeTraceDisplayOverlap",
    title: "How often we emit a new spectrum (hop = N / factor). Higher = denser time samples, thinner waterfall stripes. None = hop N; 32× = hop N/32.",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "1× (none)" }),
      Object.freeze({ value: "1", label: "2× (50%)" }),
      Object.freeze({ value: "2", label: "4× (75%)" }),
      Object.freeze({ value: "3", label: "8× (87.5%)" }),
      Object.freeze({ value: "4", label: "16× (93.8%)" }),
      Object.freeze({ value: "5", label: "32× (96.9%)" }),
    ]),
  }),
  freqOverlap: Object.freeze({
    label: "Freq overlap",
    aria: "STFT frequency zero-pad",
    id: "nodeTraceDisplayFreqOverlap",
    title: "Zero-pad the analysis window before the FFT for a denser frequency grid (does not lengthen the time window).",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "1× (none)" }),
      Object.freeze({ value: "1", label: "2× pad" }),
      Object.freeze({ value: "2", label: "4× pad" }),
    ]),
  }),
  freqScale: Object.freeze({
    label: "Freq scale",
    aria: "Frequency scale",
    id: "nodeTraceDisplayFreqScale",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "Linear" }),
      Object.freeze({ value: "1", label: "Mel" }),
      Object.freeze({ value: "2", label: "Bark" }),
    ]),
  }),
});

const nodeGraphDisplaySettingsFormTypeTitles = Object.freeze({
  trace: "Trace",
  value: "Value",
  lineBurn: "Burn",
  scope2d: "2D",
  scope2dTrace: "Trace",
  numberReadout: "Readout",
  xyPad: "Phosphor",
  phosphorLight: "2D Phosphor",
  dot: "Phosphor Dot",
  spectrogramBurn: "Spectrogram",
  ledLamp: "LED",
  rgbShapeFace: "Shape",
  rgbPictureFace: "Picture",
  rgbFractalFace: "Soft Fractal",
  matrixFace: "Matrix",
  matrixWaterfallFace: "Waterfall",
  matrixDisplayFace: "Matrix",
  // Phosphor energy faces — must not fall through to generic "Trace"
  // (that title is what made Videoscope look like Output).
  videoscopeBurn: "Videoscope",
  oscilloscopeBankBurn: "Bank",
  hypersawBurn: "Hypersaw",
  knobFace: "Knob",
  pluginSliderFace: "Slider",
  toggleButtonFace: "Toggle",
  momentaryButtonFace: "Momentary",
});

const nodeGraphDisplaySettingsSectionOrder = Object.freeze([
  "trace",
  "value",
  "dot1",
  "secondary",
  "gradient",
  "caps",
]);

// Phosphor faces: Stamp (Size/Blur/Bright) before residual (Ghost/Trail/…).
// Yields: Size → Blur → Bright → Ghost → Trail → Scale → Antialiasing → Dot Budget
const nodeGraphPhosphorDisplaySettingsSectionOrder = Object.freeze([
  "dot1",
  "trace",
  "value",
  "secondary",
  "gradient",
  "caps",
]);

function nodeGraphDisplaySettingsEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// nodeGraphDisplaySettingsBuildStepperRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildToggleRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildChoiceRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsColorRowMeta → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildColorRowHtml → node-graph-module-scope-settings-form.js
// Trace display settings UI chrome → node-graph-module-scope-settings-ui.js
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

// nodeGraphModuleScopeCapturedScope2dBuffer → node-graph-module-scope-capture.js
// captureNodeGraphLiveModuleScopeOutput → node-graph-module-scope-capture.js
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

// captureNodeGraphLiveModuleScopeFrame → node-graph-module-scope-capture.js
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
  const range = nodeGraphModuleScopeSampleRange(buffer, start, end);
  return range ? range.mid : null;
}

/** Min/max/mid/span over a buffer slice. Null when empty or DC (no edge material). */
function nodeGraphModuleScopeSampleRange(buffer, start = 0, end = buffer?.length || 0) {
  let min = Infinity;
  let max = -Infinity;
  const first = Math.max(0, Math.floor(start));
  const limit = Math.min(buffer?.length || 0, Math.ceil(end));
  for (let index = first; index < limit; index += 1) {
    const value = Number(buffer[index]) || 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-5) {
    return null;
  }
  return {
    max,
    mid: (min + max) * 0.5,
    min,
    span: max - min,
  };
}

/**
 * Rising-edge crossings. Optional hysteresis (oscilloscope-style) suppresses
 * chatter around the level: arm below level−hyst, fire above level+hyst.
 */
function nodeGraphModuleScopeRisingCrossings(buffer, threshold, start = 1, end = buffer.length, options = {}) {
  const crossings = [];
  const first = Math.max(1, Math.floor(start));
  const limit = Math.min(buffer?.length || 0, Math.ceil(end));
  const level = Number(threshold);
  if (!Number.isFinite(level) || limit <= first) {
    return crossings;
  }
  const hyst = Math.max(0, Number(options.hysteresis) || 0);
  if (hyst <= 0) {
    for (let index = first; index < limit; index += 1) {
      const previous = Number(buffer[index - 1]) || 0;
      const current = Number(buffer[index]) || 0;
      if (previous <= level && current > level) {
        const delta = current - previous;
        const fraction = Math.abs(delta) > 1e-12
          ? clampNodeSliderValue((level - previous) / delta, 0, 1)
          : 0;
        crossings.push((index - 1) + fraction);
      }
    }
    return crossings;
  }
  const low = level - hyst;
  const high = level + hyst;
  let armed = (Number(buffer[first - 1]) || 0) < low;
  for (let index = first; index < limit; index += 1) {
    const previous = Number(buffer[index - 1]) || 0;
    const current = Number(buffer[index]) || 0;
    if (current < low) {
      armed = true;
      continue;
    }
    if (!armed || current <= high || previous > high) {
      continue;
    }
    // Fire on rising through the high threshold while armed.
    const delta = current - previous;
    const fraction = Math.abs(delta) > 1e-12
      ? clampNodeSliderValue((high - previous) / delta, 0, 1)
      : 0;
    crossings.push((index - 1) + fraction);
    armed = false;
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

/**
 * Collect oscilloscope-style rising triggers in a buffer slice.
 * Light low-pass + hysteresis; falls back to raw hysteresis edges.
 * Returns { edges, periodSamples, threshold, span } — edges may be empty.
 */
function nodeGraphModuleScopeCollectSyncTriggers(syncBuffer, searchStart, searchEnd, periodHint = 0, thresholdHint = null) {
  const empty = { edges: [], periodSamples: null, span: 0, threshold: null };
  if (!syncBuffer?.length) {
    return empty;
  }
  const first = Math.max(0, Math.floor(searchStart));
  const limit = Math.min(syncBuffer.length, Math.ceil(searchEnd));
  if (limit - first < 4) {
    return empty;
  }
  const range = nodeGraphModuleScopeSampleRange(syncBuffer, first, limit);
  if (!range) {
    return empty;
  }
  const threshold = Number.isFinite(Number(thresholdHint)) ? Number(thresholdHint) : range.mid;
  const hyst = Math.max(range.span * 0.04, 1e-4);
  const periodSeed = Number(periodHint) > 0 ? Number(periodHint) : 0;
  // Prefer filtered zero-crossings (AC path) — less noise than raw level snaps.
  const syncTrace = nodeGraphModuleScopeLowpassSyncTrace(
    syncBuffer,
    first,
    limit,
    periodSeed > 0 ? periodSeed : 0,
  );
  let edges = [];
  if (syncTrace?.trace?.length > 2) {
    // Filtered trace is centered near 0; use hysteresis around 0.
    const acHyst = Math.max(1e-4, range.span * 0.03);
    edges = nodeGraphModuleScopeRisingCrossings(
      syncTrace.trace,
      0,
      1,
      syncTrace.trace.length,
      { hysteresis: acHyst },
    ).map((crossing) => crossing + (syncTrace.start || 0));
  }
  if (!edges.length) {
    edges = nodeGraphModuleScopeRisingCrossings(
      syncBuffer,
      threshold,
      first + 1,
      limit,
      { hysteresis: hyst },
    );
  }
  const measuredPeriod = nodeGraphModuleScopeMedianPeriod(edges);
  const periodSamples = measuredPeriod
    || (periodSeed > 0 ? periodSeed : null);
  return {
    edges,
    periodSamples,
    span: range.span,
    threshold,
  };
}

function nodeGraphModuleScopeEstimatedCycle(buffer) {
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  if (!syncBuffer?.length) {
    return null;
  }
  const searchStart = Math.max(0, syncBuffer.length - Math.min(syncBuffer.length, 8192));
  const searchEnd = syncBuffer.length;
  const hintedPeriodSamples = Number(buffer?.nodeGraphScopePeriodSamples);
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    Number.isFinite(hintedPeriodSamples) && hintedPeriodSamples > 0 ? hintedPeriodSamples : 0,
    null,
  );
  if (Number.isFinite(hintedPeriodSamples) && hintedPeriodSamples > 0) {
    return {
      periodSamples: hintedPeriodSamples,
      threshold: triggers.threshold ?? nodeGraphModuleScopeThreshold(syncBuffer, searchStart, searchEnd),
    };
  }
  if (!triggers.periodSamples || triggers.threshold === null) {
    return null;
  }
  return {
    periodSamples: triggers.periodSamples,
    threshold: triggers.threshold,
  };
}

/** Most recent rising edge that still fits [start, start+visible] inside the buffer. */
function nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!syncBuffer?.length || !(visibleSamples > 0)) {
    return null;
  }
  const periodForSearch = periodSamples > 0 ? periodSamples : Math.max(32, visibleSamples * 0.25);
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodForSearch * 6, 1024),
  );
  const searchStart = Math.max(1, syncBuffer.length - Math.ceil(searchSpan));
  const searchEnd = syncBuffer.length;
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    periodSamples,
    cycleEstimate?.threshold,
  );
  for (let index = triggers.edges.length - 1; index >= 0; index -= 1) {
    const start = triggers.edges[index];
    if (
      Number.isFinite(start)
      && start >= 0
      && start + visibleSamples <= syncBuffer.length
    ) {
      return start;
    }
  }
  return null;
}

/**
 * Pick a trigger index for the visible window.
 * Prefer phase continuity with `phaseHint`, else the most recent valid edge
 * (true scope re-trigger — not “nearest freerun end”).
 */
function nodeGraphTraceDisplaySyncedStart(syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd, phaseHint = null) {
  const periodSamples = Number(cycleEstimate?.periodSamples) || 0;
  if (!syncBuffer?.length || !(visibleSamples > 0)) {
    return null;
  }
  const periodForSearch = periodSamples > 0 ? periodSamples : Math.max(32, visibleSamples * 0.25);
  const searchSpan = Math.min(
    syncBuffer.length,
    Math.max(visibleSamples + periodForSearch * 8, 1024),
  );
  const searchEnd = Math.min(syncBuffer.length, validEnd);
  const searchStart = Math.max(1, searchEnd - Math.ceil(searchSpan));
  if (searchEnd <= searchStart + 1) {
    return null;
  }
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    syncBuffer,
    searchStart,
    searchEnd,
    periodSamples,
    cycleEstimate?.threshold,
  );
  const period = triggers.periodSamples || periodSamples;
  const valid = [];
  for (const edge of triggers.edges) {
    if (edge >= validStart && edge + visibleSamples <= validEnd) {
      valid.push(edge);
    }
  }
  if (!valid.length) {
    return null;
  }
  if (Number.isFinite(phaseHint) && period > 1) {
    const phaseHits = [];
    for (const edge of valid) {
      let d = Math.abs(edge - phaseHint);
      const mod = ((d % period) + period) % period;
      d = Math.min(mod, period - mod);
      if (d <= period * 0.28) {
        phaseHits.push(edge);
      }
    }
    if (phaseHits.length) {
      // Most recent among phase-compatible edges (stable lock without freezing).
      return Math.max(...phaseHits);
    }
  }
  // Auto / unlocked: most recent edge that still fills the window.
  return Math.max(...valid);
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

/**
 * Snap the visible sample window so freerun scroll advances in whole pixels.
 *
 * Without this: each frame the window end tracks the latest sample (start += N),
 * and x is remapped as 0..width across the window. When history is long,
 * samples-per-pixel (spp) is >> 1, so a 1-sample advance is a fraction of a
 * pixel — the waveform crawls with subpixel shimmer. Short history (spp≈1)
 * or low pixel density (few columns) already hides it.
 *
 * Snapping start to floor(start / spp) * spp keeps the stroke locked to the
 * pixel grid until enough samples arrive for a full 1px step.
 */
function nodeGraphTraceDisplayPixelLockedView(view, canvasWidthPx) {
  if (!view || !Number.isFinite(Number(view.start)) || !Number.isFinite(Number(view.end))) {
    return view;
  }
  const visible = Number(view.end) - Number(view.start);
  if (!(visible > 0) || !Number.isFinite(visible)) {
    return view;
  }
  const width = Math.max(1, Math.floor(Number(canvasWidthPx) || 1));
  const spp = visible / width;
  if (!(spp > 1e-9) || !Number.isFinite(spp)) {
    return view;
  }
  const snappedStart = Math.floor(Number(view.start) / spp) * spp;
  if (!Number.isFinite(snappedStart)) {
    return view;
  }
  return {
    ...view,
    start: snappedStart,
    end: snappedStart + visible,
  };
}

// TRACE = VECTOR (polylines). Strip-chart pixel-scroll removed — that model is phosphor/waterfall only.

/**
 * Oscilloscope-style auto-trigger for Trace / Output displays.
 *
 * Real scopes re-trigger each sweep (not open-loop predict forever). We:
 *  1) Find hysteresis rising edges every frame
 *  2) Prefer an edge phase-compatible with the previous lock (anti-jitter)
 *  3) Else take the most recent edge that still fills the window
 *  4) Brief phase-hold if edges are missing this frame
 *  5) Auto freerun (return null) after a short timeout so the display never freezes
 *
 * `lock` is per-display-node (see traceDisplaySyncLocks) so multiple scopes
 * watching one source do not clobber each other.
 */
function nodeGraphTraceDisplayStabilizedSyncStart(lock, buffer, syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd) {
  if (!(visibleSamples > 0) || validEnd <= validStart) {
    return null;
  }
  const source = syncBuffer || buffer;
  if (!source?.length) {
    return null;
  }
  const periodHint = Number(cycleEstimate?.periodSamples) || 0;
  const totalSampleCount = Number(buffer?.nodeGraphScopeTotalSampleCount);
  const prevTotalSampleCount = Number(lock.lastSyncTotalSampleCount);
  const elapsed = Number.isFinite(prevTotalSampleCount) && Number.isFinite(totalSampleCount)
    ? Math.max(0, totalSampleCount - prevTotalSampleCount)
    : 0;
  const sampleRate = nodeGraphScopeSampleRate(buffer || source);

  // Smooth period so holdoff / phase windows stay stable across frames.
  if (periodHint > 0) {
    const prevPeriod = Number(lock.periodEma);
    lock.periodEma = Number.isFinite(prevPeriod) && prevPeriod > 0
      ? prevPeriod * 0.82 + periodHint * 0.18
      : periodHint;
  }
  const period = Number(lock.periodEma) > 0
    ? Number(lock.periodEma)
    : (periodHint > 0 ? periodHint : 0);

  const prevStart = Number(lock.lastSyncStart);
  let phaseHint = null;
  if (Number.isFinite(prevStart) && elapsed >= 0) {
    // Buffer shifts left as new samples arrive at the end (copyWithin model).
    let predicted = prevStart - elapsed;
    if (period > 1) {
      const maxStart = validEnd - visibleSamples;
      if (maxStart >= validStart) {
        while (predicted < validStart) {
          predicted += period;
        }
        while (predicted > maxStart) {
          predicted -= period;
        }
        if (predicted >= validStart && predicted + visibleSamples <= validEnd) {
          phaseHint = predicted;
        }
      }
    } else if (predicted >= validStart && predicted + visibleSamples <= validEnd) {
      phaseHint = predicted;
    }
  }

  const estimate = {
    periodSamples: period || periodHint,
    threshold: cycleEstimate?.threshold,
  };
  const reacquired = nodeGraphTraceDisplaySyncedStart(
    source,
    estimate,
    visibleSamples,
    validStart,
    validEnd,
    phaseHint,
  );
  if (reacquired !== null) {
    lock.lastSyncStart = reacquired;
    lock.lastSyncPeriod = period || periodHint;
    lock.lastSyncVisibleSamples = visibleSamples;
    lock.lastSyncTotalSampleCount = totalSampleCount;
    lock.missedSamples = 0;
    lock.haveLock = true;
    if (!(Number(lock.periodEma) > 0) && periodHint > 0) {
      lock.periodEma = periodHint;
    }
    return reacquired;
  }

  // No edge this frame — hold phase briefly (Normal-mode stickiness), then
  // Auto freerun so aperiodic / quiet signals never freeze the face.
  const step = Math.max(1, elapsed || Math.round(Math.max(8, sampleRate / 120)));
  lock.missedSamples = (Number(lock.missedSamples) || 0) + step;
  const autoTimeout = Math.max(
    visibleSamples,
    period > 0 ? period * 2.5 : 0,
    Math.round(sampleRate * 0.08),
  );
  if (
    lock.haveLock
    && phaseHint !== null
    && lock.missedSamples < autoTimeout
  ) {
    lock.lastSyncStart = phaseHint;
    lock.lastSyncPeriod = period || periodHint;
    lock.lastSyncVisibleSamples = visibleSamples;
    lock.lastSyncTotalSampleCount = totalSampleCount;
    return phaseHint;
  }

  // Lost lock — freerun (caller uses latest window). Ready to re-arm next edge.
  lock.haveLock = false;
  lock.missedSamples = 0;
  if (Number.isFinite(totalSampleCount)) {
    lock.lastSyncTotalSampleCount = totalSampleCount;
  }
  return null;
}

/**
 * Resolve sync mode: "off" | "left" | "right" | "mono".
 * Legacy sourceSync true → mono; false → off.
 */
function nodeGraphTraceDisplaySyncChannel(settings) {
  const raw = String(settings?.syncChannel || "").toLowerCase().trim();
  if (raw === "left" || raw === "right" || raw === "mono" || raw === "off") {
    return raw;
  }
  if (settings?.sourceSync === false) {
    return "off";
  }
  if (settings?.sourceSync) {
    return "mono";
  }
  return "off";
}

/** Average L/R into a lightweight buffer for mono cycle detection. */
function nodeGraphTraceDisplayMonoSyncBuffer(leftBuffer, rightBuffer) {
  if (!leftBuffer?.length || !rightBuffer?.length) {
    return leftBuffer || rightBuffer || null;
  }
  const n = Math.min(leftBuffer.length, rightBuffer.length);
  let mono = leftBuffer._traceMonoSyncScratch;
  if (!mono || !(mono instanceof Float32Array) || mono.length < n) {
    mono = new Float32Array(n);
    leftBuffer._traceMonoSyncScratch = mono;
  }
  for (let i = 0; i < n; i += 1) {
    const a = Number(leftBuffer[i]);
    const b = Number(rightBuffer[i]);
    mono[i] = ((Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0)) * 0.5;
  }
  // Attach the same metadata cycle/view helpers expect on captured buffers.
  const head = {
    length: n,
    nodeGraphScopeTotalSampleCount: leftBuffer.nodeGraphScopeTotalSampleCount
      ?? rightBuffer.nodeGraphScopeTotalSampleCount,
    nodeGraphScopeRecentSampleCount: leftBuffer.nodeGraphScopeRecentSampleCount
      ?? rightBuffer.nodeGraphScopeRecentSampleCount,
  };
  // Proxy numeric index access onto the Float32Array.
  return new Proxy(head, {
    get(target, prop) {
      if (prop === "length") {
        return n;
      }
      if (typeof prop === "string" && /^[0-9]+$/.test(prop)) {
        return mono[Number(prop)];
      }
      if (prop in target) {
        return target[prop];
      }
      return mono[prop];
    },
  });
}

function nodeGraphTraceDisplayBufferView(buffer, slot, options = {}) {
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const zoomEditActive = Boolean(nodeGraphMvp?.traceDisplayZoomEditActive);
  const syncChannel = options.syncChannel || nodeGraphTraceDisplaySyncChannel(settings);
  const forceOff = options.forceSyncOff === true || syncChannel === "off";
  const syncSourceBuffer = options.syncBuffer || buffer;
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(syncSourceBuffer);
  const availableSamples = nodeGraphScopeAvailableSampleCount(buffer);
  const validEnd = buffer?.length || 0;
  const validStart = availableSamples > 0
    ? Math.max(0, validEnd - Math.min(validEnd, availableSamples))
    : 0;
  const validSamples = Math.max(0, validEnd - validStart);
  const visibleSamples = Math.min(validSamples, nodeGraphTraceDisplayVisibleSamples(buffer, settings));
  let start = Math.max(validStart, validEnd - visibleSamples);
  const syncEligible = !forceOff && !zoomEditActive && visibleSamples < validSamples;
  const estimatedCycle = syncEligible
    ? nodeGraphModuleScopeEstimatedCycle(syncBuffer || syncSourceBuffer)
    : null;
  if (syncEligible && estimatedCycle) {
    const lockKey = `${String(slot?.nodeId || "")}:${syncChannel}`;
    let lock = nodeGraphModuleScopeState.traceDisplaySyncLocks.get(lockKey);
    if (!lock) {
      lock = {};
      nodeGraphModuleScopeState.traceDisplaySyncLocks.set(lockKey, lock);
    }
    const triggeredStart = nodeGraphTraceDisplayStabilizedSyncStart(
      lock,
      syncSourceBuffer,
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
  if (Number.isFinite(options.forceStart)) {
    start = Math.max(validStart, Math.min(validEnd - visibleSamples, Math.floor(options.forceStart)));
  }
  const ampScale = Number(settings?.scale);
  return {
    end: Math.min(validEnd, start + visibleSamples),
    // Amplitude zoom for Output / Trace drawers (1 = full-scale face).
    gain: Number.isFinite(ampScale) && ampScale > 0
      ? clampNodeSliderValue(ampScale, 0.01, 100)
      : 1,
    offset: 0,
    start,
  };
}

/**
 * Shared window for Output L/R so both channels stay time-aligned.
 * syncChannel: off (each freeruns) | left | right | mono.
 */
function nodeGraphTraceDisplayStereoBufferViews(leftBuffer, rightBuffer, slot) {
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const syncChannel = nodeGraphTraceDisplaySyncChannel(settings);
  if (syncChannel === "off" || !leftBuffer?.length || !rightBuffer?.length) {
    return {
      left: nodeGraphTraceDisplayBufferView(leftBuffer, slot, { forceSyncOff: true }),
      right: nodeGraphTraceDisplayBufferView(rightBuffer, slot, { forceSyncOff: true }),
      syncChannel: "off",
    };
  }
  let syncBuffer = leftBuffer;
  if (syncChannel === "right") {
    syncBuffer = rightBuffer;
  } else if (syncChannel === "mono") {
    syncBuffer = nodeGraphTraceDisplayMonoSyncBuffer(leftBuffer, rightBuffer) || leftBuffer;
  }
  // Trigger window from the chosen source, then force both channels to that start.
  const master = nodeGraphTraceDisplayBufferView(syncBuffer, slot, {
    syncBuffer,
    syncChannel: "mono",
  });
  return {
    left: nodeGraphTraceDisplayBufferView(leftBuffer, slot, {
      forceStart: master.start,
      forceSyncOff: true,
    }),
    right: nodeGraphTraceDisplayBufferView(rightBuffer, slot, {
      forceStart: master.start,
      forceSyncOff: true,
    }),
    syncChannel,
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
    // Oscilloscope auto-trigger: lock when an edge fits; otherwise freerun
    // (keep defaultStart) so quiet / aperiodic signals never freeze.
    const triggeredStart = nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples);
    if (triggeredStart !== null) {
      start = triggeredStart;
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

// nodeGraphModuleScopePhosphorFrameReady → node-graph-module-scope-phosphor.js
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
    // Strip chart advances on absolute sample count, not just retained length.
    Math.floor(Number(buffer?.nodeGraphScopeTotalSampleCount) || 0),
    Math.round(Number(item?.scopeRect?.left) || 0),
    Math.round(Number(item?.scopeRect?.top) || 0),
    Math.round(Number(item?.scopeRect?.width) || 0),
    Math.round(Number(item?.scopeRect?.height) || 0),
    Math.round((Number(item?.visibleProgressRange?.[0]) || 0) * 10000),
    Math.round((Number(item?.visibleProgressRange?.[1]) || 0) * 10000),
    settings.zoomSeconds,
    settings.padding,
    Number(settings.scale) || 1,
    settings.skipDiscontinuities ? 1 : 0,
    settings.lineThickness,
    settings.brightness,
    settings.color,
    settings.secondaryLineThickness,
    settings.secondaryBrightness,
    settings.secondaryColor,
    settings.stereoBlend || "combine",
    settings.meetColor || "auto",
    // Keep 0 density as 0 (Number(0) || 1 would wrongly snap to 1).
    Number.isFinite(Number(settings.pixelDensity)) ? Number(settings.pixelDensity) : 1,
    settings.background || settings.backgroundColor || "",
    settings.sourceSync === false ? 0 : 1,
    settings.syncChannel || "off",
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
  // Display Bright is 0…1 app-wide (1 = full).
  return clampNodeSliderValue(brightness, 0, 1);
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

// drawNodeGraphModuleScopeBufferWebGl → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeSpectrumBarsWebGl → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeLightShape → node-graph-module-scope-draw-basic.js
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
// Videoscope / scope2d burn faces use the same canvas class + cache.
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
            // Live modules use data-node (not data-node-id); face is
            // .node-module-scope-window (not .node-module-scope).
            const host = document.querySelector(
              `.dsp-node[data-node="${nid}"], [data-node="${nid}"].dsp-node, [data-node-id="${nid}"]`,
            );
            const scopeEl = host?.querySelector?.(
              ".node-module-scope-window, .node-module-scope-window-surface, .node-module-scope",
            );
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
  const root = document.getElementById("nodeWiringPanel")
    || document.getElementById("nodeGraphWorkspace")
    || document.body;
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
  // Opaque face (never screen-blend — that made black plates go green/teal).
  canvas.style.mixBlendMode = "normal";
  canvas.setAttribute("aria-hidden", "true");
  screenElement.appendChild(canvas);
  if (nodeId) {
    nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
  }
  return canvas;
}

/**
 * Size a local face canvas to layout×dpr × pixelDensity.
 *
 * TRACE: still a vector polyline into this buffer; density only sets how coarse
 * the backing store is (0 = chunky lo-fi, 1 = full face, 4 = supersample).
 * PHOSPHOR: same knob on energy grids — different product, same sizing helper.
 * Never use density as an excuse for strip-chart / column-paint Trace models.
 */
function syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) {
    return false;
  }
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return false;
  }
  const resolved = typeof nodeGraphScope2dResolvePixelDensity === "function"
    ? nodeGraphScope2dResolvePixelDensity(pixelDensity, size.width, size.height)
    : { density: 1, effective: 1 };
  // 0 is valid (1×1 pixel). Never use `|| 1` — that snaps density 0 up to full res.
  const densityRaw = Number(resolved.effective);
  const density = Number.isFinite(densityRaw) ? Math.max(0, densityRaw) : 1;
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
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
  // Below 1: intentional chunky CSS upscale. At/above 1: smooth scale (AA when density > 1).
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
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

// drawNodeGraphModuleScopeCanvasDotPath → node-graph-module-scope-draw-basic.js
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

// drawNodeGraphModuleScopeLightDisplay → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeLightDisplays → node-graph-module-scope-draw-basic.js
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
        // Self-painted faces: remove any Trace overlay entirely (don't leave a
        // transparent absolute canvas sitting on the custom UI).
        {
          const selfPaint = nodeGraphModuleDisplayRendererForSlot(slot);
          if (
            selfPaint === "selfPaintFace"
            || selfPaint === "matrixFace"
            || selfPaint === "matrixWaterfallFace"
            || selfPaint === "matrixDisplayFace"
          ) {
            drawNodeGraphSelfPaintFaceItem(null, { slot, screenElement: slot.scopeElement }, 1);
          } else if (selfPaint === "knobFace") {
            drawNodeGraphKnobFaceItem(null, {
              slot,
              screenElement: slot.scopeElement,
              buffer: null,
            }, 1);
          } else {
            clearNodeGraphModuleScopeLocalFallback(slot);
          }
        }
        // Number Readout: keep an idle LCD plate when there is no live sample
        // (stop / unwired) instead of leaving a wiped blank face.
        if (slot?.type === "numberReadout" || nodeGraphModuleDisplayRendererForSlot(slot) === "numberReadout") {
          const face = slot.scopeElement;
          const numberCanvas = nodeGraphNumberReadoutCanvasForSlot(slot);
          if (numberCanvas && face) {
            paintNodeGraphNumberReadoutColdBoot(
              numberCanvas,
              face,
              nodeGraphModuleScopeNodeForSlot(slot),
            );
          }
        }
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

// drawNodeGraphTraceDisplayItem → node-graph-module-scope-draw-basic.js
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

// drawNodeGraphOscilloscopeBeam → node-graph-module-scope-draw-basic.js
// drawNodeGraphDotOscilloscopeItem → node-graph-module-scope-draw-basic.js
// drawNodeGraphValueOscilloscopeCanvasLine → node-graph-module-scope-draw-basic.js
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

// drawNodeGraphValueOscilloscopeTrail → node-graph-module-scope-draw-basic.js
// drawNodeGraphValueOscilloscopeItem → node-graph-module-scope-draw-basic.js
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

// nodeGraphPhosphorEnergyEnsureCanvas → node-graph-module-scope-phosphor.js
/**
 * Per-frame energy erase amount in 0–1 (destination-out alpha).
 * Decay alone drives fade rate. Burn is deposit gain only — do not cancel fade
 * with burn or small decay values become invisible under continuous re-deposit.
 */
// nodeGraphPhosphorEnergyFadeAmount → node-graph-module-scope-phosphor.js
/**
 * Smooth mono-energy deposit gain from brightness × size only.
 */
function nodeGraphScope2dEnergyBurnDepositGain(brightness, size01 = 0) {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.depositGain) {
    return PhosphorDrawer.depositGain(brightness, size01);
  }
  const br = Math.max(0, Number(brightness) || 0);
  const s = clampNodeSliderValue(Number(size01) || 0, 0, 1);
  return Math.max(0, br * 0.1 * (1.12 - s * 0.42));
}

/** Fixed film exposure — prefer PhosphorDrawer. */
function nodeGraphScope2dEnergyBurnExposure() {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.exposure) {
    return PhosphorDrawer.exposure();
  }
  return 2.9;
}

// nodeGraphPhosphorEnergyFade → node-graph-module-scope-phosphor.js
/** Softness in buffer px for energy deposits (size only — no ad-hoc glow). */
// nodeGraphPhosphorEnergySoftnessPx → node-graph-module-scope-phosphor.js
/**
 * Build a 0–1 → RGB gradient for phosphor presentation.
 * peakRgb: 0–255 triple (or 0–1 floats — both accepted).
 * Stops: floor → dim body → peak → hot shoulder.
 */
// nodeGraphPhosphorBuildGradientStops → node-graph-module-scope-phosphor.js
// nodeGraphPhosphorSampleGradient → node-graph-module-scope-phosphor.js
/**
 * Map grayscale energy canvas → colored RGBA into colorCanvas (same size).
 * Energy luma is max(R,G,B)/255. Output alpha tracks energy for lighter blit.
 */
// nodeGraphPhosphorMapEnergyToColorCanvas → node-graph-module-scope-phosphor.js
// ─────────────────────────────────────────────────────────────────────────────
// Number Readout — energy phosphor + hard LCD plate / live digits
// DSEG7 Classic: https://github.com/keshikan/DSEG (SIL OFL 1.1)
//
// Residual model (simple, intentional):
//   • Live reading is ALWAYS hard DSEG — never energy-charged. No change ⇒ clean.
//   • On text change, stamp only *changed* previous cells (static digits never charged).
//   • Present punches live glyphs out of residual every frame (no brightening under 0s).
//   • "Decay" UI = ghost hold length (0 = no ghosts, 1 = longest). Mapped to fade rate.
//   • No burn param. No soft blur / bleed on stamps.
// ─────────────────────────────────────────────────────────────────────────────
let nodeGraphNumberReadoutDsegReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphNumberReadoutDsegReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Monospace stack below if the font fails to load.
});

// nodeGraphNumberReadoutCanvasForSlot → node-graph-module-scope-number-readout.js
/** Force the next number-readout draw to repaint (after engine stop wipe). */
// invalidateNodeGraphNumberReadoutPaintCache → node-graph-module-scope-number-readout.js
/**
 * Idle LCD after engine stop / before first live sample: plate + unlit segments.
 * Restores room-light strength so the face is not stuck dark under the dimmer.
 */
// paintNodeGraphNumberReadoutColdBoot → node-graph-module-scope-number-readout.js
// wipeNodeGraphNumberReadoutScreensToColdBoot → node-graph-module-scope-number-readout.js
// syncNodeGraphNumberReadoutCanvas → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutEnergyMaskCanvas → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutEnergyGl → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutSafeDecimals → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutFormatValue → node-graph-module-scope-number-readout.js
// DSEG period has zero advance; every other character is one equal LCD cell
// (width of "8"). Fixed cells keep lit digits and ghost plate locked together.
// https://github.com/keshikan/DSEG#usage
// nodeGraphNumberReadoutDsegWidthChars → node-graph-module-scope-number-readout.js
// Ghost plate: full-width cells only. Digits / all-off "!" → all-on "8".
// Spaces stay blank cells (drawn as "!" under the plate path). Do NOT map
// space→"8" — space is narrower than a digit in DSEG and shifts the plate.
// nodeGraphNumberReadoutGhostPlateText → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutUnitForSlot → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutSettingsSignature → node-graph-module-scope-number-readout.js
/** Unlit LCD segment RGB from independent ghostColor (not gradient sample). */
// nodeGraphNumberReadoutGhostPlateRgb → node-graph-module-scope-number-readout.js
/**
 * Natural (unskewed) DSEG layout for the face.
 * Height-first em size from the font; uniform shrink only if the block would
 * overflow the face width. Never non-uniform scale to fill the module.
 */
// nodeGraphNumberReadoutComputeLayout → node-graph-module-scope-number-readout.js
// Ghost deposit text: only previous glyphs that *left* (char-level).
// Unchanged cells become "!" (skip draw, keep spacing) so static "0"s never
// receive residual energy — canvas XOR of full strings left AA fringes on them.
// When cell counts differ (layout shift), return full previous string.
// nodeGraphNumberReadoutGhostDepositText → node-graph-module-scope-number-readout.js
// Draw DSEG on a fixed cell grid (cell = natural advance of "8" at fontSize).
// Ghost plate and lit value share the same pen positions. No X/Y stretch.
// softBlurPx: when set, deposits a soft energy/glow edge (for 0–1 phosphor).
// nodeGraphNumberReadoutDrawDigits → node-graph-module-scope-number-readout.js
// nodeGraphNumberReadoutDrawInnerShadow → node-graph-module-scope-number-readout.js
// drawNodeGraphNumberReadoutItem → node-graph-module-scope-number-readout.js
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

// drawNodeGraphCustomDisplayItem → node-graph-module-scope-draw-basic.js
function nodeGraphDisplaySettingsAmplitudeScale(settings) {
  const s = Number(settings?.scale);
  return Number.isFinite(s) && s > 0 ? clampNodeSliderValue(s, 0.01, 100) : 1;
}

function nodeGraphOneDimensionalBurnSampleToY(sample, height, settings = null) {
  const h = Math.max(1, Number(height) || 1);
  const amp = nodeGraphDisplaySettingsAmplitudeScale(settings);
  return h * 0.5 - clampNodeSliderValue((Number(sample) || 0) * amp, -1, 1) * h * 0.44;
}

function nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings) {
  if (!context || !canvas?.width || !canvas?.height) {
    return;
  }
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  if (decay <= 0) {
    return;
  }
  // Decay only — no burn term (burn is not a second brightness/gain).
  const fadeAlpha = clampNodeSliderValue(0.012 + decay * 0.3, 0.002, 0.34);
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

/** Rising-edge threshold for 1D Burn Dot Reset (same family as osc Reset jacks). */
const nodeGraphLineBurnResetThreshold = 0.5;

/**
 * Heart-monitor 1D burn: free-running left→right pen with its own phasor.
 *
 * Position is NOT derived from absoluteFrame / duration (that jumps when you
 * change Sweep). Each face keeps canvas._lineBurnPhasor in [0, 1) and advances
 * it sample-by-sample:
 *   phasor += 1 / (sweepSeconds * sampleRate)
 * so changing duration mid-sweep continues from the current X.
 * Wrap or rising-edge Reset (≥ 0.5) snaps to 0 and breaks the path.
 */
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
  const end = Number.isFinite(fallbackEndFrame) ? fallbackEndFrame : 0;
  return {
    startFrame: Math.max(0, end - safeCount),
    endFrame: end,
  };
}

function nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count) {
  const frameInfo = nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count);
  const lastFrame = Number(
    canvas?._nodeGraphOneDimensionalBurnLastDrawnFrame
    ?? canvas?._nodeGraphScope2dLastDrawnFrame,
  );
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
  // Bridge one sample into previous frame so the trail stays continuous.
  const frameOffset = Math.max(0, Math.floor(lastFrame - frameInfo.startFrame) - 1);
  return Math.min(Math.max(0, Math.floor(Number(count) || 0) - 1), frameOffset);
}

/**
 * Sample Reset at the same time as In[index] in the current draw window.
 *
 * Visual-input ports each keep their own absoluteFrame counters, so if Reset
 * was wired later the two windows do not share frame numbers. Always align
 * by distance-from-end of the recent tails (both streams are written together
 * each engine sample while both are connected).
 *
 * inIndex: 0 .. inCount-1 within In's recent window (0 = oldest of the window).
 */
function nodeGraphOneDimensionalBurnResetSample(resetBuffer, inIndex, inCount) {
  if (!resetBuffer?.length || !(inCount > 0)) {
    return 0;
  }
  const safeInCount = Math.max(1, Math.floor(Number(inCount) || 1));
  const safeIndex = Math.max(0, Math.min(safeInCount - 1, Math.floor(Number(inIndex) || 0)));
  // Prefer Reset's recent window; fall back to full buffer.
  const rRecent = Math.floor(Number(resetBuffer.nodeGraphScopeRecentSampleCount) || 0);
  const rCount = Math.max(1, Math.min(
    resetBuffer.length,
    rRecent > 0 ? rRecent : resetBuffer.length,
  ));
  // Align ends: last sample of In window ↔ last sample of Reset window.
  const fromEnd = (safeInCount - 1) - safeIndex;
  const rIndex = (resetBuffer.length - 1) - fromEnd;
  // If Reset has a shorter recent tail, clamp into that tail.
  const rStart = resetBuffer.length - rCount;
  if (rIndex < rStart || rIndex >= resetBuffer.length) {
    // Still try absolute-frame overlap when both streams share a clock range
    // (same absoluteFrame counters when both ports ran from the start).
    return 0;
  }
  return Number(resetBuffer[rIndex]) || 0;
}

function nodeGraphOneDimensionalBurnBreakPath(points) {
  if (typeof breakNodeGraphScope2dPath === "function") {
    breakNodeGraphScope2dPath(points);
  } else {
    points.push(null);
  }
}

function nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, settings, resetBuffer = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
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
  const sampleRate = Math.max(1, Number(nodeGraphScopeSampleRate(buffer)) || 44100);
  // Seconds to cross the face → phase advance per sample.
  let sweepSeconds = Number(settings?.sweepSeconds);
  if (!Number.isFinite(sweepSeconds) || sweepSeconds <= 0) {
    // Legacy patches that still only have sweepHz.
    const legacyHz = Number(settings?.sweepHz);
    sweepSeconds = Number.isFinite(legacyHz) && legacyHz > 0
      ? 1 / legacyHz
      : nodeGraphLineBurnSettingsDefaults.sweepSeconds;
  }
  sweepSeconds = Math.max(0.01, Math.min(10, sweepSeconds));
  const phaseInc = 1 / (sweepSeconds * sampleRate);
  const width = canvas.width;
  const height = canvas.height;

  // Persistent free-run phasor on this face — survives Sweep (s) changes.
  let phasor = Number(canvas._lineBurnPhasor);
  if (!Number.isFinite(phasor) || phasor < 0 || phasor >= 1) {
    phasor = 0;
  }
  let resetWasHigh = canvas._lineBurnResetWasHigh === true;

  const stepPhasorAndReset = (resetSample) => {
    const resetHigh = Number(resetSample) >= nodeGraphLineBurnResetThreshold;
    const snapped = resetHigh && !resetWasHigh;
    if (snapped) {
      phasor = 0;
    }
    resetWasHigh = resetHigh;
    phasor += phaseInc;
    if (phasor >= 1) {
      phasor -= Math.floor(phasor);
      if (phasor < 0 || phasor >= 1) {
        phasor = 0;
      }
    }
    return snapped;
  };

  // Samples already consumed still update phasor + Reset so edges are not missed.
  for (let index = 0; index < drawStartIndex; index += 1) {
    stepPhasorAndReset(nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count));
  }

  const points = [];
  let hadPoint = false;
  for (let index = drawStartIndex; index < count; index += 1) {
    const resetSample = nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count);
    const resetHigh = Number(resetSample) >= nodeGraphLineBurnResetThreshold;
    if (resetHigh && !resetWasHigh) {
      // Rising edge Reset: snap to left edge for this sample.
      if (hadPoint) {
        nodeGraphOneDimensionalBurnBreakPath(points);
      }
      phasor = 0;
      hadPoint = false;
    }
    resetWasHigh = resetHigh;

    // Draw at current phasor, then advance — so changing Sweep keeps X.
    points.push({
      x: phasor * width,
      y: nodeGraphOneDimensionalBurnSampleToY(buffer[start + index], height, settings),
    });
    hadPoint = true;

    phasor += phaseInc;
    if (phasor >= 1) {
      // Completed a pass — break path; residual starts the next pass at left.
      nodeGraphOneDimensionalBurnBreakPath(points);
      phasor -= Math.floor(phasor);
      if (phasor < 0 || phasor >= 1) {
        phasor = 0;
      }
      hadPoint = false;
    }
  }

  canvas._lineBurnPhasor = phasor;
  canvas._lineBurnResetWasHigh = resetWasHigh;
  delete canvas._lineBurnSweepOriginFrame;
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

// drawNodeGraphScopeCanvasSmoothPath → node-graph-module-scope-draw-basic.js
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
// disposeNodeGraphScope2dBurnRendererForCanvas → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnCanvasForSlot → node-graph-module-scope-draw-burn.js
/**
 * Resolve face pixel density 0–4 to an effective scale.
 * Full range: 0 → single pixel (1×1), 1 → layout×dpr, 4 → supersample AA.
 * (No lo-fi floor — user wants the whole dial.)
 */
function nodeGraphScope2dResolvePixelDensity(pixelDensity, layoutWidth = 1, layoutHeight = 1) {
  const raw = Number(pixelDensity);
  const density = Number.isFinite(raw) ? Math.max(0, Math.min(4, raw)) : 1;
  // effective === density; canvas size uses max(1, round(layout * density)).
  return { density, effective: density, minDensity: 0 };
}

/** Default face plate — pure black (no teal/CRT tint in the plate color). */
const nodeGraphFacePlateDefaultBackground = "#000000";

/** Resolve face plate color from any display settings object. */
function nodeGraphFacePlateBackground(settings, fallback = nodeGraphFacePlateDefaultBackground) {
  return normalizeNodeGraphTraceDisplayColor(
    settings?.background ?? settings?.backgroundColor,
    fallback,
  );
}

/**
 * Pixel density 0–4 from settings. Preserves 0 (never `|| 1`).
 * 0 → 1×1 buffer; 1 → layout×dpr; 4 → supersample.
 */
function nodeGraphFacePlateDensity(settings, fallback = 1) {
  const n = Number(settings?.pixelDensity);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Number.isFinite(fb) ? Math.max(0, Math.min(4, fb)) : 1;
  }
  return Math.max(0, Math.min(4, n));
}

function nodeGraphFacePlateApplyCss(screenElement, bg) {
  if (screenElement?.style) {
    screenElement.style.setProperty(
      "--node-scope-background",
      bg || nodeGraphFacePlateDefaultBackground,
    );
    // Plate under the face canvas is solid CSS; keep it true to settings.
    if (screenElement.classList?.contains("node-module-scope-window")
      || screenElement.classList?.contains("node-module-scope-window-surface")) {
      screenElement.style.background = bg || nodeGraphFacePlateDefaultBackground;
    }
  }
}

function nodeGraphFacePlateFillCanvas(context, canvas, bg) {
  if (!context || !canvas) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.fillStyle = bg || nodeGraphFacePlateDefaultBackground;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

/** Paint plate under existing pixels (e.g. after putImageData / transparent energy). */
function nodeGraphFacePlateFillUnder(context, canvas, bg) {
  if (!context || !canvas) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = bg || nodeGraphFacePlateDefaultBackground;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

// syncNodeGraphScope2dBurnCanvas → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnTextureFormats → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnTexture → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnFramebuffer → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// deleteNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnRenderer → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnRendererForCanvas → node-graph-module-scope-draw-burn.js
// resizeNodeGraphScope2dBurnRenderer → node-graph-module-scope-draw-burn.js
function bindNodeGraphScope2dQuad(renderer, program, positionLocation) {
  const gl = renderer.gl;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 8, 0);
}

// copyNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnDecayValues → node-graph-module-scope-draw-burn.js
// decayNodeGraphScope2dBurn → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnLayers → node-graph-module-scope-draw-burn.js
// appendNodeGraphScope2dBurnSegment → node-graph-module-scope-draw-burn.js
// buildNodeGraphScope2dBurnVertices → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dBurnBeamLayer → node-graph-module-scope-draw-burn.js
// compositeNodeGraphScope2dBurn → node-graph-module-scope-draw-burn.js
/**
 * Beautiful soft-beam retained burn on mono energy + gradient LUT.
 * Same continuous gaussian segment ribbons as classic scope2d; storage is
 * scalar energy (shared phosphor device), color only at present via LUT.
 * Returns true if handled (caller should not run legacy RGB WebGL burn).
 */
// drawNodeGraphScope2dEnergyBurnPath → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dRetainedBurn → node-graph-module-scope-draw-burn.js
// drawNodeGraphRetainedBurnPath → node-graph-module-scope-draw-burn.js
// drawNodeGraphLineBurnOscilloscopeItem → node-graph-module-scope-draw-burn.js
// Draws one vertical line per Hypersaw voice, at x = that voice's current
// phase (0..1) across the face. Canonical mono energy phosphor drawer
// (same soft/hard stamps as 2D Burn / Lorenz).
// drawNodeGraphHypersawBurnItem → node-graph-module-scope-draw-burn.js
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

// nodeGraphScope2dBurnCanvasSquare → node-graph-module-scope-draw-burn.js
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

// drawNodeGraphScope2dTraceLayer → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dTraceItem → node-graph-module-scope-draw-burn.js
function buildNodeGraphTraceDisplaySamples(buffer, slot, pointCount, progressFn, samplesPerPoint, viewOverride = null) {
  const view = viewOverride || nodeGraphTraceDisplayBufferView(buffer, slot);
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

function buildNodeGraphTraceDisplayCanvasPoints(buffer, canvas, slot, viewOverride = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const width = Math.max(1, canvas.width);
  // VECTOR: continuous sample window → continuous face coords (no pixel lock / column snap).
  const view = viewOverride || nodeGraphTraceDisplayBufferView(buffer, slot);
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
  // Control-point budget is sample/CPU limited — NOT min(canvas.width) (that is a pixel paradigm).
  const budget = typeof TraceStroke !== "undefined" && TraceStroke.pointBudget
    ? TraceStroke.pointBudget(canvas.width, canvas.height, nodeGraphTraceDisplayRenderPointBudget())
    : Math.max(256, Math.min(4096, nodeGraphTraceDisplayRenderPointBudget()));
  const pointCount = Math.max(2, Math.min(visibleSamples, budget));
  const midY = canvas.height * 0.5;
  const samplesPerPoint = visibleSamples / Math.max(1, pointCount - 1);
  const progressFn = (index, count) => count <= 1 ? 0 : index / (count - 1);
  const samples = buildNodeGraphTraceDisplaySamples(
    buffer,
    slot,
    pointCount,
    progressFn,
    samplesPerPoint,
    view,
  );
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
      // Continuous face coordinates — GPU/canvas antialiases the stroke.
      points.push({
        x: s.progress * width,
        y: midY - s.value * halfHeight,
      });
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
    // VECTOR polyline: opaque source-over (not additive pixel glow).
    TraceStroke.draw(context, points, {
      size: layer.size,
      blur: 0,
      brightness: layer.brightness,
      color: layer.color,
      faceMinSide: face,
      composite: "source-over",
    });
    return;
  }
  const size = clampNodeSliderValue(layer.size, 0, 1);
  const brightness = Math.max(0, Number(layer.brightness) || 0);
  if (size <= 0 || brightness <= 0) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(layer.color));
  const gain = Math.min(1, brightness);
  const lineWidth = Math.max(1, face * size);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.imageSmoothingEnabled = true;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = `rgb(${Math.round(rgb[0] * gain)}, ${Math.round(rgb[1] * gain)}, ${Math.round(rgb[2] * gain)})`;
  context.shadowBlur = 0;
  context.beginPath();
  drawNodeGraphScopeCanvasSmoothPath(context, points);
  context.stroke();
  context.restore();
}

// Output stereo: any Left/Right colors + blend modes.
// Output stereo: any Left/Right colors + blend modes.
// Meet (combine): m=min(L,R); pixel=(L-m)·C_L+(R-m)·C_R+m·C_meet (complement → red+blue→green).
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
    // Trace is hard-stroke only — soft skirts don't fit line ribbons.
    blur: 0,
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
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(slot);
  // VECTOR polyline into density-scaled face buffer (default 1 = current look).
  const density = nodeGraphFacePlateDensity(settings, 1);
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    density,
  )) {
    return false;
  }
  // Vector class: normal blend (not screen). Density < 1 always chunky;
  // density ≥ 1 defers to CSS (smooth at 1:1, pixelated under zoom ≥ 2.5).
  canvas.classList.add("node-module-scope-vector-trace");
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else {
    canvas.style.imageRendering = "";
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  // At lo-fi density, keep nearest-neighbor presentation; at ≥1, smooth AA into buffer.
  context.imageSmoothingEnabled = density >= 0.999;
  if ("imageSmoothingQuality" in context && density >= 0.999) {
    context.imageSmoothingQuality = "high";
  }
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const fillTraceBackground = () => nodeGraphFacePlateFillCanvas(context, canvas, bg);
  // putImageData (combine/Meet) replaces pixels — paint plate *under* with destination-over after.
  const paintBackgroundUnder = () => nodeGraphFacePlateFillUnder(context, canvas, bg);
  const stereoBuffers = slot?.type === "output" ? nodeGraphOutputStereoTraceBuffers(slot.nodeId) : null;
  if (stereoBuffers) {
    const leftBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.left, settings);
    const rightBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.right, settings);
    const views = nodeGraphTraceDisplayStereoBufferViews(leftBuffer, rightBuffer, slot);
    const leftPoints = buildNodeGraphTraceDisplayCanvasPoints(leftBuffer, canvas, slot, views.left);
    const rightPoints = buildNodeGraphTraceDisplayCanvasPoints(rightBuffer, canvas, slot, views.right);
    const leftColor = settings.color || settings.dot1Color || "#ff0000";
    const rightColor = settings.secondaryColor || "#0000ff";
    const leftLayer = nodeGraphTraceDisplayPrimaryLayer(settings, leftColor);
    const rightLayer = {
      enabled: settings.secondaryEnabled !== false,
      size: settings.secondarySize,
      brightness: settings.secondaryBrightness,
      blur: 0,
      color: rightColor,
    };
    context.clearRect(0, 0, canvas.width, canvas.height);
    const face = Math.min(canvas.width, canvas.height);
    let painted = 0;
    const blend = settings.stereoBlend || "combine";
    if (blend !== "combine") {
      // Canvas composites: plate first, then strokes.
      fillTraceBackground();
    }
    if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereo) {
      painted = TraceStroke.drawStereo(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: 0,
          brightness: leftLayer.brightness,
          color: leftColor,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: 0,
          brightness: rightLayer.brightness,
          color: rightColor,
          faceMinSide: face,
        },
        {
          blend,
          leftColor,
          rightColor,
          meetColor: "auto",
        },
      );
    } else if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereoRedBlueGreen) {
      painted = TraceStroke.drawStereoRedBlueGreen(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: 0,
          brightness: leftLayer.brightness,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: 0,
          brightness: rightLayer.brightness,
          faceMinSide: face,
        },
      );
    } else {
      fillTraceBackground();
      // Fallback: layered RGB (overlap may look like additive mix, not meet).
      drawNodeGraphTraceDisplayCanvasLayer(context, rightPoints, rightLayer, canvas, { glow: false });
      drawNodeGraphTraceDisplayCanvasLayer(context, leftPoints, leftLayer, canvas, { glow: false });
      painted = leftPoints.length + rightPoints.length;
    }
    // Meet putImageData leaves transparent holes — plate goes underneath.
    if (blend === "combine") {
      paintBackgroundUnder();
    }
    recordNodeGraphModuleScopeRenderMetrics(painted, painted);
    rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
    return true;
  }
  // Mono 1D Trace = VECTOR polyline (not a pixel strip / energy grid).
  const prepared = prepareNodeGraphTraceDisplayBuffer(buffer, settings);
  fillTraceBackground();
  const points = buildNodeGraphTraceDisplayCanvasPoints(prepared || buffer, canvas, slot);
  const layer = nodeGraphTraceDisplayPrimaryLayer(settings, settings.color);
  drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas, { glow: false });
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
    safeSettings.background,
    safeSettings.ghost,
    safeSettings.trail,
    safeSettings.dot1Enabled ? 1 : 0,
    safeSettings.dot1Size,
    safeSettings.dot1Brightness,
    safeSettings.dot1Color,
    safeSettings.lineThickness,
    Number.isFinite(Number(safeSettings.pixelDensity)) ? Number(safeSettings.pixelDensity) : 1,
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

// drawNodeGraphScope2dItem → node-graph-module-scope-draw-burn.js
// Registry of displayType -> renderer function, checked by
// drawNodeGraphModuleScopeTypedItem below. New bespoke display types (e.g.
// a module's own dedicated file) can call
// nodeGraphModuleScopeCustomRenderers.yourType = yourRenderFn to register
// without editing this file, once they've also been added to the
// nodeGraphDisplayModeRenderers allow-list above (that list stays a
// separate validation step, not a dispatch mechanism).
/**
 * Modules that paint their own face canvas (Matrix Display, Asciiscope XY, …).
 * Scope slot stays registered so visualSink buffer capture + room-dimmer light
 * punches still work — but we must never mount a Trace local-fallback canvas
 * over the custom UI (that painted a grey baseline bar across the module).
 */
function drawNodeGraphSelfPaintFaceItem(_renderer, item, _pixelRatio) {
  const screen = item?.screenElement || item?.slot?.scopeElement;
  if (!screen) {
    return;
  }
  // Strip any leftover scope overlay from before this displayType existed.
  for (const overlay of screen.querySelectorAll?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  ) || []) {
    try {
      if (typeof disposeNodeGraphScope2dBurnRendererForCanvas === "function") {
        disposeNodeGraphScope2dBurnRendererForCanvas(overlay);
      }
    } catch (_) { /* best-effort */ }
    overlay.remove();
  }
  // Drop persistent-canvas cache so a rebuild does not re-append the ghost plate.
  const nodeId = item?.slot?.nodeId || item?.nodeId;
  if (nodeId && typeof nodeGraphModuleScopePersistentCanvases !== "undefined") {
    nodeGraphModuleScopePersistentCanvases.delete?.(nodeId);
  }
}

/** Knob face = final Bias display (live modulated), not static param meta. */
function drawNodeGraphKnobFaceItem(_renderer, item, _pixelRatio) {
  drawNodeGraphSelfPaintFaceItem(_renderer, item, _pixelRatio);
  const face = item?.screenElement || item?.slot?.scopeElement;
  const nodeId = item?.slot?.nodeId || item?.nodeId;
  if (!face || !nodeId) {
    return;
  }
  if (typeof paintNodeGraphKnobFaceLive === "function") {
    paintNodeGraphKnobFaceLive(face, nodeId, item?.buffer);
  } else if (typeof renderNodeGraphKnobFace === "function") {
    renderNodeGraphKnobFace(face, nodeId);
  }
  // Dimmer cutout only with loaded face art (text/stroke stay under the veil).
  if (typeof nodeGraphKnobFaceSyncLightSource === "function") {
    nodeGraphKnobFaceSyncLightSource(face);
  } else {
    const lit = face.classList?.contains("has-image");
    nodeGraphModuleScopeMarkScreenLit(face, lit ? 1 : 0);
  }
}

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
  selfPaintFace: drawNodeGraphSelfPaintFaceItem,
  matrixFace: drawNodeGraphSelfPaintFaceItem,
  matrixWaterfallFace: drawNodeGraphSelfPaintFaceItem,
  matrixDisplayFace: drawNodeGraphSelfPaintFaceItem,
  knobFace: drawNodeGraphKnobFaceItem,
  pluginSliderFace: (renderer, item) => {
    item?.screenElement?.syncFromParameters?.();
  },
  toggleButtonFace: (renderer, item) => {
    item?.screenElement?.syncFromParameters?.();
  },
  momentaryButtonFace: () => {},
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

/** Room dimmer: mark a painted screen face as a light rect (full hole = 1). */
function nodeGraphModuleScopeMarkScreenLit(screenElement, strength = 1) {
  if (!screenElement?.dataset) {
    return;
  }
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  screenElement.dataset.lightStrength = s.toFixed(3);
  // Punch target is often the local fallback canvas, not the outer window.
  const painted = screenElement.querySelector?.(
    ":scope > canvas.node-module-scope-local-fallback-canvas, :scope > canvas.node-number-readout-canvas",
  );
  if (painted?.dataset) {
    painted.dataset.lightStrength = s.toFixed(3);
    painted.dataset.lightSource = "screen";
  }
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(screenElement, s);
    if (painted) {
      setNodeGraphLightStrength(painted, s);
    }
  }
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
    // Phosphor freeze: hold face pixels, stop decay/deposit, absorb sample cursors
    // so unpause does not stamp a backlog onto the frozen image.
    absorbNodeGraphModuleScopePhosphorDrawCursors();
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
  // Engine-stop wipe sets data-light-strength=0 on all screens. Only LED /
  // Number Readout re-wrote it, so Output + other scopes stayed under the
  // room veil forever. Re-mark every visible painted face each frame.
  // Knob: image face only — empty plate text/stroke stay under dimmer.
  for (const item of visibleItems) {
    const face = item?.screenElement || item?.slot?.scopeElement;
    if (!face) {
      continue;
    }
    if (face.classList?.contains("node-knob-face")) {
      if (typeof nodeGraphKnobFaceSyncLightSource === "function") {
        nodeGraphKnobFaceSyncLightSource(face);
      } else {
        nodeGraphModuleScopeMarkScreenLit(
          face,
          face.classList.contains("has-image") ? 1 : 0,
        );
      }
      continue;
    }
    nodeGraphModuleScopeMarkScreenLit(face, 1);
  }
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
    // Keep cursors current while frozen (no full redraw / no decay).
    absorbNodeGraphModuleScopePhosphorDrawCursors();
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
