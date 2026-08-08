// Scope draw orchestrator extracted from node-graph-module-scopes.js (Phase D).
// Typed-item dispatch, face draws, main draw pass, RAF schedule.
// Load AFTER node-graph-module-scopes.js (helpers stay there). Extract-only.

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

/** Knob face = macro dial + live Bias (modulated), not static param meta. */
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
  // Lit when macro dial is showing or image art is loaded.
  const lit = face.classList?.contains("has-image") || face.classList?.contains("node-knob-module-macro");
  if (typeof nodeGraphKnobFaceSyncLightSource === "function") {
    nodeGraphKnobFaceSyncLightSource(face, lit);
  } else {
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
