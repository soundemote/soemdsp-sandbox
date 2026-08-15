// Phosphor-style waveform display for the Music Player (audioPlayer) module.
//
// Reads the node's decoded sample buffer directly (nodeGraphMvp.sampleBuffers,
// keyed by node.sample.id) and draws a min/max-per-pixel envelope with a
// green-phosphor glow (layered shadowBlur passes, matching this project's
// scope-green aesthetic), plus a live playhead and the Start/End loop-region
// markers already present on the module. Zoom (Shift+wheel) and pan (drag) operate
// on a per-node view window in sample frames, independent of the shared
// WebGL scope compositor used by every other module's display.

const nodeGraphPhosphorWaveformViewStates = new Map();
// 1 = single sample (Time Window 0). Shift+wheel can zoom all the way in.
const nodeGraphPhosphorWaveformMinWindowFrames = 1;

// Right-click "waveform display options" -- time window (seconds shown at
// once) and scroll mode (does the view auto-follow the playhead, and how).
// Persisted per-node on the patch (node.phosphorWaveformSettings), same
// spot traceDisplaySettings lives for the trace/scope family -- see
// cloneNodeGraphTypedDisplaySettings in node-graph-patch-clone.js and its
// call site in node-graph-patch-core.js's validateNodeGraphPatch.
// scrollLinePosition is the anchor ratio (0..1, left..right across the
// canvas) the playhead is held at -- "what's considered the point of
// impact". left biases the view toward showing what's coming up, right
// toward what's already played. Not flush against 0/1 so there's always a
// sliver of context on the far side.
const nodeGraphPhosphorWaveformScrollLinePositionRatios = Object.freeze({
  left: 0.15,
  mid: 0.5,
  right: 0.85,
});

const nodeGraphPhosphorWaveformDefaultSettings = Object.freeze({
  scrollMode: "smooth",
  timeWindowSeconds: 2,
  scrollLinePosition: "mid",
  scrollLineWidth: 2.5,
  // Waveform thickness in CSS pixels (0.5…5, half-pixel steps). Scaled by DPR.
  // Drawing uses width + a +0.5px soft skirt for a cheap pixel-matched blur.
  // Default 1.5 CSS px.
  traceWidth: 1.5,
  // Both color pairs default to the phosphor-green look this display
  // always had (hue ~140, a green), so an untouched node renders exactly
  // as before.
  hue: 140,
  lineBrightness: 0.5,
  // Per-sample vertical grid (visible when zoomed in). 0 = hidden; 0.5 ≈ legacy mid.
  gridBrightness: 0.5,
  backgroundHue: 140,
  // 0…1. Default 0.5 ≈ former mid of 0…2 scale (~8.8% lightness).
  // 1 is the brightest *plate*, not white — a 100% field hid the trace.
  backgroundBrightness: 0.5,
  // Panel shape/inset. cornerShape only has a visible effect once
  // cornerRadius > 0. edgeSpacing is a 0..1 ratio of the largest inset that
  // still leaves the panel visible, so 1 collapses it to nothing.
  // cornerRadius is a PERCENTAGE of the largest radius the panel can take
  // (half its shorter side), not a pixel count -- 100 is therefore fully
  // round whatever size the module is, and the value means the same thing to
  // both corner shapes so switching between them shows the curve difference
  // rather than a size difference.
  cornerShape: "squircle",
  cornerRadius: 0,
  edgeSpacing: 0.05,
  // Zoom % / speed labels: CSS px inset from the canvas corner (no arc math).
  labelInsetPx: 6,
  // Playlist row fade span. 0 = sharp (only the playing row), 1 = gradual
  // (smoothstep across the whole list, the original look).
  playlistFade: 1,
});

function normalizeNodeGraphPhosphorWaveformSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const timeWindowSeconds = Number(source.timeWindowSeconds);
  const scrollLineWidth = Number(source.scrollLineWidth);
  const traceWidth = Number(source.traceWidth);
  const hue = Number(source.hue);
  const lineBrightness = Number(source.lineBrightness);
  const gridBrightness = Number(source.gridBrightness);
  const backgroundHue = Number(source.backgroundHue);
  const backgroundBrightness = Number(source.backgroundBrightness);
  const cornerRadius = Number(source.cornerRadius);
  const edgeSpacing = Number(source.edgeSpacing);
  const labelInsetPx = Number(source.labelInsetPx);
  const playlistFade = Number(source.playlistFade);
  return {
    scrollMode: source.scrollMode === "snap" ? "snap" : "smooth",
    // 0 = one sample at a time. Finite values only; NaN keeps the default.
    timeWindowSeconds: Number.isFinite(timeWindowSeconds)
      ? Math.max(0, Math.min(60, timeWindowSeconds))
      : nodeGraphPhosphorWaveformDefaultSettings.timeWindowSeconds,
    scrollLinePosition: Object.prototype.hasOwnProperty.call(
      nodeGraphPhosphorWaveformScrollLinePositionRatios,
      source.scrollLinePosition,
    )
      ? source.scrollLinePosition
      : nodeGraphPhosphorWaveformDefaultSettings.scrollLinePosition,
    // 0 = hide playhead / scroll line; half-pixel steps up to 8.
    scrollLineWidth: Number.isFinite(scrollLineWidth)
      ? Math.max(0, Math.min(8, Math.round(scrollLineWidth * 2) / 2))
      : nodeGraphPhosphorWaveformDefaultSettings.scrollLineWidth,
    // Half-pixel steps (…1, 1.5, 2, 2.5…) — the +0.5 skirt uses the same grid.
    traceWidth: Number.isFinite(traceWidth)
      ? Math.max(0.5, Math.min(5, Math.round(traceWidth * 2) / 2))
      : nodeGraphPhosphorWaveformDefaultSettings.traceWidth,
    hue: Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : nodeGraphPhosphorWaveformDefaultSettings.hue,
    lineBrightness: Number.isFinite(lineBrightness)
      ? Math.max(0, Math.min(1, lineBrightness))
      : nodeGraphPhosphorWaveformDefaultSettings.lineBrightness,
    gridBrightness: Number.isFinite(gridBrightness)
      ? Math.max(0, Math.min(1, gridBrightness))
      : nodeGraphPhosphorWaveformDefaultSettings.gridBrightness,
    backgroundHue: Number.isFinite(backgroundHue)
      ? ((backgroundHue % 360) + 360) % 360
      : nodeGraphPhosphorWaveformDefaultSettings.backgroundHue,
    backgroundBrightness: Number.isFinite(backgroundBrightness)
      ? Math.max(0, Math.min(1, backgroundBrightness))
      : nodeGraphPhosphorWaveformDefaultSettings.backgroundBrightness,
    // Default squircle; only an explicit "square" (pill) opt-out sticks.
    cornerShape: source.cornerShape === "square" ? "square" : "squircle",
    cornerRadius: Number.isFinite(cornerRadius)
      ? Math.max(0, Math.min(100, cornerRadius))
      : nodeGraphPhosphorWaveformDefaultSettings.cornerRadius,
    edgeSpacing: Number.isFinite(edgeSpacing)
      ? Math.max(0, Math.min(1, edgeSpacing))
      : nodeGraphPhosphorWaveformDefaultSettings.edgeSpacing,
    labelInsetPx: Number.isFinite(labelInsetPx)
      ? Math.max(0, Math.min(48, Math.round(labelInsetPx)))
      : nodeGraphPhosphorWaveformDefaultSettings.labelInsetPx,
    playlistFade: Number.isFinite(playlistFade)
      ? Math.max(0, Math.min(1, playlistFade))
      : nodeGraphPhosphorWaveformDefaultSettings.playlistFade,
  };
}

function nodeGraphPhosphorWaveformSettingsForNode(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  return normalizeNodeGraphPhosphorWaveformSettings(node?.phosphorWaveformSettings);
}

function nodeGraphPhosphorWaveformScrollLineRatio(settings) {
  return nodeGraphPhosphorWaveformScrollLinePositionRatios[settings.scrollLinePosition]
    ?? nodeGraphPhosphorWaveformScrollLinePositionRatios.mid;
}

// Auto-scroll pauses for a moment after the user manually Shift+wheel-zooms or
// drags the display, so it doesn't immediately yank the view back out from
// under their hands -- refreshed on every zoom/pan call, so a held drag
// keeps postponing it continuously.
const nodeGraphPhosphorWaveformLastInteraction = new Map();
const nodeGraphPhosphorWaveformAutoScrollPauseMs = 800;

// Tracks the last Time Window / scroll-line settings auto-scroll applied.
// Signature must NOT include canvas pixel width — modular-view zoom changes
// device columns every frame of a zoom gesture and used to look like a
// "settings change", re-applying Time Window and undoing Shift+wheel zoom.
const nodeGraphPhosphorWaveformLastAppliedTimeWindow = new Map();

function nodeGraphPhosphorWaveformSettingsSignature(settings) {
  const s = normalizeNodeGraphPhosphorWaveformSettings(settings);
  return `${s.timeWindowSeconds}:${s.scrollLinePosition}`;
}

function nodeGraphPhosphorWaveformMarkInteraction(nodeId) {
  nodeGraphPhosphorWaveformLastInteraction.set(nodeId, Date.now());
}

/**
 * Persist the live sample-window span as Time Window (s) so Shift+wheel zoom
 * and the settings field stay in sync, and so a later modular zoom cannot
 * re-apply a stale Time Window over the user's gesture.
 */
function nodeGraphPhosphorWaveformSyncTimeWindowFromView(nodeId, windowFrames, sampleRate) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) {
    return;
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const frames = Math.max(1, Number(windowFrames) || 1);
  const seconds = frames <= 1
    ? 0
    : Math.max(0, Math.min(60, frames / rate));
  const current = normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings);
  if (Math.abs(current.timeWindowSeconds - seconds) >= 0.0005) {
    node.phosphorWaveformSettings = normalizeNodeGraphPhosphorWaveformSettings({
      ...current,
      timeWindowSeconds: seconds,
    });
  }
  nodeGraphPhosphorWaveformLastAppliedTimeWindow.set(
    nodeId,
    nodeGraphPhosphorWaveformSettingsSignature(node.phosphorWaveformSettings),
  );
  if (
    nodeGraphMvp?.phosphorWaveformSettingsTargetNode === nodeId
    && typeof renderNodeGraphPhosphorWaveformSettingsWindow === "function"
  ) {
    renderNodeGraphPhosphorWaveformSettingsWindow();
  }
}

// Music Player display options live on Command Center Display Settings.
// The 📂 + path box and the 📋 + phase readout are the same widgets the
// Music Player carries on its face -- built by the shared sample factories
// so hiding the module control surface still leaves load + phase available
// here. Rebuilt only when the panel switches to a different node (listeners
// close over the node id), so re-rendering on every settings change does not
// wipe out a path you are halfway through typing.
function renderNodeGraphPhosphorWaveformSampleLoader(nodeId) {
  const slot = document.getElementById("nodePhosphorWaveformSampleLoaderSlot");
  if (!slot || typeof createNodeGraphSamplePathLoader !== "function") {
    return;
  }
  if (slot.dataset.node === nodeId && slot.firstElementChild) {
    return;
  }
  slot.dataset.node = nodeId;
  slot.textContent = "";
  const loader = createNodeGraphSamplePathLoader(nodeId, { instance: "waveform-settings" });
  slot.append(loader.fileInput, loader.pathShell);
}

