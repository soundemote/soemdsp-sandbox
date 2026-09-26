// Phosphor-style waveform display for the Music Player (audioPlayer) module.
//
// Reads the node's decoded sample buffer directly (nodeGraphMvp.sampleBuffers,
// keyed by node.sample.id) and draws a min/max-per-pixel envelope with a
// green-phosphor glow (layered shadowBlur passes, matching this project's
// scope-green aesthetic), plus a live playhead and the Start/End loop-region
// markers already present on the module. Zoom (Shift+wheel) and pan (drag) operate
// on a per-node view window in sample frames, independent of the shared
// WebGL scope compositor used by every other module's display.

const nodeGraphSampleWaveformViewStates = new Map();
let nodeGraphSampleWaveformMissingLogged = "";

function nodeGraphSampleWaveformFaceSlot(sectionOrFace) {
  const raw = typeof sectionOrFace === "string"
    ? sectionOrFace
    : (sectionOrFace?.dataset?.musicPlayerFace || "wave");
  if (typeof nodeGraphAudioPlayerPlaylistNormalizeFace === "function") {
    return nodeGraphAudioPlayerPlaylistNormalizeFace(raw) === "waveplay" ? "waveplay" : "wave";
  }
  const face = String(raw || "wave").trim().toLowerCase();
  return face === "waveplay" || face === "wavplay" ? "waveplay" : "wave";
}

function nodeGraphSampleWaveformViewKey(nodeId, sectionOrFace) {
  return `${String(nodeId || "")}:${nodeGraphSampleWaveformFaceSlot(sectionOrFace)}`;
}

function nodeGraphSampleWaveformClearViewKeys(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  for (const key of [id, `${id}:wave`, `${id}:waveplay`]) {
    nodeGraphSampleWaveformViewStates.delete(key);
    if (typeof nodeGraphSampleWaveformLastAppliedTimeWindow !== "undefined") {
      nodeGraphSampleWaveformLastAppliedTimeWindow.delete(key);
    }
  }
}

// 1 = single sample (Time Window 0). Shift+wheel can zoom all the way in.
const nodeGraphSampleWaveformMinWindowFrames = 1;

// Right-click "waveform display options" -- time window (seconds shown at
// once) and scroll mode (does the view auto-follow the playhead, and how).
// Persisted per-node on the patch (node.sampleWaveformSettings), same
// spot traceDisplaySettings lives for the trace/scope family -- see
// cloneNodeGraphTypedDisplaySettings in node-graph-patch-clone.js and its
// call site in node-graph-patch-core.js's validateNodeGraphPatch.
// scrollLinePosition is the anchor ratio (0..1, left..right across the
// canvas) the playhead is held at -- "what's considered the point of
// impact". left biases the view toward showing what's coming up, right
// toward what's already played. Not flush against 0/1 so there's always a
// sliver of context on the far side.
const nodeGraphSampleWaveformScrollLinePositionRatios = Object.freeze({
  left: 0.15,
  mid: 0.5,
  right: 0.85,
});

// Ink (trace/scroll/font) = CSS px @ zoom 1. Layout fractions (label/corner/edge)
// stay 0..1 of face min-edge. See display-scale.js / APP_POLICY §15.
const nodeGraphSampleWaveformDefaultSettings = Object.freeze({
  scrollMode: "smooth",
  timeWindowSeconds: 2,
  scrollLinePosition: "mid",
  // 0 = hide playhead. CSS px @ zoom 1.
  scrollLineWidth: 2,
  // Trace core width (+0.5 CSS-px skirt at draw).
  traceWidth: 2,
  hue: 140,
  lineBrightness: 0.5,
  // Per-sample vertical grid when zoomed in. 0 = hidden.
  gridBrightness: 0.5,
  backgroundHue: 140,
  // 0…1 plate brightness. 1 is the brightest plate, not white.
  backgroundBrightness: 0.5,
  // cornerShape only matters once cornerRadius > 0.
  // edgeSpacing: 0..1 of maxInset (half min-edge); 1 collapses the panel.
  // cornerRadius: 0..1 of maxRadius (half panel min-edge); 1 is fully round.
  cornerShape: "squircle",
  cornerRadius: 0,
  edgeSpacing: 0.05,
  labelInset: 0.025,
  fontSize: 11,
  // Playlist row fade. 0 = no fade, 1 = only the playing row is visible.
  playlistFade: 0.25,
  playlistVisibleCount: 8,
});

function normalizeNodeGraphSampleWaveformSettings(settings = {}) {
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
  const labelInset = Number(source.labelInset);
  const fontSize = Number(source.fontSize);
  const playlistFade = Number(source.playlistFade);
  const playlistVisibleCount = Number(source.playlistVisibleCount);
  return {
    scrollMode: source.scrollMode === "snap" ? "snap" : "smooth",
    // 0 = one sample at a time. Finite values only; NaN keeps the default.
    timeWindowSeconds: Number.isFinite(timeWindowSeconds)
      ? Math.max(0, Math.min(60, timeWindowSeconds))
      : nodeGraphSampleWaveformDefaultSettings.timeWindowSeconds,
    scrollLinePosition: Object.prototype.hasOwnProperty.call(
      nodeGraphSampleWaveformScrollLinePositionRatios,
      source.scrollLinePosition,
    )
      ? source.scrollLinePosition
      : nodeGraphSampleWaveformDefaultSettings.scrollLinePosition,
    scrollLineWidth: Number.isFinite(scrollLineWidth)
      ? Math.max(0, Math.min(16, clampAuthoredInkPx(scrollLineWidth, nodeGraphSampleWaveformDefaultSettings.scrollLineWidth)))
      : nodeGraphSampleWaveformDefaultSettings.scrollLineWidth,
    traceWidth: Number.isFinite(traceWidth)
      ? Math.max(0.25, Math.min(16, clampAuthoredInkPx(traceWidth, nodeGraphSampleWaveformDefaultSettings.traceWidth)))
      : nodeGraphSampleWaveformDefaultSettings.traceWidth,
    hue: Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : nodeGraphSampleWaveformDefaultSettings.hue,
    lineBrightness: Number.isFinite(lineBrightness)
      ? Math.max(0, Math.min(1, lineBrightness))
      : nodeGraphSampleWaveformDefaultSettings.lineBrightness,
    gridBrightness: Number.isFinite(gridBrightness)
      ? Math.max(0, Math.min(1, gridBrightness))
      : nodeGraphSampleWaveformDefaultSettings.gridBrightness,
    backgroundHue: Number.isFinite(backgroundHue)
      ? ((backgroundHue % 360) + 360) % 360
      : nodeGraphSampleWaveformDefaultSettings.backgroundHue,
    backgroundBrightness: Number.isFinite(backgroundBrightness)
      ? Math.max(0, Math.min(1, backgroundBrightness))
      : nodeGraphSampleWaveformDefaultSettings.backgroundBrightness,
    cornerShape: source.cornerShape === "square" ? "square" : "squircle",
    cornerRadius: Number.isFinite(cornerRadius)
      ? clampDisplayUnit01(cornerRadius, nodeGraphSampleWaveformDefaultSettings.cornerRadius)
      : nodeGraphSampleWaveformDefaultSettings.cornerRadius,
    edgeSpacing: Number.isFinite(edgeSpacing)
      ? clampDisplayUnit01(edgeSpacing, nodeGraphSampleWaveformDefaultSettings.edgeSpacing)
      : nodeGraphSampleWaveformDefaultSettings.edgeSpacing,
    labelInset: Number.isFinite(labelInset)
      ? clampDisplayUnit01(labelInset, nodeGraphSampleWaveformDefaultSettings.labelInset)
      : nodeGraphSampleWaveformDefaultSettings.labelInset,
    fontSize: Number.isFinite(fontSize)
      ? Math.max(6, Math.min(48, clampAuthoredInkPx(fontSize, nodeGraphSampleWaveformDefaultSettings.fontSize)))
      : nodeGraphSampleWaveformDefaultSettings.fontSize,
    playlistFade: Number.isFinite(playlistFade)
      ? Math.max(0, Math.min(1, playlistFade))
      : nodeGraphSampleWaveformDefaultSettings.playlistFade,
    playlistVisibleCount: Number.isFinite(playlistVisibleCount)
      ? Math.max(1, Math.min(10, Math.round(playlistVisibleCount)))
      : nodeGraphSampleWaveformDefaultSettings.playlistVisibleCount,
  };
}

function nodeGraphSampleWaveformSettingsForNode(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  return normalizeNodeGraphSampleWaveformSettings(node?.sampleWaveformSettings);
}

function nodeGraphSampleWaveformScrollLineRatio(settings) {
  return nodeGraphSampleWaveformScrollLinePositionRatios[settings.scrollLinePosition]
    ?? nodeGraphSampleWaveformScrollLinePositionRatios.mid;
}

// Auto-scroll pauses for a moment after the user manually Shift+wheel-zooms or
// drags the display, so it doesn't immediately yank the view back out from
// under their hands -- refreshed on every zoom/pan call, so a held drag
// keeps postponing it continuously.
const nodeGraphSampleWaveformLastInteraction = new Map();
const nodeGraphSampleWaveformAutoScrollPauseMs = 800;

// Tracks the last Time Window / scroll-line settings auto-scroll applied.
// Signature must NOT include canvas pixel width — modular-view zoom changes
// device columns every frame of a zoom gesture and used to look like a
// "settings change", re-applying Time Window and undoing Shift+wheel zoom.
const nodeGraphSampleWaveformLastAppliedTimeWindow = new Map();

function nodeGraphSampleWaveformSettingsSignature(settings) {
  const s = normalizeNodeGraphSampleWaveformSettings(settings);
  return `${s.timeWindowSeconds}:${s.scrollLinePosition}`;
}

function nodeGraphSampleWaveformMarkInteraction(nodeId) {
  nodeGraphSampleWaveformLastInteraction.set(nodeId, Date.now());
}

/**
 * Persist the live sample-window span as Time Window (s) so Shift+wheel zoom
 * and the settings field stay in sync, and so a later modular zoom cannot
 * re-apply a stale Time Window over the user's gesture.
 */
function nodeGraphSampleWaveformSyncTimeWindowFromView(nodeId, windowFrames, sampleRate, section) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) {
    return;
  }
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const frames = Math.max(1, nodeGraphFiniteNumber(windowFrames, 1));
  const seconds = frames <= 1
    ? 0
    : Math.max(0, Math.min(60, frames / rate));
  const current = normalizeNodeGraphSampleWaveformSettings(node.sampleWaveformSettings);
  const slot = nodeGraphSampleWaveformFaceSlot(section);
  // Waveplay keeps its own view window. Do not overwrite the Wave Time Window.
  if (slot !== "waveplay" && Math.abs(current.timeWindowSeconds - seconds) >= 0.0005) {
    node.sampleWaveformSettings = normalizeNodeGraphSampleWaveformSettings({
      ...current,
      timeWindowSeconds: seconds,
    });
  }
  nodeGraphSampleWaveformLastAppliedTimeWindow.set(
    nodeGraphSampleWaveformViewKey(nodeId, section),
    nodeGraphSampleWaveformSettingsSignature(node.sampleWaveformSettings),
  );
  if (
    slot !== "waveplay"
    && nodeGraphMvp?.sampleWaveformSettingsTargetNode === nodeId
    && typeof renderNodeGraphSampleWaveformSettingsWindow === "function"
  ) {
    renderNodeGraphSampleWaveformSettingsWindow();
  }
}

// Music Player display options live on Command Center Display Settings.
// Folder path is paste-only (no picker). Phase readout is the same widget
// the sample modules use. Rebuilt only when the panel switches to a different
// node (listeners close over the node id), so re-rendering on every settings
// change does not wipe out a path you are halfway through typing.
function renderNodeGraphSampleWaveformSampleLoader(nodeId) {
  const slot = document.getElementById("nodeSampleWaveformSampleLoaderSlot");
  if (!slot || typeof createNodeGraphSamplePathLoader !== "function") {
    return;
  }
  if (slot.dataset.node === nodeId && slot.firstElementChild) {
    return;
  }
  slot.dataset.node = nodeId;
  slot.textContent = "";
  const loader = createNodeGraphSamplePathLoader(nodeId, { instance: "waveform-settings" });
  if (loader.fileInput) {
    slot.append(loader.fileInput);
  }
  slot.append(loader.pathShell);
}

function syncNodeGraphSampleWaveformPlaylistSettingsControls(nodeId) {
  const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
    ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
    : null;
  if (!pl) {
    return;
  }
  const recursive = document.getElementById("nodeSampleWaveformRecursiveSearch");
  if (recursive) {
    recursive.checked = Boolean(pl.folderDive);
  }
  const remove = document.getElementById("nodeSampleWaveformRemoveAfterPlay");
  if (remove) {
    remove.checked = pl.removeAfterPlay !== false;
  }
  const host = document.getElementById("nodeSampleWaveformFormatChecks");
  if (host && typeof NODE_GRAPH_AUDIO_PLAYER_FORMATS !== "undefined") {
    const formats = typeof nodeGraphAudioPlayerLibraryNormalizeFormats === "function"
      ? nodeGraphAudioPlayerLibraryNormalizeFormats(pl.formats)
      : {};
    if (!host.childElementCount) {
      for (const fmt of NODE_GRAPH_AUDIO_PLAYER_FORMATS) {
        const label = document.createElement("label");
        label.className = "node-sample-waveform-format-check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.dataset.musicFormat = fmt.id;
        box.checked = formats[fmt.id] !== false;
        label.append(box, document.createTextNode(fmt.label));
        host.append(label);
      }
    } else {
      for (const box of host.querySelectorAll("[data-music-format]")) {
        box.checked = formats[box.dataset.musicFormat] !== false;
      }
    }
  }
  const pathBox = document.querySelector(
    `.node-sample-path-input[data-sample-path-for-node="${CSS.escape(String(nodeId))}"]`,
  );
  if (pathBox && document.activeElement !== pathBox) {
    const stored = typeof nodeGraphAudioPlayerLibraryStoredFolderPath === "function"
      ? nodeGraphAudioPlayerLibraryStoredFolderPath(pl.folderPath)
      : "";
    const current = String(pathBox.value || "").trim();
    // Keep a Browse-folder label visible when there is no persisted OS path.
    if (stored) {
      pathBox.value = stored;
    } else if (!(/\(\s*browser\s*\)\s*$/i.test(current) || current.startsWith("browser:"))) {
      pathBox.value = "";
    }
  }
}

