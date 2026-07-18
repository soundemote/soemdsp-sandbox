// Phosphor-style waveform display for the Music Player (audioPlayer) module.
//
// Reads the node's decoded sample buffer directly (nodeGraphMvp.sampleBuffers,
// keyed by node.sample.id) and draws a min/max-per-pixel envelope with a
// green-phosphor glow (layered shadowBlur passes, matching this project's
// scope-green aesthetic), plus a live playhead and the Start/End loop-region
// markers already present on the module. Zoom (wheel) and pan (drag) operate
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
});

function normalizeNodeGraphPhosphorWaveformSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const timeWindowSeconds = Number(source.timeWindowSeconds);
  const scrollLineWidth = Number(source.scrollLineWidth);
  const hue = Number(source.hue);
  const lineBrightness = Number(source.lineBrightness);
  const backgroundHue = Number(source.backgroundHue);
  const backgroundBrightness = Number(source.backgroundBrightness);
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

// Auto-scroll pauses for a moment after the user manually wheel-zooms or
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
function renderNodeGraphPhosphorWaveformSettingsWindow() {
  const nodeId = nodeGraphMvp.phosphorWaveformSettingsTargetNode;
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win || !nodeId) {
    return;
  }
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
}

function positionNodeGraphPhosphorWaveformSettingsAt(x, y) {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win) {
    return;
  }
  win.hidden = false;
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

function beginNodeGraphPhosphorWaveformSettingsDrag(event) {
  const win = document.getElementById("nodePhosphorWaveformSettingsWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "phosphorWaveformSettingsDragging");
}

function dragNodeGraphPhosphorWaveformSettings(event) {
  dragNodeGraphFloatingWindow(event, "phosphorWaveformSettingsDragging", document.getElementById("nodePhosphorWaveformSettingsWindow"));
}

function endNodeGraphPhosphorWaveformSettingsDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "phosphorWaveformSettingsDragging");
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
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY > 0 ? 1.25 : 0.8;
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

function scheduleNodeGraphPhosphorWaveformFrame(section) {
  if (!section.isConnected) {
    return;
  }
  if (nodeGraphPhosphorWaveformFrameReady(section.dataset.node)) {
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

function nodeGraphPhosphorWaveformMinMaxColumns(samples, startFrame, endFrame, columns) {
  const values = new Float32Array(columns * 2);
  const span = Math.max(1, endFrame - startFrame);
  const framesPerColumn = span / columns;
  const totalFrames = samples.length;
  for (let column = 0; column < columns; column += 1) {
    const rangeStart = Math.max(0, Math.floor(startFrame + column * framesPerColumn));
    const rangeEnd = Math.min(totalFrames, Math.max(rangeStart + 1, Math.ceil(startFrame + (column + 1) * framesPerColumn)));
    let min = Infinity;
    let max = -Infinity;
    for (let frame = rangeStart; frame < rangeEnd; frame += 1) {
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
  const scaledLightness = Math.max(0, Math.min(30, 2 * settings.backgroundBrightness));
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
  const rect = section.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  const cssWidth = Math.max(1, Number(section.clientWidth || section.offsetWidth || 0) || rect.width / zoom);
  const cssHeight = Math.max(1, Number(section.clientHeight || section.offsetHeight || 0) || rect.height / zoom);
  const canvasWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
  const canvasHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
  if (canvas.width !== canvasWidth) {
    canvas.width = canvasWidth;
  }
  if (canvas.height !== canvasHeight) {
    canvas.height = canvasHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  // Draw entirely in device-pixel space (no CSS-pixel transform) so every
  // coordinate can be snapped to a real physical pixel — a fractional
  // devicePixelRatio (1.25x/1.5x are common on Windows) would otherwise put
  // "half pixel" offsets at non-integer physical positions, forcing the
  // renderer to antialias/blur lines that should be crisp.
  context.setTransform(1, 0, 0, 1, 0, 0);
  const width = canvasWidth;
  const height = canvasHeight;
  const snap = (value) => Math.round(value);
  const crisp = (value) => Math.round(value) + 0.5;

  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
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
  const lastInteraction = nodeGraphPhosphorWaveformLastInteraction.get(nodeId) || 0;
  const autoScrollPaused = Date.now() - lastInteraction < nodeGraphPhosphorWaveformAutoScrollPauseMs;
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

function drawNodeGraphPhosphorWaveformDisplays() {
  document.querySelectorAll(".node-phosphor-waveform-display").forEach(drawNodeGraphPhosphorWaveformDisplay);
}