function renderNodeGraphPhosphorWaveformPhaseReadout(nodeId) {
  const slot = document.getElementById("nodePhosphorWaveformPhaseSlot");
  if (!slot || typeof createNodeGraphSamplePhaseReadout !== "function") {
    return;
  }
  if (slot.dataset.node === nodeId && slot.firstElementChild) {
    // Keep the live phase number in sync without rebuilding the copy button.
    if (typeof syncNodeGraphSampleDisplayForNode === "function") {
      syncNodeGraphSampleDisplayForNode(nodeId);
    }
    return;
  }
  slot.dataset.node = nodeId;
  slot.textContent = "";
  const { phase } = createNodeGraphSamplePhaseReadout(nodeId);
  slot.append(phase);
}

function nodeGraphPhosphorWaveformSettingsTargetNodeId() {
  return String(
    nodeGraphMvp?.phosphorWaveformSettingsTargetNode
    || nodeGraphMvp?.traceDisplaySettingsTargetNode
    || "",
  );
}

function renderNodeGraphPhosphorWaveformSettingsWindow() {
  const nodeId = nodeGraphPhosphorWaveformSettingsTargetNodeId();
  if (!nodeId) {
    return;
  }
  renderNodeGraphPhosphorWaveformSampleLoader(nodeId);
  renderNodeGraphPhosphorWaveformPhaseReadout(nodeId);
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
  const setValueUnlessFocused = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setValueUnlessFocused("nodePhosphorWaveformTimeWindowInput", settings.timeWindowSeconds);
  setValueUnlessFocused("nodePhosphorWaveformLineWidthInput", settings.scrollLineWidth);
  setValueUnlessFocused("nodePhosphorWaveformTraceWidthInput", settings.traceWidth);
  setValueUnlessFocused("nodePhosphorWaveformHueInput", settings.hue);
  setValueUnlessFocused("nodePhosphorWaveformLineBrightnessInput", settings.lineBrightness);
  setValueUnlessFocused("nodePhosphorWaveformGridBrightnessInput", settings.gridBrightness);
  setValueUnlessFocused("nodePhosphorWaveformBackgroundHueInput", settings.backgroundHue);
  setValueUnlessFocused("nodePhosphorWaveformBackgroundBrightnessInput", settings.backgroundBrightness);
  setValueUnlessFocused("nodePhosphorWaveformCornerRadiusInput", settings.cornerRadius);
  setValueUnlessFocused("nodePhosphorWaveformEdgeSpacingInput", settings.edgeSpacing);
  setValueUnlessFocused("nodePhosphorWaveformLabelInsetInput", settings.labelInsetPx);
  setValueUnlessFocused("nodePhosphorWaveformPlaylistFadeInput", settings.playlistFade);
  const setPressed = (id, active) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  };
  setPressed("nodePhosphorWaveformScrollSmoothButton", settings.scrollMode === "smooth");
  setPressed("nodePhosphorWaveformScrollSnapButton", settings.scrollMode === "snap");
  setPressed("nodePhosphorWaveformPositionLeftButton", settings.scrollLinePosition === "left");
  setPressed("nodePhosphorWaveformPositionMidButton", settings.scrollLinePosition === "mid");
  setPressed("nodePhosphorWaveformPositionRightButton", settings.scrollLinePosition === "right");
  setPressed("nodePhosphorWaveformCornerSquareButton", settings.cornerShape === "square");
  setPressed("nodePhosphorWaveformCornerSquircleButton", settings.cornerShape === "squircle");
}

function positionNodeGraphPhosphorWaveformSettingsAt(x, y) {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win) {
    return;
  }
  win.hidden = false;
  // Shared app-wide policy: spawn at the pointer the FIRST time only, then
  // restore wherever the user left it. See
  // openNodeGraphFloatingWindowAtPosition in node-graph-ui-settings-persistence.js.
  if (typeof openNodeGraphFloatingWindowAtPosition === "function") {
    openNodeGraphFloatingWindowAtPosition("phosphorWaveformSettings", win, () => {
      const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
      setNodeGraphFloatingWindowViewportPosition(win, left, top);
    });
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
  setNodeGraphFloatingWindowViewportPosition(win, left, top);
}

function nodeGraphNodeUsesPhosphorWaveformDisplay(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (!patchNode) {
    return false;
  }
  if (patchNode.type === "audioPlayer") {
    return true;
  }
  const layout = typeof nodeGraphPatchNodeLayout === "function"
    ? nodeGraphPatchNodeLayout(patchNode)
    : nodeGraphModuleDefinitions?.[patchNode.type]?.layout;
  return layout === "phosphorWaveform";
}

function openNodeGraphPhosphorWaveformSettings(nodeId, event) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || !nodeGraphNodeUsesPhosphorWaveformDisplay(node)) {
    return false;
  }
  closeNodeGraphPhosphorWaveformSettings();
  nodeGraphMvp.phosphorWaveformSettingsTargetNode = nodeId;
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    return openNodeGraphTraceDisplaySettings(nodeId, event);
  }
  return false;
}

function closeNodeGraphPhosphorWaveformSettings() {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (win) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("phosphorWaveformSettings", win, { open: false }, { status: false });
    }
    win.hidden = true;
  }
}

// Debounced working-patch autosave for display-option drags. Full
// commitNodeGraphPatch on every Time Window step rebuilt the whole modular
// DOM + live plan and tanked frames; Shift+wheel zoom never did that.
let nodeGraphPhosphorWaveformSettingsPersistTimer = 0;

function scheduleNodeGraphPhosphorWaveformSettingsPersist() {
  if (nodeGraphPhosphorWaveformSettingsPersistTimer) {
    window.clearTimeout(nodeGraphPhosphorWaveformSettingsPersistTimer);
  }
  nodeGraphPhosphorWaveformSettingsPersistTimer = window.setTimeout(() => {
    nodeGraphPhosphorWaveformSettingsPersistTimer = 0;
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.patchDirtyState = "edited";
    }
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings();
    } else if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      syncNodeGraphCurrentSavedPatchHeader();
    }
  }, 280);
}

/**
 * Apply waveform display options without a full patch commit.
 * Same in-place mutation path as Shift+wheel zoom (SyncTimeWindowFromView).
 */
