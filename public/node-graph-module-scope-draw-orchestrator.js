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
  dot: drawNodeGraphVectorDotItem,
  vectorDot: drawNodeGraphVectorDotItem,
  pulseDot: drawNodeGraphVectorDotItem,
  lcdDot: drawNodeGraphVectorDotItem,
  value: drawNodeGraphValueOscilloscopeItem,
  lineBurn: drawNodeGraphLineBurnOscilloscopeItem,
  hypersawBurn: drawNodeGraphHypersawBurnItem,
  scope2dTrace: drawNodeGraphScope2dTraceItem,
  scope2d: drawNodeGraphScope2dItem,
  numberReadout: drawNodeGraphNumberReadoutItem,
  customDisplay: drawNodeGraphCustomDisplayItem,
  phosphorWaveform: () => {},
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
  momentaryButtonFace: (renderer, item) => {
    item?.screenElement?.syncFromParameters?.();
  },
  keypadFace: () => {},
  portalFace: () => {},
  roundShapeFace: () => {},
  basicShapeFace: () => {},
  textBoxFace: () => {},
  // oscilloscopeBankBurn self-registers from
  // public/modules/oscilloscopeBank/oscilloscope-bank-display.js
  // videoscopeBurn self-registers from
  // public/modules/videoscope/videoscope-display.js
  // limiterGainFace self-registers from
  // public/modules/lookaheadLimiter/lookahead-limiter-display.js
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

/**
 * Keep the RAF paint loop alive while the circuit is live.
 * Several early-outs (trace signature skip, transient layout, etc.) used to
 * return without rescheduling — then scopes only updated on zoom/pan/events.
 * Init Music Player + Output is all Trace faces, so the signature skip was a
 * hard stall for the whole default patch.
 */
function nodeGraphModuleScopeKeepDrawLoopAlive(scopePaused = false) {
  if (scopePaused) {
    return;
  }
  if (typeof scopePaintKeepLoopAlive === "function") {
    scopePaintKeepLoopAlive();
    return;
  }
  if (typeof scopePaintShouldKeepLoop === "function") {
    if (!scopePaintShouldKeepLoop()) {
      return;
    }
  } else if (typeof nodeGraphModuleScopeLivePaintActive === "function") {
    if (!nodeGraphModuleScopeLivePaintActive()) {
      return;
    }
  } else if (typeof nodeGraphModuleScopePaused === "function" && nodeGraphModuleScopePaused()) {
    return;
  }
  if (!nodeGraphModuleScopeHasDrawableSlots()) {
    return;
  }
  scheduleNodeGraphModuleScopeDraw();
}

/**
 * Idle plate for Trace/Output faces without a full live capture pass.
 * Used while paused (so Display Settings background still updates) and when
 * capture rings are empty (so faces are never pure black under the dimmer).
 */
function paintNodeGraphModuleScopeColdPlatesOnly(pixelRatio = window.devicePixelRatio || 1, options = {}) {
  const force = options?.force === true;
  // Pause/freeze: held face pixels (LCD / trace / phosphor) must survive
  // incidental draws from module move/resize/wire redraw. Only an explicit
  // force (Clear, Display Settings) may overwrite the plate.
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen());
  if (frozen && !force) {
    return;
  }
  if (typeof nodeGraphVisibleModuleScopeSlots !== "function") {
    return;
  }
  if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
    paintNodeGraphRasterRgbFacesNow(pixelRatio);
  }
  if (typeof paintNodeGraphTraceDisplayColdPlate !== "function") {
    return;
  }
  for (const slot of nodeGraphVisibleModuleScopeSlots()) {
    const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
      ? nodeGraphModuleDisplayRendererForSlot(slot)
      : "";
    if (renderer === "rasterRgbFace" || slot?.type === "rasterRgb") {
      continue;
    }
    if (
      renderer !== "trace"
      && renderer !== "dot"
      && renderer !== "value"
      && renderer !== "lineBurn"
      && slot?.type !== "output"
      && slot?.type !== "pluginOutput"
    ) {
      continue;
    }
    paintNodeGraphTraceDisplayColdPlate(slot, pixelRatio, { force });
    if (slot?.scopeElement && typeof nodeGraphModuleScopeMarkScreenLit === "function") {
      nodeGraphModuleScopeMarkScreenLit(slot.scopeElement, 1);
    }
  }
}