function nodeGraphSampleWaveformCommitPlaylistOptions() {
  const nodeId = nodeGraphSampleWaveformSettingsTargetNodeId();
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer" || typeof nodeGraphAudioPlayerPlaylistForNode !== "function") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const recursive = document.getElementById("nodeSampleWaveformRecursiveSearch");
  if (recursive) {
    pl.folderDive = Boolean(recursive.checked);
  }
  const remove = document.getElementById("nodeSampleWaveformRemoveAfterPlay");
  if (remove) {
    pl.removeAfterPlay = Boolean(remove.checked);
  }
  const formats = {};
  for (const box of document.querySelectorAll("#nodeSampleWaveformFormatChecks [data-music-format]")) {
    formats[box.dataset.musicFormat] = Boolean(box.checked);
  }
  if (typeof nodeGraphAudioPlayerLibraryNormalizeFormats === "function") {
    pl.formats = nodeGraphAudioPlayerLibraryNormalizeFormats(formats);
  } else {
    pl.formats = formats;
  }
  node.playlist = pl;
  if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
}

function renderNodeGraphSampleWaveformPhaseReadout(nodeId) {
  const slot = document.getElementById("nodeSampleWaveformPhaseSlot");
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

function nodeGraphSampleWaveformSettingsTargetNodeId() {
  return String(
    nodeGraphMvp?.sampleWaveformSettingsTargetNode
    || nodeGraphMvp?.traceDisplaySettingsTargetNode
    || "",
  );
}

function renderNodeGraphSampleWaveformSettingsWindow() {
  const nodeId = nodeGraphSampleWaveformSettingsTargetNodeId();
  if (!nodeId) {
    return;
  }
  renderNodeGraphSampleWaveformSampleLoader(nodeId);
  renderNodeGraphSampleWaveformPhaseReadout(nodeId);
  if (typeof syncNodeGraphSampleWaveformPlaylistSettingsControls === "function") {
    syncNodeGraphSampleWaveformPlaylistSettingsControls(nodeId);
  }
  const settings = nodeGraphSampleWaveformSettingsForNode(nodeId);
  const setValueUnlessFocused = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setValueUnlessFocused("nodeSampleWaveformTimeWindowInput", settings.timeWindowSeconds);
  setValueUnlessFocused("nodeSampleWaveformLineWidthInput", settings.scrollLineWidth);
  setValueUnlessFocused("nodeSampleWaveformTraceWidthInput", settings.traceWidth);
  setValueUnlessFocused("nodeSampleWaveformHueInput", settings.hue);
  setValueUnlessFocused("nodeSampleWaveformLineBrightnessInput", settings.lineBrightness);
  setValueUnlessFocused("nodeSampleWaveformGridBrightnessInput", settings.gridBrightness);
  setValueUnlessFocused("nodeSampleWaveformBackgroundHueInput", settings.backgroundHue);
  setValueUnlessFocused("nodeSampleWaveformBackgroundBrightnessInput", settings.backgroundBrightness);
  setValueUnlessFocused("nodeSampleWaveformCornerRadiusInput", settings.cornerRadius);
  setValueUnlessFocused("nodeSampleWaveformEdgeSpacingInput", settings.edgeSpacing);
  setValueUnlessFocused("nodeSampleWaveformLabelInsetInput", settings.labelInset);
  setValueUnlessFocused("nodeSampleWaveformFontSizeInput", settings.fontSize);
  setValueUnlessFocused("nodeSampleWaveformPlaylistFadeInput", settings.playlistFade);
  setValueUnlessFocused("nodeSampleWaveformPlaylistVisibleCountInput", settings.playlistVisibleCount);
  const setPressed = (id, active) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  };
  setPressed("nodeSampleWaveformScrollSmoothButton", settings.scrollMode === "smooth");
  setPressed("nodeSampleWaveformScrollSnapButton", settings.scrollMode === "snap");
  setPressed("nodeSampleWaveformPositionLeftButton", settings.scrollLinePosition === "left");
  setPressed("nodeSampleWaveformPositionMidButton", settings.scrollLinePosition === "mid");
  setPressed("nodeSampleWaveformPositionRightButton", settings.scrollLinePosition === "right");
  setPressed("nodeSampleWaveformCornerSquareButton", settings.cornerShape === "square");
  setPressed("nodeSampleWaveformCornerSquircleButton", settings.cornerShape === "squircle");
}

function positionNodeGraphSampleWaveformSettingsAt(x, y) {
  const win = document.getElementById("nodeSampleWaveformSettingsWindow");
  if (!win) {
    return;
  }
  win.hidden = false;
  // Shared app-wide policy: spawn at the pointer the FIRST time only, then
  // restore wherever the user left it. See
  // openNodeGraphFloatingWindowAtPosition in node-graph-ui-settings-persistence.js.
  if (typeof openNodeGraphFloatingWindowAtPosition === "function") {
    openNodeGraphFloatingWindowAtPosition("sampleWaveformSettings", win, () => {
      const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
      setNodeGraphFloatingWindowViewportPosition(win, left, top);
    });
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(win, x, y);
  setNodeGraphFloatingWindowViewportPosition(win, left, top);
}

function nodeGraphNodeUsesSampleWaveformDisplay(node) {
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
  return layout === "sampleWaveform";
}

function openNodeGraphSampleWaveformSettings(nodeId, event) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || !nodeGraphNodeUsesSampleWaveformDisplay(node)) {
    return false;
  }
  closeNodeGraphSampleWaveformSettings();
  nodeGraphMvp.sampleWaveformSettingsTargetNode = nodeId;
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    return openNodeGraphTraceDisplaySettings(nodeId, event);
  }
  return false;
}

function closeNodeGraphSampleWaveformSettings() {
  const win = document.getElementById("nodeSampleWaveformSettingsWindow");
  if (win) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("sampleWaveformSettings", win, { open: false }, { status: false });
    }
    win.hidden = true;
  }
}

// Debounced working-patch autosave for display-option drags. Full
// commitNodeGraphPatch on every Time Window step rebuilt the whole modular
// DOM + live plan and tanked frames; Shift+wheel zoom never did that.
let nodeGraphSampleWaveformSettingsPersistTimer = 0;

