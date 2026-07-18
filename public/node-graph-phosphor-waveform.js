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
const nodeGraphPhosphorWaveformDefaultSettings = Object.freeze({
  scrollMode: "smooth",
  timeWindowSeconds: 2,
});

function normalizeNodeGraphPhosphorWaveformSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const timeWindowSeconds = Number(source.timeWindowSeconds);
  return {
    scrollMode: source.scrollMode === "snap" ? "snap" : "smooth",
    timeWindowSeconds: Number.isFinite(timeWindowSeconds) && timeWindowSeconds > 0
      ? Math.max(0.05, Math.min(60, timeWindowSeconds))
      : nodeGraphPhosphorWaveformDefaultSettings.timeWindowSeconds,
  };
}

function nodeGraphPhosphorWaveformSettingsForNode(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  return normalizeNodeGraphPhosphorWaveformSettings(node?.phosphorWaveformSettings);
}

// Auto-scroll pauses for a moment after the user manually wheel-zooms or
// drags the display, so it doesn't immediately yank the view back out from
// under their hands -- refreshed on every zoom/pan call, so a held drag
// keeps postponing it continuously.
const nodeGraphPhosphorWaveformLastInteraction = new Map();
const nodeGraphPhosphorWaveformAutoScrollPauseMs = 800;

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
  const input = document.getElementById("nodePhosphorWaveformTimeWindowInput");
  if (input && document.activeElement !== input) {
    input.value = String(settings.timeWindowSeconds);
  }
  const smoothButton = document.getElementById("nodePhosphorWaveformScrollSmoothButton");
  const snapButton = document.getElementById("nodePhosphorWaveformScrollSnapButton");
  if (smoothButton) {
    const active = settings.scrollMode === "smooth";
    smoothButton.classList.toggle("active", active);
    smoothButton.setAttribute("aria-pressed", String(active));
  }
  if (snapButton) {
    const active = settings.scrollMode === "snap";
    snapButton.classList.toggle("active", active);
    snapButton.setAttribute("aria-pressed", String(active));
  }
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
  const entry = nodeGraphPhosphorWaveformSampleEntry(section.dataset.node);
  if (!entry) {
    return;
  }
  const state = nodeGraphPhosphorWaveformViewState(section.dataset.node, entry.frames);
  const rect = canvas.getBoundingClientRect();
  const ratio = rect.width > 0 ? clampNodeSliderValue((clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const anchorFrame = state.startFrame + ratio * (state.endFrame - state.startFrame);
  const width = state.endFrame - state.startFrame;
  const newWidth = Math.max(
    nodeGraphPhosphorWaveformMinWindowFrames,
    Math.min(state.totalFrames, width * factor),
  );
  state.startFrame = anchorFrame - ratio * newWidth;
  state.endFrame = state.startFrame + newWidth;
  nodeGraphPhosphorWaveformClampWindow(state);
  nodeGraphPhosphorWaveformMarkInteraction(section.dataset.node);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

function nodeGraphPhosphorWaveformPanBy(section, deltaPixels, canvasWidth) {
  const entry = nodeGraphPhosphorWaveformSampleEntry(section.dataset.node);
  if (!entry || canvasWidth <= 0) {
    return;
  }
  const state = nodeGraphPhosphorWaveformViewState(section.dataset.node, entry.frames);
  const framesPerPixel = (state.endFrame - state.startFrame) / canvasWidth;
  state.startFrame -= deltaPixels * framesPerPixel;
  state.endFrame -= deltaPixels * framesPerPixel;
  nodeGraphPhosphorWaveformClampWindow(state);
  nodeGraphPhosphorWaveformMarkInteraction(section.dataset.node);
  drawNodeGraphPhosphorWaveformDisplay(section);
}

function nodeGraphPhosphorWaveformResetZoom(section) {
  const entry = nodeGraphPhosphorWaveformSampleEntry(section.dataset.node);
  if (!entry) {
    return;
  }
  nodeGraphPhosphorWaveformViewStates.set(section.dataset.node, {
    endFrame: entry.frames,
    startFrame: 0,
    totalFrames: entry.frames,
  });
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

function scheduleNodeGraphPhosphorWaveformFrame(section) {
  if (!section.isConnected) {
    return;
  }
  drawNodeGraphPhosphorWaveformDisplay(section);
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

function drawNodeGraphPhosphorWaveformPlaceholder(context, width, height, message, pixelRatio = 1) {
  context.fillStyle = "rgba(70, 220, 140, 0.55)";
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

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#020a06";
  context.fillRect(0, 0, width, height);

  const entry = nodeGraphPhosphorWaveformSampleEntry(nodeId);
  if (!entry) {
    drawNodeGraphPhosphorWaveformPlaceholder(context, width, height, "No sample loaded", pixelRatio);
    return;
  }

  const state = nodeGraphPhosphorWaveformViewState(nodeId, entry.frames);
  const phase = typeof nodeGraphSamplePhaseForNode === "function" ? nodeGraphSamplePhaseForNode(nodeId) : 0;
  const playheadFrame = phase * entry.frames;
  const settings = nodeGraphPhosphorWaveformSettingsForNode(nodeId);
  const lastInteraction = nodeGraphPhosphorWaveformLastInteraction.get(nodeId) || 0;
  const autoScrollPaused = Date.now() - lastInteraction < nodeGraphPhosphorWaveformAutoScrollPauseMs;
  if (!autoScrollPaused) {
    const windowFrames = Math.max(
      nodeGraphPhosphorWaveformMinWindowFrames,
      Math.min(entry.frames, settings.timeWindowSeconds * (entry.sampleRate || 44100)),
    );
    if (settings.scrollMode === "smooth") {
      // Keep the playhead centered every frame -- continuous, gradual
      // motion since it only moves as far as phase advanced since the
      // last animation frame.
      state.startFrame = playheadFrame - windowFrames / 2;
      state.endFrame = state.startFrame + windowFrames;
    } else {
      // "snap": only jump when the playhead has left the current page, or
      // the window width no longer matches the configured time window
      // (e.g. right after changing it) -- lands on the page-aligned
      // window containing the playhead, no interpolation.
      const currentWidth = state.endFrame - state.startFrame;
      const outOfBounds = playheadFrame < state.startFrame || playheadFrame > state.endFrame;
      if (outOfBounds || Math.round(currentWidth) !== Math.round(windowFrames)) {
        const page = Math.floor(playheadFrame / windowFrames);
        state.startFrame = page * windowFrames;
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
    context.fillStyle = "rgba(70, 220, 140, 0.08)";
    context.fillRect(regionX0, 0, regionX1 - regionX0, height);
  }

  // Per-sample grid, once zoomed in enough that individual frames are
  // legible (roughly 6+ device pixels per sample) — makes the discrete
  // nature of the buffer visible instead of implying a continuous signal.
  const pixelsPerFrame = width / Math.max(1, state.endFrame - state.startFrame);
  const showSampleGrid = pixelsPerFrame >= 6 * pixelRatio;
  if (showSampleGrid) {
    context.strokeStyle = "rgba(90, 255, 150, 0.14)";
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
      context.shadowColor = "rgba(90, 255, 150, 0.85)";
      context.strokeStyle = "rgba(90, 255, 150, 0.35)";
      context.lineWidth = 2.5 * pixelRatio;
    } else {
      context.shadowBlur = 0;
      context.strokeStyle = "rgba(180, 255, 210, 0.95)";
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
    context.lineWidth = 1.5 * pixelRatio;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.shadowBlur = 0;
  }

  const zoomRatio = (state.endFrame - state.startFrame) / Math.max(1, state.totalFrames);
  context.fillStyle = "rgba(180, 255, 210, 0.7)";
  context.font = `600 ${Math.round(10 * pixelRatio)}px system-ui, sans-serif`;
  context.fillText(`${(zoomRatio * 100).toFixed(zoomRatio < 0.1 ? 1 : 0)}%`, snap(6 * pixelRatio), snap(13 * pixelRatio));
}

function drawNodeGraphPhosphorWaveformDisplays() {
  document.querySelectorAll(".node-phosphor-waveform-display").forEach(drawNodeGraphPhosphorWaveformDisplay);
}
