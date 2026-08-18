// LED settings model + Command Center Display Settings panel.
//
// LED options live only in the shared Display Settings popover (same path as
// Number Readout / scopes). There is no separate floating "LED options" window.
//
// Settings live on node.led, normalized by normalizeNodeGraphLedLayout in
// node-graph-patch-clone.js -- that function is the single source of truth for
// defaults and clamping, and this file only reads/writes through it.

// ---------------------------------------------------------------------------
// Light mathematics
// ---------------------------------------------------------------------------
// Mono energy, then free multi-stop LUT (same idea as phosphor scopes):
//
//   energy = clamp(level * brightness, 0..1)   // brightness is 0…1 (1 = full)
//   color  = sample(gradientStops, energy)     // arbitrary; may go bright→dim
//
// Legacy callers may still pass (hue, level, brightness) without stops; we
// seed a black→hue→white ramp in that case.

function nodeGraphLedHexToRgb255(hex) {
  if (typeof nodeGraphScopeHexColorToRgb === "function") {
    const floats = nodeGraphScopeHexColorToRgb(hex);
    return floats.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255));
  }
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
  if (!match) {
    return [255, 255, 255];
  }
  return match.slice(1).map((part) => Number.parseInt(part, 16));
}

function nodeGraphLedNormalizeStops(stops, hueFallback = 0) {
  if (typeof normalizeNodeGraphLedGradientStops === "function") {
    return normalizeNodeGraphLedGradientStops(stops, hueFallback);
  }
  if (Array.isArray(stops) && stops.length >= 2) {
    return stops;
  }
  if (typeof nodeGraphLedGradientStopsFromHue === "function") {
    return nodeGraphLedGradientStopsFromHue(hueFallback);
  }
  return [
    { t: 0, color: "#000000" },
    { t: 1, color: "#ffffff" },
  ];
}

/** Sample multi-stop gradient at energy t∈[0,1] → [r,g,b] 0..255. */
function nodeGraphLedSampleGradientRgb(stops, energy) {
  const list = Array.isArray(stops) && stops.length ? stops : nodeGraphLedNormalizeStops(null, 0);
  const t = Math.max(0, Math.min(1, Number(energy) || 0));
  const parsed = list.map((s) => {
    const [r, g, b] = nodeGraphLedHexToRgb255(s?.color);
    return {
      t: Math.max(0, Math.min(1, Number(s?.t) || 0)),
      r,
      g,
      b,
    };
  }).sort((a, b) => a.t - b.t);
  if (t <= parsed[0].t) {
    return [parsed[0].r, parsed[0].g, parsed[0].b];
  }
  const last = parsed[parsed.length - 1];
  if (t >= last.t) {
    return [last.r, last.g, last.b];
  }
  for (let i = 1; i < parsed.length; i += 1) {
    const a = parsed[i - 1];
    const b = parsed[i];
    if (t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return [
        Math.round(a.r + (b.r - a.r) * u),
        Math.round(a.g + (b.g - a.g) * u),
        Math.round(a.b + (b.b - a.b) * u),
      ];
    }
  }
  return [last.r, last.g, last.b];
}

/**
 * level 0..1, brightness multiplies mono energy before the LUT.
 * settings may be a full LED layout (preferred) or omitted for legacy (hue, level, brightness).
 */
