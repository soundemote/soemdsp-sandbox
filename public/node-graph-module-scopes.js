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

// Scope offline analyzer → node-graph-module-scope-offline.js
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
// Scope buffer I/O → node-graph-module-scope-buffer-io.js
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
