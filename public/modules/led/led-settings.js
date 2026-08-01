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
// The input level drives the lamp from off to blown out:
//
//   0.0  black       (no light)
//   0.5  the hue     (fully saturated -- the LED at its rated color)
//   1.0  white       (over-driven, all three channels railed)
//
// Mixing happens in LINEAR light, not in sRGB or HSL, because that is what a
// real emitter does: twice the drive is twice the photons. Doing it in gamma
// space instead makes the lower half look washed out and the upper half read
// as the color simply fading, rather than the hue holding while the other two
// channels catch up to it.

function nodeGraphLedSrgbToLinear(channel) {
  const value = Math.max(0, Math.min(1, Number(channel) || 0));
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function nodeGraphLedLinearToSrgb(channel) {
  const value = Math.max(0, Math.min(1, Number(channel) || 0));
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// Fully saturated hue at HSL lightness 50% -- the "rated color" of the part.
function nodeGraphLedHueToSrgb(hue) {
  const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

// level 0..1 -> [r, g, b] each 0..255. brightness scales the emitted light in
// linear space AFTER the ramp, so turning it down dims the lamp without
// changing which color it is at a given level.
function nodeGraphLedEmittedRgb(hue, level, brightness = 1) {
  const drive = Math.max(0, Math.min(1, Number(level) || 0));
  const gain = Math.max(0, Math.min(2, Number.isFinite(Number(brightness)) ? Number(brightness) : 1));
  return nodeGraphLedHueToSrgb(hue)
    .map(nodeGraphLedSrgbToLinear)
    .map((channel) => (
      drive <= 0.5
        // Off -> rated color: scale the hue's own light up from nothing.
        ? channel * (drive / 0.5)
        // Rated color -> white: the two dim channels climb to meet the bright
        // one. The already-railed channel stays put, so the hue holds until it
        // physically cannot any more.
        : channel + (1 - channel) * ((drive - 0.5) / 0.5)
    ))
    .map((channel) => Math.round(
      Math.max(0, Math.min(1, nodeGraphLedLinearToSrgb(channel * gain))) * 255,
    ));
}

function nodeGraphLedEmittedColor(hue, level, brightness = 1) {
  const [r, g, b] = nodeGraphLedEmittedRgb(hue, level, brightness);
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
  return `
    <div class="node-led-display-settings-panel" data-led-display-settings-panel>
      <div class="node-led-settings-row" aria-label="Color ramp preview">
        <span class="node-led-color-preview" data-led-color-preview aria-hidden="true"></span>
      </div>
      <label class="node-led-settings-row">
        <span>Color</span>
        <input type="range" min="0" max="360" step="1" data-led-field="hue" aria-label="LED hue">
      </label>
      <label class="node-led-settings-row">
        <span>Brightness</span>
        <input type="range" min="0" max="2" step="0.02" data-led-field="brightness" aria-label="LED brightness">
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
      <div class="node-led-settings-row node-led-image-row" data-led-image-row="bottom">
        <span>Bottom image</span>
        <button type="button" data-led-image-pick="bottom">Load</button>
        <button type="button" data-led-image-clear="bottom">Clear</button>
        <span class="node-led-image-filename" data-led-image-filename="bottom">none</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-led-image-file="bottom" hidden>
      </div>
      <div class="node-led-settings-row node-led-image-row" data-led-image-row="top">
        <span>Top image</span>
        <button type="button" data-led-image-pick="top">Load</button>
        <button type="button" data-led-image-clear="top">Clear</button>
        <span class="node-led-image-filename" data-led-image-filename="top">none</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-led-image-file="top" hidden>
      </div>
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
  setRange("hue", settings.hue);
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
  for (const layer of ["bottom", "top"]) {
    const key = layer === "bottom" ? "bottomImage" : "topImage";
    const name = settings[key]?.fileName || (settings[key]?.dataUrl ? "image" : "none");
    const el = root.querySelector?.(`[data-led-image-filename="${layer}"]`);
    if (el) {
      el.textContent = name;
      el.title = name;
    }
  }
  const preview = root.querySelector?.("[data-led-color-preview]");
  if (preview && typeof nodeGraphLedEmittedColor === "function") {
    preview.style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
      .map((level) => nodeGraphLedEmittedColor(settings.hue, level, settings.brightness))
      .join(", ")})`;
  }
}

function nodeGraphLedPickImageLayer(host, layer) {
  const input = host?.querySelector?.(`[data-led-image-file="${layer}"]`);
  if (input) {
    input.click();
  }
}

function nodeGraphLedClearImageLayer(layer) {
  const key = layer === "top" ? "topImage" : "bottomImage";
  updateNodeGraphLedSettings({ [key]: { dataUrl: "", fileName: "" } });
}

function nodeGraphLedLoadImageLayerFromFile(layer, file) {
  if (!file) {
    return;
  }
  const type = String(file.type || "").toLowerCase();
  const ok = /image\/(png|jpe?g|webp|gif|svg\+xml)/i.test(type)
    || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name || "");
  if (!ok) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Image type not supported (use PNG, JPEG, WebP, GIF, or SVG).");
    }
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > 3_000_000) {
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp("Image is too large or invalid.");
      }
      return;
    }
    const key = layer === "top" ? "topImage" : "bottomImage";
    updateNodeGraphLedSettings({
      [key]: {
        dataUrl,
        fileName: file.name || `${layer}-image`,
      },
    });
  };
  reader.readAsDataURL(file);
}

function bindNodeGraphLedDisplaySettingsBody(host) {
  if (!host || host.dataset.ledSettingsBound === "true") {
    return;
  }
  host.dataset.ledSettingsBound = "true";
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
      return;
    }
    const fileInput = event.target?.closest?.("[data-led-image-file]");
    if (fileInput && host.contains(fileInput)) {
      const layer = fileInput.getAttribute("data-led-image-file");
      const file = fileInput.files?.[0];
      fileInput.value = "";
      nodeGraphLedLoadImageLayerFromFile(layer, file);
    }
  });
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-led-corner]");
    if (corner && host.contains(corner)) {
      event.preventDefault();
      setNodeGraphLedCornerShape(corner.getAttribute("data-led-corner"));
      return;
    }
    const pick = event.target?.closest?.("[data-led-image-pick]");
    if (pick && host.contains(pick)) {
      event.preventDefault();
      nodeGraphLedPickImageLayer(host, pick.getAttribute("data-led-image-pick"));
      return;
    }
    const clear = event.target?.closest?.("[data-led-image-clear]");
    if (clear && host.contains(clear)) {
      event.preventDefault();
      nodeGraphLedClearImageLayer(clear.getAttribute("data-led-image-clear"));
    }
  });
  // Ctrl/cmd-click reset + shift/ctrl step scaling (shared slider binder).
  if (typeof bindNodeGraphNativeSliderModifiers === "function"
    && typeof nodeGraphLedDefaultSettings === "object") {
    for (const [key, fallback] of Object.entries({
      hue: nodeGraphLedDefaultSettings.hue,
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