function scheduleNodeGraphSampleWaveformSettingsPersist() {
  if (nodeGraphSampleWaveformSettingsPersistTimer) {
    window.clearTimeout(nodeGraphSampleWaveformSettingsPersistTimer);
  }
  nodeGraphSampleWaveformSettingsPersistTimer = window.setTimeout(() => {
    nodeGraphSampleWaveformSettingsPersistTimer = 0;
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
function updateNodeGraphSampleWaveformSettings(patch) {
  const nodeId = nodeGraphSampleWaveformSettingsTargetNodeId();
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
  const current = normalizeNodeGraphSampleWaveformSettings(targetNode.sampleWaveformSettings);
  targetNode.sampleWaveformSettings = normalizeNodeGraphSampleWaveformSettings({
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
    nodeGraphSampleWaveformLastAppliedTimeWindow.delete(nodeId);
    nodeGraphSampleWaveformLastAppliedTimeWindow.delete(`${nodeId}:wave`);
    nodeGraphSampleWaveformLastAppliedTimeWindow.delete(`${nodeId}:waveplay`);
  }
  scheduleNodeGraphSampleWaveformSettingsPersist();
  renderNodeGraphSampleWaveformSettingsWindow();
  // Immediate paint — do not wait on the FPS gate (zoom does this too).
  const section = document.querySelector?.(
    `.node-sample-waveform-display[data-node="${String(nodeId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
  );
  if (section) {
    if (typeof nodeGraphSampleWaveformResyncFrameClock === "function") {
      nodeGraphSampleWaveformResyncFrameClock(nodeId);
    }
    if (typeof drawNodeGraphSampleWaveformDisplay === "function") {
      drawNodeGraphSampleWaveformDisplay(section);
    }
    if (
      (Object.prototype.hasOwnProperty.call(patch, "playlistFade")
        || Object.prototype.hasOwnProperty.call(patch, "playlistVisibleCount"))
      && typeof nodeGraphAudioPlayerPlaylistApplyRowFade === "function"
    ) {
      nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
    }
  }
}

function handleNodeGraphSampleWaveformTimeWindowChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  updateNodeGraphSampleWaveformSettings({ timeWindowSeconds: value });
}

function setNodeGraphSampleWaveformScrollMode(mode) {
  updateNodeGraphSampleWaveformSettings({ scrollMode: mode === "snap" ? "snap" : "smooth" });
}

function setNodeGraphSampleWaveformScrollLinePosition(position) {
  updateNodeGraphSampleWaveformSettings({ scrollLinePosition: position });
}

function handleNodeGraphSampleWaveformLineWidthChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  updateNodeGraphSampleWaveformSettings({ scrollLineWidth: value });
}

function handleNodeGraphSampleWaveformTraceWidthChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) {
    return;
  }
  updateNodeGraphSampleWaveformSettings({ traceWidth: value });
}

function handleNodeGraphSampleWaveformHueChange(event) {
  updateNodeGraphSampleWaveformSettings({ hue: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformLineBrightnessChange(event) {
  updateNodeGraphSampleWaveformSettings({ lineBrightness: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformGridBrightnessChange(event) {
  updateNodeGraphSampleWaveformSettings({ gridBrightness: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformBackgroundHueChange(event) {
  updateNodeGraphSampleWaveformSettings({ backgroundHue: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformBackgroundBrightnessChange(event) {
  updateNodeGraphSampleWaveformSettings({ backgroundBrightness: Number(event.target.value) });
}

function setNodeGraphSampleWaveformCornerShape(shape) {
  updateNodeGraphSampleWaveformSettings({ cornerShape: shape === "squircle" ? "squircle" : "square" });
}

function handleNodeGraphSampleWaveformCornerRadiusChange(event) {
  updateNodeGraphSampleWaveformSettings({ cornerRadius: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformFontSizeChange(event) {
  updateNodeGraphSampleWaveformSettings({ fontSize: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformEdgeSpacingChange(event) {
  updateNodeGraphSampleWaveformSettings({ edgeSpacing: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformLabelInsetChange(event) {
  updateNodeGraphSampleWaveformSettings({ labelInset: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformPlaylistFadeChange(event) {
  updateNodeGraphSampleWaveformSettings({ playlistFade: Number(event.target.value) });
}

function handleNodeGraphSampleWaveformPlaylistVisibleCountChange(event) {
  const value = Math.round(Number(event.target.value));
  if (!Number.isFinite(value)) {
    return;
  }
  updateNodeGraphSampleWaveformSettings({ playlistVisibleCount: value });
}

/** Shared Corners / Rounding / Edge Spacing rows (Music Player plate chrome). */
function buildNodeGraphSampleWaveformCornerChromeHtml(options = {}) {
  const squareId = String(options.squareId || "nodeSampleWaveformCornerSquareButton");
  const squircleId = String(options.squircleId || "nodeSampleWaveformCornerSquircleButton");
  const radiusId = String(options.radiusId || "nodeSampleWaveformCornerRadiusInput");
  const spacingId = String(options.spacingId || "nodeSampleWaveformEdgeSpacingInput");
  const includeSpacing = options.includeSpacing !== false;
  return `
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Corner shape">
        <span>Corners</span>
        <span class="node-sample-waveform-control-widgets">
          <button id="${squareId}" type="button" data-corner-shape="square" aria-pressed="false">Pill</button>
          <button id="${squircleId}" type="button" data-corner-shape="squircle" aria-pressed="true">Squircle</button>
        </span>
      </div>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Rounding</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="${radiusId}" type="range" min="0" max="1" step="0.01" title="0..1 of max corner radius (half panel min-edge)">
        </span>
      </label>
      ${includeSpacing ? `<label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Edge Spacing</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="${spacingId}" type="range" min="0" max="1" step="0.01" title="0..1 of max inset (half face min-edge)">
        </span>
      </label>` : ""}`;
}

function buildNodeGraphSampleWaveformDisplaySettingsBodyHtml() {
  return `
    <div class="node-led-display-settings-panel node-sample-waveform-display-settings-panel" data-sample-waveform-display-settings-panel>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-load-row" role="group" aria-label="Folder or file path">
        <div id="nodeSampleWaveformSampleLoaderSlot" class="node-sample-waveform-loader-slot"></div>
      </div>
      <label class="node-led-settings-row node-sample-waveform-settings-row">
        <span>Recursive search</span>
        <input id="nodeSampleWaveformRecursiveSearch" type="checkbox">
      </label>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-playlist-actions node-sample-waveform-load-actions" role="group" aria-label="Load path">
        <button id="nodeSampleWaveformLoadPlaylist" type="button" title="List audio from a pasted folder path (or the parent folder of a pasted file). Online with an empty path: Browse.">Load Folder</button>
        <button id="nodeSampleWaveformLoadFile" type="button" title="Pick one audio file (native browser), or load a pasted audio file path.">Load File</button>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-formats-row" role="group" aria-label="Audio formats">
        <div id="nodeSampleWaveformFormatChecks" class="node-sample-waveform-format-checks"></div>
      </div>
      <label class="node-led-settings-row node-sample-waveform-settings-row">
        <span>Remove after play</span>
        <input id="nodeSampleWaveformRemoveAfterPlay" type="checkbox" checked>
      </label>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-playlist-actions" role="group" aria-label="Playlist">
        <button id="nodeSampleWaveformShufflePlaylist" type="button" title="Shuffle the unplayed list. Playing keeps its list number.">Shuffle</button>
        <button id="nodeSampleWaveformClearPlaylist" type="button">Clear</button>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-playlist-actions node-sample-waveform-history-reset" role="group" aria-label="Play history">
        <button id="nodeSampleWaveformResetHistory" type="button" title="Move played tracks into unplayed. Playing stays on top.">Reset history</button>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-phase-row" role="group" aria-label="Current phase">
        <span>Phase</span>
        <div id="nodeSampleWaveformPhaseSlot" class="node-sample-waveform-phase-slot"></div>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Time window">
        <span>Time Window</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformTimeWindowInput" data-phosphor-number-drag="timeWindowSeconds" type="number" inputmode="decimal" step="0.05" min="0" max="60" autocomplete="off" readonly title="Drag to adjust · double-click to type · 0 = single sample">
          <span>s</span>
        </span>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Scroll mode">
        <span>Scroll</span>
        <span class="node-sample-waveform-control-widgets">
          <button id="nodeSampleWaveformScrollSmoothButton" type="button" data-scroll-mode="smooth" aria-pressed="true">Smooth</button>
          <button id="nodeSampleWaveformScrollSnapButton" type="button" data-scroll-mode="snap" aria-pressed="false">Snap</button>
        </span>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Scroll line position">
        <span>Position</span>
        <span class="node-sample-waveform-control-widgets">
          <button id="nodeSampleWaveformPositionLeftButton" type="button" data-scroll-position="left" aria-pressed="false">Left</button>
          <button id="nodeSampleWaveformPositionMidButton" type="button" data-scroll-position="mid" aria-pressed="true">Mid</button>
          <button id="nodeSampleWaveformPositionRightButton" type="button" data-scroll-position="right" aria-pressed="false">Right</button>
        </span>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Scroll line thickness">
        <span>Scroll Line</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformLineWidthInput" data-phosphor-number-drag="scrollLineWidth" type="number" inputmode="decimal" step="0.25" min="0" max="16" autocomplete="off" readonly title="Drag to adjust · double-click to type · CSS px @ zoom 1 (0 = hidden)">
        </span>
      </div>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Trace thickness">
        <span>Trace</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformTraceWidthInput" data-phosphor-number-drag="traceWidth" type="number" inputmode="decimal" step="0.25" min="0.25" max="16" autocomplete="off" readonly title="Drag to adjust · double-click to type · CSS px @ zoom 1">
        </span>
      </div>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Hue</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformHueInput" type="range" min="0" max="360" step="1">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Line Brightness</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformLineBrightnessInput" type="range" min="0" max="1" step="0.01">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Grid Brightness</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformGridBrightnessInput" type="range" min="0" max="1" step="0.01" title="Sample grid lines when zoomed in (0 = hidden)">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>BG Hue</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformBackgroundHueInput" type="range" min="0" max="360" step="1">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>BG Brightness</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformBackgroundBrightnessInput" type="range" min="0" max="1" step="0.01">
        </span>
      </label>
      ${buildNodeGraphSampleWaveformCornerChromeHtml()}
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Label inset</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformLabelInsetInput" type="range" min="0" max="1" step="0.001" title="0..1 of face min-edge — how far zoom/speed labels sit from the corner">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Font size</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformFontSizeInput" type="range" min="6" max="48" step="0.5" title="HUD / placeholder text — CSS px @ zoom 1">
        </span>
      </label>
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" title="0 = no fade. Full = only the playing row stays visible.">
        <span>Playlist fade</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformPlaylistFadeInput" type="range" min="0" max="1" step="0.01" value="0.25" aria-label="Playlist fade. 0 is no fade. Full shows only the playing track.">
        </span>
      </label>
      <div class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row" role="group" aria-label="Playlist items shown">
        <span>Items shown</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeSampleWaveformPlaylistVisibleCountInput" data-phosphor-number-drag="playlistVisibleCount" type="number" inputmode="numeric" step="1" min="1" max="10" autocomplete="off" readonly title="Drag to adjust · double-click to type · 1 = fill the face, 2–10 = that many rows">
        </span>
      </div>
    </div>`;
}

function bindNodeGraphSampleWaveformDisplaySettingsBody(host) {
  if (!host) {
    return;
  }
  const nodeId = nodeGraphSampleWaveformSettingsTargetNodeId()
    || document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsTargetNode
    || "";
  if (nodeId && nodeGraphMvp) {
    nodeGraphMvp.sampleWaveformSettingsTargetNode = nodeId;
  }
  bindNodeGraphSampleWaveformNumberDrags(host);
  if (typeof bindNodeGraphSampleWaveformSettingModifiers === "function") {
    bindNodeGraphSampleWaveformSettingModifiers();
  }
  if (host.dataset.sampleWaveformSettingsBound !== "true") {
    host.dataset.sampleWaveformSettingsBound = "true";
    host.addEventListener("input", (event) => {
      const id = event.target?.id || "";
      if (id === "nodeSampleWaveformHueInput") {
        handleNodeGraphSampleWaveformHueChange(event);
      } else if (id === "nodeSampleWaveformLineBrightnessInput") {
        handleNodeGraphSampleWaveformLineBrightnessChange(event);
      } else if (id === "nodeSampleWaveformGridBrightnessInput") {
        handleNodeGraphSampleWaveformGridBrightnessChange(event);
      } else if (id === "nodeSampleWaveformBackgroundHueInput") {
        handleNodeGraphSampleWaveformBackgroundHueChange(event);
      } else if (id === "nodeSampleWaveformBackgroundBrightnessInput") {
        handleNodeGraphSampleWaveformBackgroundBrightnessChange(event);
      } else if (id === "nodeSampleWaveformCornerRadiusInput") {
        handleNodeGraphSampleWaveformCornerRadiusChange(event);
      } else if (id === "nodeSampleWaveformEdgeSpacingInput") {
        handleNodeGraphSampleWaveformEdgeSpacingChange(event);
      } else if (id === "nodeSampleWaveformLabelInsetInput") {
        handleNodeGraphSampleWaveformLabelInsetChange(event);
      } else if (id === "nodeSampleWaveformFontSizeInput") {
        handleNodeGraphSampleWaveformFontSizeChange(event);
      } else if (id === "nodeSampleWaveformPlaylistFadeInput") {
        handleNodeGraphSampleWaveformPlaylistFadeChange(event);
      } else if (id === "nodeSampleWaveformPlaylistVisibleCountInput") {
        handleNodeGraphSampleWaveformPlaylistVisibleCountChange(event);
      } else if (id === "nodeSampleWaveformTraceWidthInput") {
        handleNodeGraphSampleWaveformTraceWidthChange(event);
      }
    });
    host.addEventListener("change", (event) => {
      const target = event.target;
      const id = target?.id || "";
      if (
        id === "nodeSampleWaveformRecursiveSearch"
        || id === "nodeSampleWaveformRemoveAfterPlay"
        || target?.dataset?.musicFormat
      ) {
        nodeGraphSampleWaveformCommitPlaylistOptions();
        return;
      }
      if (id === "nodeSampleWaveformTimeWindowInput") {
        handleNodeGraphSampleWaveformTimeWindowChange(event);
      } else if (id === "nodeSampleWaveformLineWidthInput") {
        handleNodeGraphSampleWaveformLineWidthChange(event);
      } else if (id === "nodeSampleWaveformTraceWidthInput") {
        handleNodeGraphSampleWaveformTraceWidthChange(event);
      } else if (id === "nodeSampleWaveformPlaylistFadeInput") {
        handleNodeGraphSampleWaveformPlaylistFadeChange(event);
      } else if (id === "nodeSampleWaveformPlaylistVisibleCountInput") {
        handleNodeGraphSampleWaveformPlaylistVisibleCountChange(event);
      }
    });
    host.addEventListener("click", (event) => {
      const button = event.target?.closest?.("button");
      if (!button || !host.contains(button)) {
        return;
      }
      if (button.id === "nodeSampleWaveformScrollSmoothButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformScrollMode("smooth");
      } else if (button.id === "nodeSampleWaveformScrollSnapButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformScrollMode("snap");
      } else if (button.id === "nodeSampleWaveformPositionLeftButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformScrollLinePosition("left");
      } else if (button.id === "nodeSampleWaveformPositionMidButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformScrollLinePosition("mid");
      } else if (button.id === "nodeSampleWaveformPositionRightButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformScrollLinePosition("right");
      } else if (button.id === "nodeSampleWaveformLoadPlaylist") {
        event.preventDefault();
        const id = nodeGraphSampleWaveformSettingsTargetNodeId();
        nodeGraphSampleWaveformCommitPlaylistOptions();
        if (typeof nodeGraphAudioPlayerLibraryLoadPlaylist === "function") {
          nodeGraphAudioPlayerLibraryLoadPlaylist(id).catch((error) => {
            const message = String(error?.message || error || "load failed");
            if (typeof setNodeGraphSampleStatus === "function") {
              setNodeGraphSampleStatus(id, message);
            }
          });
        }
      } else if (button.id === "nodeSampleWaveformLoadFile") {
        event.preventDefault();
        const id = nodeGraphSampleWaveformSettingsTargetNodeId();
        nodeGraphSampleWaveformCommitPlaylistOptions();
        if (typeof nodeGraphAudioPlayerLibraryLoadFile === "function") {
          nodeGraphAudioPlayerLibraryLoadFile(id).catch((error) => {
            const message = String(error?.message || error || "load failed");
            if (typeof setNodeGraphSampleStatus === "function") {
              setNodeGraphSampleStatus(id, message);
            }
          });
        }
      } else if (button.id === "nodeSampleWaveformShufflePlaylist") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerLibraryShufflePlaylist === "function") {
          nodeGraphAudioPlayerLibraryShufflePlaylist(nodeGraphSampleWaveformSettingsTargetNodeId());
        }
      } else if (button.id === "nodeSampleWaveformClearPlaylist") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerPlaylistClear === "function") {
          nodeGraphAudioPlayerPlaylistClear(nodeGraphSampleWaveformSettingsTargetNodeId());
        }
      } else if (button.id === "nodeSampleWaveformResetHistory") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerPlaylistResetHistory === "function") {
          nodeGraphAudioPlayerPlaylistResetHistory(nodeGraphSampleWaveformSettingsTargetNodeId());
        }
      } else if (button.id === "nodeSampleWaveformCornerSquareButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformCornerShape("square");
      } else if (button.id === "nodeSampleWaveformCornerSquircleButton") {
        event.preventDefault();
        setNodeGraphSampleWaveformCornerShape("squircle");
      }
    });
  }
  renderNodeGraphSampleWaveformSettingsWindow();
}

function applyNodeGraphSampleWaveformDisplaySettingsToFace(node) {
  const nodeId = String(node?.id || "");
  if (!nodeId) {
    return;
  }
  const section = document.querySelector?.(
    `.node-sample-waveform-display[data-node="${CSS.escape(nodeId)}"]`,
  );
  if (!section) {
    return;
  }
  nodeGraphSampleWaveformSyncLayout(section);
  if (typeof nodeGraphSampleWaveformResyncFrameClock === "function") {
    nodeGraphSampleWaveformResyncFrameClock(nodeId);
  }
  if (typeof drawNodeGraphSampleWaveformDisplay === "function") {
    drawNodeGraphSampleWaveformDisplay(section);
  }
  if (typeof nodeGraphAudioPlayerPlaylistApplyRowFade === "function") {
    nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
  }
}

// Display-type contract (sample waveform face):
//   • Layout / chrome / canvas backing size are owned by ResizeObserver +
//     settings apply — never by the paint loop.
//   • Paint uses cached metrics only (no clientWidth / getBoundingClientRect).
//   • Visibility is the module's viewport-asleep cull (world AABB), not a
//     per-frame layout read. Faces stay live during workspace pan/zoom.
//
// Panel shape/inset: CSS vars resolved against the cell size, quantized to
// whole pixels. cellWidth/Height MUST be the section padding-box (inset does
// not change it — measuring the canvas would feedback-loop Edge Spacing).
function applyNodeGraphSampleWaveformPanelShape(section, settings, cellWidth, cellHeight, powered = true) {
  const outerWidth = cellWidth;
  const outerHeight = cellHeight;
  const faceMin = faceMinSide(outerWidth, outerHeight);
  const maxInset = Math.max(0, Math.floor(faceMin / 2));
  const inset = Math.round(settings.edgeSpacing * maxInset);
  const panelWidth = Math.max(0, outerWidth - inset * 2);
  const panelHeight = Math.max(0, outerHeight - inset * 2);
  const maxRadius = Math.max(0, Math.min(panelWidth, panelHeight) / 2);
  const radius = Math.round(settings.cornerRadius * maxRadius);
  const shape = settings.cornerShape === "squircle" ? "squircle" : "round";
  const borderColor = powered
    ? `hsl(${Math.round(settings.backgroundHue)} 100% 68% / 0.16)`
    : "transparent";
  const labelInset = Math.round(faceFracPx(settings.labelInset, faceMin));
  const next = `${inset}|${radius}|${shape}|${borderColor}|${powered ? 1 : 0}|${labelInset}`;
  if (section.dataset.panelShape === next) {
    return false;
  }
  section.dataset.panelShape = next;
  section.style.setProperty("--sample-waveform-inset", `${inset}px`);
  section.style.setProperty("--sample-waveform-label-inset", `${labelInset}px`);
  section.style.setProperty("--sample-waveform-radius", `${radius}px`);
  section.style.setProperty("--sample-waveform-border-color", borderColor);
  if (typeof applyNodeGraphSampleWaveformHudVars === "function") {
    applyNodeGraphSampleWaveformHudVars(section, settings);
  }
  section.style.setProperty("--sample-waveform-corner-shape", shape);
  return true;
}

/** Per-section face metrics cache. Paint reads this; layout writes it. */
const nodeGraphSampleWaveformFaceMetricsCache = new WeakMap();

function nodeGraphSampleWaveformCircuitRunning() {
  return typeof nodeGraphModuleScopeCircuitRunning === "function"
    ? nodeGraphModuleScopeCircuitRunning()
    : Boolean(nodeGraphMvp?.live?.outputEnabled && nodeGraphMvp?.live?.node);
}

/**
 * Measure face CSS box once and cache device-pixel canvas metrics.
 * Call only from layout owners (ResizeObserver, settings apply, face switch).
 */
function nodeGraphSampleWaveformSyncLayout(section, options = {}) {
  if (!section?.isConnected) {
    return null;
  }
  const canvas = section.querySelector?.(".node-sample-waveform-canvas");
  if (!canvas) {
    return null;
  }
  const nodeId = section.dataset.node || "";
  const face = String(
    options.face
    || section.dataset.musicPlayerFace
    || "wave",
  );
  const settings = typeof nodeGraphSampleWaveformSettingsForNode === "function"
    ? nodeGraphSampleWaveformSettingsForNode(nodeId)
    : nodeGraphSampleWaveformDefaultSettings;
  const powered = options.powered != null
    ? Boolean(options.powered)
    : nodeGraphSampleWaveformCircuitRunning();

  // Section padding-box is stable under inset CSS vars (see panel-shape note).
  const cellW = Math.max(1, section.clientWidth || section.offsetWidth || 0);
  const cellH = Math.max(1, section.clientHeight || section.offsetHeight || 0);
  applyNodeGraphSampleWaveformPanelShape(section, settings, cellW, cellH, powered);
  // Font / HUD colors always — panel-shape fingerprint does not include fontSize.
  applyNodeGraphSampleWaveformHudVars(section, settings);

  // Buffer must match the CSS box the canvas actually fills. Measuring the
  // section/cell while CSS sizes the canvas to a different page aspect
  // non-uniformly stretches the bitmap (HUD text looks elongated).
  const page = section.querySelector(`[data-music-player-page="${face}"]`);
  const waveHost = face === "waveplay"
    ? section.querySelector("[data-music-player-wave-host]")
    : null;
  const box = (waveHost && page && !page.hidden)
    ? waveHost
    : (page && !page.hidden ? page : canvas.parentElement);
  let cssWidth = 0;
  let cssHeight = 0;
  if (box) {
    cssWidth = box.clientWidth || box.offsetWidth || 0;
    cssHeight = box.clientHeight || box.offsetHeight || 0;
  }
  // Prefer the canvas's laid-out size when available (exact CSS paint box).
  const canvasCssW = canvas.clientWidth || canvas.offsetWidth || 0;
  const canvasCssH = canvas.clientHeight || canvas.offsetHeight || 0;
  if (canvasCssW > 2 && canvasCssH > 2) {
    cssWidth = canvasCssW;
    cssHeight = canvasCssH;
  } else if (!(cssWidth > 2) || !(cssHeight > 2)) {
    cssWidth = cellW;
    cssHeight = cellH;
  }
  cssWidth = Math.max(8, Math.round(cssWidth));
  cssHeight = Math.max(8, Math.round(cssHeight));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(8, Math.round(cssWidth * dpr));
  const height = Math.max(8, Math.round(cssHeight * dpr));
  const layoutFp = [
    face,
    cellW,
    cellH,
    cssWidth,
    cssHeight,
    width,
    height,
    powered ? 1 : 0,
    settings.fontSize,
    settings.labelInset,
    settings.edgeSpacing,
    settings.cornerRadius,
    settings.cornerShape,
    settings.backgroundHue,
  ].join("|");
  const prev = nodeGraphSampleWaveformFaceMetricsCache.get(section);
  if (prev && prev.layoutFp === layoutFp && prev.context?.canvas === canvas) {
    return prev;
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  const metrics = {
    context,
    width,
    height,
    pixelRatio: dpr,
    cssWidth,
    cssHeight,
    face,
    cellW,
    cellH,
    layoutFp,
  };
  nodeGraphSampleWaveformFaceMetricsCache.set(section, metrics);
  return metrics;
}

function nodeGraphSampleWaveformEnsureLayoutObserver(section) {
  if (!section || section.dataset.phosphorLayoutObs === "1") {
    return;
  }
  if (typeof ResizeObserver !== "function") {
    nodeGraphSampleWaveformSyncLayout(section);
    return;
  }
  section.dataset.phosphorLayoutObs = "1";
  // Observe the section only. Panel inset CSS vars resize absolute page hosts;
  // observing those hosts + writing inset = ResizeObserver feedback loop
  // ("loop completed with undelivered notifications") and can desync canvas mode.
  let scheduled = 0;
  const ro = new ResizeObserver(() => {
    if (!section.isConnected) {
      return;
    }
    if (scheduled) {
      return;
    }
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      nodeGraphSampleWaveformSyncLayout(section);
    });
  });
  try {
    ro.observe(section);
  } catch (_error) {
    // Ignore.
  }
  section._phosphorLayoutObserver = ro;
  nodeGraphSampleWaveformSyncLayout(section);
}

// Bound to BOTH the drag handle and the whole title bar. Safe to bind on the
// heading because beginNodeGraphFloatingWindowDrag defers to
// nodeGraphDialogDragTargetIsInteractive, which whitelists
// .scene-context-drag-handle and excludes the close button.
function beginNodeGraphSampleWaveformSettingsDrag(event) {
  const win = document.getElementById("nodeSampleWaveformSettingsWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "sampleWaveformSettingsDragging");
}

// Gives every numeric control in the waveform display options window the same
// modifier vocabulary as the module sliders -- ctrl/cmd+click reset, relative
// drag + wheel/arrows via nodeGraphNumericDragMultiplier. See
// bindNodeGraphNativeSliderModifiers in node-graph-slider-dragging.js.
const nodeGraphSampleWaveformSettingInputs = Object.freeze([
  ["nodeSampleWaveformTimeWindowInput", "timeWindowSeconds"],
  ["nodeSampleWaveformLineWidthInput", "scrollLineWidth"],
  ["nodeSampleWaveformTraceWidthInput", "traceWidth"],
  ["nodeSampleWaveformHueInput", "hue"],
  ["nodeSampleWaveformLineBrightnessInput", "lineBrightness"],
  ["nodeSampleWaveformGridBrightnessInput", "gridBrightness"],
  ["nodeSampleWaveformBackgroundHueInput", "backgroundHue"],
  ["nodeSampleWaveformBackgroundBrightnessInput", "backgroundBrightness"],
  ["nodeSampleWaveformCornerRadiusInput", "cornerRadius"],
  ["nodeSampleWaveformEdgeSpacingInput", "edgeSpacing"],
  ["nodeSampleWaveformLabelInsetInput", "labelInset"],
  ["nodeSampleWaveformFontSizeInput", "fontSize"],
  ["nodeSampleWaveformPlaylistFadeInput", "playlistFade"],
  ["nodeSampleWaveformPlaylistVisibleCountInput", "playlistVisibleCount"],
]);

function bindNodeGraphSampleWaveformSettingModifiers() {
  if (typeof bindNodeGraphNativeSliderModifiers !== "function") {
    return;
  }
  for (const [id, key] of nodeGraphSampleWaveformSettingInputs) {
    bindNodeGraphNativeSliderModifiers(
      document.getElementById(id),
      nodeGraphSampleWaveformDefaultSettings[key],
    );
  }
}

const nodeGraphSampleWaveformNumberDragSpecs = Object.freeze({
  timeWindowSeconds: {
    step: 0.05,
    min: 0,
    max: 60,
    pixelsPerStep: 8,
    commit: () => typeof handleNodeGraphSampleWaveformTimeWindowChange === "function"
      && handleNodeGraphSampleWaveformTimeWindowChange({
        target: document.getElementById("nodeSampleWaveformTimeWindowInput"),
      }),
  },
  scrollLineWidth: {
    step: 0.25,
    min: 0,
    max: 16,
    pixelsPerStep: 4,
    commit: () => typeof handleNodeGraphSampleWaveformLineWidthChange === "function"
      && handleNodeGraphSampleWaveformLineWidthChange({
        target: document.getElementById("nodeSampleWaveformLineWidthInput"),
      }),
  },
  traceWidth: {
    step: 0.25,
    min: 0.25,
    max: 16,
    pixelsPerStep: 4,
    commit: () => typeof handleNodeGraphSampleWaveformTraceWidthChange === "function"
      && handleNodeGraphSampleWaveformTraceWidthChange({
        target: document.getElementById("nodeSampleWaveformTraceWidthInput"),
      }),
  },
  playlistVisibleCount: {
    step: 1,
    min: 1,
    max: 10,
    pixelsPerStep: 12,
    commit: () => typeof handleNodeGraphSampleWaveformPlaylistVisibleCountChange === "function"
      && handleNodeGraphSampleWaveformPlaylistVisibleCountChange({
        target: document.getElementById("nodeSampleWaveformPlaylistVisibleCountInput"),
      }),
  },
});

function nodeGraphSampleWaveformClampNumberDrag(value, spec) {
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

let nodeGraphSampleWaveformNumberDrag = null;

function nodeGraphSampleWaveformEnsureNumberDragDocListeners() {
  if (document.documentElement.dataset.phosphorNumberDragDocBound === "2") {
    return;
  }
  document.documentElement.dataset.phosphorNumberDragDocBound = "2";
  // Capture: popover text-protection stopPropagates before bubble listeners.
  document.addEventListener("pointermove", nodeGraphSampleWaveformMoveNumberDrag, true);
  document.addEventListener("pointerup", nodeGraphSampleWaveformEndNumberDrag, true);
  document.addEventListener("pointercancel", nodeGraphSampleWaveformEndNumberDrag, true);
  document.addEventListener("lostpointercapture", nodeGraphSampleWaveformEndNumberDrag, true);
}

function nodeGraphSampleWaveformBeginNumberDrag(event) {
  nodeGraphSampleWaveformEnsureNumberDragDocListeners();
  const input = event.target?.closest?.("input[data-phosphor-number-drag]");
  if (!input || event.button > 0 || event.detail > 1 || !input.readOnly) {
    return false;
  }
  const spec = nodeGraphSampleWaveformNumberDragSpecs[input.dataset.phosphorNumberDrag];
  if (!spec) {
    return false;
  }
  const mult = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  nodeGraphSampleWaveformNumberDrag = {
    input,
    spec,
    pointerId: event.pointerId ?? null,
    startX: event.clientX,
    startY: event.clientY,
    startValue: nodeGraphFiniteNumber(input.value),
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

function nodeGraphSampleWaveformMoveNumberDrag(event) {
  const drag = nodeGraphSampleWaveformNumberDrag;
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
    nodeGraphSampleWaveformEndNumberDrag(event);
    return;
  }
  const mult = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  if (mult !== drag.fineScale) {
    drag.startValue = nodeGraphFiniteNumber(drag.input.value, drag.startValue);
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
    drag.startValue = nodeGraphSampleWaveformClampNumberDrag(
      drag.startValue + drag.valueStep,
      drag.spec,
    );
    changed = true;
  }
  while (drag.accum <= -threshold) {
    drag.accum += threshold;
    drag.startValue = nodeGraphSampleWaveformClampNumberDrag(
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

function nodeGraphSampleWaveformEndNumberDrag(event) {
  const drag = nodeGraphSampleWaveformNumberDrag;
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
  nodeGraphSampleWaveformNumberDrag = null;
  event?.preventDefault?.();
}

/**
 * Capture-phase drag on the Display Settings host. Per-input listeners die
 * when the panel rebuilds innerHTML; host delegation does not.
 */
function bindNodeGraphSampleWaveformNumberDrags(host) {
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

  host.addEventListener("pointerdown", nodeGraphSampleWaveformBeginNumberDrag, true);
  nodeGraphSampleWaveformEnsureNumberDragDocListeners();
}

function bindNodeGraphSampleWaveformTimeWindowEditing() {
  const host = document.querySelector("[data-sample-waveform-display-settings-panel]")
    ?.closest?.("[data-display-settings-body]")
    || document.querySelector("[data-display-settings-body]");
  bindNodeGraphSampleWaveformNumberDrags(host);
}

function dragNodeGraphSampleWaveformSettings(event) {
  dragNodeGraphFloatingWindow(event, "sampleWaveformSettingsDragging", document.getElementById("nodeSampleWaveformSettingsWindow"));
}

function endNodeGraphSampleWaveformSettingsDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "sampleWaveformSettingsDragging", () => {
    // Record where the user parked it so the next open restores it instead of
    // jumping back to the pointer.
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "sampleWaveformSettings",
        document.getElementById("nodeSampleWaveformSettingsWindow"),
        { open: true },
        { status: false },
      );
    }
  });
}

function nodeGraphSampleWaveformViewState(nodeId, frames, sectionOrFace) {
  const safeFrames = Math.max(1, Math.round(nodeGraphFiniteNumber(frames, 1)));
  const key = nodeGraphSampleWaveformViewKey(nodeId, sectionOrFace);
  let state = nodeGraphSampleWaveformViewStates.get(key)
    || nodeGraphSampleWaveformViewStates.get(nodeId);
  if (!state || state.totalFrames !== safeFrames) {
    state = { endFrame: safeFrames, startFrame: 0, totalFrames: safeFrames };
  }
  nodeGraphSampleWaveformViewStates.set(key, state);
  return state;
}

function nodeGraphSampleWaveformClampWindow(state) {
  const minWindow = Math.min(state.totalFrames, nodeGraphSampleWaveformMinWindowFrames);
  let width = state.endFrame - state.startFrame;
  width = Math.max(minWindow, Math.min(state.totalFrames, width));
  // Preserve exact window length (may be float from pan/zoom). Only clamp range.
  state.startFrame = Math.max(0, Math.min(state.totalFrames - width, state.startFrame));
  state.endFrame = state.startFrame + width;
}

/**
 * View window. Scroll is pixel-locked (see draw): history is a tape, not a
 * full-path rebuild every frame.
 */
function nodeGraphSampleWaveformContinuousView(idealStart, windowFrames, totalFrames) {
  const total = Math.max(1, Math.round(nodeGraphFiniteNumber(totalFrames, 1)));
  const win = Math.max(
    Math.min(total, nodeGraphSampleWaveformMinWindowFrames),
    Math.max(1, Math.min(total, Math.round(nodeGraphFiniteNumber(windowFrames, 1)))),
  );
  const maxStart = Math.max(0, total - win);
  const viewStart = Math.max(0, Math.min(maxStart, nodeGraphFiniteNumber(idealStart)));
  return {
    viewEnd: viewStart + win,
    viewStart,
  };
}

function nodeGraphSampleWaveformSamplesUsable(samples) {
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

function nodeGraphSampleWaveformEntrySamples(entry) {
  if (!entry) {
    return null;
  }
  if (nodeGraphSampleWaveformSamplesUsable(entry.samples)) {
    return entry.samples;
  }
  const channel = entry.channelData?.[0];
  return nodeGraphSampleWaveformSamplesUsable(channel) ? channel : null;
}

const nodeGraphWavetable2dWarpKnots = Object.freeze([
  -0.97, -0.87, -0.73, -0.66, -0.49, -0.19, 0,
  0.19, 0.49, 0.66, 0.73, 0.87, 0.97,
]);

function nodeGraphWavetable2dWrap01(t) {
  let x = Number(t);
  if (!Number.isFinite(x)) x = 0;
  x -= Math.floor(x);
  if (x < 0) x += 1;
  return x;
}

function nodeGraphWavetable2dWarpPhase(t, warp) {
  t = nodeGraphWavetable2dWrap01(t);
  let skew = Number(warp);
  if (!Number.isFinite(skew)) skew = 0;
  if (skew > 0.9999) skew = 0.9999;
  if (skew < -0.9999) skew = -0.9999;
  if (skew === 0) return t;
  const cv = skew * t;
  const den = 2 * cv - skew + 1;
  if (Math.abs(den) < 1e-12) return t;
  return nodeGraphWavetable2dWrap01((cv + t) / den);
}

function nodeGraphWavetable2dWarpPosition(warp) {
  let w = Number(warp);
  if (!Number.isFinite(w)) w = 0;
  if (w < -1) w = -1;
  if (w > 1) w = 1;
  const last = nodeGraphWavetable2dWarpKnots.length - 1;
  return (w + 1) * 0.5 * last;
}

function nodeGraphSampleWaveformPaintBuffer(canvas, samples, settings) {
  if (!canvas || !samples?.length) return;
  const cssW = Math.max(8, canvas.clientWidth || 40);
  const cssH = Math.max(8, canvas.clientHeight || 28);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(cssW * dpr);
  const height = Math.round(cssH * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bg = typeof nodeGraphSampleWaveformBackgroundColor === "function"
    ? nodeGraphSampleWaveformBackgroundColor(settings)
    : "#050805";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const midY = height * 0.5;
  const amp = midY * 0.92;
  const fill = typeof nodeGraphSampleWaveformLineColor === "function"
    ? nodeGraphSampleWaveformLineColor(settings, 85, 0.95)
    : "hsla(140, 80%, 62%, 0.95)";
  nodeGraphSampleWaveformPaintEnvelopeColumns(
    ctx,
    samples,
    0,
    samples.length / Math.max(1, width),
    0,
    width,
    height,
    midY,
    amp,
    fill,
  );
}

function nodeGraphWavetable2dPeakNormalize(buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const a = buf[i] < 0 ? -buf[i] : buf[i];
    if (a > peak) peak = a;
  }
  if (peak > 1e-12) {
    const s = 1 / peak;
    for (let i = 0; i < buf.length; i += 1) buf[i] *= s;
  }
}

function nodeGraphWavetable2dEnsureFrames() {
  if (nodeGraphWavetable2dEnsureFrames._frames) {
    return nodeGraphWavetable2dEnsureFrames._frames;
  }
  const N = 4096;
  const H = 2047;
  const twoPi = Math.PI * 2;
  const rect = new Float32Array(N);
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    const t = i / N;
    let y = 0;
    for (let n = 1; n <= H; n += 1) {
      y += (1 / (n * n)) * Math.sin(twoPi * (n * t + (n & 1 ? 0.25 : 0.75)));
    }
    rect[i] = y;
    sum += y;
  }
  const mean = sum / N;
  for (let i = 0; i < N; i += 1) rect[i] -= mean;
  nodeGraphWavetable2dPeakNormalize(rect);
  const sine = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    sine[i] = Math.sin(twoPi * (i / N + 0.25));
  }
  nodeGraphWavetable2dPeakNormalize(sine);
  const flip = new Float32Array(N);
  const rot = N / 2;
  for (let i = 0; i < N; i += 1) {
    flip[i] = -rect[(i + rot) % N];
  }
  const sine2 = new Float32Array(N);
  sine2.set(sine);
  const frames = [rect, sine, flip, sine2];
  nodeGraphWavetable2dEnsureFrames._frames = frames;
  nodeGraphWavetable2dEnsureFrames._labels = [
    "Rectified sine",
    "Sine",
    "Inverted rectified sine (180°)",
    "Sine",
  ];
  nodeGraphWavetable2dEnsureFrames._warped = [];
  return frames;
}

function nodeGraphWavetable2dWarpedFrame(frameIndex, knotIndex) {
  const frames = nodeGraphWavetable2dEnsureFrames();
  const f = ((frameIndex % frames.length) + frames.length) % frames.length;
  const knots = nodeGraphWavetable2dWarpKnots;
  let w = knotIndex | 0;
  if (w < 0) w = 0;
  if (w > knots.length - 1) w = knots.length - 1;
  let row = nodeGraphWavetable2dEnsureFrames._warped[f];
  if (!row) {
    row = [];
    nodeGraphWavetable2dEnsureFrames._warped[f] = row;
  }
  if (row[w]) return row[w];
  const src = frames[f];
  const N = src.length;
  const out = new Float32Array(N);
  const knot = knots[w];
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    const tp = nodeGraphWavetable2dWarpPhase(i / N, knot) * N;
    const i0 = ((Math.floor(tp) % N) + N) % N;
    const i1 = (i0 + 1) % N;
    const frac = tp - Math.floor(tp);
    const y = src[i0] + (src[i1] - src[i0]) * frac;
    out[i] = y;
    sum += y;
  }
  const mean = sum / N;
  for (let i = 0; i < N; i += 1) out[i] -= mean;
  nodeGraphWavetable2dPeakNormalize(out);
  row[w] = out;
  return out;
}

function nodeGraphWavetable2dLerpFrames(a, b, frac, dest) {
  const N = a.length;
  const t = frac < 0 ? 0 : (frac > 1 ? 1 : frac);
  if (t <= 1e-9) {
    dest.set(a);
    return dest;
  }
  if (t >= 1 - 1e-9) {
    dest.set(b);
    return dest;
  }
  for (let i = 0; i < N; i += 1) {
    dest[i] = a[i] + (b[i] - a[i]) * t;
  }
  return dest;
}

function nodeGraphWavetable2dBlendBuffer(morph, warp, dest) {
  const frames = nodeGraphWavetable2dEnsureFrames();
  const N = frames[0].length;
  const count = frames.length;
  const m = nodeGraphWavetable2dWrap01(morph);
  let mpos = m * count;
  if (mpos >= count) mpos = 0;
  const mi0 = Math.floor(mpos) % count;
  const mi1 = (mi0 + 1) % count;
  const mf = mpos - Math.floor(mpos);
  const knots = nodeGraphWavetable2dWarpKnots;
  let wpos = nodeGraphWavetable2dWarpPosition(warp);
  if (wpos < 0) wpos = 0;
  if (wpos > knots.length - 1) wpos = knots.length - 1;
  const wi0 = Math.min(knots.length - 1, Math.max(0, Math.floor(wpos)));
  const wi1 = Math.min(knots.length - 1, wi0 + 1);
  const wf = wi0 === wi1 ? 0 : (wpos - wi0);
  let buf = dest;
  if (!buf || buf.length !== N) buf = new Float32Array(N);
  const a = nodeGraphWavetable2dWarpedFrame(mi0, wi0);
  const b = nodeGraphWavetable2dWarpedFrame(mi1, wi0);
  const c = nodeGraphWavetable2dWarpedFrame(mi0, wi1);
  const d = nodeGraphWavetable2dWarpedFrame(mi1, wi1);
  const omf = 1 - mf;
  const owf = 1 - wf;
  for (let i = 0; i < N; i += 1) {
    const u0 = a[i] * omf + b[i] * mf;
    const u1 = c[i] * omf + d[i] * mf;
    buf[i] = u0 * owf + u1 * wf;
  }
  return buf;
}

function nodeGraphWavetable2dBlendDisplay(morph, warp) {
  const frames = nodeGraphWavetable2dEnsureFrames();
  const N = frames[0].length;
  let blend = nodeGraphWavetable2dBlendDisplay._buf;
  if (!blend || blend.length !== N) {
    blend = new Float32Array(N);
    nodeGraphWavetable2dBlendDisplay._buf = blend;
  }
  nodeGraphWavetable2dBlendBuffer(morph, warp, blend);
  let entry = nodeGraphWavetable2dBlendDisplay._entry;
  if (!entry) {
    entry = {
      frames: N,
      sampleRate: 44100,
      channels: 1,
      samples: blend,
      channelData: [blend],
    };
    nodeGraphWavetable2dBlendDisplay._entry = entry;
  } else {
    entry.samples = blend;
    entry.channelData = [blend];
  }
  return entry;
}

function nodeGraphWavetable2dWriteParam(nodeId, key, value) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || (key !== "morph" && key !== "warp")) return;
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  node.params = { ...(node.params || {}), [key]: next };
  const safeId = String(nodeId || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const moduleEl = document.querySelector(`.dsp-node[data-node="${safeId}"]`);
  const slider = moduleEl?.querySelector?.(`input[data-param="${key}"]`);
  if (slider) {
    if (typeof setNodeSliderValue === "function") {
      setNodeSliderValue(slider, next, { interaction: "program", bypassSmoothing: true });
    } else {
      slider.value = String(next);
      if (typeof syncNodeSliderReadout === "function") {
        syncNodeSliderReadout(slider);
      }
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
}

function nodeGraphWavetable2dSyncStrips(section) {
  if (!section || section.dataset.nodeType !== "wavetable2d") return;
  const nodeId = section.dataset.node;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const frames = nodeGraphWavetable2dEnsureFrames();
  const count = Math.max(1, frames.length);
  const knots = nodeGraphWavetable2dWarpKnots;
  let morph = Number(node?.params?.morph);
  if (!Number.isFinite(morph)) morph = 0;
  morph = nodeGraphWavetable2dWrap01(morph);
  let warp = Number(node?.params?.warp);
  if (!Number.isFinite(warp)) warp = 0;
  const warpPos = nodeGraphWavetable2dWarpPosition(warp);
  const warpSel = Math.min(knots.length - 1, Math.max(0, Math.floor(warpPos + 1e-9)));
  const morphCanvas = section.querySelector(".node-wavetable-morph-preview-canvas");
  const warpStrip = section.querySelector(".node-wavetable-warp-strip");
  const previewW = morphCanvas?.clientWidth || 0;
  const settings = typeof nodeGraphSampleWaveformSettingsForNode === "function"
    ? nodeGraphSampleWaveformSettingsForNode(nodeId)
    : null;
  const sig = `${morph.toFixed(4)}|${warp.toFixed(4)}|${previewW}|${section.clientWidth || 0}`;
  if (section.dataset.wtStripSig === sig) {
    warpStrip?.querySelectorAll?.(".node-wavetable-warp-slot").forEach((el) => {
      el.classList.toggle("is-selected", Number(el.dataset.slot) === warpSel);
    });
    return;
  }
  section.dataset.wtStripSig = sig;
  let morphBuf = nodeGraphWavetable2dSyncStrips._morphBuf;
  if (!morphBuf || morphBuf.length !== frames[0].length) {
    morphBuf = new Float32Array(frames[0].length);
    nodeGraphWavetable2dSyncStrips._morphBuf = morphBuf;
  }
  // Morph row is the unwarped morph blend (warp 0) as one cycle.
  nodeGraphWavetable2dBlendBuffer(morph, 0, morphBuf);
  nodeGraphSampleWaveformPaintBuffer(morphCanvas, morphBuf, settings);
  let warpBuf = nodeGraphWavetable2dSyncStrips._warpBuf;
  if (!warpBuf || warpBuf.length !== frames[0].length) {
    warpBuf = new Float32Array(frames[0].length);
    nodeGraphWavetable2dSyncStrips._warpBuf = warpBuf;
  }
  const mpos = morph * count;
  const mi0 = Math.floor(mpos) % count;
  const mi1 = (mi0 + 1) % count;
  const mf = mpos - Math.floor(mpos);
  warpStrip?.querySelectorAll?.(".node-wavetable-warp-slot").forEach((el) => {
    const s = Number(el.dataset.slot);
    el.classList.toggle("is-selected", s === warpSel);
    const canvas = el.querySelector(".node-wavetable-warp-slot-canvas");
    const a = nodeGraphWavetable2dWarpedFrame(mi0, s);
    const b = nodeGraphWavetable2dWarpedFrame(mi1, s);
    nodeGraphWavetable2dLerpFrames(a, b, mf, warpBuf);
    nodeGraphSampleWaveformPaintBuffer(canvas, warpBuf, settings);
  });
}

function nodeGraphSampleWaveformSampleEntry(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  if (node?.type === "wavetable2d") {
    return nodeGraphWavetable2dBlendDisplay(node?.params?.morph, node?.params?.warp);
  }
  const sampleId = node?.sample?.id;
  let entry = sampleId ? nodeGraphMvp?.sampleBuffers?.get?.(sampleId) : null;
  let samples = nodeGraphSampleWaveformEntrySamples(entry);
  let frames = Math.max(0, nodeGraphFiniteNumber(entry?.frames, nodeGraphFiniteNumber(samples?.length, 0)));
  if (!(entry && samples && frames > 0) && typeof nodeGraphAudioPlayerLibraryFindBufferForItem === "function") {
    const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
      ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
      : null;
    const found = nodeGraphAudioPlayerLibraryFindBufferForItem(pl?.playing || pl?.items?.[pl?.index || 0]);
    if (found?.buf) {
      entry = found.buf;
      samples = nodeGraphSampleWaveformEntrySamples(entry);
      frames = Math.max(0, nodeGraphFiniteNumber(found.frames, nodeGraphFiniteNumber(samples?.length, 0)));
    }
  }
  return entry && samples && frames > 0 ? entry : null;
}

function nodeGraphSampleWaveformZoomAt(section, canvas, clientX, factor) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  // Smooth-scroll mode continuously re-centers the view on the playhead
  // every auto-scroll frame -- if a manual zoom anchored to the mouse
  // cursor instead, the very next auto-scroll frame after the interaction
  // pause would visibly jump the view to re-center on the playhead. Anchor
  // to the playhead here too so zooming in smooth mode feels like zooming
  // into the scroll line itself, with no jump once auto-scroll resumes.
  // Snap mode (and "no sample position yet") keep the normal
  // cursor-anchored zoom.
  const settings = nodeGraphSampleWaveformSettingsForNode(nodeId);
  const phase = typeof nodeGraphSamplePhaseForNode === "function" ? nodeGraphSamplePhaseForNode(nodeId) : 0;
  const useSmoothAnchor = settings.scrollMode === "smooth";
  const rect = canvas.getBoundingClientRect();
  const ratio = useSmoothAnchor
    ? nodeGraphSampleWaveformScrollLineRatio(settings)
    : (rect.width > 0 ? clampNodeSliderValue((clientX - rect.left) / rect.width, 0, 1) : 0.5);
  const anchorFrame = useSmoothAnchor
    ? phase * entry.frames
    : state.startFrame + ratio * (state.endFrame - state.startFrame);
  const width = state.endFrame - state.startFrame;
  const newWidth = Math.max(
    nodeGraphSampleWaveformMinWindowFrames,
    Math.min(state.totalFrames, width * factor),
  );
  state.startFrame = anchorFrame - ratio * newWidth;
  state.endFrame = state.startFrame + newWidth;
  nodeGraphSampleWaveformClampWindow(state);
  // Keep Time Window setting = live span so modular zoom / auto-scroll cannot
  // re-apply the old seconds value and undo this gesture.
  nodeGraphSampleWaveformSyncTimeWindowFromView(
    nodeId,
    state.endFrame - state.startFrame,
    entry.sampleRate,
    section,
  );
  nodeGraphSampleWaveformMarkInteraction(nodeId);
  nodeGraphSampleWaveformResyncFrameClock(nodeId);
  drawNodeGraphSampleWaveformDisplay(section);
}

function nodeGraphSampleWaveformPanBy(section, deltaPixels, canvasWidth) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (!entry || canvasWidth <= 0) {
    return;
  }
  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  const framesPerPixel = (state.endFrame - state.startFrame) / canvasWidth;
  state.startFrame -= deltaPixels * framesPerPixel;
  state.endFrame -= deltaPixels * framesPerPixel;
  nodeGraphSampleWaveformClampWindow(state);
  nodeGraphSampleWaveformMarkInteraction(nodeId);
  nodeGraphSampleWaveformResyncFrameClock(nodeId);
  drawNodeGraphSampleWaveformDisplay(section);
}

function nodeGraphSampleWaveformResetZoom(section) {
  const nodeId = section.dataset.node;
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  nodeGraphSampleWaveformViewStates.set(nodeGraphSampleWaveformViewKey(nodeId, section), {
    endFrame: entry.frames,
    startFrame: 0,
    totalFrames: entry.frames,
  });
  nodeGraphSampleWaveformSyncTimeWindowFromView(nodeId, entry.frames, entry.sampleRate, section);
  nodeGraphSampleWaveformMarkInteraction(nodeId);
  nodeGraphSampleWaveformResyncFrameClock(nodeId);
  drawNodeGraphSampleWaveformDisplay(section);
}

/**
 * Nudge Music Player phaseOffset (−1…+1 wrap) by a relative cycle delta.
 * Does not touch free-running transport phase — only the relative scrub param.
 */
function nodeGraphSampleWaveformNudgePhaseOffset(nodeId, deltaCycles) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const delta = nodeGraphFiniteNumber(deltaCycles);
  if (!delta) {
    return;
  }
  const current = nodeGraphFiniteNumber(node.params?.phaseOffset);
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
    if (!nodeGraphSampleWaveformNudgePhaseOffset._saveTimer) {
      nodeGraphSampleWaveformNudgePhaseOffset._saveTimer = window.setTimeout(() => {
        nodeGraphSampleWaveformNudgePhaseOffset._saveTimer = 0;
        saveNodeGraphWorkingPatchToUserSettings();
      }, 400);
    }
  }
}

function nodeGraphSampleWaveformFormatZoomPercent(ratio) {
  const pct = Math.max(0, nodeGraphFiniteNumber(ratio)) * 100;
  if (pct >= 9.95) {
    return `${Math.round(pct)}%`;
  }
  if (pct >= 0.995) {
    return `${pct.toFixed(1)}%`;
  }
  return `${pct.toFixed(2)}%`;
}

function nodeGraphSampleWaveformEnsureZoomControl(section) {
  if (!section) {
    return null;
  }
  let control = section.querySelector(":scope > .node-sample-waveform-zoom");
  if (control) {
    return control;
  }
  control = document.createElement("button");
  control.type = "button";
  control.className = "node-sample-waveform-zoom";
  control.textContent = "100%";
  control.title = "Drag to zoom (right/up · left/down). Double-click resets.";
  control.setAttribute("aria-label", "Waveform zoom percent");
  control.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    beginNodeGraphSampleWaveformZoomDrag(event, section);
  });
  control.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphSampleWaveformResetZoom(section);
  });
  section.append(control);
  return control;
}

function nodeGraphSampleWaveformSyncZoomControl(section, ratio) {
  const control = nodeGraphSampleWaveformEnsureZoomControl(section);
  if (!control) {
    return;
  }
  const label = nodeGraphSampleWaveformFormatZoomPercent(ratio);
  if (control.textContent !== label) {
    control.textContent = label;
  }
}

function beginNodeGraphSampleWaveformZoomDrag(event, section) {
  if (event.button > 0 || (typeof nodeGraphAudioPlayerFaceIsWave === "function"
    ? !nodeGraphAudioPlayerFaceIsWave(section)
    : (section?.dataset?.musicPlayerFace || "wave") !== "wave")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const nodeId = section.dataset.node;
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (!entry) {
    return;
  }
  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  const startWidth = Math.max(1, state.endFrame - state.startFrame);
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const control = event.currentTarget;
  control.setPointerCapture?.(pointerId);
  control.classList.add("is-dragging");
  const applyFromStart = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    // Same diagonal 1D policy as sliders / Time Window: right+up / left+down.
    const axes = typeof nodeGraphPointerDragScreenDelta === "function"
      ? nodeGraphPointerDragScreenDelta(startX, startY, moveEvent.clientX, moveEvent.clientY)
      : { combined: (moveEvent.clientX - startX) + (startY - moveEvent.clientY) };
    const targetWidth = startWidth * Math.exp(axes.combined * 0.008);
    const currentWidth = Math.max(1, state.endFrame - state.startFrame);
    const canvasEl = section.querySelector(".node-sample-waveform-canvas");
    const rect = canvasEl?.getBoundingClientRect?.();
    const clientX = rect ? rect.left + rect.width * 0.5 : startX;
    nodeGraphSampleWaveformZoomAt(section, canvasEl, clientX, targetWidth / currentWidth);
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

const nodeGraphSampleWaveformHandleHitPx = 10;

function nodeGraphSampleWaveformRegionHandleHit(section, canvas, clientX) {
  const nodeId = section?.dataset?.node;
  const entry = typeof nodeGraphSampleWaveformSampleEntry === "function"
    ? nodeGraphSampleWaveformSampleEntry(nodeId)
    : null;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!entry?.frames || !node || !canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0)) {
    return null;
  }
  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  const viewStart = state.startFrame;
  const viewEnd = state.endFrame;
  const viewSpan = Math.max(1e-9, viewEnd - viewStart);
  const loopStart = clampNodeSliderValue(nodeGraphFiniteNumber(node.params?.start), 0, 1) * entry.frames;
  const loopEnd = clampNodeSliderValue(nodeGraphFiniteNumber(node.params?.end, 1), 0, 1) * entry.frames;
  const x0 = ((Math.min(loopStart, loopEnd) - viewStart) / viewSpan) * rect.width;
  const x1 = ((Math.max(loopStart, loopEnd) - viewStart) / viewSpan) * rect.width;
  const localX = clientX - rect.left;
  const hit = nodeGraphSampleWaveformHandleHitPx;
  const d0 = Math.abs(localX - x0);
  const d1 = Math.abs(localX - x1);
  if (d0 <= hit && d0 <= d1) {
    return "start";
  }
  if (d1 <= hit) {
    return "end";
  }
  return null;
}

function nodeGraphSampleWaveformWriteRegionParam(nodeId, key, phase01) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || (key !== "start" && key !== "end")) {
    return;
  }
  const next = clampNodeSliderValue(nodeGraphFiniteNumber(phase01), 0, 1);
  node.params = { ...(node.params || {}), [key]: next };
  const safeId = String(nodeId || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const moduleEl = document.querySelector(`.dsp-node[data-node="${safeId}"]`);
  const slider = moduleEl?.querySelector?.(`input[data-param="${key}"]`);
  if (slider) {
    if (typeof setNodeSliderValue === "function") {
      setNodeSliderValue(slider, next, { interaction: "program", bypassSmoothing: true });
    } else {
      slider.value = String(next);
      if (typeof syncNodeSliderReadout === "function") {
        syncNodeSliderReadout(slider);
      }
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
}

function nodeGraphSampleWaveformSetRegionFromClientX(section, canvas, clientX, which) {
  const nodeId = section?.dataset?.node;
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (!entry?.frames || !canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0)) {
    return;
  }
  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  const viewStart = state.startFrame;
  const viewEnd = state.endFrame;
  const viewSpan = Math.max(1e-9, viewEnd - viewStart);
  const localX = clampNodeSliderValue((clientX - rect.left) / rect.width, 0, 1);
  const frame = viewStart + localX * viewSpan;
  const phase = clampNodeSliderValue(frame / Math.max(1, entry.frames), 0, 1);
  nodeGraphSampleWaveformWriteRegionParam(nodeId, which === "end" ? "end" : "start", phase);
  nodeGraphSampleWaveformMarkInteraction(nodeId);
}

function bindNodeGraphSampleWaveformInteractions(section, canvas) {
  canvas.style.touchAction = "none";

  let dragPointerId = null;
  let lastClientX = 0;
  let lastClientY = 0;
  // "pan" = view window, "phase" = phaseOffset scrub, "start"/"end" = region handles.
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
    lastClientY = event.clientY;
    const handle = event.shiftKey
      ? null
      : nodeGraphSampleWaveformRegionHandleHit(section, canvas, event.clientX);
    if (handle) {
      dragMode = handle;
      nodeGraphSampleWaveformSetRegionFromClientX(section, canvas, event.clientX, handle);
    } else {
      dragMode = event.shiftKey ? "phase" : "pan";
    }
    canvas.setPointerCapture?.(dragPointerId);
    canvas.classList.add("dragging");
    canvas.classList.toggle("phase-scrubbing", dragMode === "phase");
    canvas.classList.toggle("region-handle-dragging", dragMode === "start" || dragMode === "end");
    event.stopPropagation();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) {
      // Hover cursor near start/end handles.
      const hover = nodeGraphSampleWaveformRegionHandleHit(section, canvas, event.clientX);
      canvas.style.cursor = hover ? "ew-resize" : "";
      return;
    }
    const nodeId = section.dataset.node;
    const canvasW = canvas.clientWidth || canvas.width;
    if (dragMode === "start" || dragMode === "end") {
      nodeGraphSampleWaveformSetRegionFromClientX(section, canvas, event.clientX, dragMode);
      lastClientX = event.clientX;
      lastClientY = event.clientY;
    } else if (dragMode === "phase") {
      // Same diagonal 1D policy as sliders: right+up / left+down.
      const axes = typeof nodeGraphPointerDragScreenDelta === "function"
        ? nodeGraphPointerDragScreenDelta(lastClientX, lastClientY, event.clientX, event.clientY)
        : { combined: (event.clientX - lastClientX) + (lastClientY - event.clientY) };
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      // Relative scrub: travel across the face moves phase by the visible
      // window as a fraction of the whole file (zoom in = finer control).
      const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
      const state = entry
        ? nodeGraphSampleWaveformViewState(nodeId, entry.frames, section)
        : null;
      const viewSpan = state
        ? Math.max(1, state.endFrame - state.startFrame)
        : 1;
      const total = Math.max(1, state?.totalFrames || entry?.frames || 1);
      const deltaCycles = canvasW > 0 ? (axes.combined / canvasW) * (viewSpan / total) : 0;
      nodeGraphSampleWaveformNudgePhaseOffset(nodeId, deltaCycles);
    } else {
      const deltaX = event.clientX - lastClientX;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      // Pan stays horizontal — it's a spatial window slide, not a 1D value.
      nodeGraphSampleWaveformPanBy(section, deltaX, canvasW);
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
    canvas.classList.remove("region-handle-dragging");
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
    nodeGraphSampleWaveformResetZoom(section);
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
const nodeGraphSampleWaveformFrameClockStates = new Map();

function nodeGraphSampleWaveformFrameReady(nodeId) {
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  if (!(fps > 0) || typeof nodeGraphModuleScopeAdvanceFixedFrameClock !== "function") {
    return true;
  }
  const now = performance.now() / 1000;
  let clock = nodeGraphSampleWaveformFrameClockStates.get(nodeId);
  if (!clock) {
    clock = { lastUpdate: 0, time: now };
    nodeGraphSampleWaveformFrameClockStates.set(nodeId, clock);
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
function nodeGraphSampleWaveformResyncFrameClock(nodeId) {
  const now = performance.now() / 1000;
  nodeGraphSampleWaveformFrameClockStates.set(nodeId, { lastUpdate: now, time: now });
}

/**
 * Visibility for paint: module viewport cull (viewport-asleep), not a
 * layout-forcing getBoundingClientRect. Cull owns wake/sleep of this loop.
 */
function nodeGraphSampleWaveformSectionOnScreen(section) {
  const node = section?.closest?.(".dsp-node");
  if (!node) {
    return true;
  }
  return !node.classList.contains("viewport-asleep");
}

function nodeGraphSampleWaveformShouldKeepLoop(section) {
  if (!section?.isConnected) {
    return false;
  }
  if (section.dataset.phosphorLoopHold === "0") {
    return false;
  }
  const face = section.dataset.musicPlayerFace || "wave";
  if (face === "pl" || face === "playinfo") {
    return false;
  }
  // Wavetable is a free-running osc, not a playlist clip. The Music Player
  // audible gate would kill this loop, so Morph/Warp previews never animated.
  if (section.dataset.nodeType === "wavetable2d") {
    return true;
  }
  const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
  if (!live?.outputEnabled || !live?.node) {
    return false;
  }
  const speed = Number(live.speedMultiplier);
  if (Number.isFinite(speed) && speed <= 0) {
    return false;
  }
  const nodeId = section.dataset.node;
  if (typeof nodeGraphAudioPlayerPlaylistIsAudible === "function"
    && !nodeGraphAudioPlayerPlaylistIsAudible(nodeId)) {
    return false;
  }
  return true;
}

function scheduleNodeGraphSampleWaveformFrame(section) {
  if (!section.isConnected) {
    section.dataset.phosphorRaf = "";
    return;
  }
  const gen = Number(section.dataset.phosphorLoopGen || "0");
  const keep = nodeGraphSampleWaveformShouldKeepLoop(section);
  const face = section.dataset.musicPlayerFace || "wave";
  const skipFace = face === "pl" || face === "playinfo";
  if (
    keep
    && !skipFace
    && !(typeof nodeGraphDisplaysFrozen === "function" && nodeGraphDisplaysFrozen())
    && nodeGraphSampleWaveformFrameReady(section.dataset.node)
    && nodeGraphSampleWaveformSectionOnScreen(section)
  ) {
    drawNodeGraphSampleWaveformDisplay(section);
    if (section.dataset.nodeType === "wavetable2d") {
      nodeGraphWavetable2dSyncStrips(section);
    }
  }
  if (!keep) {
    section.dataset.phosphorRaf = "";
    return;
  }
  section.dataset.phosphorRaf = "1";
  window.requestAnimationFrame(() => {
    if (Number(section.dataset.phosphorLoopGen || "0") !== gen) {
      return;
    }
    scheduleNodeGraphSampleWaveformFrame(section);
  });
}

function nodeGraphSampleWaveformStopLoop(section) {
  if (!section) {
    return;
  }
  section.dataset.phosphorLoopHold = "0";
  section.dataset.phosphorLoopGen = String(
    (Number(section.dataset.phosphorLoopGen || "0") + 1) | 0,
  );
  section.dataset.phosphorRaf = "";
}

function nodeGraphSampleWaveformEnsureLoop(section) {
  if (!section) {
    return;
  }
  nodeGraphSampleWaveformEnsureLayoutObserver(section);
  section.dataset.phosphorLoopHold = "1";
  if (section.dataset.phosphorRaf === "1") {
    return;
  }
  section.dataset.phosphorRaf = "1";
  window.requestAnimationFrame(() => scheduleNodeGraphSampleWaveformFrame(section));
}

function createNodeGraphSampleWaveformDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-sample-waveform-display node-light-source";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  // Room dimmer rect punch (same contract as .node-module-scope-window).
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "1";
  const faceLabel = type === "samplePlayer"
    ? "Sample Player"
    : (type === "wavetable2d"
      ? "Wavetable 2D"
      : (nodeGraphNodeDisplayName?.(nodeId) || "Music Player"));
  section.setAttribute("aria-label", `${faceLabel} waveform display`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-sample-waveform-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "1";
  section.append(canvas);
  bindNodeGraphSampleWaveformInteractions(section, canvas);
  // Music Player: face bar + playlist page (pl) over the waveform.
  if (type === "audioPlayer" && typeof nodeGraphAudioPlayerPlaylistEnhanceDisplay === "function") {
    nodeGraphAudioPlayerPlaylistEnhanceDisplay(section, nodeId);
    if (typeof window.__nodeGraphAudioPlayerPlaylistWrapRuntime === "function") {
      window.__nodeGraphAudioPlayerPlaylistWrapRuntime();
    }
  }
  // Wavetable 2D: result (main canvas) / Morph preview (one cycle) / Warp boxes.
  if (type === "wavetable2d") {
    section.classList.add("has-wavetable-morph-strip");
    const morphPreview = document.createElement("div");
    morphPreview.className = "node-wavetable-morph-preview";
    morphPreview.setAttribute("aria-label", "Wavetable morph preview");
    morphPreview.dataset.node = nodeId;
    morphPreview.title = "Morph (warp 0). Drag to scrub Morph.";
    const morphCanvas = document.createElement("canvas");
    morphCanvas.className = "node-wavetable-morph-preview-canvas";
    morphPreview.append(morphCanvas);
    const scrubMorph = (event) => {
      const rect = morphCanvas.getBoundingClientRect();
      if (!(rect.width > 0)) return;
      const x = (event.clientX - rect.left) / rect.width;
      const morph = x < 0 ? 0 : (x > 1 ? 1 : x);
      nodeGraphWavetable2dWriteParam(nodeId, "morph", morph >= 1 ? 0 : morph);
      section.dataset.wtStripSig = "";
      nodeGraphWavetable2dSyncStrips(section);
    };
    morphCanvas.style.touchAction = "none";
    morphCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== undefined) return;
      event.stopPropagation();
      morphCanvas.setPointerCapture?.(event.pointerId);
      scrubMorph(event);
    });
    morphCanvas.addEventListener("pointermove", (event) => {
      if (!morphCanvas.hasPointerCapture?.(event.pointerId)) return;
      event.stopPropagation();
      scrubMorph(event);
    });
    section.append(morphPreview);
    const knots = nodeGraphWavetable2dWarpKnots;
    const warpStrip = document.createElement("div");
    warpStrip.className = "node-wavetable-warp-strip";
    warpStrip.setAttribute("aria-label", "Wavetable warp knots");
    warpStrip.dataset.node = nodeId;
    const last = Math.max(1, knots.length - 1);
    for (let s = 0; s < knots.length; s += 1) {
      const box = document.createElement("button");
      box.type = "button";
      box.className = "node-wavetable-warp-slot" + (s === 6 ? " is-selected" : "");
      box.dataset.slot = String(s);
      const knot = knots[s];
      const title = knot === 0 ? "Warp 0 (linear)" : `Warp ${knot > 0 ? "+" : ""}${knot}`;
      box.title = title;
      box.setAttribute("aria-label", title);
      const mini = document.createElement("canvas");
      mini.className = "node-wavetable-warp-slot-canvas";
      box.append(mini);
      box.addEventListener("click", (event) => {
        event.stopPropagation();
        nodeGraphWavetable2dWriteParam(nodeId, "warp", -1 + (2 * s) / last);
        warpStrip.querySelectorAll(".node-wavetable-warp-slot").forEach((el) => {
          el.classList.toggle("is-selected", el === box);
        });
        section.dataset.wtStripSig = "";
        nodeGraphWavetable2dSyncStrips(section);
      });
      warpStrip.append(box);
    }
    section.append(warpStrip);
    requestAnimationFrame(() => nodeGraphWavetable2dSyncStrips(section));
  }
  if (type !== "wavetable2d") {
    nodeGraphSampleWaveformEnsureZoomControl(section);
  }
  nodeGraphSampleWaveformEnsureLayoutObserver(section);
  nodeGraphSampleWaveformEnsureLoop(section);
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
const nodeGraphSampleWaveformMaxSamplesPerColumn = 256;

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
function nodeGraphSampleWaveformBuildVectorPath(
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
  const first = Math.max(0, Math.floor(nodeGraphFiniteNumber(viewStart)));
  const last = Math.min(total - 1, Math.ceil(nodeGraphFiniteNumber(viewEnd)));
  if (last < first) {
    return new Float32Array(0);
  }
  const span = Math.max(1e-9, (nodeGraphFiniteNumber(viewEnd)) - (nodeGraphFiniteNumber(viewStart)));
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
  const strideCap = nodeGraphSampleWaveformMaxSamplesPerColumn;
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

function nodeGraphSampleWaveformEnsureTape(state, width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!state.waveTape || state.waveTape.width !== w || state.waveTape.height !== h) {
    const tape = document.createElement("canvas");
    tape.width = w;
    tape.height = h;
    state.waveTape = tape;
    state.tapeCtx = tape.getContext("2d");
    state.tapeStart = Number.NaN;
    state.tapeSig = "";
  }
  return state.tapeCtx;
}

function nodeGraphSampleWaveformPaintEnvelopeColumns(
  context,
  samples,
  viewStart,
  spp,
  x0,
  x1,
  height,
  midY,
  amplitude,
  fillStyle,
) {
  if (!context || !samples?.length || !(spp > 0) || x1 <= x0) {
    return;
  }
  const total = samples.length;
  const maxScan = nodeGraphSampleWaveformMaxSamplesPerColumn;
  context.fillStyle = fillStyle;
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(context.canvas.width, Math.ceil(x1));
  for (let x = xa; x < xb; x += 1) {
    const t0 = viewStart + x * spp;
    const t1 = viewStart + (x + 1) * spp;
    let i0 = Math.floor(t0);
    let i1 = Math.ceil(t1);
    if (i0 < 0) i0 = 0;
    if (i1 > total) i1 = total;
    if (i1 <= i0) {
      continue;
    }
    let minV = Infinity;
    let maxV = -Infinity;
    const range = i1 - i0;
    const stride = range > maxScan ? Math.max(1, Math.floor(range / maxScan)) : 1;
    for (let i = i0; i < i1; i += stride) {
      const v = samples[i];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!(minV <= maxV)) {
      minV = 0;
      maxV = 0;
    }
    const y0 = midY - maxV * amplitude;
    const y1 = midY - minV * amplitude;
    context.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

function nodeGraphSampleWaveformStrokeVectorPath(context, points) {
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
function applyNodeGraphSampleWaveformHudVars(section, settings) {
  if (!section?.style) {
    return;
  }
  const muted = nodeGraphSampleWaveformLineColor(settings, 57, 0.55);
  const hot = nodeGraphSampleWaveformLineColor(settings, 85, 0.7);
  const dim = nodeGraphSampleWaveformLineColor(settings, 57, 0.28);
  section.style.setProperty("--sample-waveform-hud-color", muted);
  section.style.setProperty("--sample-waveform-hud-color-hot", hot);
  section.style.setProperty("--sample-waveform-hud-color-dim", dim);
  // HUD DOM text: uniform size from face min-edge only — never stretch by
  // width/height independently (APP_POLICY §15 / §16).
  const cellW = Math.max(1, section.clientWidth || section.offsetWidth || 0);
  const cellH = Math.max(1, section.clientHeight || section.offsetHeight || 0);
  const faceMin = faceMinSide(cellW, cellH);
  const fontUnit = settings && Number.isFinite(Number(settings.fontSize))
    ? Number(settings.fontSize)
    : nodeGraphSampleWaveformDefaultSettings.fontSize;
  const fontPx = Math.max(6, Math.round(faceInkPx(clampAuthoredInkPx(fontUnit, 11), faceMin)));
  const fontSmPx = Math.max(8, Math.round(fontPx * 0.9));
  section.style.setProperty("--sample-waveform-hud-font", `600 ${fontPx}px/1 system-ui, sans-serif`);
  section.style.setProperty("--sample-waveform-hud-font-sm", `600 ${fontSmPx}px/1 system-ui, sans-serif`);
}

function nodeGraphSampleWaveformLineColor(settings, lightness, alpha) {
  const defaults = nodeGraphSampleWaveformDefaultSettings || {
    hue: 140,
    lineBrightness: 0.5,
  };
  let s = defaults;
  try {
    if (typeof normalizeNodeGraphSampleWaveformSettings === "function") {
      s = normalizeNodeGraphSampleWaveformSettings(settings ?? {});
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
    : nodeGraphFiniteNumber(defaults.lineBrightness, 0.5);
  const hueRaw = Number(s.hue);
  const hue = Number.isFinite(hueRaw) ? hueRaw : nodeGraphFiniteNumber(defaults.hue, 140);
  const a = Number(alpha);
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(hue, brightness, Number.isFinite(a) ? a : 1);
  }
  const light = Number(lightness);
  const scaledLightness = Math.max(0, Math.min(100, (Number.isFinite(light) ? light : 50)));
  return `hsla(${hue}, 90%, ${scaledLightness}%, ${Number.isFinite(a) ? a : 0})`;
}

function nodeGraphSampleWaveformBackgroundColor(settings) {
  // Brightness 0…1 maps onto a dark CRT plate. Exponential curve keeps the
  // dark end usable; default 0.5 ≈ old mid (~8.8% lightness). Cap well below
  // the trace (~85%) so a stored 1.0 (old 0–2 mid, or slider max) cannot
  // become a solid green/white square that hides the waveform.
  const s = normalizeNodeGraphSampleWaveformSettings(settings);
  const normalized = Math.max(0, Math.min(1, nodeGraphFiniteNumber(s.backgroundBrightness)));
  const scaledLightness = Math.max(0, Math.min(24, 100 * (normalized ** 3.5)));
  return `hsl(${s.backgroundHue}, 70%, ${scaledLightness}%)`;
}

/**
 * Face bitmap metrics for paint. Uses the layout cache only.
 * Cold path (no cache yet) syncs layout once — never per steady-state frame.
 */
function nodeGraphMusicPlayerFaceMetrics(section, canvas, face = "") {
  if (!section || !canvas) {
    return null;
  }
  const key = String(face || section.dataset?.musicPlayerFace || "wave");
  let metrics = nodeGraphSampleWaveformFaceMetricsCache.get(section);
  if (!metrics || metrics.face !== key || metrics.context?.canvas !== canvas) {
    metrics = nodeGraphSampleWaveformSyncLayout(section, { face: key });
  }
  return metrics || null;
}

function drawNodeGraphSampleWaveformPlaceholder(context, width, height, message, pixelRatio = 1, settings) {
  if (!context) {
    return;
  }
  const fontUnit = settings && Number.isFinite(Number(settings.fontSize))
    ? Number(settings.fontSize)
    : nodeGraphSampleWaveformDefaultSettings.fontSize;
  const fontPx = Math.max(1, Math.round(faceInkPx(clampAuthoredInkPx(fontUnit, 11), faceMinSide(width, height))));
  context.fillStyle = nodeGraphSampleWaveformLineColor(settings, 57, 0.55);
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, Math.round(width / 2), Math.round(height / 2));
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawNodeGraphSampleWaveformDisplay(section) {
  const nodeId = section?.dataset?.node || "";
  const node = nodeGraphPatchNode(nodeId);
  const canvas = section?.querySelector?.(".node-sample-waveform-canvas");
  if (!node || !canvas) {
    return;
  }
  const musicFace = section.dataset.musicPlayerFace || "wave";
  // Playlist-only face: compact row waveforms. Main phosphor canvas stays
  // on the hidden wave page — do not paint a second copy here.
  if (musicFace === "pl" || musicFace === "playinfo") {
    return;
  }
  if (musicFace === "vsxy" || musicFace === "vslr") {
    if (typeof nodeGraphAudioPlayerVideoscopePaint === "function") {
      nodeGraphAudioPlayerVideoscopePaint(section);
    }
    return;
  }
  const settings = nodeGraphSampleWaveformSettingsForNode(nodeId);
  // Circuit = live output + audio node (not transport pause). Panel chrome /
  // canvas size live in the layout cache — paint does not remeasure.
  const circuitRunning = nodeGraphSampleWaveformCircuitRunning();
  const metrics = nodeGraphMusicPlayerFaceMetrics(section, canvas, musicFace);
  if (!metrics) {
    nodeGraphSampleWaveformPaintCompanionPlaylist(section, nodeId);
    return;
  }
  // Powered frame color can change without a resize — update chrome from cache
  // cell size only (no layout read).
  if (metrics.cellW > 0 && metrics.cellH > 0) {
    applyNodeGraphSampleWaveformPanelShape(
      section,
      settings,
      metrics.cellW,
      metrics.cellH,
      circuitRunning,
    );
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
  const entry = nodeGraphSampleWaveformSampleEntry(nodeId);
  if (entry && nodeGraphSampleWaveformMissingLogged.startsWith(`${nodeId}:`)) {
    nodeGraphSampleWaveformMissingLogged = "";
  }
  context.fillStyle = circuitRunning
    ? nodeGraphSampleWaveformBackgroundColor(settings)
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
    const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
      ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
      : null;
    if (circuitRunning && (pl?.items?.length || 0) > 0 && typeof nodeGraphAudioPlayerLog === "function") {
      const missKey = `${nodeId}:${node?.sample?.id || ""}:${pl.items.length}`;
      if (nodeGraphSampleWaveformMissingLogged !== missKey) {
        nodeGraphSampleWaveformMissingLogged = missKey;
        nodeGraphAudioPlayerLog("FAIL", "waveform has no buffer", {
          nodeId,
          sampleId: node?.sample?.id || "",
          tracks: pl.items.length,
          transport: node?.params?.transport || "",
        });
      }
    }
    drawNodeGraphSampleWaveformPlaceholder(
      context,
      width,
      height,
      circuitRunning ? "No sample loaded" : "Load a sample",
      pixelRatio,
      settings,
    );
    nodeGraphSampleWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings);
    nodeGraphSampleWaveformPaintCompanionPlaylist(section, nodeId);
    return;
  }

  // Offline / suspended: still draw the static sample so the face is never blank.
  // Live auto-scroll + playhead only when the circuit is actually running.

  const state = nodeGraphSampleWaveformViewState(nodeId, entry.frames, section);
  const phase = typeof nodeGraphSamplePhaseForNode === "function" ? nodeGraphSamplePhaseForNode(nodeId) : 0;
  const playheadFrame = phase * entry.frames;
  const scrollLineRatio = nodeGraphSampleWaveformScrollLineRatio(settings);
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
  const lastInteraction = nodeGraphSampleWaveformLastInteraction.get(nodeId) || 0;
  // Offline: hold a static window (manual zoom/pan still works). Live auto-
  // scroll only when the circuit is actually running.
  const autoScrollPaused = !circuitRunning
    || (settings.scrollMode === "snap"
      && Date.now() - lastInteraction < nodeGraphSampleWaveformAutoScrollPauseMs);
  // Desired window length in samples. Manual Shift+wheel zoom keeps the live
  // span; Time Window / scroll-line setting only re-applies when those change
  // (never when canvas pixel width changes from modular zoom).
  const settingsWindowFrames = Math.max(
    nodeGraphSampleWaveformMinWindowFrames,
    Math.min(
      entry.frames,
      settings.timeWindowSeconds <= 0
        ? 1
        : Math.round(settings.timeWindowSeconds * (entry.sampleRate || 44100)),
    ),
  );
  const appliedSignature = nodeGraphSampleWaveformSettingsSignature(settings);
  const viewKey = nodeGraphSampleWaveformViewKey(nodeId, section);
  const lastAppliedSignature = nodeGraphSampleWaveformLastAppliedTimeWindow.get(viewKey);
  const settingsJustChanged = lastAppliedSignature !== appliedSignature;
  if (!autoScrollPaused) {
    nodeGraphSampleWaveformLastAppliedTimeWindow.set(viewKey, appliedSignature);
  }
  const windowFrames = (!autoScrollPaused && settingsJustChanged)
    ? settingsWindowFrames
    : Math.max(
      nodeGraphSampleWaveformMinWindowFrames,
      Math.round(Math.abs(state.endFrame - state.startFrame)) || settingsWindowFrames,
    );
  if (!autoScrollPaused) {
    if (settings.scrollMode === "smooth") {
      const idealStart = playheadFrame - windowFrames * scrollLineRatio;
      const view = nodeGraphSampleWaveformContinuousView(
        idealStart,
        windowFrames,
        entry.frames,
      );
      const spp = windowFrames / Math.max(1, width);
      const alignedStart = spp > 0
        ? Math.round(view.viewStart / spp) * spp
        : view.viewStart;
      state.startFrame = alignedStart;
      state.endFrame = alignedStart + windowFrames;
    } else {
      // "snap": only jump when the playhead has left the current window, or
      // the Time Window/Scroll Position settings just changed -- lands the
      // playhead at scrollLineRatio within the new window at the instant of
      // the jump, then holds that window still (no interpolation) until the
      // playhead exits it again.
      const outOfBounds = playheadFrame < state.startFrame || playheadFrame > state.endFrame;
      if (outOfBounds || settingsJustChanged) {
        const idealStart = playheadFrame - windowFrames * scrollLineRatio;
        const view = nodeGraphSampleWaveformContinuousView(
          idealStart,
          windowFrames,
          entry.frames,
        );
        const spp = windowFrames / Math.max(1, width);
        const alignedStart = spp > 0
          ? Math.round(view.viewStart / spp) * spp
          : view.viewStart;
        state.startFrame = alignedStart;
        state.endFrame = alignedStart + windowFrames;
      }
    }
  } else {
    // First offline paint / after settings change: seed a sensible window.
    if (settingsJustChanged || !(Math.abs(state.endFrame - state.startFrame) >= 1)) {
      state.startFrame = 0;
      state.endFrame = Math.min(entry.frames, settingsWindowFrames);
      nodeGraphSampleWaveformLastAppliedTimeWindow.set(viewKey, appliedSignature);
    }
    nodeGraphSampleWaveformClampWindow(state);
  }
  const viewStart = state.startFrame;
  const viewEnd = state.endFrame;
  const midY = height * 0.5;
  const amplitude = midY * 0.92;
  const viewSpan = Math.max(1e-9, viewEnd - viewStart);
  const frameToX = (frame) => ((frame - viewStart) / viewSpan) * width;

  // Start/End region (params start/end). Selection is the bright middle;
  // outside is dimmed after the trace so the effect is obvious.
  const loopStart = clampNodeSliderValue(nodeGraphFiniteNumber(node.params?.start), 0, 1) * entry.frames;
  const loopEnd = clampNodeSliderValue(nodeGraphFiniteNumber(node.params?.end, 1), 0, 1) * entry.frames;
  const regionX0 = clampNodeSliderValue(frameToX(Math.min(loopStart, loopEnd)), 0, width);
  const regionX1 = clampNodeSliderValue(frameToX(Math.max(loopStart, loopEnd)), 0, width);

  // Per-sample grid, once zoomed in enough that individual frames are
  // legible (roughly 6+ device pixels per sample) — makes the discrete
  // nature of the buffer visible instead of implying a continuous signal.
  // gridBrightness 0 = hidden; 1 = full (former top of 0…2 scale).
  const pixelsPerFrame = width / viewSpan;
  const gridBrightness = Math.max(0, Math.min(1, nodeGraphFiniteNumber(settings.gridBrightness)));
  const showSampleGrid = gridBrightness > 0.001 && pixelsPerFrame >= 6 * pixelRatio;

  const faceMinDevice = faceMinSide(width, height);
  const samples = nodeGraphSampleWaveformEntrySamples(entry);
  const spp = viewSpan / Math.max(1, width);
  const tapeCtx = nodeGraphSampleWaveformEnsureTape(state, width, height);
  const tapeSig = [
    width, height, windowFrames, entry.frames, node?.sample?.id || "",
    settings.hue, settings.lineBrightness, settings.backgroundHue,
    settings.backgroundBrightness, settings.traceWidth,
    node?.type === "wavetable2d"
      ? `${node?.params?.morph ?? 0}:${node?.params?.warp ?? 0}`
      : "",
  ].join(":");
  const fillStyle = nodeGraphSampleWaveformLineColor(settings, 85, 0.95);
  const plate = circuitRunning
    ? nodeGraphSampleWaveformBackgroundColor(settings)
    : (entry ? "hsl(140, 20%, 4%)" : "#050805");
  const paintStrip = (x0, x1, start) => {
    tapeCtx.fillStyle = plate;
    tapeCtx.fillRect(x0, 0, Math.max(0, x1 - x0), height);
    nodeGraphSampleWaveformPaintEnvelopeColumns(
      tapeCtx, samples, start, spp, x0, x1, height, midY, amplitude, fillStyle,
    );
  };
  const rebuildTape = () => {
    paintStrip(0, width, viewStart);
    state.tapeStart = viewStart;
    state.tapeSig = tapeSig;
  };
  if (!tapeCtx) {
    rebuildTape();
  } else if (state.tapeSig !== tapeSig || !Number.isFinite(state.tapeStart)) {
    rebuildTape();
  } else {
    const dx = Math.round((viewStart - state.tapeStart) / spp);
    if (dx === 0) {
      // History unchanged — do not redraw.
    } else if (Math.abs(dx) >= width) {
      rebuildTape();
    } else {
      tapeCtx.save();
      tapeCtx.setTransform(1, 0, 0, 1, 0, 0);
      tapeCtx.imageSmoothingEnabled = false;
      tapeCtx.globalCompositeOperation = "copy";
      tapeCtx.drawImage(state.waveTape, -dx, 0);
      tapeCtx.restore();
      if (dx > 0) {
        paintStrip(width - dx, width, viewStart);
      } else {
        paintStrip(0, -dx, viewStart);
      }
      state.tapeStart = viewStart;
    }
  }
  context.drawImage(state.waveTape, 0, 0);
  if (showSampleGrid) {
    const gridHue = Number.isFinite(Number(settings.hue)) ? Number(settings.hue) : 140;
    context.strokeStyle = typeof nodeGraphHueBrightnessCss === "function"
      ? nodeGraphHueBrightnessCss(gridHue, gridBrightness, 0.45)
      : nodeGraphSampleWaveformLineColor(settings, 68, 0.45);
    context.lineWidth = 1;
    context.beginPath();
    const firstFrame = Math.ceil(viewStart);
    const lastFrame = Math.floor(viewEnd);
    for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
      const x = Math.round(frameToX(frame)) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
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
    context.fillStyle = nodeGraphSampleWaveformLineColor(settings, 70, 0.06);
    context.fillRect(regionX0, 0, regionX1 - regionX0, height);
  }
  // Draggable Start / End handles (visible lines at region edges).
  {
    const handlePx = 1;
    context.shadowBlur = 0;
    context.lineCap = "butt";
    context.strokeStyle = "rgba(255, 220, 120, 0.95)";
    context.lineWidth = handlePx;
    context.beginPath();
    context.moveTo(regionX0, 0);
    context.lineTo(regionX0, height);
    context.moveTo(regionX1, 0);
    context.lineTo(regionX1, height);
    context.stroke();
    // Small top/bottom caps so the handles read as grab points.
    const cap = 4;
    context.fillStyle = "rgba(255, 220, 120, 0.95)";
    context.fillRect(regionX0 - handlePx * 1.5, 0, handlePx * 3, cap);
    context.fillRect(regionX0 - handlePx * 1.5, height - cap, handlePx * 3, cap);
    context.fillRect(regionX1 - handlePx * 1.5, 0, handlePx * 3, cap);
    context.fillRect(regionX1 - handlePx * 1.5, height - cap, handlePx * 3, cap);
  }

  // Playhead — scrollLineWidth CSS px @ zoom 1. 0 = hidden.
  // Offline: no playhead (static sample preview only).
  const scrollPx = faceInkPx(
    clampAuthoredInkPx(
      Number.isFinite(Number(settings.scrollLineWidth))
        ? settings.scrollLineWidth
        : nodeGraphSampleWaveformDefaultSettings.scrollLineWidth,
      2,
    ),
    faceMinDevice,
  );
  if (
    circuitRunning
    && scrollPx > 0
    && playheadFrame >= viewStart
    && playheadFrame <= viewEnd
  ) {
    const x = (!autoScrollPaused && settings.scrollMode === "smooth")
      ? Math.round(scrollLineRatio * width) + 0.5
      : Math.round(frameToX(playheadFrame)) + 0.5;
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = Math.max(0.5, scrollPx);
    context.lineCap = "butt";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  if (node?.type !== "wavetable2d") {
    const zoomRatio = (viewEnd - viewStart) / Math.max(1, state.totalFrames);
    nodeGraphSampleWaveformSyncZoomControl(section, zoomRatio);
    nodeGraphSampleWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings);
    nodeGraphSampleWaveformPaintCompanionPlaylist(section, nodeId);
  } else {
    nodeGraphWavetable2dSyncStrips(section);
  }
}

function nodeGraphSampleWaveformPaintCompanionPlaylist(section, nodeId) {
  if ((section?.dataset?.musicPlayerFace || "") !== "waveplay") {
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistPaintWaves === "function") {
    nodeGraphAudioPlayerPlaylistPaintWaves(nodeId, { liveOnly: true });
  }
  if (typeof nodeGraphAudioPlayerPlaylistSyncScrubber === "function") {
    nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
  }
}

function nodeGraphSampleWaveformPaintSpeedLabel(context, nodeId, node, width, height, pixelRatio, settings) {
  if (!context) {
    return;
  }
  // Face HUD is the rate the engine is actually using (param + Speed jack),
  // never the Speed metaparameter / slider readout.
  let speed = typeof nodeGraphAudioPlayerLiveSpeedForNode === "function"
    ? nodeGraphAudioPlayerLiveSpeedForNode(nodeId)
    : null;
  const hasSample = Boolean(node?.sample?.id);
  if (!Number.isFinite(speed) || (!hasSample && speed === 0)) {
    const paramSpeed = Number(node?.params?.speed);
    if (!Number.isFinite(paramSpeed)) {
      if (!Number.isFinite(speed)) {
        return;
      }
    } else {
      speed = paramSpeed;
    }
  }
  const speedLabel = `${speed.toFixed(3)}x`;
  const faceMin = faceMinSide(width, height);
  const fontUnit = settings && Number.isFinite(Number(settings.fontSize))
    ? Number(settings.fontSize)
    : nodeGraphSampleWaveformDefaultSettings.fontSize;
  const fontPx = Math.max(1, Math.round(faceInkPx(clampAuthoredInkPx(fontUnit, 11), faceMin)));
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  const labelUnit = settings && Number.isFinite(Number(settings.labelInset))
    ? Number(settings.labelInset)
    : nodeGraphSampleWaveformDefaultSettings.labelInset;
  const pad = faceFracPx(labelUnit, faceMin);
  const x = Math.round(width - pad);
  const y = Math.round(height - pad);
  context.textAlign = "right";
  context.textBaseline = "bottom";
  if (Math.abs(speed) < 1e-5) {
    const textW = context.measureText(speedLabel).width;
    const boxPad = Math.max(1, Math.round(fontPx * 0.2));
    context.fillStyle = "#FF0000";
    context.fillRect(
      Math.round(x - textW - boxPad),
      Math.round(y - fontPx - boxPad),
      Math.round(textW + boxPad * 2),
      Math.round(fontPx + boxPad * 2),
    );
  }
  context.fillStyle = nodeGraphSampleWaveformLineColor(settings, 85, 0.7);
  context.fillText(speedLabel, x, y);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}