function updateNodeGraphPhosphorWaveformSettings(patch) {
  const nodeId = nodeGraphPhosphorWaveformSettingsTargetNodeId();
  if (!nodeId) {
    return;
  }
  const targetNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : (Array.isArray(nodeGraphMvp?.patch?.nodes)
      ? nodeGraphMvp.patch.nodes.find((node) => node.id === nodeId)
      : null);
  if (!targetNode) {
    return;
  }
  const current = normalizeNodeGraphPhosphorWaveformSettings(targetNode.phosphorWaveformSettings);
  targetNode.phosphorWaveformSettings = normalizeNodeGraphPhosphorWaveformSettings({
    ...current,
    ...patch,
  });
  // Keep signature tracking aligned so the next draw re-applies Time Window /
  // scroll-line (same as SyncTimeWindowFromView).
  if (
    Object.prototype.hasOwnProperty.call(patch, "timeWindowSeconds")
    || Object.prototype.hasOwnProperty.call(patch, "scrollLinePosition")
  ) {
    // Drop last-applied so draw treats this as a real settings change even if
    // auto-scroll was holding a matching signature from a prior gesture.
    nodeGraphPhosphorWaveformLastAppliedTimeWindow.delete(nodeId);
  }
  scheduleNodeGraphPhosphorWaveformSettingsPersist();
  renderNodeGraphPhosphorWaveformSettingsWindow();
  // Immediate paint — do not wait on the FPS gate (zoom does this too).
  const section = document.querySelector?.(
    `.node-phosphor-waveform-display[data-node="${String(nodeId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
  );
  if (section) {
    if (typeof nodeGraphPhosphorWaveformResyncFrameClock === "function") {
      nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
    }
    if (typeof drawNodeGraphPhosphorWaveformDisplay === "function") {
      drawNodeGraphPhosphorWaveformDisplay(section);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "playlistFade")
      && typeof nodeGraphAudioPlayerPlaylistApplyRowFade === "function"
    ) {
      nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
    }
  }
}

function handleNodeGraphPhosphorWaveformTimeWindowChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  updateNodeGraphPhosphorWaveformSettings({ timeWindowSeconds: value });
}

function setNodeGraphPhosphorWaveformScrollMode(mode) {
  updateNodeGraphPhosphorWaveformSettings({ scrollMode: mode === "snap" ? "snap" : "smooth" });
}

function setNodeGraphPhosphorWaveformScrollLinePosition(position) {
  updateNodeGraphPhosphorWaveformSettings({ scrollLinePosition: position });
}

function handleNodeGraphPhosphorWaveformLineWidthChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  updateNodeGraphPhosphorWaveformSettings({ scrollLineWidth: value });
}

function handleNodeGraphPhosphorWaveformTraceWidthChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) {
    return;
  }
  updateNodeGraphPhosphorWaveformSettings({ traceWidth: value });
}

function handleNodeGraphPhosphorWaveformHueChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ hue: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformLineBrightnessChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ lineBrightness: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformGridBrightnessChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ gridBrightness: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformBackgroundHueChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ backgroundHue: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformBackgroundBrightnessChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ backgroundBrightness: Number(event.target.value) });
}

function setNodeGraphPhosphorWaveformCornerShape(shape) {
  updateNodeGraphPhosphorWaveformSettings({ cornerShape: shape === "squircle" ? "squircle" : "square" });
}

function handleNodeGraphPhosphorWaveformCornerRadiusChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ cornerRadius: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformEdgeSpacingChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ edgeSpacing: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformLabelInsetChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ labelInsetPx: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformPlaylistFadeChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ playlistFade: Number(event.target.value) });
}

function buildNodeGraphPhosphorWaveformDisplaySettingsBodyHtml() {
  return `
    <div class="node-led-display-settings-panel node-phosphor-waveform-display-settings-panel" data-phosphor-waveform-display-settings-panel>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row node-phosphor-waveform-load-row" role="group" aria-label="Load sample">
        <span>Load Sample</span>
        <div id="nodePhosphorWaveformSampleLoaderSlot" class="node-phosphor-waveform-loader-slot"></div>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row node-phosphor-waveform-playlist-actions" role="group" aria-label="Playlist">
        <button id="nodePhosphorWaveformClearPlaylist" type="button">Clear Playlist</button>
        <button id="nodePhosphorWaveformRemoveItem" type="button">❌ Item</button>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row node-phosphor-waveform-phase-row" role="group" aria-label="Current phase">
        <span>Phase</span>
        <div id="nodePhosphorWaveformPhaseSlot" class="node-phosphor-waveform-phase-slot"></div>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Time window">
        <span>Time Window</span>
        <input id="nodePhosphorWaveformTimeWindowInput" data-phosphor-number-drag="timeWindowSeconds" type="number" inputmode="decimal" step="0.05" min="0" max="60" autocomplete="off" readonly title="Drag to adjust · double-click to type · 0 = single sample">
        <span>s</span>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Scroll mode">
        <span>Scroll</span>
        <button id="nodePhosphorWaveformScrollSmoothButton" type="button" data-scroll-mode="smooth" aria-pressed="true">Smooth</button>
        <button id="nodePhosphorWaveformScrollSnapButton" type="button" data-scroll-mode="snap" aria-pressed="false">Snap</button>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Scroll line position">
        <span>Position</span>
        <button id="nodePhosphorWaveformPositionLeftButton" type="button" data-scroll-position="left" aria-pressed="false">Left</button>
        <button id="nodePhosphorWaveformPositionMidButton" type="button" data-scroll-position="mid" aria-pressed="true">Mid</button>
        <button id="nodePhosphorWaveformPositionRightButton" type="button" data-scroll-position="right" aria-pressed="false">Right</button>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Scroll line thickness">
        <span>Scroll Line</span>
        <input id="nodePhosphorWaveformLineWidthInput" data-phosphor-number-drag="scrollLineWidth" type="number" inputmode="decimal" step="0.5" min="0" max="8" autocomplete="off" readonly title="Drag to adjust · double-click to type (0 = hidden)">
        <span>px</span>
      </div>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Trace thickness">
        <span>Trace</span>
        <input id="nodePhosphorWaveformTraceWidthInput" data-phosphor-number-drag="traceWidth" type="number" inputmode="decimal" step="0.5" min="0.5" max="5" autocomplete="off" readonly title="Drag to adjust · double-click to type (0.5–5 CSS px)">
        <span>px</span>
      </div>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Hue</span>
        <input id="nodePhosphorWaveformHueInput" type="range" min="0" max="360" step="1">
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Line Brightness</span>
        <input id="nodePhosphorWaveformLineBrightnessInput" type="range" min="0" max="1" step="0.01">
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Grid Brightness</span>
        <input id="nodePhosphorWaveformGridBrightnessInput" type="range" min="0" max="1" step="0.01" title="Sample grid lines when zoomed in (0 = hidden)">
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>BG Hue</span>
        <input id="nodePhosphorWaveformBackgroundHueInput" type="range" min="0" max="360" step="1">
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>BG Brightness</span>
        <input id="nodePhosphorWaveformBackgroundBrightnessInput" type="range" min="0" max="1" step="0.01">
      </label>
      <div class="node-led-settings-row node-phosphor-waveform-settings-row" role="group" aria-label="Corner shape">
        <span>Corners</span>
        <button id="nodePhosphorWaveformCornerSquareButton" type="button" data-corner-shape="square" aria-pressed="false">Pill</button>
        <button id="nodePhosphorWaveformCornerSquircleButton" type="button" data-corner-shape="squircle" aria-pressed="true">Squircle</button>
      </div>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Rounding</span>
        <input id="nodePhosphorWaveformCornerRadiusInput" type="range" min="0" max="100" step="1">
        <span>%</span>
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Edge Spacing</span>
        <input id="nodePhosphorWaveformEdgeSpacingInput" type="range" min="0" max="1" step="0.01">
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row">
        <span>Label inset</span>
        <input id="nodePhosphorWaveformLabelInsetInput" type="range" min="0" max="48" step="1" title="How many pixels the zoom/speed labels sit away from the corner">
        <span>px</span>
      </label>
      <label class="node-led-settings-row node-phosphor-waveform-settings-row" title="How far playlist rows fade away from the playing track">
        <span>Playlist fade</span>
        <span>sharp</span>
        <input id="nodePhosphorWaveformPlaylistFadeInput" type="range" min="0" max="1" step="0.01" aria-label="Playlist fade from sharp to gradual">
        <span>gradual</span>
      </label>
    </div>`;
}

function bindNodeGraphPhosphorWaveformDisplaySettingsBody(host) {
  if (!host) {
    return;
  }
  const nodeId = nodeGraphPhosphorWaveformSettingsTargetNodeId()
    || document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsTargetNode
    || "";
  if (nodeId && nodeGraphMvp) {
    nodeGraphMvp.phosphorWaveformSettingsTargetNode = nodeId;
  }
  bindNodeGraphPhosphorWaveformNumberDrags(host);
  if (typeof bindNodeGraphPhosphorWaveformSettingModifiers === "function") {
    bindNodeGraphPhosphorWaveformSettingModifiers();
  }
  if (host.dataset.phosphorWaveformSettingsBound !== "true") {
    host.dataset.phosphorWaveformSettingsBound = "true";
    host.addEventListener("input", (event) => {
      const id = event.target?.id || "";
      if (id === "nodePhosphorWaveformHueInput") {
        handleNodeGraphPhosphorWaveformHueChange(event);
      } else if (id === "nodePhosphorWaveformLineBrightnessInput") {
        handleNodeGraphPhosphorWaveformLineBrightnessChange(event);
      } else if (id === "nodePhosphorWaveformGridBrightnessInput") {
        handleNodeGraphPhosphorWaveformGridBrightnessChange(event);
      } else if (id === "nodePhosphorWaveformBackgroundHueInput") {
        handleNodeGraphPhosphorWaveformBackgroundHueChange(event);
      } else if (id === "nodePhosphorWaveformBackgroundBrightnessInput") {
        handleNodeGraphPhosphorWaveformBackgroundBrightnessChange(event);
      } else if (id === "nodePhosphorWaveformCornerRadiusInput") {
        handleNodeGraphPhosphorWaveformCornerRadiusChange(event);
      } else if (id === "nodePhosphorWaveformEdgeSpacingInput") {
        handleNodeGraphPhosphorWaveformEdgeSpacingChange(event);
      } else if (id === "nodePhosphorWaveformLabelInsetInput") {
        handleNodeGraphPhosphorWaveformLabelInsetChange(event);
      } else if (id === "nodePhosphorWaveformPlaylistFadeInput") {
        handleNodeGraphPhosphorWaveformPlaylistFadeChange(event);
      } else if (id === "nodePhosphorWaveformTraceWidthInput") {
        handleNodeGraphPhosphorWaveformTraceWidthChange(event);
      }
    });
    host.addEventListener("change", (event) => {
      const id = event.target?.id || "";
      if (id === "nodePhosphorWaveformTimeWindowInput") {
        handleNodeGraphPhosphorWaveformTimeWindowChange(event);
      } else if (id === "nodePhosphorWaveformLineWidthInput") {
        handleNodeGraphPhosphorWaveformLineWidthChange(event);
      } else if (id === "nodePhosphorWaveformTraceWidthInput") {
        handleNodeGraphPhosphorWaveformTraceWidthChange(event);
      } else if (id === "nodePhosphorWaveformPlaylistFadeInput") {
        handleNodeGraphPhosphorWaveformPlaylistFadeChange(event);
      }
    });
    host.addEventListener("click", (event) => {
      const button = event.target?.closest?.("button");
      if (!button || !host.contains(button)) {
        return;
      }
      if (button.id === "nodePhosphorWaveformScrollSmoothButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformScrollMode("smooth");
      } else if (button.id === "nodePhosphorWaveformScrollSnapButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformScrollMode("snap");
      } else if (button.id === "nodePhosphorWaveformPositionLeftButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformScrollLinePosition("left");
      } else if (button.id === "nodePhosphorWaveformPositionMidButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformScrollLinePosition("mid");
      } else if (button.id === "nodePhosphorWaveformPositionRightButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformScrollLinePosition("right");
      } else if (button.id === "nodePhosphorWaveformClearPlaylist") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerPlaylistClear === "function") {
          nodeGraphAudioPlayerPlaylistClear(nodeGraphPhosphorWaveformSettingsTargetNodeId());
        }
      } else if (button.id === "nodePhosphorWaveformRemoveItem") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerPlaylistRemoveSelected === "function") {
          nodeGraphAudioPlayerPlaylistRemoveSelected(nodeGraphPhosphorWaveformSettingsTargetNodeId());
        }
      } else if (button.id === "nodePhosphorWaveformCornerSquareButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformCornerShape("square");
      } else if (button.id === "nodePhosphorWaveformCornerSquircleButton") {
        event.preventDefault();
        setNodeGraphPhosphorWaveformCornerShape("squircle");
      }
    });
  }
  renderNodeGraphPhosphorWaveformSettingsWindow();
}

function applyNodeGraphPhosphorWaveformDisplaySettingsToFace(node) {
  const nodeId = String(node?.id || "");
  if (!nodeId) {
    return;
  }
  const section = document.querySelector?.(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(nodeId)}"]`,
  );
  if (!section) {
    return;
  }
  if (typeof nodeGraphPhosphorWaveformResyncFrameClock === "function") {
    nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
  }
  if (typeof drawNodeGraphPhosphorWaveformDisplay === "function") {
    drawNodeGraphPhosphorWaveformDisplay(section);
  }
  if (typeof nodeGraphAudioPlayerPlaylistApplyRowFade === "function") {
    nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
  }
}

// Panel shape/inset are pure CSS, but the inset has to be resolved against the
// live cell size (so "1" really does collapse the panel whatever the module
// height is) and quantized to whole pixels (so the black gap and the panel
// edge both land on a device pixel and stay razor sharp -- a fractional inset
// would give a soft, half-lit edge). Called from the draw path, which already
// runs per section per frame and has the measured size to hand.
//
// powered (default true): when false (audio engine / simulation off), kill the
// phosphor-green frame so the plate reads as a cold black screen, not a lit
// empty CRT.
function applyNodeGraphPhosphorWaveformPanelShape(section, settings, cellWidth, cellHeight, powered = true) {
  // cellWidth/cellHeight MUST be the section's own padding-box size, i.e. the
  // whole grid cell, which the inset does not change: the inset is padding
  // inside this element, so section.clientWidth stays put while the canvas
  // inside it shrinks. Feeding the canvas's (inset-dependent) size in here
  // instead is a feedback loop -- bigger inset shrinks the measurement, which
  // shrinks maxInset, which shrinks the inset again -- and that oscillation is
  // what made the module jitter while dragging Edge Spacing. No back-adding of
  // the applied inset is needed (or correct) any more; the input is stable, so
  // the result depends only on the setting.
  const outerWidth = cellWidth;
  const outerHeight = cellHeight;
  const maxInset = Math.max(0, Math.floor(Math.min(outerWidth, outerHeight) / 2));
  const inset = Math.round(settings.edgeSpacing * maxInset);
  // Largest meaningful radius is half the panel's shorter side: at 100% a
  // square panel is a circle and a wide one is a pill/stadium.
  const panelWidth = Math.max(0, outerWidth - inset * 2);
  const panelHeight = Math.max(0, outerHeight - inset * 2);
  const maxRadius = Math.max(0, Math.min(panelWidth, panelHeight) / 2);
  const radius = Math.round((settings.cornerRadius / 100) * maxRadius);
  const shape = settings.cornerShape === "squircle" ? "squircle" : "round";
  // The panel outline follows BG Hue so the frame and the field it encloses
  // stay the same colour family. Saturation/lightness/alpha are the values
  // the old hardcoded rgba(90, 255, 150, 0.16) worked out to, so at the
  // default hue (140) this is visually unchanged. Off = no frame (black plate).
  const borderColor = powered
    ? `hsl(${Math.round(settings.backgroundHue)} 100% 68% / 0.16)`
    : "transparent";
  const labelInset = Math.max(0, Math.min(48, Math.round(Number(settings.labelInsetPx) || 0)));
  const next = `${inset}|${radius}|${shape}|${borderColor}|${powered ? 1 : 0}|${labelInset}`;
  if (section.dataset.panelShape === next) {
    return;
  }
  section.dataset.panelShape = next;
  section.style.setProperty("--phosphor-waveform-inset", `${inset}px`);
  section.style.setProperty("--phosphor-waveform-label-inset", `${labelInset}px`);
  section.style.setProperty("--phosphor-waveform-radius", `${radius}px`);
  section.style.setProperty("--phosphor-waveform-border-color", borderColor);
  if (typeof applyNodeGraphPhosphorWaveformHudVars === "function") {
    applyNodeGraphPhosphorWaveformHudVars(section, settings);
  }
  // corner-shape is a progressive enhancement: where it is unsupported the
  // declaration is dropped and the panel is a normal rounded rect.
  section.style.setProperty("--phosphor-waveform-corner-shape", shape);
}

