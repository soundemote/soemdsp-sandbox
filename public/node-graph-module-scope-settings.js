// Module-scope settings normalize/load/save (Phase D).
// Load after scopes.js state + defaults. Extract-only.

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
