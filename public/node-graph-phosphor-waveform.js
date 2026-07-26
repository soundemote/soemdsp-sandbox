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
// Low enough that even a narrow node canvas can zoom past the per-sample
// grid threshold below — "zoomed all the way in" should reliably reach it.
const nodeGraphPhosphorWaveformMinWindowFrames = 6;

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
  scrollLineWidth: 1.5,
  // Both color pairs default to the phosphor-green look this display
  // always had (hue ~140, a green), so an untouched node renders exactly
  // as before.
  hue: 140,
  lineBrightness: 1,
  backgroundHue: 140,
  backgroundBrightness: 1,
  // Panel shape/inset. cornerShape only has a visible effect once
  // cornerRadius > 0. edgeSpacing is a 0..1 ratio of the largest inset that
  // still leaves the panel visible, so 1 collapses it to nothing.
  // cornerRadius is a PERCENTAGE of the largest radius the panel can take
  // (half its shorter side), not a pixel count -- 100 is therefore fully
  // round whatever size the module is, and the value means the same thing to
  // both corner shapes so switching between them shows the curve difference
  // rather than a size difference.
  cornerShape: "square",
  cornerRadius: 0,
  edgeSpacing: 0.05,
});

function normalizeNodeGraphPhosphorWaveformSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const timeWindowSeconds = Number(source.timeWindowSeconds);
  const scrollLineWidth = Number(source.scrollLineWidth);
  const hue = Number(source.hue);
  const lineBrightness = Number(source.lineBrightness);
  const backgroundHue = Number(source.backgroundHue);
  const backgroundBrightness = Number(source.backgroundBrightness);
  const cornerRadius = Number(source.cornerRadius);
  const edgeSpacing = Number(source.edgeSpacing);
  return {
    scrollMode: source.scrollMode === "snap" ? "snap" : "smooth",
    timeWindowSeconds: Number.isFinite(timeWindowSeconds) && timeWindowSeconds > 0
      ? Math.max(0.05, Math.min(60, timeWindowSeconds))
      : nodeGraphPhosphorWaveformDefaultSettings.timeWindowSeconds,
    scrollLinePosition: Object.hasOwn(nodeGraphPhosphorWaveformScrollLinePositionRatios, source.scrollLinePosition)
      ? source.scrollLinePosition
      : nodeGraphPhosphorWaveformDefaultSettings.scrollLinePosition,
    scrollLineWidth: Number.isFinite(scrollLineWidth) && scrollLineWidth > 0
      ? Math.max(0.5, Math.min(8, scrollLineWidth))
      : nodeGraphPhosphorWaveformDefaultSettings.scrollLineWidth,
    hue: Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : nodeGraphPhosphorWaveformDefaultSettings.hue,
    lineBrightness: Number.isFinite(lineBrightness)
      ? Math.max(0, Math.min(2, lineBrightness))
      : nodeGraphPhosphorWaveformDefaultSettings.lineBrightness,
    backgroundHue: Number.isFinite(backgroundHue)
      ? ((backgroundHue % 360) + 360) % 360
      : nodeGraphPhosphorWaveformDefaultSettings.backgroundHue,
    backgroundBrightness: Number.isFinite(backgroundBrightness)
      ? Math.max(0, Math.min(2, backgroundBrightness))
      : nodeGraphPhosphorWaveformDefaultSettings.backgroundBrightness,
    cornerShape: source.cornerShape === "squircle" ? "squircle" : "square",
    cornerRadius: Number.isFinite(cornerRadius)
      ? Math.max(0, Math.min(100, cornerRadius))
      : nodeGraphPhosphorWaveformDefaultSettings.cornerRadius,
    edgeSpacing: Number.isFinite(edgeSpacing)
      ? Math.max(0, Math.min(1, edgeSpacing))
      : nodeGraphPhosphorWaveformDefaultSettings.edgeSpacing,
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

// Tracks the last Time Window value (seconds) auto-scroll actually applied
// per node, so it can tell "the setting just changed" apart from "still
// the same setting as last frame" -- see the draw loop below.
const nodeGraphPhosphorWaveformLastAppliedTimeWindow = new Map();

function nodeGraphPhosphorWaveformMarkInteraction(nodeId) {
  nodeGraphPhosphorWaveformLastInteraction.set(nodeId, Date.now());
}

// Right-click "waveform display options" window -- deliberately a fully
// independent floating window (own drag state, own position, no
// persistence), NOT part of the shared-inspector displacement system that
// metadata/module-actions/trace-display-settings use to auto-close each
// other -- opening this must never close anything else, and nothing else
// should close it either.
// The 📂 + path box in this window is the very same widget the Music Player
// carries on its face -- built by createNodeGraphSamplePathLoader so there is
// one implementation of "load a sample into this node", not two that drift.
// Rebuilt only when the window switches to a different node (its listeners
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

function renderNodeGraphPhosphorWaveformSettingsWindow() {
  const nodeId = nodeGraphMvp.phosphorWaveformSettingsTargetNode;
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win || !nodeId) {
    return;
  }
  renderNodeGraphPhosphorWaveformSampleLoader(nodeId);
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
  const setValueUnlessFocused = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setValueUnlessFocused("nodePhosphorWaveformTimeWindowInput", settings.timeWindowSeconds);
  setValueUnlessFocused("nodePhosphorWaveformLineWidthInput", settings.scrollLineWidth);
  setValueUnlessFocused("nodePhosphorWaveformHueInput", settings.hue);
  setValueUnlessFocused("nodePhosphorWaveformLineBrightnessInput", settings.lineBrightness);
  setValueUnlessFocused("nodePhosphorWaveformBackgroundHueInput", settings.backgroundHue);
  setValueUnlessFocused("nodePhosphorWaveformBackgroundBrightnessInput", settings.backgroundBrightness);
  setValueUnlessFocused("nodePhosphorWaveformCornerRadiusInput", settings.cornerRadius);
  setValueUnlessFocused("nodePhosphorWaveformEdgeSpacingInput", settings.edgeSpacing);
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

function openNodeGraphPhosphorWaveformSettings(nodeId, event) {
  if (!nodeGraphPatchNode(nodeId)) {
    return false;
  }
  nodeGraphMvp.phosphorWaveformSettingsTargetNode = nodeId;
  renderNodeGraphPhosphorWaveformSettingsWindow();
  positionNodeGraphPhosphorWaveformSettingsAt(
    Number.isFinite(Number(event?.clientX)) ? event.clientX : window.innerWidth / 2,
    Number.isFinite(Number(event?.clientY)) ? event.clientY : window.innerHeight / 2,
  );
  return true;
}

function closeNodeGraphPhosphorWaveformSettings() {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (win) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("phosphorWaveformSettings", win, { open: false }, { status: false });
    }
    win.hidden = true;
  }
  nodeGraphMvp.phosphorWaveformSettingsTargetNode = null;
}