// Bound to BOTH the drag handle and the whole title bar. Safe to bind on the
// heading because beginNodeGraphFloatingWindowDrag defers to
// nodeGraphDialogDragTargetIsInteractive, which whitelists
// .scene-context-drag-handle and excludes the close button.
function beginNodeGraphPhosphorWaveformSettingsDrag(event) {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "phosphorWaveformSettingsDragging");
}

// Gives every numeric control in the waveform display options window the same
// modifier vocabulary as the module sliders -- ctrl/cmd+click resets to
// default, shift/ctrl scale the step. See bindNodeGraphNativeSliderModifiers
// in node-graph-slider-dragging.js; defaults come from the one settings
// object, so they cannot drift from what normalize* actually falls back to.
const nodeGraphPhosphorWaveformSettingInputs = Object.freeze([
  ["nodePhosphorWaveformTimeWindowInput", "timeWindowSeconds"],
  ["nodePhosphorWaveformLineWidthInput", "scrollLineWidth"],
  ["nodePhosphorWaveformTraceWidthInput", "traceWidth"],
  ["nodePhosphorWaveformHueInput", "hue"],
  ["nodePhosphorWaveformLineBrightnessInput", "lineBrightness"],
  ["nodePhosphorWaveformGridBrightnessInput", "gridBrightness"],
  ["nodePhosphorWaveformBackgroundHueInput", "backgroundHue"],
  ["nodePhosphorWaveformBackgroundBrightnessInput", "backgroundBrightness"],
  ["nodePhosphorWaveformCornerRadiusInput", "cornerRadius"],
  ["nodePhosphorWaveformEdgeSpacingInput", "edgeSpacing"],
  ["nodePhosphorWaveformLabelInsetInput", "labelInsetPx"],
  ["nodePhosphorWaveformPlaylistFadeInput", "playlistFade"],
]);

function bindNodeGraphPhosphorWaveformSettingModifiers() {
  if (typeof bindNodeGraphNativeSliderModifiers !== "function") {
    return;
  }
  for (const [id, key] of nodeGraphPhosphorWaveformSettingInputs) {
    bindNodeGraphNativeSliderModifiers(
      document.getElementById(id),
      nodeGraphPhosphorWaveformDefaultSettings[key],
    );
  }
}

const nodeGraphPhosphorWaveformNumberDragSpecs = Object.freeze({
  timeWindowSeconds: {
    step: 0.05,
    min: 0,
    max: 60,
    pixelsPerStep: 8,
    commit: () => typeof handleNodeGraphPhosphorWaveformTimeWindowChange === "function"
      && handleNodeGraphPhosphorWaveformTimeWindowChange({
        target: document.getElementById("nodePhosphorWaveformTimeWindowInput"),
      }),
  },
  scrollLineWidth: {
    step: 0.5,
    min: 0,
    max: 8,
    pixelsPerStep: 14,
    commit: () => typeof handleNodeGraphPhosphorWaveformLineWidthChange === "function"
      && handleNodeGraphPhosphorWaveformLineWidthChange({
        target: document.getElementById("nodePhosphorWaveformLineWidthInput"),
      }),
  },
  traceWidth: {
    step: 0.5,
    min: 0.5,
    max: 5,
    pixelsPerStep: 14,
    commit: () => typeof handleNodeGraphPhosphorWaveformTraceWidthChange === "function"
      && handleNodeGraphPhosphorWaveformTraceWidthChange({
        target: document.getElementById("nodePhosphorWaveformTraceWidthInput"),
      }),
  },
});

function nodeGraphPhosphorWaveformClampNumberDrag(value, spec) {
  let n = Number(value);
  if (!Number.isFinite(n)) {
    return spec.min;
  }
  n = Math.max(spec.min, Math.min(spec.max, n));
  if (spec.step > 0) {
    n = spec.min + Math.round((n - spec.min) / spec.step) * spec.step;
    const decimals = String(spec.step).includes(".") ? String(spec.step).split(".")[1].length : 0;
    if (decimals > 0) {
      n = Number(n.toFixed(decimals));
    }
  }
  return n;
}

let nodeGraphPhosphorWaveformNumberDrag = null;

function nodeGraphPhosphorWaveformEnsureNumberDragDocListeners() {
  if (document.documentElement.dataset.phosphorNumberDragDocBound === "2") {
    return;
  }
  document.documentElement.dataset.phosphorNumberDragDocBound = "2";
  // Capture: popover text-protection stopPropagates before bubble listeners.
  document.addEventListener("pointermove", nodeGraphPhosphorWaveformMoveNumberDrag, true);
  document.addEventListener("pointerup", nodeGraphPhosphorWaveformEndNumberDrag, true);
  document.addEventListener("pointercancel", nodeGraphPhosphorWaveformEndNumberDrag, true);
  document.addEventListener("lostpointercapture", nodeGraphPhosphorWaveformEndNumberDrag, true);
}

function nodeGraphPhosphorWaveformBeginNumberDrag(event) {
  nodeGraphPhosphorWaveformEnsureNumberDragDocListeners();
  const input = event.target?.closest?.("input[data-phosphor-number-drag]");
  if (!input || event.button > 0 || event.detail > 1 || !input.readOnly) {
    return false;
  }
  const spec = nodeGraphPhosphorWaveformNumberDragSpecs[input.dataset.phosphorNumberDrag];
  if (!spec) {
    return false;
  }
  const mult = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  nodeGraphPhosphorWaveformNumberDrag = {
    input,
    spec,
    pointerId: event.pointerId ?? null,
    startX: event.clientX,
    startY: event.clientY,
    startValue: Number(input.value) || 0,
    accum: 0,
    lastCombined: 0,
    fineScale: mult,
    valueStep: spec.step * mult,
    pixelsPerStep: spec.pixelsPerStep / Math.max(0.25, Math.min(4, mult)),
  };
  input.classList.add("value-dragging");
  try {
    input.setPointerCapture?.(event.pointerId);
  } catch {
    // ignore
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function nodeGraphPhosphorWaveformMoveNumberDrag(event) {
  const drag = nodeGraphPhosphorWaveformNumberDrag;
  if (!drag) {
    return;
  }
  if (drag.pointerId !== null && event.pointerId !== undefined && event.pointerId !== drag.pointerId) {
    return;
  }
  // Display Settings text-protection stopPropagates inside the popover.
  // These listeners must run in capture on document. If the button is already
  // up, the matching pointerup was eaten — drop the drag or it sticks forever.
  if (event.buttons === 0) {
    nodeGraphPhosphorWaveformEndNumberDrag(event);
    return;
  }
  const mult = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  if (mult !== drag.fineScale) {
    drag.startValue = Number(drag.input.value) || drag.startValue;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.accum = 0;
    drag.lastCombined = 0;
    drag.fineScale = mult;
    drag.valueStep = drag.spec.step * mult;
    drag.pixelsPerStep = drag.spec.pixelsPerStep / Math.max(0.25, Math.min(4, mult));
    event.preventDefault();
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  const delta = axes.combined - drag.lastCombined;
  drag.lastCombined = axes.combined;
  drag.accum += delta;
  const threshold = drag.pixelsPerStep;
  let changed = false;
  while (drag.accum >= threshold) {
    drag.accum -= threshold;
    drag.startValue = nodeGraphPhosphorWaveformClampNumberDrag(
      drag.startValue + drag.valueStep,
      drag.spec,
    );
    changed = true;
  }
  while (drag.accum <= -threshold) {
    drag.accum += threshold;
    drag.startValue = nodeGraphPhosphorWaveformClampNumberDrag(
      drag.startValue - drag.valueStep,
      drag.spec,
    );
    changed = true;
  }
  if (changed) {
    drag.input.value = String(drag.startValue);
    drag.spec.commit();
  }
  event.preventDefault();
}

function nodeGraphPhosphorWaveformEndNumberDrag(event) {
  const drag = nodeGraphPhosphorWaveformNumberDrag;
  if (!drag) {
    return;
  }
  if (event && drag.pointerId !== null && event.pointerId !== undefined && event.pointerId !== drag.pointerId) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  try {
    if (event?.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
      drag.input.releasePointerCapture(event.pointerId);
    }
  } catch {
    // input may have been remounted
  }
  nodeGraphPhosphorWaveformNumberDrag = null;
  event?.preventDefault?.();
}

/**
 * Capture-phase drag on the Display Settings host. Per-input listeners die
 * when the panel rebuilds innerHTML; host delegation does not.
 */
function bindNodeGraphPhosphorWaveformNumberDrags(host) {
  if (!host || host.dataset.phosphorNumberDragBound === "1") {
    return;
  }
  host.dataset.phosphorNumberDragBound = "1";

  host.addEventListener("dblclick", (event) => {
    const input = event.target?.closest?.("input[data-phosphor-number-drag]");
    if (!input || !host.contains(input)) {
      return;
    }
    input.readOnly = false;
    input.classList.add("editing");
    input.focus();
    input.select();
    event.preventDefault();
    event.stopPropagation();
  }, true);

  host.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.phosphorNumberDrag) {
      return;
    }
    input.readOnly = true;
    input.classList.remove("editing");
  }, true);

  host.addEventListener("keydown", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.phosphorNumberDrag) {
      return;
    }
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      input.blur();
    }
  }, true);

  host.addEventListener("pointerdown", nodeGraphPhosphorWaveformBeginNumberDrag, true);
  nodeGraphPhosphorWaveformEnsureNumberDragDocListeners();
}

function bindNodeGraphPhosphorWaveformTimeWindowEditing() {
  const host = document.querySelector("[data-phosphor-waveform-display-settings-panel]")
    ?.closest?.("[data-display-settings-body]")
    || document.querySelector("[data-display-settings-body]");
  bindNodeGraphPhosphorWaveformNumberDrags(host);
}

function bindNodeGraphPhosphorWaveformPxFields() {
  bindNodeGraphPhosphorWaveformTimeWindowEditing();
}

function dragNodeGraphPhosphorWaveformSettings(event) {
  dragNodeGraphFloatingWindow(event, "phosphorWaveformSettingsDragging", document.getElementById("nodePhosphorWaveformSettingsWindow"));
}

function endNodeGraphPhosphorWaveformSettingsDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "phosphorWaveformSettingsDragging", () => {
    // Record where the user parked it so the next open restores it instead of
    // jumping back to the pointer.
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "phosphorWaveformSettings",
        document.getElementById("nodePhosphorWaveformSettingsWindow"),
        { open: true },
        { status: false },
      );
    }
  });
}

function nodeGraphPhosphorWaveformViewState(nodeId, frames) {
  const safeFrames = Math.max(1, Math.round(Number(frames) || 1));
  let state = nodeGraphPhosphorWaveformViewStates.get(nodeId);
  if (!state || state.totalFrames !== safeFrames) {
    state = { endFrame: safeFrames, startFrame: 0, totalFrames: safeFrames };
    nodeGraphPhosphorWaveformViewStates.set(nodeId, state);
  }
  return state;
}