function drawNodeGraphModuleScopes(options = {}) {
  const force = options?.force === true;
  const debug = setNodeGraphModuleScopeDebugPhase("enter", {
    drawAttempts: (Number(nodeGraphModuleScopeState.renderDebug?.drawAttempts) || 0) + 1,
    lastFrameStartMs: nodeGraphModuleScopeNowMs(),
    zoom: nodeGraphModuleScopeZoomScale(),
  });
  const animationTimeEarly = (performance.now?.() || Date.now()) / 1000;
  nodeGraphModuleScopeState.animationTime = animationTimeEarly;
  if (!force && nodeGraphModuleScopeState?.idleHold) {
    markNodeGraphModuleScopeDebugSkip("idle-hold");
    return;
  }
  // Sim FPS gate BEFORE layout/collect. Immediate rAF-on-miss + the 100 ms
  // watchdog stacked extra draws when a frame already overran the budget.
  if (!force && typeof nodeGraphModuleScopePhosphorFrameReady === "function"
    && !nodeGraphModuleScopePhosphorFrameReady()) {
    setNodeGraphModuleScopeDebugPhase("fps-gate");
    markNodeGraphModuleScopeDebugSkip("fps-gate");
    if (typeof scopePaintShouldKeepLoop === "function" ? scopePaintShouldKeepLoop() : true) {
      scheduleNodeGraphModuleScopeDrawAfterSimClock();
    }
    return;
  }
  const canvas = nodeGraphModuleScopeCanvas();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!nodeGraphModuleScopeHasDrawableSlots()) {
    setNodeGraphModuleScopesEnabled(false);
    markNodeGraphModuleScopeDebugSkip("no-drawable-slots");
    return;
  }
  // Hard idle when transport/engine is paused or stopped — before canvas sync,
  // setScopesEnabled, or getBoundingClientRect. HasModelDisplay used to keep
  // offline clocks/oscillators drawing through Stop, which forced layout on
  // every wire redraw / slot register and made stop-mode FPS collapse.
  // force=true still runs (Clear / cold-plate rebind).
  // Still paint Trace/Output idle plates so Display Settings (background color)
  // are not stuck on a wiped black face under the room dimmer.
  // Paint gate: single live/pause policy (see node-graph-module-scope-paint-gate.js).
  const enterLivePaint = typeof scopePaintShouldFullDraw === "function"
    ? scopePaintShouldFullDraw(force)
    : (typeof nodeGraphModuleScopeLivePaintActive === "function"
      ? nodeGraphModuleScopeLivePaintActive() || force
      : !nodeGraphModuleScopePaused() || force);
  if (!enterLivePaint) {
    absorbNodeGraphModuleScopePhosphorDrawCursors();
    nodeGraphModuleScopeState.animationLastTime = (performance.now?.() || Date.now()) / 1000;
    if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
      try {
        paintNodeGraphRasterRgbFacesNow(window.devicePixelRatio || 1);
      } catch (_error) {
        // Best-effort — invert / plate must still update while paused.
      }
    }
    if (force) {
      paintNodeGraphModuleScopeColdPlatesOnly(undefined, { force: true });
    }
    if (typeof holdNodeGraphScope2dTraceFaces === "function") {
      holdNodeGraphScope2dTraceFaces();
    }
    markNodeGraphModuleScopeDebugSkip("paused");
    return;
  }
  if (!canvas || !workspace || !nodeGraphModuleScopeBuffersCurrent()) {
    markNodeGraphModuleScopeDebugSkip(!canvas ? "no-canvas" : !workspace ? "no-workspace" : "stale-buffers");
    // Pause→stop→play: rings may be empty for a few frames while the worklet
    // arms. Still repaint Value LCD/LED/lamp faces so they do not stay wiped
    // black under the room dimmer until a full shared-canvas pass succeeds.
    if (typeof paintNodeGraphValueFacesNow === "function") {
      try {
        paintNodeGraphValueFacesNow(window.devicePixelRatio || 1);
      } catch (_error) {
        // Best-effort.
      }
    }
    if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
      try {
        paintNodeGraphRasterRgbFacesNow(window.devicePixelRatio || 1);
      } catch (_error) {
        // Best-effort.
      }
    }
    // Live but capture/layout not ready yet — keep ticking until rings exist.
    nodeGraphModuleScopeKeepDrawLoopAlive(false);
    return;
  }
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  debug.totalSlots = nodeGraphModuleScopeSlots().length;
  setNodeGraphModuleScopesEnabled(true);
  setNodeGraphModuleScopeDebugPhase("sync-canvas");
  if (!syncNodeGraphModuleScopeCanvas()) {
    markNodeGraphModuleScopeDebugSkip("canvas-sync");
    nodeGraphModuleScopeKeepDrawLoopAlive(false);
    return;
  }
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  const renderer = nodeGraphModuleScopeRenderer(canvas);
  if (!renderer) {
    // Do not permanently disable: WebGL can fail once and recover after a
    // resize/context restore. Heartbeat + reschedule keep trying.
    markNodeGraphModuleScopeDebugSkip("no-renderer");
    nodeGraphModuleScopeKeepDrawLoopAlive(false);
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
    if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
      try {
        paintNodeGraphRasterRgbFacesNow(window.devicePixelRatio || 1);
      } catch (_error) {
        // Raster is a self-painted face, not a shared-canvas trace.
      }
    }
    markNodeGraphModuleScopeDebugSkip("traces-off");
    return;
  }
  nodeGraphModuleScopeState.scopeTracesOffActive = false;
  const scopePaused = typeof scopePaintIsPaused === "function"
    ? scopePaintIsPaused()
    : nodeGraphModuleScopePaused();
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
    prePixelRatio;
  debug.pixelRatio = pixelRatio;
  debug.canvasWidth = canvas.width;
  debug.canvasHeight = canvas.height;
  const gl = renderer.gl;
  setNodeGraphModuleScopeDebugPhase("collect");
  const visibleItems = nodeGraphModuleScopeScreenItems(workspace, canvas, pixelRatio);
  debug.visibleItems = visibleItems.length;
  // Engine-stop wipe sets data-light-strength=0 on all screens. Only LED /
  // Number Readout re-wrote it, so Output + other scopes stayed under the
  // room veil forever. Re-mark every *drawable* face each frame — not only
  // items with a live buffer (Output with no capture yet was light=0 → pure
  // black under the dimmer, and Display Settings colors never showed).
  // Knob: image face only — empty plate text/stroke stay under dimmer.
  const litSlots = typeof nodeGraphVisibleModuleScopeSlots === "function"
    ? nodeGraphVisibleModuleScopeSlots()
    : visibleItems.map((item) => item?.slot).filter(Boolean);
  for (const slot of litSlots) {
    const face = slot?.scopeElement;
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
    // Reflective LCD plates: less-dim punch (2/3), not full phosphor hole.
    if (typeof nodeGraphNumberReadoutIsLcdFaceElement === "function"
      && nodeGraphNumberReadoutIsLcdFaceElement(face)) {
      const lcdS = typeof nodeGraphLcdDisplayLightStrength === "number"
        ? nodeGraphLcdDisplayLightStrength
        : 2 / 3;
      nodeGraphModuleScopeMarkScreenLit(face, lcdS);
      continue;
    }
    nodeGraphModuleScopeMarkScreenLit(face, 1);
  }
  flushNodeSliderReadoutUpdates();
  // Instant Trace skip only when paint gate says idle (never while live).
  const allowTraceSkip = typeof scopePaintShouldSkipUnchangedTrace === "function"
    ? scopePaintShouldSkipUnchangedTrace()
    : scopePaused;
  if (!force && allowTraceSkip && nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems)) {
    setNodeGraphModuleScopeDebugPhase("trace-unchanged");
    commitNodeGraphModuleScopeRenderMetricsFrame(animationTime);
    nodeGraphModuleScopeKeepDrawLoopAlive(scopePaused);
    return;
  }
  // Same Simulation FPS tick as phosphor / traces — one Pixel Grid write.
  if (typeof nodeGraphRasterRgbArmIngest === "function") {
    nodeGraphRasterRgbArmIngest();
  }
  if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
    try {
      paintNodeGraphRasterRgbFacesNow(pixelRatio);
    } catch (_error) {
      // Best-effort — typed item may still present.
    }
  }
  if (typeof paintNodeGraphFbmFieldFacesNow === "function") {
    try {
      paintNodeGraphFbmFieldFacesNow();
    } catch (_error) {
      // Best-effort — RAF covers traces-off only.
    }
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
  // Keep RAF alive while the paint gate says live and faces exist.
  if (typeof nodeGraphModuleScopeState !== "undefined" && nodeGraphModuleScopeState) {
    nodeGraphModuleScopeState.idleHold = typeof nodeGraphModuleScopeBuffersIdleSilent === "function"
      && nodeGraphModuleScopeBuffersIdleSilent();
  }
  const keepDrawing = (typeof scopePaintShouldKeepLoop === "function"
    ? scopePaintShouldKeepLoop()
    : !scopePaused && nodeGraphModuleScopeHasDrawableSlots())
    && (
      visibleItems.length
      || nodeGraphModuleScopeHasModelDisplay()
      || nodeGraphModuleScopeHasDrawableSlots()
    );
  if (keepDrawing) {
    setNodeGraphModuleScopeDebugPhase("schedule-next");
    scheduleNodeGraphModuleScopeDraw();
  } else {
    setNodeGraphModuleScopeDebugPhase("idle");
    // Stop (engine off): kill the 100ms heartbeat after a forced Clear frame so
    // Stop stays idle. Pause-with-live keeps heartbeat for phosphor absorb.
    if (
      scopePaused
      && typeof nodeGraphModuleScopeCircuitRunning === "function"
      && !nodeGraphModuleScopeCircuitRunning()
    ) {
      setNodeGraphModuleScopesEnabled(false);
    }
  }
}