function updateNodeGraphPhosphorWaveformSettings(patch) {
  const nodeId = nodeGraphMvp.phosphorWaveformSettingsTargetNode;
  if (!nodeId) {
    return;
  }
  const clonedPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = clonedPatch.nodes.find((node) => node.id === nodeId);
  if (!targetNode) {
    return;
  }
  const current = normalizeNodeGraphPhosphorWaveformSettings(targetNode.phosphorWaveformSettings);
  targetNode.phosphorWaveformSettings = normalizeNodeGraphPhosphorWaveformSettings({ ...current, ...patch });
  commitNodeGraphPatch(clonedPatch, { status: "waveform display options changed" });
  renderNodeGraphPhosphorWaveformSettingsWindow();
}

function handleNodeGraphPhosphorWaveformTimeWindowChange(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value <= 0) {
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
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  updateNodeGraphPhosphorWaveformSettings({ scrollLineWidth: value });
}

function handleNodeGraphPhosphorWaveformHueChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ hue: Number(event.target.value) });
}

function handleNodeGraphPhosphorWaveformLineBrightnessChange(event) {
  updateNodeGraphPhosphorWaveformSettings({ lineBrightness: Number(event.target.value) });
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

// Panel shape/inset are pure CSS, but the inset has to be resolved against the
// live cell size (so "1" really does collapse the panel whatever the module
// height is) and quantized to whole pixels (so the black gap and the panel
// edge both land on a device pixel and stay razor sharp -- a fractional inset
// would give a soft, half-lit edge). Called from the draw path, which already
// runs per section per frame and has the measured size to hand.
function applyNodeGraphPhosphorWaveformPanelShape(section, settings, cellWidth, cellHeight) {
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
  // default hue (140) this is visually unchanged.
  const borderColor = `hsl(${Math.round(settings.backgroundHue)} 100% 68% / 0.16)`;
  const next = `${inset}|${radius}|${shape}|${borderColor}`;
  if (section.dataset.panelShape === next) {
    return;
  }
  section.dataset.panelShape = next;
  section.style.setProperty("--phosphor-waveform-inset", `${inset}px`);
  section.style.setProperty("--phosphor-waveform-radius", `${radius}px`);
  section.style.setProperty("--phosphor-waveform-border-color", borderColor);
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
  ["nodePhosphorWaveformHueInput", "hue"],
  ["nodePhosphorWaveformLineBrightnessInput", "lineBrightness"],
  ["nodePhosphorWaveformBackgroundHueInput", "backgroundHue"],
  ["nodePhosphorWaveformBackgroundBrightnessInput", "backgroundBrightness"],
  ["nodePhosphorWaveformCornerRadiusInput", "cornerRadius"],
  ["nodePhosphorWaveformEdgeSpacingInput", "edgeSpacing"],
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

// Time Window is read-only until double-clicked, same gesture as the render
// range Start/End fields and the Music Player path box.
function bindNodeGraphPhosphorWaveformTimeWindowEditing() {
  const input = document.getElementById("nodePhosphorWaveformTimeWindowInput");
  if (!input || input.dataset.dblClickBound === "true") {
    return;
  }
  input.dataset.dblClickBound = "true";
  input.readOnly = true;
  input.addEventListener("dblclick", () => {
    input.readOnly = false;
    input.classList.add("editing");
    input.focus();
    input.select();
  });
  input.addEventListener("blur", () => {
    input.readOnly = true;
    input.classList.remove("editing");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      input.blur();
    }
  });
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
  state.startFrame = Math.max(0, Math.min(state.totalFrames - width, state.startFrame));
  state.endFrame = state.startFrame + width;
}

function nodeGraphPhosphorWaveformSampleEntry(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  const sampleId = node?.sample?.id;
  if (!sampleId) {
    return null;
  }
  const entry = nodeGraphMvp?.sampleBuffers?.get?.(sampleId);
  return entry && entry.samples && entry.frames > 0 ? entry : null;
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
  nodeGraphPhosphorWaveformMarkInteraction(nodeId);
  nodeGraphPhosphorWaveformResyncFrameClock(nodeId);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

function bindNodeGraphPhosphorWaveformInteractions(section, canvas) {
  canvas.style.touchAction = "none";
  // Plain wheel is left alone so it bubbles to the workspace zoom handler --
  // the Music Player must not be a dead zone you cannot zoom the canvas over,
  // which is what swallowing every wheel event here used to make it. Waveform
  // zoom moves to Shift+wheel. (Shift is the safe modifier: Ctrl+wheel is
  // browser page zoom.) Browsers translate Shift+wheel into horizontal scroll
  // on most platforms, so the delta can arrive on deltaX instead of deltaY.
  canvas.addEventListener("wheel", (event) => {
    if (!event.shiftKey) {
      return;
    }
    const delta = event.deltaY || event.deltaX;
    if (!delta) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const factor = delta > 0 ? 1.25 : 0.8;
    nodeGraphPhosphorWaveformZoomAt(section, canvas, event.clientX, factor);
  }, { passive: false });

  let dragPointerId = null;
  let lastClientX = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== undefined) {
      return;
    }
    dragPointerId = event.pointerId;
    lastClientX = event.clientX;
    canvas.setPointerCapture?.(dragPointerId);
    canvas.classList.add("dragging");
    event.stopPropagation();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) {
      return;
    }
    const deltaX = event.clientX - lastClientX;
    lastClientX = event.clientX;
    nodeGraphPhosphorWaveformPanBy(section, deltaX, canvas.clientWidth || canvas.width);
    event.stopPropagation();
  });
  const endDrag = (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) {
      return;
    }
    canvas.releasePointerCapture?.(dragPointerId);
    dragPointerId = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", (event) => {
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
  section.className = "node-phosphor-waveform-display";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  section.setAttribute("aria-label", `${nodeGraphNodeDisplayName?.(nodeId) || "Music Player"} phosphor waveform display`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-phosphor-waveform-canvas";
  section.append(canvas);
  bindNodeGraphPhosphorWaveformInteractions(section, canvas);
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

function nodeGraphPhosphorWaveformMinMaxColumns(samples, startFrame, endFrame, columns) {
  const values = new Float32Array(columns * 2);
  const span = Math.max(1, endFrame - startFrame);
  const framesPerColumn = span / columns;
  const totalFrames = samples.length;
  const stride = Math.max(1, Math.floor(framesPerColumn / nodeGraphPhosphorWaveformMaxSamplesPerColumn));
  for (let column = 0; column < columns; column += 1) {
    const rangeStart = Math.max(0, Math.floor(startFrame + column * framesPerColumn));
    const rangeEnd = Math.min(totalFrames, Math.max(rangeStart + 1, Math.ceil(startFrame + (column + 1) * framesPerColumn)));
    let min = Infinity;
    let max = -Infinity;
    for (let frame = rangeStart; frame < rangeEnd; frame += stride) {
      const value = samples[frame];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (min > max) {
      min = 0;
      max = 0;
    }
    values[column * 2] = min;
    values[column * 2 + 1] = max;
  }
  return values;
}

// Every "line family" color (loop shading, sample grid, envelope glow/core,
// placeholder text, zoom label) is this same hue at a different base
// lightness -- settings.hue shifts the whole palette together, and
// settings.lineBrightness scales every one of those base lightness values
// by the same factor, preserving their relative contrast to each other.
function nodeGraphPhosphorWaveformLineColor(settings, lightness, alpha) {
  const scaledLightness = Math.max(0, Math.min(100, lightness * settings.lineBrightness));
  return `hsla(${settings.hue}, 90%, ${scaledLightness}%, ${alpha})`;
}

function nodeGraphPhosphorWaveformBackgroundColor(settings) {
  // Brightness 0..2 maps onto 0..100% lightness so the top of the slider is
  // actually white. The curve is exponential rather than linear because the
  // useful range is all down at the dark end: a linear ramp to white would
  // make every setting past the first few percent unusably bright. The
  // exponent is picked so the default (1) still lands at ~8.8%, which is
  // where the old `8 * brightness` mapping put it -- high enough that
  // rotating BG Hue produces a visible change.
  const normalized = Math.max(0, Math.min(1, settings.backgroundBrightness / 2));
  const scaledLightness = Math.max(0, Math.min(100, 100 * (normalized ** 3.5)));
  return `hsl(${settings.backgroundHue}, 70%, ${scaledLightness}%)`;
}

function drawNodeGraphPhosphorWaveformPlaceholder(context, width, height, message, pixelRatio, settings) {
  context.fillStyle = nodeGraphPhosphorWaveformLineColor(settings, 57, 0.55);
  context.font = `600 ${Math.round(11 * pixelRatio)}px system-ui, sans-serif`;
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
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
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
  );
  // Measure the CANVAS, not the section: the section is the full cell, the
  // canvas is what actually displays the bitmap, so its box is what the
  // backing store has to match or the browser scales the difference away
  // (that is what made the waveform and its "No sample loaded" text grow and
  // shrink with Edge Spacing).
  const metrics = nodeGraphSizeDisplayCanvas(canvas, canvas);
  if (!metrics) {
    return;
  }
  const { context, cssHeight, cssWidth, height, pixelRatio, width } = metrics;
  // Draw entirely in device-pixel space (no CSS-pixel transform) so every
  // coordinate can be snapped to a real physical pixel — a fractional
  // devicePixelRatio (1.25x/1.5x are common on Windows) would otherwise put
  // "half pixel" offsets at non-integer physical positions, forcing the
  // renderer to antialias/blur lines that should be crisp.
  context.setTransform(1, 0, 0, 1, 0, 0);
  const snap = (value) => Math.round(value);
  const crisp = (value) => Math.round(value) + 0.5;

  context.clearRect(0, 0, width, height);
  context.fillStyle = nodeGraphPhosphorWaveformBackgroundColor(settings);
  context.fillRect(0, 0, width, height);

  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry) {
    drawNodeGraphPhosphorWaveformPlaceholder(context, width, height, "No sample loaded", pixelRatio, settings);
    return;
  }

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
  const autoScrollPaused = settings.scrollMode === "snap" &&
    Date.now() - lastInteraction < nodeGraphPhosphorWaveformAutoScrollPauseMs;
  if (!autoScrollPaused) {
    // Only re-derive the window width from the Time Window setting when
    // that setting itself just changed (including the first time
    // auto-scroll engages for this node) -- otherwise keep whatever width
    // is already in the view state. Without this, every auto-scroll frame
    // would force width back to the configured seconds, silently undoing
    // any manual wheel-zoom the instant the post-interaction pause above
    // elapsed (reported as "zooming in un-zooms me").
    const settingsWindowFrames = Math.max(
      nodeGraphPhosphorWaveformMinWindowFrames,
      Math.min(entry.frames, settings.timeWindowSeconds * (entry.sampleRate || 44100)),
    );
    const appliedSignature = `${settings.timeWindowSeconds}:${settings.scrollLinePosition}`;
    const lastAppliedSignature = nodeGraphPhosphorWaveformLastAppliedTimeWindow.get(nodeId);
    const settingsJustChanged = lastAppliedSignature !== appliedSignature;
    nodeGraphPhosphorWaveformLastAppliedTimeWindow.set(nodeId, appliedSignature);
    const windowFrames = settingsJustChanged
      ? settingsWindowFrames
      : Math.max(nodeGraphPhosphorWaveformMinWindowFrames, state.endFrame - state.startFrame);
    if (settings.scrollMode === "smooth") {
      // Keep the playhead anchored at scrollLineRatio every frame --
      // continuous, gradual motion since it only moves as far as phase
      // advanced since the last animation frame.
      state.startFrame = playheadFrame - windowFrames * scrollLineRatio;
      state.endFrame = state.startFrame + windowFrames;
    } else {
      // "snap": only jump when the playhead has left the current window, or
      // the Time Window/Scroll Position settings just changed -- lands the
      // playhead at scrollLineRatio within the new window at the instant of
      // the jump, then holds that window still (no interpolation) until the
      // playhead exits it again.
      const outOfBounds = playheadFrame < state.startFrame || playheadFrame > state.endFrame;
      if (outOfBounds || settingsJustChanged) {
        state.startFrame = playheadFrame - windowFrames * scrollLineRatio;
        state.endFrame = state.startFrame + windowFrames;
      }
    }
  }
  nodeGraphPhosphorWaveformClampWindow(state);
  const columns = width;
  const minMax = nodeGraphPhosphorWaveformMinMaxColumns(entry.samples, state.startFrame, state.endFrame, columns);
  const midY = height / 2;
  const amplitude = midY * 0.92;

  // Start/End loop-region shading, reusing the module's existing Start/End params.
  const loopStart = clampNodeSliderValue(Number(node.params?.start) || 0, 0, 1) * entry.frames;
  const loopEnd = clampNodeSliderValue(Number(node.params?.end) || 1, 0, 1) * entry.frames;
  const frameToX = (frame) => ((frame - state.startFrame) / Math.max(1, state.endFrame - state.startFrame)) * width;
  const regionX0 = snap(clampNodeSliderValue(frameToX(loopStart), 0, width));
  const regionX1 = snap(clampNodeSliderValue(frameToX(loopEnd), 0, width));
  if (regionX1 > regionX0) {
    context.fillStyle = nodeGraphPhosphorWaveformLineColor(settings, 57, 0.08);
    context.fillRect(regionX0, 0, regionX1 - regionX0, height);
  }

  // Per-sample grid, once zoomed in enough that individual frames are
  // legible (roughly 6+ device pixels per sample) — makes the discrete
  // nature of the buffer visible instead of implying a continuous signal.
  const pixelsPerFrame = width / Math.max(1, state.endFrame - state.startFrame);
  const showSampleGrid = pixelsPerFrame >= 6 * pixelRatio;
  if (showSampleGrid) {
    context.strokeStyle = nodeGraphPhosphorWaveformLineColor(settings, 68, 0.14);
    context.lineWidth = 1;
    context.beginPath();
    const firstFrame = Math.ceil(state.startFrame);
    const lastFrame = Math.floor(state.endFrame);
    for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
      const x = crisp(frameToX(frame));
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.stroke();
  }

  // Phosphor glow: a wide blurred pass beneath a sharp core pass. Every
  // column is one exact device pixel, so the core stroke lands crisp.
  const drawEnvelope = (glow) => {
    context.beginPath();
    for (let x = 0; x < columns; x += 1) {
      const min = minMax[x * 2];
      const max = minMax[x * 2 + 1];
      const yTop = snap(midY - max * amplitude);
      const yBottom = snap(midY - min * amplitude);
      const lineX = x + 0.5;
      context.moveTo(lineX, yTop);
      context.lineTo(lineX, Math.max(yTop + 1, yBottom));
    }
    if (glow) {
      context.shadowBlur = 8 * pixelRatio;
      context.shadowColor = nodeGraphPhosphorWaveformLineColor(settings, 68, 0.85);
      context.strokeStyle = nodeGraphPhosphorWaveformLineColor(settings, 68, 0.35);
      context.lineWidth = 2.5 * pixelRatio;
    } else {
      context.shadowBlur = 0;
      context.strokeStyle = nodeGraphPhosphorWaveformLineColor(settings, 85, 0.95);
      context.lineWidth = 1;
    }
    context.stroke();
  };
  drawEnvelope(true);
  drawEnvelope(false);
  context.shadowBlur = 0;

  // Playhead (phase/playheadFrame computed earlier, ahead of the
  // auto-scroll decision above).
  if (playheadFrame >= state.startFrame && playheadFrame <= state.endFrame) {
    const x = crisp(frameToX(playheadFrame));
    context.shadowBlur = 6 * pixelRatio;
    context.shadowColor = "rgba(255, 255, 255, 0.9)";
    context.strokeStyle = "rgba(255, 255, 255, 0.85)";
    context.lineWidth = settings.scrollLineWidth * pixelRatio;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.shadowBlur = 0;
  }

  const zoomRatio = (state.endFrame - state.startFrame) / Math.max(1, state.totalFrames);
  context.fillStyle = nodeGraphPhosphorWaveformLineColor(settings, 85, 0.7);
  context.font = `600 ${Math.round(10 * pixelRatio)}px system-ui, sans-serif`;
  context.fillText(`${(zoomRatio * 100).toFixed(zoomRatio < 0.1 ? 1 : 0)}%`, snap(6 * pixelRatio), snap(13 * pixelRatio));
}