function nodeGraphPhosphorWaveformClampWindow(state) {
  const minWindow = Math.min(state.totalFrames, nodeGraphPhosphorWaveformMinWindowFrames);
  let width = state.endFrame - state.startFrame;
  width = Math.max(minWindow, Math.min(state.totalFrames, width));
  // Preserve exact window length (may be float from pan/zoom). Only clamp range.
  state.startFrame = Math.max(0, Math.min(state.totalFrames - width, state.startFrame));
  state.endFrame = state.startFrame + width;
}

/**
 * Continuous (sub-sample) view window for vector scroll.
 *
 * Older min/max *column* drawing needed pixel-locked scroll to stop rebin
 * shimmer. A straight vector path through sample points does not rebin — it
 * just translates — so we keep the window on continuous floats and let the
 * GPU/canvas antialias the stroke. Clamps to the file only.
 */
function nodeGraphPhosphorWaveformContinuousView(idealStart, windowFrames, totalFrames) {
  const total = Math.max(1, Math.round(Number(totalFrames) || 1));
  const win = Math.max(
    Math.min(total, nodeGraphPhosphorWaveformMinWindowFrames),
    Math.max(1, Math.min(total, Math.round(Number(windowFrames) || 1))),
  );
  const maxStart = Math.max(0, total - win);
  const viewStart = Math.max(0, Math.min(maxStart, Number(idealStart) || 0));
  return {
    viewEnd: viewStart + win,
    viewStart,
  };
}

function nodeGraphPhosphorWaveformSamplesUsable(samples) {
  if (!samples?.length) {
    return false;
  }
  try {
    if (samples.buffer && samples.buffer.byteLength === 0) {
      return false;
    }
    return Number.isFinite(Number(samples[0]));
  } catch {
    return false;
  }
}

function nodeGraphPhosphorWaveformEntrySamples(entry) {
  if (!entry) {
    return null;
  }
  if (nodeGraphPhosphorWaveformSamplesUsable(entry.samples)) {
    return entry.samples;
  }
  const channel = entry.channelData?.[0];
  return nodeGraphPhosphorWaveformSamplesUsable(channel) ? channel : null;
}

function nodeGraphPhosphorWaveformSampleEntry(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  const sampleId = node?.sample?.id;
  if (!sampleId) {
    return null;
  }
  const entry = nodeGraphMvp?.sampleBuffers?.get?.(sampleId);
  const samples = nodeGraphPhosphorWaveformEntrySamples(entry);
  const frames = Math.max(0, Number(entry?.frames) || samples?.length || 0);
  return entry && samples && frames > 0 ? entry : null;
}

function nodeGraphPhosphorWaveformZoomAt(section, canvas, clientX, factor) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  const state = nodeGraphPhosphorWaveformViewState(nodeId, entry.frames);
  // Smooth-scroll mode continuously re-centers the view on the playhead
  // every auto-scroll frame -- if a manual zoom anchored to the mouse
  // cursor instead, the very next auto-scroll frame after the interaction
  // pause would visibly jump the view to re-center on the playhead. Anchor
  // to the playhead here too so zooming in smooth mode feels like zooming
  // into the scroll line itself, with no jump once auto-scroll resumes.
  // Snap mode (and "no sample position yet") keep the normal
  // cursor-anchored zoom.
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
  const phase = typeof nodeGraphSamplePhaseForNode === "function" ? nodeGraphSamplePhaseForNode(nodeId) : 0;
  const useSmoothAnchor = settings.scrollMode === "smooth";
  const rect = canvas.getBoundingClientRect();
  const ratio = useSmoothAnchor
    ? nodeGraphPhosphorWaveformScrollLineRatio(settings)
    : (rect.width > 0 ? clampNodeSliderValue((clientX - rect.left) / rect.width, 0, 1) : 0.5);
  const anchorFrame = useSmoothAnchor
    ? phase * entry.frames
    : state.startFrame + ratio * (state.endFrame - state.startFrame);
  const width = state.endFrame - state.startFrame;
  const newWidth = Math.max(
    nodeGraphPhosphorWaveformMinWindowFrames,
    Math.min(state.totalFrames, width * factor),
  );
  state.startFrame = anchorFrame - ratio * newWidth;
  state.endFrame = state.startFrame + newWidth;
  nodeGraphPhosphorWaveformClampWindow(state);
  // Keep Time Window setting = live span so modular zoom / auto-scroll cannot
  // re-apply the old seconds value and undo this gesture.
  nodeGraphPhosphorWaveformSyncTimeWindowFromView(
    nodeId,
    state.endFrame - state.startFrame,
    entry.sampleRate,
  );
  nodeGraphPhosphorWaveformMarkInteraction(nodeId);
  nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

function nodeGraphPhosphorWaveformPanBy(section, deltaPixels, canvasWidth) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry || canvasWidth <= 0) {
    return;
  }
  const state = nodeGraphPhosphorWaveformViewState(nodeId, entry.frames);
  const framesPerPixel = (state.endFrame - state.startFrame) / canvasWidth;
  state.startFrame -= deltaPixels * framesPerPixel;
  state.endFrame -= deltaPixels * framesPerPixel;
  nodeGraphPhosphorWaveformClampWindow(state);
  nodeGraphPhosphorWaveformMarkInteraction(nodeId);
  nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

function nodeGraphPhosphorWaveformResetZoom(section) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  nodeGraphPhosphorWaveformViewStates.set(nodeId, {
    endFrame: entry.frames,
    startFrame: 0,
    totalFrames: entry.frames,
  });
  nodeGraphPhosphorWaveformSyncTimeWindowFromView(nodeId, entry.frames, entry.sampleRate);
  nodeGraphPhosphorWaveformMarkInteraction(nodeId);
  nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

/**
 * Nudge Music Player phaseOffset (−1…+1 wrap) by a relative cycle delta.
 * Does not touch free-running transport phase — only the relative scrub param.
 */
function nodeGraphPhosphorWaveformNudgePhaseOffset(nodeId, deltaCycles) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const delta = Number(deltaCycles) || 0;
  if (!delta) {
    return;
  }
  const current = Number(node.params?.phaseOffset) || 0;
  const next = typeof wrapNodeSliderValue === "function"
    ? wrapNodeSliderValue(current + delta, -1, 1)
    : ((((current + delta) + 1) % 2) + 2) % 2 - 1;
  node.params = { ...(node.params || {}), phaseOffset: next };
  // Mirror the module slider if present.
  const safeId = String(nodeId || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const moduleEl = document.querySelector(`.dsp-node[data-node="${safeId}"]`);
  const slider = moduleEl?.querySelector?.('input[data-param="phaseOffset"]');
  if (slider) {
    slider.value = String(next);
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(slider);
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
  // Keep working-patch autosave from lagging too far behind scrub gestures.
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    if (!nodeGraphPhosphorWaveformNudgePhaseOffset._saveTimer) {
      nodeGraphPhosphorWaveformNudgePhaseOffset._saveTimer = window.setTimeout(() => {
        nodeGraphPhosphorWaveformNudgePhaseOffset._saveTimer = 0;
        saveNodeGraphWorkingPatchToUserSettings();
      }, 400);
    }
  }
}

function nodeGraphPhosphorWaveformFormatZoomPercent(ratio) {
  const pct = Math.max(0, Number(ratio) || 0) * 100;
  if (pct >= 9.95) {
    return `${Math.round(pct)}%`;
  }
  if (pct >= 0.995) {
    return `${pct.toFixed(1)}%`;
  }
  return `${pct.toFixed(2)}%`;
}

function nodeGraphPhosphorWaveformEnsureZoomControl(section) {
  if (!section) {
    return null;
  }
  let control = section.querySelector(":scope > .node-phosphor-waveform-zoom");
  if (control) {
    return control;
  }
  control = document.createElement("button");
  control.type = "button";
  control.className = "node-phosphor-waveform-zoom";
  control.textContent = "100%";
  control.title = "Drag to zoom. Double-click resets.";
  control.setAttribute("aria-label", "Waveform zoom percent");
  control.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    beginNodeGraphPhosphorWaveformZoomDrag(event, section);
  });
  control.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphPhosphorWaveformResetZoom(section);
  });
  section.append(control);
  return control;
}

function nodeGraphPhosphorWaveformSyncZoomControl(section, ratio) {
  const control = nodeGraphPhosphorWaveformEnsureZoomControl(section);
  if (!control) {
    return;
  }
  const label = nodeGraphPhosphorWaveformFormatZoomPercent(ratio);
  if (control.textContent !== label) {
    control.textContent = label;
  }
}

function beginNodeGraphPhosphorWaveformZoomDrag(event, section) {
  if (event.button > 0 || (typeof nodeGraphAudioPlayerFaceIsWave === "function"
    ? !nodeGraphAudioPlayerFaceIsWave(section)
    : (section?.dataset?.musicPlayerFace || "wave") !== "wave")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const nodeId = section.dataset.node;
  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  const state = nodeGraphPhosphorWaveformViewState(nodeId, entry.frames);
  const startWidth = Math.max(1, state.endFrame - state.startFrame);
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const control = event.currentTarget;
  control.setPointerCapture?.(pointerId);
  control.classList.add("is-dragging");
  const applyFromStart = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    const deltaX = moveEvent.clientX - startX;
    const targetWidth = startWidth * Math.exp(deltaX * 0.008);
    const currentWidth = Math.max(1, state.endFrame - state.startFrame);
    const canvasEl = section.querySelector(".node-phosphor-waveform-canvas");
    const rect = canvasEl?.getBoundingClientRect?.();
    const clientX = rect ? rect.left + rect.width * 0.5 : startX;
    nodeGraphPhosphorWaveformZoomAt(section, canvasEl, clientX, targetWidth / currentWidth);
  };
  const endDrag = (endEvent) => {
    if (endEvent.pointerId !== pointerId) {
      return;
    }
    control.releasePointerCapture?.(pointerId);
    control.classList.remove("is-dragging");
    control.removeEventListener("pointermove", applyFromStart);
    control.removeEventListener("pointerup", endDrag);
    control.removeEventListener("pointercancel", endDrag);
  };
  control.addEventListener("pointermove", applyFromStart);
  control.addEventListener("pointerup", endDrag);
  control.addEventListener("pointercancel", endDrag);
}