function nodeGraphModuleScopeSimFps() {
  return typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : Math.max(0, Math.round(Number(nodeGraphMvp?.moduleScopeFramesPerSecond) || 60));
}

function clearNodeGraphModuleScopeDrawWait() {
  if (nodeGraphModuleScopeState.drawWaitTimer) {
    window.clearTimeout(nodeGraphModuleScopeState.drawWaitTimer);
    nodeGraphModuleScopeState.drawWaitTimer = 0;
  }
}

function scheduleNodeGraphModuleScopeDrawAfterSimClock() {
  if (nodeGraphModuleScopeState.drawWaitTimer || nodeGraphModuleScopeState.drawFrame) {
    return;
  }
  const fps = nodeGraphModuleScopeSimFps();
  if (!(fps > 0)) {
    return;
  }
  const now = (performance.now?.() || Date.now()) / 1000;
  const last = Number(nodeGraphModuleScopeState.phosphorFrame?.lastUpdate) || 0;
  const frameDur = 1 / fps;
  let remainingMs = (last + frameDur - now) * 1000;
  if (!Number.isFinite(remainingMs) || remainingMs < 8) {
    remainingMs = 8;
  }
  remainingMs = Math.min(remainingMs, frameDur * 1000);
  nodeGraphModuleScopeState.drawWaitTimer = window.setTimeout(() => {
    nodeGraphModuleScopeState.drawWaitTimer = 0;
    scheduleNodeGraphModuleScopeDraw();
  }, remainingMs);
}