function nodeGraphLedEmittedRgb(hueOrSettings, level, brightness = 1) {
  let stops = null;
  let hue = 0;
  let gain = 1;
  let drive = Math.max(0, Math.min(1, Number(level) || 0));
  if (hueOrSettings && typeof hueOrSettings === "object" && !Array.isArray(hueOrSettings)) {
    const settings = hueOrSettings;
    stops = settings.gradientStops || settings.gradient;
    hue = Number(settings.hue) || 0;
    gain = Math.max(0, Math.min(1, Number.isFinite(Number(settings.brightness))
      ? Number(settings.brightness)
      : 1));
    // Second arg is still level when called as (settings, level).
    drive = Math.max(0, Math.min(1, Number(level) || 0));
  } else {
    hue = Number(hueOrSettings) || 0;
    gain = Math.max(0, Math.min(1, Number.isFinite(Number(brightness)) ? Number(brightness) : 1));
  }
  const energy = Math.max(0, Math.min(1, drive * gain));
  if (typeof nodeGraphHueBrightnessRgb01 === "function") {
    const [r, g, b] = nodeGraphHueBrightnessRgb01(hue, energy);
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  const normalizedStops = nodeGraphLedNormalizeStops(stops, hue);
  return nodeGraphLedSampleGradientRgb(normalizedStops, energy);
}

function nodeGraphLedEmittedColor(hueOrSettings, level, brightness = 1) {
  const [r, g, b] = nodeGraphLedEmittedRgb(hueOrSettings, level, brightness);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function nodeGraphLedSettingsForNode(nodeId) {
  return normalizeNodeGraphLedLayout(nodeGraphPatchNode(nodeId)?.led);
}

function nodeGraphLedSettingsTargetNodeId() {
  return String(
    nodeGraphMvp?.ledSettingsTargetNode
    || nodeGraphMvp?.traceDisplaySettingsTargetNode
    || document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset?.displaySettingsTargetNode
    || "",
  );
}

/** LED range-slider control scheme (shared Display Settings body, not steppers). */
function buildNodeGraphLedDisplaySettingsBodyHtml() {
  // Shared .node-led-settings-row rules style this panel inside Display Settings.
  // Gradient host uses the same selector as other phosphor faces.
  return `
    <div class="node-led-display-settings-panel" data-led-display-settings-panel>
      <div class="metadata-section-title node-trace-display-gradient-title">Gradient</div>
      <div class="metadata-field-section node-trace-display-gradient-section">
        <div
          id="nodeTraceDisplayGradientSelectorHost"
          class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
          data-gradient-selector-host
          data-shared-gradient-host
          data-spectrogram-gradient-host></div>
      </div>
      <div class="node-led-settings-row" aria-label="Energy → color preview">
        <span class="node-led-color-preview" data-led-color-preview aria-hidden="true"></span>
      </div>
      <label class="node-led-settings-row">
        <span>Brightness</span>
        <input type="range" min="0" max="1" step="0.01" data-led-field="brightness" aria-label="LED brightness 0–1 (scales mono energy into the gradient)">
      </label>
      <label class="node-led-settings-row">
        <span>Blur</span>
        <input type="range" min="0" max="1" step="0.01" data-led-field="blur" aria-label="LED blur">
      </label>
      <label class="node-led-settings-row">
        <span>Fill</span>
        <input type="range" min="0" max="100" step="1" data-led-field="fillPercent" aria-label="LED fill of available space">
        <span>%</span>
      </label>
      <div class="node-led-settings-row" role="group" aria-label="Corner shape">
        <span>Corners</span>
        <button type="button" data-led-corner="square" aria-pressed="false">Pill</button>
        <button type="button" data-led-corner="squircle" aria-pressed="true">Squircle</button>
      </div>
      <label class="node-led-settings-row">
        <span>Rounding</span>
        <input type="range" min="0" max="100" step="1" data-led-field="rounding" aria-label="LED rounding">
        <span>%</span>
      </label>
      ${(typeof nodeGraphBuildImageAssetRowHtml === "function"
        ? nodeGraphBuildImageAssetRowHtml({ key: "bottom", label: "Bottom image" })
        : "")}
      ${(typeof nodeGraphBuildImageAssetRowHtml === "function"
        ? nodeGraphBuildImageAssetRowHtml({ key: "top", label: "Top image" })
        : "")}
    </div>`;
}

function syncNodeGraphLedDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  const setRange = (key, value) => {
    const el = root.querySelector?.(`[data-led-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setRange("brightness", settings.brightness);
  setRange("blur", settings.blur);
  setRange("rounding", settings.rounding);
  setRange("fillPercent", settings.fillPercent);
  for (const button of root.querySelectorAll?.("[data-led-corner]") || []) {
    const shape = button.getAttribute("data-led-corner");
    const active = shape === settings.cornerShape;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (typeof nodeGraphSyncImageAssetRow === "function") {
    nodeGraphSyncImageAssetRow(root, "bottom", settings.bottomImage, "none");
    nodeGraphSyncImageAssetRow(root, "top", settings.topImage, "none");
  }
  const preview = root.querySelector?.("[data-led-color-preview]");
  if (preview && typeof nodeGraphLedEmittedColor === "function") {
    // Preview the actual LUT path (level × brightness → gradient sample).
    preview.style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
      .map((level) => nodeGraphLedEmittedColor(settings, level))
      .join(", ")})`;
  }
}

function nodeGraphLedPickImageLayer(layer) {
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  const key = layer === "top" ? "topImage" : "bottomImage";
  nodeGraphPickImageFile((asset) => {
    updateNodeGraphLedSettings({ [key]: asset });
  });
}

function nodeGraphLedClearImageLayer(layer) {
  const key = layer === "top" ? "topImage" : "bottomImage";
  updateNodeGraphLedSettings({ [key]: { dataUrl: "", fileName: "" } });
}

function bindNodeGraphLedDisplaySettingsBody(host) {
  if (!host || host.dataset.ledSettingsBound === "true") {
    return;
  }
  host.dataset.ledSettingsBound = "true";
  if (typeof nodeGraphBindImageAssetClicks === "function") {
    nodeGraphBindImageAssetClicks(host, (key, action) => {
      const layer = key === "top" ? "top" : "bottom";
      if (action === "load") {
        nodeGraphLedPickImageLayer(layer);
      } else if (action === "clear") {
        nodeGraphLedClearImageLayer(layer);
      } else if (action === "save") {
        const nodeId = typeof nodeGraphLedSettingsTargetNodeId === "function"
          ? nodeGraphLedSettingsTargetNodeId()
          : "";
        const settings = typeof nodeGraphLedSettingsForNode === "function"
          ? nodeGraphLedSettingsForNode(nodeId)
          : {};
        const asset = layer === "top" ? settings.topImage : settings.bottomImage;
        if (typeof nodeGraphSaveImageAsset === "function") {
          nodeGraphSaveImageAsset(asset, `led-${layer}`);
        }
      }
    });
  }
  host.addEventListener("input", (event) => {
    const field = event.target?.closest?.("[data-led-field]")?.getAttribute?.("data-led-field");
    if (!field) {
      return;
    }
    updateNodeGraphLedSettings({ [field]: Number(event.target.value) });
  });
  host.addEventListener("change", (event) => {
    const field = event.target?.closest?.("[data-led-field]")?.getAttribute?.("data-led-field");
    if (field) {
      updateNodeGraphLedSettings({ [field]: Number(event.target.value) });
    }
  });
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-led-corner]");
    if (corner && host.contains(corner)) {
      event.preventDefault();
      setNodeGraphLedCornerShape(corner.getAttribute("data-led-corner"));
    }
  });
  // Ctrl/cmd-click reset + shift/ctrl step scaling (shared slider binder).
  if (typeof bindNodeGraphNativeSliderModifiers === "function"
    && typeof nodeGraphLedDefaultSettings === "object") {
    for (const [key, fallback] of Object.entries({
      brightness: nodeGraphLedDefaultSettings.brightness,
      blur: nodeGraphLedDefaultSettings.blur,
      rounding: nodeGraphLedDefaultSettings.rounding,
      fillPercent: nodeGraphLedDefaultSettings.fillPercent,
    })) {
      const input = host.querySelector(`[data-led-field="${key}"]`);
      if (input) {
        bindNodeGraphNativeSliderModifiers(input, fallback);
      }
    }
  }
}