function bindNodeGraphPhosphorWaveformInteractions(section, canvas) {
  canvas.style.touchAction = "none";

  let dragPointerId = null;
  let lastClientX = 0;
  // "pan" = view window, "phase" = relative phaseOffset scrub (Shift+drag).
  let dragMode = "pan";
  canvas.addEventListener("pointerdown", (event) => {
    if (typeof nodeGraphAudioPlayerFaceIsWave === "function"
      ? !nodeGraphAudioPlayerFaceIsWave(section)
      : (section.dataset.musicPlayerFace || "wave") !== "wave") {
      return;
    }
    if (event.button !== 0 && event.button !== undefined) {
      return;
    }
    dragPointerId = event.pointerId;
    lastClientX = event.clientX;
    dragMode = event.shiftKey ? "phase" : "pan";
    canvas.setPointerCapture?.(dragPointerId);
    canvas.classList.add("dragging");
    canvas.classList.toggle("phase-scrubbing", dragMode === "phase");
    event.stopPropagation();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) {
      return;
    }
    const deltaX = event.clientX - lastClientX;
    lastClientX = event.clientX;
    const nodeId = section.dataset.node;
    const canvasW = canvas.clientWidth || canvas.width;
    if (dragMode === "phase") {
      // Relative scrub: drag across the face moves phase by the visible
      // window as a fraction of the whole file (zoom in = finer control).
      const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
      const state = entry
        ? nodeGraphPhosphorWaveformViewState(nodeId, entry.frames)
        : null;
      const viewSpan = state
        ? Math.max(1, state.endFrame - state.startFrame)
        : 1;
      const total = Math.max(1, state?.totalFrames || entry?.frames || 1);
      const deltaCycles = canvasW > 0 ? (deltaX / canvasW) * (viewSpan / total) : 0;
      nodeGraphPhosphorWaveformNudgePhaseOffset(nodeId, deltaCycles);
    } else {
      nodeGraphPhosphorWaveformPanBy(section, deltaX, canvasW);
    }
    event.stopPropagation();
  });
  const endDrag = (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) {
      return;
    }
    canvas.releasePointerCapture?.(dragPointerId);
    dragPointerId = null;
    dragMode = "pan";
    canvas.classList.remove("dragging");
    canvas.classList.remove("phase-scrubbing");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", (event) => {
    if (typeof nodeGraphAudioPlayerFaceIsWave === "function"
      ? !nodeGraphAudioPlayerFaceIsWave(section)
      : (section.dataset.musicPlayerFace || "wave") !== "wave") {
      return;
    }
    event.stopPropagation();
    nodeGraphPhosphorWaveformResetZoom(section);
  });
}

// Every other display in this app paces its redraws to the shared FPS
// setting (nodeGraphMvp.moduleScopeFramesPerSecond, default 60) via
// nodeGraphModuleScopeAdvanceFixedFrameClock -- this display ran on raw,
// unthrottled requestAnimationFrame instead (uncapped to the monitor's own
// refresh rate), which reads as inconsistent/less smooth next to
// everything else in the app rendering on the same steady cadence.
//
// Reuses that exact function (node-graph-module-scopes.js) rather than a
// bespoke "now - last < frameDuration" check -- a naive version like that
// resets its own clock to `now` on every allowed frame instead of
// carrying the frame-clock phase forward (lastUpdate + steps*frameDuration),
// so it drifts against rAF's own timing and periodically double-skips or
// double-fires a frame. That reads exactly as "not smooth" / stutter, and
// showed up as the playhead visibly jumping ("desync with the position
// line") whenever a frame got dropped out of phase. The shared function
// already carries the phase forward and tolerates rAF's normal jitter
// (5% of a frame duration) without falsely skipping an on-time frame.
// Self contained -- keeps its own per-node {lastUpdate, time} state
// rather than the shared scope compositor's animation-time clock, which
// may not even be ticking if no other scope-based module exists in the
// patch.
const nodeGraphPhosphorWaveformFrameClockStates = new Map();

function nodeGraphPhosphorWaveformFrameReady(nodeId) {
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  if (!(fps > 0) || typeof nodeGraphModuleScopeAdvanceFixedFrameClock !== "function") {
    return true;
  }
  const now = performance.now() / 1000;
  let clock = nodeGraphPhosphorWaveformFrameClockStates.get(nodeId);
  if (!clock) {
    clock = { lastUpdate: 0, time: now };
    nodeGraphPhosphorWaveformFrameClockStates.set(nodeId, clock);
  }
  const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(clock, now, fps);
  if (!tick.ready) {
    return false;
  }
  clock.lastUpdate = tick.lastUpdate;
  clock.time = tick.time;
  return true;
}

// Manual interaction (zoom/pan/reset) draws immediately for responsive
// feedback, bypassing the FPS gate -- but without this, the scheduled
// loop's frame clock wouldn't know a draw just happened and could fire an
// extra one right on its heels, or (worse) treat the gap since its last
// tick as having grown, triggering a multi-step "catch-up" jump on the
// next scheduled frame. Resyncing the clock to "now" after every manual
// draw keeps the two draw paths on one consistent clock.
function nodeGraphPhosphorWaveformResyncFrameClock(nodeId) {
  const now = performance.now() / 1000;
  nodeGraphPhosphorWaveformFrameClockStates.set(nodeId, { lastUpdate: now, time: now });
}

// Mirrors the module-scope compositor's off-screen culling
// (nodeGraphModuleScopeScreenItems/nodeGraphModuleScopeVisibleDrawGeometry
// in node-graph-module-scopes.js) -- a Music Player scrolled/panned fully
// outside the workspace viewport shouldn't keep paying for a canvas
// clear+stroke every frame just because its section is still in the DOM.
// A plain viewport-rect overlap test is enough here (unlike the scope
// compositor, the waveform doesn't need a partial-visible-range draw).
function nodeGraphPhosphorWaveformSectionOnScreen(section) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return true;
  }
  const workspaceRect = workspace.getBoundingClientRect();
  const rect = section.getBoundingClientRect();
  return rect.right > workspaceRect.left &&
    rect.left < workspaceRect.right &&
    rect.bottom > workspaceRect.top &&
    rect.top < workspaceRect.bottom;
}

function scheduleNodeGraphPhosphorWaveformFrame(section) {
  if (!section.isConnected) {
    return;
  }
  // Order matters: skip the FPS-gate clock entirely while off-screen so it
  // doesn't advance -- when the section scrolls back into view its frame
  // clock's stalled-too-long resync path (nodeGraphModuleScopeAdvanceFixedFrameClock)
  // fires a single fresh frame instead of a multi-step catch-up burst.
  if (nodeGraphPhosphorWaveformSectionOnScreen(section) && nodeGraphPhosphorWaveformFrameReady(section.dataset.node)) {
    drawNodeGraphPhosphorWaveformDisplay(section);
  }
  window.requestAnimationFrame(() => scheduleNodeGraphPhosphorWaveformFrame(section));
}

function createNodeGraphPhosphorWaveformDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-phosphor-waveform-display node-light-source";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  // Room dimmer rect punch (same contract as .node-module-scope-window).
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "1";
  section.setAttribute("aria-label", `${nodeGraphNodeDisplayName?.(nodeId) || "Music Player"} phosphor waveform display`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-phosphor-waveform-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "1";
  section.append(canvas);
  bindNodeGraphPhosphorWaveformInteractions(section, canvas);
  // Music Player: face bar + playlist page (pl) over the waveform.
  if (type === "audioPlayer" && typeof nodeGraphAudioPlayerPlaylistEnhanceDisplay === "function") {
    nodeGraphAudioPlayerPlaylistEnhanceDisplay(section, nodeId);
    if (typeof window.__nodeGraphAudioPlayerPlaylistWrapRuntime === "function") {
      window.__nodeGraphAudioPlayerPlaylistWrapRuntime();
    }
  }
  nodeGraphPhosphorWaveformEnsureZoomControl(section);
  window.requestAnimationFrame(() => scheduleNodeGraphPhosphorWaveformFrame(section));
  return section;
}

// At the default 2-second time window this scan costs ~2ms/frame -- fine.
// Fully zoomed out on a realistic multi-minute file it costs ~28ms/frame
// (measured on a 3-minute file at 1200 columns), blowing well past a 60fps
// frame budget (16.67ms) regardless of the configured FPS target -- the
// throttle can only skip frames it's given, it can't make a frame that's
// already running finish faster. That's an unbounded cost (O(total frames
// in view)), so it scales with however zoomed-out/long the file is. Capping
// the number of samples actually read per column (via a stride once a
// column would otherwise span more than that) bounds the total work to
// columns * cap regardless of zoom level or file length -- the standard
// technique every waveform renderer uses for this. Slightly less accurate
// peaks when heavily zoomed out (a real audio min/max envelope always is,
// at any zoom, from downsampling to begin with); visually indistinguishable
// at the pixel widths this draws at.
const nodeGraphPhosphorWaveformMaxSamplesPerColumn = 256;

/**
 * Straight vector waveform path (flat [x0,y0,x1,y1,…]).
 *
 * One continuous polyline at every zoom — no column stems, no mode switch
 * that can leave disconnected dabs:
 *   • enough room  → every sample in the view
 *   • dense view   → bucket decimation that keeps min+max of each bucket in
 *                    true time order (classic peak-preserving downsample)
 *
 * Pixel-aligned viewStart still stops scroll shimmer; the stroke itself is
 * always a single connected vector.
 */
function nodeGraphPhosphorWaveformBuildVectorPath(
  samples,
  viewStart,
  viewEnd,
  width,
  midY,
  amplitude,
) {
  const total = samples?.length || 0;
  if (!total || !(width > 0)) {
    return new Float32Array(0);
  }
  const first = Math.max(0, Math.floor(Number(viewStart) || 0));
  const last = Math.min(total - 1, Math.ceil(Number(viewEnd) || 0));
  if (last < first) {
    return new Float32Array(0);
  }
  const span = Math.max(1e-9, (Number(viewEnd) || 0) - (Number(viewStart) || 0));
  const sampleCount = last - first + 1;
  // Vertex budget when dense: ~3 pairs/pixel keeps peaks smooth without
  // scanning the whole file every frame (CPU guard for long zooms-out).
  const maxVertices = Math.max(2, Math.floor(width) * 3);
  const frameToX = (frame) => ((frame - viewStart) / span) * width;
  const yOf = (value) => midY - value * amplitude;

  if (sampleCount <= maxVertices) {
    const points = new Float32Array(sampleCount * 2);
    let o = 0;
    for (let frame = first; frame <= last; frame += 1) {
      points[o] = frameToX(frame);
      points[o + 1] = yOf(samples[frame]);
      o += 2;
    }
    return points;
  }

  // Bucket count so each bucket emits up to 2 vertices (min + max).
  const buckets = Math.max(1, Math.floor(maxVertices / 2));
  const points = new Float32Array(buckets * 4);
  let o = 0;
  const strideCap = nodeGraphPhosphorWaveformMaxSamplesPerColumn;
  for (let b = 0; b < buckets; b += 1) {
    const t0 = first + Math.floor((b * sampleCount) / buckets);
    const t1 = first + Math.floor(((b + 1) * sampleCount) / buckets);
    const rangeStart = t0;
    const rangeEnd = Math.max(t0 + 1, t1);
    const rangeLen = rangeEnd - rangeStart;
    const stride = Math.max(1, Math.floor(rangeLen / strideCap));
    let minV = Infinity;
    let maxV = -Infinity;
    let minI = rangeStart;
    let maxI = rangeStart;
    for (let frame = rangeStart; frame < rangeEnd; frame += stride) {
      const value = samples[frame];
      if (value < minV) {
        minV = value;
        minI = frame;
      }
      if (value > maxV) {
        maxV = value;
        maxI = frame;
      }
    }
    // Always include the true last sample of the bucket (stride may skip it).
    if (stride > 1) {
      const frame = rangeEnd - 1;
      const value = samples[frame];
      if (value < minV) {
        minV = value;
        minI = frame;
      }
      if (value > maxV) {
        maxV = value;
        maxI = frame;
      }
    }
    if (!(minV <= maxV)) {
      minV = 0;
      maxV = 0;
      minI = rangeStart;
      maxI = rangeStart;
    }
    // Emit extrema in chronological order so the path never backtracks in time.
    if (minI === maxI) {
      points[o] = frameToX(minI);
      points[o + 1] = yOf(minV);
      o += 2;
    } else if (minI < maxI) {
      points[o] = frameToX(minI);
      points[o + 1] = yOf(minV);
      points[o + 2] = frameToX(maxI);
      points[o + 3] = yOf(maxV);
      o += 4;
    } else {
      points[o] = frameToX(maxI);
      points[o + 1] = yOf(maxV);
      points[o + 2] = frameToX(minI);
      points[o + 3] = yOf(minV);
      o += 4;
    }
  }
  return o === points.length ? points : points.subarray(0, o);
}