function scheduleNodeGraphModuleScopeDraw(options = {}) {
  const force = options?.force === true;
  if (!nodeGraphModuleScopeHasDrawableSlots()) {
    return;
  }
  if (!force && nodeGraphModuleScopeState.drawWaitTimer) {
    return;
  }
  if (force) {
    clearNodeGraphModuleScopeDrawWait();
  }
  if (nodeGraphModuleScopeTracesOff()) {
    if (!nodeGraphModuleScopeState.scopeTracesOffActive) {
      nodeGraphModuleScopeState.scopeTracesOffActive = true;
      clearNodeGraphModuleScopeCanvas();
    }
    markNodeGraphModuleScopeDebugSkip("traces-off");
    return;
  }
  // Arm heartbeat as soon as we intend to draw — do not wait for a successful
  // full paint (that left faces event-only until zoom/pan).
  if (!nodeGraphModuleScopesEnabled()) {
    setNodeGraphModuleScopesEnabled(true);
  }
  // Pause/stop: do not queue a full live RAF loop. Force=true after Clear so
  // energy rebinds and the cold plate sticks even while frozen. Still run one
  // cold-plate paint so Display Settings (background) update while Stopped —
  // otherwise Output stays wiped black under the dimmer until Play.
  if (typeof scopePaintShouldFullDraw === "function") {
    if (!scopePaintShouldFullDraw(force)) {
      absorbNodeGraphModuleScopePhosphorDrawCursors();
      // Raster invert / grade live on a module slider, not Display Settings.
      // The live RAF loop is off while paused/stopped — still paint the face.
      if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
        try {
          paintNodeGraphRasterRgbFacesNow(window.devicePixelRatio || 1);
        } catch (_error) {
          // Best-effort.
        }
      }
      // Never fill idle plates over a frozen face (move/resize used to wipe LCD).
      if (force) {
        paintNodeGraphModuleScopeColdPlatesOnly(undefined, { force: true });
      }
      if (typeof holdNodeGraphScope2dTraceFaces === "function") {
        holdNodeGraphScope2dTraceFaces();
      }
      return;
    }
  } else {
    const livePaintActive = typeof nodeGraphModuleScopeLivePaintActive === "function"
      ? nodeGraphModuleScopeLivePaintActive()
      : !nodeGraphModuleScopePaused();
    if (!livePaintActive && !force) {
      absorbNodeGraphModuleScopePhosphorDrawCursors();
      return;
    }
  }
  if (nodeGraphModuleScopeState.drawFrame) {
    const now = (performance.now?.() || Date.now());
    const requestedAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
    // force always wins: cancel a pending non-force RAF so Clear is not dropped.
    const pendingForce = nodeGraphModuleScopeState.drawFrameForce === true;
    if (force && !pendingForce) {
      window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
      nodeGraphModuleScopeState.drawFrame = 0;
      nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
      nodeGraphModuleScopeState.drawFrameForce = false;
      if (nodeGraphModuleScopeState.drawFrameWatchdog) {
        window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
        nodeGraphModuleScopeState.drawFrameWatchdog = 0;
      }
    } else if (requestedAt > 0 && now - requestedAt > 250) {
      window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
      nodeGraphModuleScopeState.drawFrame = 0;
      nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
      nodeGraphModuleScopeState.drawFrameForce = false;
      if (nodeGraphModuleScopeState.drawFrameWatchdog) {
        window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
        nodeGraphModuleScopeState.drawFrameWatchdog = 0;
      }
    } else {
      // Coalesce: if force already pending, keep it; if non-force pending and we
      // also want force, the branch above already cancelled.
      if (force) {
        nodeGraphModuleScopeState.drawFrameForce = true;
      }
      return;
    }
  }
  setNodeGraphModuleScopeDebugPhase("request-raf");
  nodeGraphModuleScopeState.drawFrameForce = force;
  const frameId = window.requestAnimationFrame(() => {
    if (nodeGraphModuleScopeState.drawFrameWatchdog) {
      window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
      nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    }
    const frameForce = nodeGraphModuleScopeState.drawFrameForce === true;
    nodeGraphModuleScopeState.drawFrame = 0;
    nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    nodeGraphModuleScopeState.drawFrameForce = false;
    runNodeGraphModuleScopeDrawFrame("raf", { force: frameForce });
  });
  nodeGraphModuleScopeState.drawFrame = frameId;
  nodeGraphModuleScopeState.drawFrameRequestedAt = (performance.now?.() || Date.now());
  const simFps = nodeGraphModuleScopeSimFps();
  const frameMs = simFps > 0 ? 1000 / simFps : 100;
  const watchdogMs = Math.max(250, Math.round(frameMs * 2));
  nodeGraphModuleScopeState.drawFrameWatchdog = window.setTimeout(() => {
    if (nodeGraphModuleScopeState.drawFrame !== frameId) {
      return;
    }
    const frameForce = nodeGraphModuleScopeState.drawFrameForce === true;
    window.cancelAnimationFrame(frameId);
    nodeGraphModuleScopeState.drawFrame = 0;
    nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    nodeGraphModuleScopeState.drawFrameForce = false;
    nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    if (nodeGraphModuleScopeState.drawBusy) {
      return;
    }
    setNodeGraphModuleScopeDebugPhase("watchdog");
    // Re-arm rAF instead of drawing on the timer. A sync watchdog draw
    // during an overrun stacked a second 50–167ms paint in the same budget.
    scheduleNodeGraphModuleScopeDraw(frameForce ? { force: true } : {});
  }, watchdogMs);
}