/** Sync LED controls in the Command Center Display Settings panel. */
function renderNodeGraphLedSettingsWindow() {
  const nodeId = nodeGraphLedSettingsTargetNodeId();
  if (!nodeId) {
    return;
  }
  const settings = nodeGraphLedSettingsForNode(nodeId);
  const panel = document.querySelector(
    "#nodeTraceDisplaySettingsPopover [data-led-display-settings-panel]",
  );
  if (panel) {
    syncNodeGraphLedDisplaySettingsControls(panel, settings);
  }
}

/** Open LED options via shared Display Settings (Command Center path). */
function openNodeGraphLedSettings(nodeId, event) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "led") {
    return false;
  }
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    return openNodeGraphTraceDisplaySettings(nodeId, event);
  }
  return false;
}

function closeNodeGraphLedSettings() {
  nodeGraphMvp.ledSettingsTargetNode = null;
}

function updateNodeGraphLedSettings(patch) {
  const nodeId = nodeGraphLedSettingsTargetNodeId();
  if (!nodeId) {
    return;
  }
  nodeGraphMvp.ledSettingsTargetNode = nodeId;
  const clonedPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = clonedPatch.nodes.find((node) => node.id === nodeId);
  if (!targetNode) {
    return;
  }
  targetNode.led = normalizeNodeGraphLedLayout({
    ...normalizeNodeGraphLedLayout(targetNode.led),
    ...patch,
  });
  commitNodeGraphPatch(clonedPatch, { status: "led options changed" });
  renderNodeGraphLedSettingsWindow();
  // Cosmetic face update — works with the audio engine off (no scope buffer).
  if (typeof scheduleNodeGraphLedFaceRefresh === "function") {
    scheduleNodeGraphLedFaceRefresh(nodeId);
  } else if (typeof refreshNodeGraphLedFaceForNode === "function") {
    refreshNodeGraphLedFaceForNode(nodeId);
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function setNodeGraphLedCornerShape(shape) {
  updateNodeGraphLedSettings({ cornerShape: shape === "squircle" ? "squircle" : "square" });
}