function nodeGraphPhosphorWaveformStrokeVectorPath(context, points) {
  const count = points.length;
  if (count < 2) {
    return false;
  }
  context.beginPath();
  context.moveTo(points[0], points[1]);
  if (count === 2) {
    // Single sample in view — tiny tick so it still inks.
    context.lineTo(points[0], points[1] + 0.5);
    return true;
  }
  for (let i = 2; i < count; i += 2) {
    context.lineTo(points[i], points[i + 1]);
  }
  return true;
}

// Line family shares nodeGraphHueBrightnessCss (black → hue @ 0.5 → white).
// settings.hue is the pigment; settings.lineBrightness is the slider.
// Always normalize: phosphillator (and other callers) may omit settings.
// Never read properties off a raw `settings` argument — it is often undefined.
function applyNodeGraphPhosphorWaveformHudVars(section, settings) {
  if (!section?.style) {
    return;
  }
  const muted = nodeGraphPhosphorWaveformLineColor(settings, 57, 0.55);
  const hot = nodeGraphPhosphorWaveformLineColor(settings, 85, 0.7);
  const dim = nodeGraphPhosphorWaveformLineColor(settings, 57, 0.28);
  section.style.setProperty("--phosphor-hud-color", muted);
  section.style.setProperty("--phosphor-hud-color-hot", hot);
  section.style.setProperty("--phosphor-hud-color-dim", dim);
}

function nodeGraphPhosphorWaveformLineColor(settings, lightness, alpha) {
  const defaults = nodeGraphPhosphorWaveformDefaultSettings || {
    hue: 140,
    lineBrightness: 0.5,
  };
  let s = defaults;
  try {
    if (typeof normalizeNodeGraphPhosphorWaveformSettings === "function") {
      s = normalizeNodeGraphPhosphorWaveformSettings(settings ?? {});
    } else if (settings && typeof settings === "object") {
      s = settings;
    }
  } catch {
    s = defaults;
  }
  if (!s || typeof s !== "object") {
    s = defaults;
  }
  const brightnessRaw = Number(s.lineBrightness);
  const brightness = Number.isFinite(brightnessRaw)
    ? brightnessRaw
    : Number(defaults.lineBrightness) || 0.5;
  const hueRaw = Number(s.hue);
  const hue = Number.isFinite(hueRaw) ? hueRaw : Number(defaults.hue) || 140;
  const a = Number(alpha);
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(hue, brightness, Number.isFinite(a) ? a : 1);
  }
  const light = Number(lightness);
  const scaledLightness = Math.max(0, Math.min(100, (Number.isFinite(light) ? light : 50)));
  return `hsla(${hue}, 90%, ${scaledLightness}%, ${Number.isFinite(a) ? a : 0})`;
}

function nodeGraphPhosphorWaveformBackgroundColor(settings) {
  // Brightness 0…1 maps onto a dark CRT plate. Exponential curve keeps the
  // dark end usable; default 0.5 ≈ old mid (~8.8% lightness). Cap well below
  // the trace (~85%) so a stored 1.0 (old 0–2 mid, or slider max) cannot
  // become a solid green/white square that hides the waveform.
  const s = normalizeNodeGraphPhosphorWaveformSettings(settings);
  const normalized = Math.max(0, Math.min(1, Number(s.backgroundBrightness) || 0));
  const scaledLightness = Math.max(0, Math.min(24, 100 * (normalized ** 3.5)));
  return `hsl(${s.backgroundHue}, 70%, ${scaledLightness}%)`;
}

/**
 * Face bitmap size. The page is absolutely inset (definite box). The canvas
 * is a flex child whose intrinsic bitmap size must NOT drive layout — CSS
 * uses flex:1;height:0. Measuring the canvas itself caused a 1×1 backing
 * store stretched over the plate (solid green / red square, LR flash).
 */
function nodeGraphMusicPlayerFaceMetrics(section, canvas, face = "") {
  if (!section || !canvas) {
    return null;
  }
  const key = String(face || section.dataset?.musicPlayerFace || "wave");
  const page = section.querySelector(`[data-music-player-page="${key}"]`);
  const waveHost = key === "wavplay"
    ? section.querySelector("[data-music-player-wave-host]")
    : null;
  const box = (waveHost && page && !page.hidden) ? waveHost : page;
  const dock = section.querySelector(".node-music-player-dock");
  // Never measure the canvas. height:100% / flex:1 children report 0×0 on the
  // first paint; a 1×1 backing store CSS-stretched is the solid green/red plate.
  let cssWidth = 0;
  let cssHeight = 0;
  if (box && !box.hidden) {
    cssWidth = box.clientWidth || box.offsetWidth || 0;
    cssHeight = box.clientHeight || box.offsetHeight || 0;
  }
  if (!(cssWidth > 2) || !(cssHeight > 2)) {
    cssWidth = section.clientWidth || section.offsetWidth || 0;
    cssHeight = (section.clientHeight || section.offsetHeight || 0) - (dock?.offsetHeight || 0);
  }
  if (!(cssWidth > 2) || !(cssHeight > 2)) {
    const rect = section.getBoundingClientRect();
    const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
    cssWidth = rect.width / zoom;
    cssHeight = rect.height / zoom - (dock?.offsetHeight || 0);
  }
  cssWidth = Math.max(8, Math.round(cssWidth));
  cssHeight = Math.max(8, Math.round(cssHeight));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(8, Math.round(cssWidth * dpr));
  const height = Math.max(8, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  return context ? { context, width, height, pixelRatio: dpr, cssWidth, cssHeight } : null;
}

function drawNodeGraphPhosphorWaveformPlaceholder(context, width, height, message, pixelRatio = 1, settings) {
  if (!context) {
    return;
  }
  const dpr = Math.max(1, Number(pixelRatio) || 1);
  context.fillStyle = nodeGraphPhosphorWaveformLineColor(settings, 57, 0.55);
  context.font = `600 ${Math.round(11 * dpr)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, Math.round(width / 2), Math.round(height / 2));
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawNodeGraphPhosphorWaveformDisplay(section) {
  const nodeId = section?.dataset?.node || "";
  const node = nodeGraphPatchNode(nodeId);
  const canvas = section?.querySelector?.(".node-phosphor-waveform-canvas");
  if (!node || !canvas) {
    return;
  }
  const musicFace = section.dataset.musicPlayerFace || "wave";
  // Playlist-only face: compact row waveforms. Main phosphor canvas stays
  // on the hidden wave page — do not paint a second copy here.
  if (musicFace === "pl") {
    if (typeof nodeGraphAudioPlayerPlaylistPaintWaves === "function") {
      nodeGraphAudioPlayerPlaylistPaintWaves(nodeId, { liveOnly: true });
    }
    if (typeof nodeGraphAudioPlayerPlaylistSyncScrubber === "function") {
      nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
    }
    return;
  }
  if (musicFace === "vsxy" || musicFace === "vslr") {
    if (typeof nodeGraphAudioPlayerVideoscopePaint === "function") {
      nodeGraphAudioPlayerVideoscopePaint(section);
    }
    return;
  }
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
  // Simulation off → pure black plate + no green frame. Circuit = live output
  // + audio node + open context (not transport pause).
  const circuitRunning = typeof nodeGraphModuleScopeCircuitRunning === "function"
    ? nodeGraphModuleScopeCircuitRunning()
    : Boolean(nodeGraphMvp?.live?.outputEnabled && nodeGraphMvp?.live?.node);
  // Shape FIRST, measure second, both in this one frame. The inset is padding
  // on the section, so writing it changes the canvas's box; measuring before
  // writing would size the backing store from the PREVIOUS inset and leave the
  // bitmap stretched over the new box for a frame -- which is the jitter you
  // see while dragging Edge Spacing, since every drag frame lands mid-change.
  // The shape input is the section's own padding box (the whole grid cell),
  // which the inset does not affect -- see the function's comment. Reading the
  // canvas box right after the write forces a synchronous layout on purpose:
  // that is what makes the two agree within the frame.
  applyNodeGraphPhosphorWaveformPanelShape(
    section,
    settings,
    Math.max(1, section.clientWidth),
    Math.max(1, section.clientHeight),
    circuitRunning,
  );
  const metrics = nodeGraphMusicPlayerFaceMetrics(section, canvas, musicFace);
  if (!metrics) {
    nodeGraphPhosphorWaveformPaintCompanionPlaylist(section, nodeId);
    return;
  }
  const { context, height, pixelRatio, width } = metrics;
  // Draw entirely in device-pixel space (no CSS-pixel transform) so every
  // coordinate can be snapped to a real physical pixel — a fractional
  // devicePixelRatio (1.25x/1.5x are common on Windows) would otherwise put
  // "half pixel" offsets at non-integer physical positions, forcing the
  // renderer to antialias/blur lines that should be crisp.
  context.setTransform(1, 0, 0, 1, 0, 0);
  const snap = (value) => Math.round(value);
  const crisp = (value) => Math.round(value) + 0.5;

  context.clearRect(0, 0, width, height);
  // Always paint a readable plate (not pure void). When the circuit is off
  // or the AudioContext is still suspended, keep a cold dark field so the
  // Music Player face is visibly "there" — pure #000 under the room dimmer
  // looked identical to a dead/missing display.
  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  context.fillStyle = circuitRunning
    ? nodeGraphPhosphorWaveformBackgroundColor(settings)
    : (entry ? "hsl(140, 20%, 4%)" : "#050805");
  context.fillRect(0, 0, width, height);

  // Room dimmer: punch a hole for any painted face so the waveform is not
  // swallowed by the veil (strength 0 made the whole panel look missing).
  const strength = "1";
  if (section.dataset) {
    section.dataset.lightStrength = strength;
  }
  if (canvas?.dataset) {
    canvas.dataset.lightStrength = strength;
    canvas.dataset.lightSource = "screen";
  }

  if (!entry) {
    drawNodeGraphPhosphorWaveformPlaceholder(
      context,
      width,
      height,
      circuitRunning ? "No sample loaded" : "Load a sample",
      pixelRatio,
      settings,
    );
    nodeGraphPhosphorWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings);
    nodeGraphPhosphorWaveformPaintCompanionPlaylist(section, nodeId);
    return;
  }

  // Offline / suspended: still draw the static sample so the face is never blank.
  // Live auto-scroll + playhead only when the circuit is actually running.

  const state = nodeGraphPhosphorWaveformViewState(nodeId, entry.frames);
  const phase = typeof nodeGraphSamplePhaseForNode === "function" ? nodeGraphSamplePhaseForNode(nodeId) : 0;
  const playheadFrame = phase * entry.frames;
  const scrollLineRatio = nodeGraphPhosphorWaveformScrollLineRatio(settings);
  // Smooth mode must be smooth, full stop -- no pause, ever, even during an
  // active zoom gesture. This used to share the same pause as snap mode,
  // originally added to stop auto-scroll from fighting a cursor-anchored
  // zoom; but smooth-mode zoom already anchors to the playhead (same
  // invariant auto-scroll itself maintains every frame), so there's no
  // longer anything to fight. Pausing anyway just froze the view for the
  // whole gesture (every zoom tick renewed the pause) and only caught up
  // once the playhead drifted out of the frozen window and the pause
  // finally lapsed -- reported as "desync" and "moving slowly". Snap mode
  // keeps the pause: its zoom is still cursor-anchored (deliberately, for
  // manual browsing), so an unpaused page-jump mid-gesture would be an
  // unwanted interruption there.
  const lastInteraction = nodeGraphPhosphorWaveformLastInteraction.get(nodeId) || 0;
  // Offline: hold a static window (manual zoom/pan still works). Live auto-
  // scroll only when the circuit is actually running.
  const autoScrollPaused = !circuitRunning
    || (settings.scrollMode === "snap"
      && Date.now() - lastInteraction < nodeGraphPhosphorWaveformAutoScrollPauseMs);
  // Desired window length in samples. Manual Shift+wheel zoom keeps the live
  // span; Time Window / scroll-line setting only re-applies when those change
  // (never when canvas pixel width changes from modular zoom).
  const settingsWindowFrames = Math.max(
    nodeGraphPhosphorWaveformMinWindowFrames,
    Math.min(
      entry.frames,
      settings.timeWindowSeconds <= 0
        ? 1
        : Math.round(settings.timeWindowSeconds * (entry.sampleRate || 44100)),
    ),
  );
  const appliedSignature = nodeGraphPhosphorWaveformSettingsSignature(settings);
  const lastAppliedSignature = nodeGraphPhosphorWaveformLastAppliedTimeWindow.get(nodeId);
  const settingsJustChanged = lastAppliedSignature !== appliedSignature;
  if (!autoScrollPaused) {
    nodeGraphPhosphorWaveformLastAppliedTimeWindow.set(nodeId, appliedSignature);
  }
  const windowFrames = (!autoScrollPaused && settingsJustChanged)
    ? settingsWindowFrames
    : Math.max(
      nodeGraphPhosphorWaveformMinWindowFrames,
      Math.round(Math.abs(state.endFrame - state.startFrame)) || settingsWindowFrames,
    );
  if (!autoScrollPaused) {
    if (settings.scrollMode === "smooth") {
      // Continuous float window — vector path translates smoothly (no pixel quantize).
      const idealStart = playheadFrame - windowFrames * scrollLineRatio;
      const view = nodeGraphPhosphorWaveformContinuousView(
        idealStart,
        windowFrames,
        entry.frames,
      );
      state.startFrame = view.viewStart;
      state.endFrame = view.viewEnd;
    } else {
      // "snap": only jump when the playhead has left the current window, or
      // the Time Window/Scroll Position settings just changed -- lands the
      // playhead at scrollLineRatio within the new window at the instant of
      // the jump, then holds that window still (no interpolation) until the
      // playhead exits it again.
      const outOfBounds = playheadFrame < state.startFrame || playheadFrame > state.endFrame;
      if (outOfBounds || settingsJustChanged) {
        const idealStart = playheadFrame - windowFrames * scrollLineRatio;
        const view = nodeGraphPhosphorWaveformContinuousView(
          idealStart,
          windowFrames,
          entry.frames,
        );
        state.startFrame = view.viewStart;
        state.endFrame = view.viewEnd;
      }
    }
  } else {
    // First offline paint / after settings change: seed a sensible window.
    if (settingsJustChanged || !(Math.abs(state.endFrame - state.startFrame) >= 1)) {
      state.startFrame = 0;
      state.endFrame = Math.min(entry.frames, settingsWindowFrames);
      nodeGraphPhosphorWaveformLastAppliedTimeWindow.set(nodeId, appliedSignature);
    }
    nodeGraphPhosphorWaveformClampWindow(state);
  }
  const viewStart = state.startFrame;
  const viewEnd = state.endFrame;
  const midY = height * 0.5;
  const amplitude = midY * 0.92;
  const viewSpan = Math.max(1e-9, viewEnd - viewStart);
  const frameToX = (frame) => ((frame - viewStart) / viewSpan) * width;

  // Start/End region (params start/end). Selection is the bright middle;
  // outside is dimmed after the trace so the effect is obvious.
  const loopStart = clampNodeSliderValue(Number(node.params?.start) || 0, 0, 1) * entry.frames;
  const loopEnd = clampNodeSliderValue(Number(node.params?.end) || 1, 0, 1) * entry.frames;
  const regionX0 = clampNodeSliderValue(frameToX(Math.min(loopStart, loopEnd)), 0, width);
  const regionX1 = clampNodeSliderValue(frameToX(Math.max(loopStart, loopEnd)), 0, width);

  // Per-sample grid, once zoomed in enough that individual frames are
  // legible (roughly 6+ device pixels per sample) — makes the discrete
  // nature of the buffer visible instead of implying a continuous signal.
  // gridBrightness 0 = hidden; 1 = full (former top of 0…2 scale).
  const pixelsPerFrame = width / viewSpan;
  const gridBrightness = Math.max(0, Math.min(1, Number(settings.gridBrightness) || 0));
  const showSampleGrid = gridBrightness > 0.001 && pixelsPerFrame >= 6 * pixelRatio;
  if (showSampleGrid) {
    const gridHue = Number.isFinite(Number(settings.hue)) ? Number(settings.hue) : 140;
    context.strokeStyle = typeof nodeGraphHueBrightnessCss === "function"
      ? nodeGraphHueBrightnessCss(gridHue, gridBrightness, 0.45)
      : nodeGraphPhosphorWaveformLineColor(settings, 68, 0.45);
    context.lineWidth = 1;
    context.beginPath();
    const firstFrame = Math.ceil(viewStart);
    const lastFrame = Math.floor(viewEnd);
    for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
      const x = frameToX(frame);
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.stroke();
  }

  // Vector trace: core width + free half-pixel skirt (cheap AA that matches
  // the pixel grid — not a blur/glow pass, just width + 0.5 in device px).
  const traceCss = Math.max(0.5, Math.min(5, Math.round((Number(settings.traceWidth) || 1.5) * 2) / 2));
  const tracePx = Math.max(0.5, traceCss * pixelRatio);
  const skirtPx = tracePx + 0.5;
  const vectorPoints = nodeGraphPhosphorWaveformBuildVectorPath(
    nodeGraphPhosphorWaveformEntrySamples(entry),
    viewStart,
    viewEnd,
    width,
    midY,
    amplitude,
  );
  if (nodeGraphPhosphorWaveformStrokeVectorPath(context, vectorPoints)) {
    context.shadowBlur = 0;
    context.lineCap = "butt";
    context.lineJoin = "miter";
    context.miterLimit = 2;
    // Skirt first (slightly wider, softer).
    context.strokeStyle = nodeGraphPhosphorWaveformLineColor(settings, 75, 0.4);
    context.lineWidth = skirtPx;
    context.stroke();
    // Core on top.
    nodeGraphPhosphorWaveformStrokeVectorPath(context, vectorPoints);
    context.strokeStyle = nodeGraphPhosphorWaveformLineColor(settings, 85, 0.95);
    context.lineWidth = tracePx;
    context.stroke();
  }

  // Dim everything outside Start…End (over the waveform). Selected band
  // stays full brightness; unselected flanks get a solid dark veil.
  if (regionX0 > 0.5) {
    context.fillStyle = "rgba(0, 0, 0, 0.58)";
    context.fillRect(0, 0, regionX0, height);
  }
  if (regionX1 < width - 0.5) {
    context.fillStyle = "rgba(0, 0, 0, 0.58)";
    context.fillRect(regionX1, 0, width - regionX1, height);
  }
  // Subtle selected-band lift so the active region still reads as “on”.
  if (regionX1 > regionX0) {
    context.fillStyle = nodeGraphPhosphorWaveformLineColor(settings, 70, 0.06);
    context.fillRect(regionX0, 0, regionX1 - regionX0, height);
  }

  // Playhead — plain line at scroll line width (default 2.5 CSS px). 0 = hidden.
  // Offline: no playhead (static sample preview only).
  const rawScrollW = Number(settings.scrollLineWidth);
  const scrollCss = Number.isFinite(rawScrollW)
    ? Math.max(0, Math.min(8, Math.round(rawScrollW * 2) / 2))
    : nodeGraphPhosphorWaveformDefaultSettings.scrollLineWidth;
  if (
    circuitRunning
    && scrollCss > 0
    && playheadFrame >= viewStart
    && playheadFrame <= viewEnd
  ) {
    const x = frameToX(playheadFrame);
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = Math.max(0.5, scrollCss * pixelRatio);
    context.lineCap = "butt";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const zoomRatio = (viewEnd - viewStart) / Math.max(1, state.totalFrames);
  nodeGraphPhosphorWaveformSyncZoomControl(section, zoomRatio);
  nodeGraphPhosphorWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings);
  nodeGraphPhosphorWaveformPaintCompanionPlaylist(section, nodeId);
}

function nodeGraphPhosphorWaveformPaintCompanionPlaylist(section, nodeId) {
  if ((section?.dataset?.musicPlayerFace || "") !== "wavplay") {
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistPaintWaves === "function") {
    nodeGraphAudioPlayerPlaylistPaintWaves(nodeId, { liveOnly: true });
  }
  if (typeof nodeGraphAudioPlayerPlaylistSyncScrubber === "function") {
    nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
  }
}

function nodeGraphPhosphorWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings) {
  if (!context) {
    return;
  }
  // Face HUD is the rate the engine is actually using (param + Speed jack),
  // never the Speed metaparameter / slider readout.
  let speed = typeof nodeGraphAudioPlayerLiveSpeedForNode === "function"
    ? nodeGraphAudioPlayerLiveSpeedForNode(nodeId)
    : null;
  if (!Number.isFinite(speed)) {
    const paramSpeed = Number(node?.params?.speed);
    if (!Number.isFinite(paramSpeed)) {
      return;
    }
    speed = paramSpeed;
  }
  const speedLabel = `${speed.toFixed(3)}x`;
  const ratio = Number(pixelRatio) || 1;
  const fontPx = Math.max(1, Math.round(10 * ratio));
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  const labelPadCss = Math.max(0, Math.min(48, Number(settings?.labelInsetPx) || 0));
  const pad = labelPadCss * ratio;
  const x = Math.round(width - pad);
  const y = Math.round(height - pad);
  context.textAlign = "right";
  context.textBaseline = "bottom";
  if (Math.abs(speed) < 1e-5) {
    const textW = context.measureText(speedLabel).width;
    const boxPad = Math.max(1, Math.round(2 * ratio));
    context.fillStyle = "#FF0000";
    context.fillRect(
      Math.round(x - textW - boxPad),
      Math.round(y - fontPx - boxPad),
      Math.round(textW + boxPad * 2),
      Math.round(fontPx + boxPad * 2),
    );
  }
  context.fillStyle = typeof nodeGraphPhosphorWaveformLineColor === "function"
    ? nodeGraphPhosphorWaveformLineColor(settings, 85, 0.7)
    : "hsla(140, 90%, 85%, 0.7)";
  context.fillText(speedLabel, x, y);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}
