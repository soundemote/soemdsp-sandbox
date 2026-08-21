// Scope wipe / clear buffer helpers (Phase D).
// Load after scopes.js. Extract-only.

function wipeNodeGraphModuleScopeScreensToColdBoot() {
  if (typeof document === "undefined") {
    return;
  }
  // Off-screen spectrogram history bitmaps (if the display registered a wipe).
  if (typeof clearNodeGraphSpectrogramHistory === "function") {
    try {
      clearNodeGraphSpectrogramHistory();
    } catch (_error) {
      // Best-effort.
    }
  }
  // LEDs are CSS lamps (no canvas) — force unlit + no glow.
  for (const face of document.querySelectorAll(".node-led-face")) {
    const shell = face.closest(".dsp-node") || face;
    const lamp = face.querySelector?.(".node-led-lamp") || face;
    shell.style?.setProperty?.("--node-led-face-color", "rgb(0, 0, 0)");
    shell.style?.setProperty?.("--node-led-face-glow", "none");
    if (face.dataset) {
      face.dataset.lightStrength = "0";
      face.dataset.ledLevel = "0";
      delete face.dataset.ledAppearance;
    }
    if (lamp?.dataset) {
      lamp.dataset.lightStrength = "0";
      lamp.dataset.ledLevel = "0";
    }
    if (lamp?.style) {
      lamp.style.background = "rgb(0, 0, 0)";
      lamp.style.boxShadow = "none";
    }
  }
  // Room-light emitters go dark with the simulation. Number Readout / Value LCD
  // / Value LED faces AND their canvases keep their hole — stop wipe used to
  // zero the canvas only, then the room dimmer punched strength 0 and the
  // digits stayed invisible even after live paint (pause→stop death).
  // Knob only re-lights when face art is present (paint). LED lamps go dark
  // above (intentional unlit).
  for (const el of document.querySelectorAll("[data-light-strength], [data-light-source]")) {
    if (!el.dataset) {
      continue;
    }
    if (
      el.classList?.contains("node-number-readout-face")
      || el.classList?.contains("node-value-lcd-face")
      || el.classList?.contains("node-value-led-face")
      || el.classList?.contains("node-pitch-detector-lcd")
      || el.classList?.contains("node-number-readout-canvas")
      || el.closest?.(".node-number-readout-face")
      || el.closest?.(".node-value-lcd-face")
      || el.closest?.(".node-value-led-face")
      || el.closest?.(".node-pitch-detector-lcd")
      || (typeof nodeGraphFilterCurveIsPersistentScreen === "function"
        && nodeGraphFilterCurveIsPersistentScreen(el))
      || el.classList?.contains("node-filter-curve-display")
      || el.classList?.contains("node-filter-curve-canvas")
      || el.closest?.(".node-filter-curve-display")
    ) {
      continue;
    }
    el.dataset.lightStrength = "0";
  }
  const phosphorKeys = ["_phosphorEnergyGl", "_xyPadPhosphorEnergyGl"];
  const canvases = new Set();
  for (const canvas of document.querySelectorAll(
    "canvas.node-module-scope-local-fallback-canvas, canvas.node-xy-pad-canvas, canvas.node-spectrogram-canvas, canvas.node-phosphor-waveform-canvas",
  )) {
    if (canvas instanceof HTMLCanvasElement) {
      canvases.add(canvas);
    }
  }
  // Any other canvas still holding a phosphor energy face (chromeless modules).
  for (const canvas of document.querySelectorAll("canvas")) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      continue;
    }
    if (canvas.classList?.contains("node-number-readout-canvas")) {
      continue;
    }
    if (phosphorKeys.some((key) => canvas[key])) {
      canvases.add(canvas);
    }
  }
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined" && nodeGraphModuleScopePersistentCanvases?.values) {
    for (const canvas of nodeGraphModuleScopePersistentCanvases.values()) {
      if (canvas instanceof HTMLCanvasElement) {
        canvases.add(canvas);
      }
    }
  }
  for (const canvas of canvases) {
    // Shared workspace overlays are cleared by clearNodeGraphModuleScopeCanvas().
    // Number Readout has its own idle-LCD wipe (do not solid-plate over it).
    if (
      canvas.id === "nodeModuleScopeCanvas"
      || canvas.classList?.contains("node-module-scope-light-canvas")
      || canvas.classList?.contains("node-room-dimmer-canvas")
      || canvas.classList?.contains("node-number-readout-canvas")
      || canvas.classList?.contains("node-raster-rgb-canvas")
      || canvas.classList?.contains("node-filter-curve-canvas")
    ) {
      continue;
    }
    for (const key of phosphorKeys) {
      const face = canvas[key];
      if (face && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
        try {
          nodeGraphPhosphorEnergyGlDestroy(face);
        } catch (_error) {
          // Best-effort; a torn-down WebGL context is already dark.
        }
      }
      canvas[key] = null;
    }
    if (canvas._numberReadoutLastValueText !== undefined) {
      canvas._numberReadoutLastValueText = "";
      canvas._numberReadoutLastTextChangeAt = 0;
      canvas._nodeGraphNumberReadoutText = "";
    }
    if (canvas._numberReadoutResidualPresent) {
      const rctx = canvas._numberReadoutResidualPresent.getContext?.("2d");
      rctx?.clearRect(
        0,
        0,
        canvas._numberReadoutResidualPresent.width,
        canvas._numberReadoutResidualPresent.height,
      );
    }
    const context = canvas.getContext?.("2d");
    if (!context || !(canvas.width > 0) || !(canvas.height > 0)) {
      continue;
    }
    const bg = nodeGraphModuleScopePlateBackgroundForElement(canvas);
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(context, canvas, bg);
    } else {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = bg || "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
  }
  // Last: idle LCD plate + unlit segments + dimmer strength (not a solid blank).
  wipeNodeGraphNumberReadoutScreensToColdBoot();
  // Fractal Brownian Field uses its own WebGL canvas (not 2d / phosphor).
  // Stop rAF + plate pure black.
  if (typeof wipeNodeGraphFbmFieldScreensToColdBoot === "function") {
    try {
      wipeNodeGraphFbmFieldScreensToColdBoot();
    } catch (_error) {
      // Best-effort.
    }
  }
  // Pixel Grid keeps its own rolling framebuffer (skipped in the 2d plate loop).
  if (typeof wipeNodeGraphRasterRgbScreensToColdBoot === "function") {
    try {
      wipeNodeGraphRasterRgbScreensToColdBoot();
    } catch (_error) {
      // Best-effort.
    }
  }
  // EQ / filter-curve faces are parameter plots — redraw after Stop, do not
  // leave a black plate under the room veil.
  if (typeof scheduleNodeGraphFilterCurveDraw === "function") {
    try {
      scheduleNodeGraphFilterCurveDraw();
    } catch (_error) {
      // Best-effort.
    }
  }
}

/**
 * Drop a face canvas from the persistent map (and DOM) so the next draw can
 * allocate a healthy 2D canvas. WebGL-poisoned faces must not be reattached.
 */
function nodeGraphDropScopeFaceCanvas(canvas, nodeId = "") {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined"
    && nodeGraphModuleScopePersistentCanvases?.delete) {
    if (nodeId) {
      const held = nodeGraphModuleScopePersistentCanvases.get(nodeId);
      if (held === canvas) {
        nodeGraphModuleScopePersistentCanvases.delete(nodeId);
      }
    } else if (nodeGraphModuleScopePersistentCanvases.forEach) {
      nodeGraphModuleScopePersistentCanvases.forEach((value, key) => {
        if (value === canvas) {
          nodeGraphModuleScopePersistentCanvases.delete(key);
        }
      });
    }
  }
  try {
    canvas.remove();
  } catch (_error) {
    // Best-effort.
  }
}

/**
 * Resolve node ids for Display Settings → Clear (multi-select safe).
 * Prefer the open panel's multi-target list; if only one id is stored, re-resolve
 * from the current selection so multi-select after open still clears every face.
 */
function nodeGraphTraceDisplaySettingsIdsForClearAction(explicitIds = null) {
  if (Array.isArray(explicitIds) && explicitIds.length) {
    return explicitIds.map((id) => String(id || "").trim()).filter(Boolean);
  }
  const active = typeof nodeGraphTraceDisplaySettingsActiveTargetIds === "function"
    ? nodeGraphTraceDisplaySettingsActiveTargetIds()
    : [];
  const primary = (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "")
    || active[0]
    || document.getElementById("nodeTraceDisplaySettingsPopover")
      ?.dataset?.displaySettingsTargetNode
    || "";
  // Always re-resolve from selection when multi-select is live so Clear cannot
  // silently fall back to the primary face only.
  if (typeof nodeGraphTraceDisplaySettingsResolveMultiTargetIds === "function" && primary) {
    const resolved = nodeGraphTraceDisplaySettingsResolveMultiTargetIds(primary);
    if (resolved.length > 1) {
      return resolved;
    }
  }
  if (active.length) {
    return active;
  }
  return primary ? [String(primary)] : [];
}

/** Collect every face canvas that may hold phosphor residual for a node. */
function nodeGraphClearCollectFaceCanvasesForNode(nodeId) {
  const id = String(nodeId || "").trim();
  const canvases = new Set();
  if (!id) {
    return canvases;
  }

  // Persistent burn face (1D/2D phosphor).
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined"
    && nodeGraphModuleScopePersistentCanvases?.get) {
    const persistent = nodeGraphModuleScopePersistentCanvases.get(id);
    if (persistent instanceof HTMLCanvasElement) {
      canvases.add(persistent);
    }
  }

  // Live DOM under the module shell (scope windows, XY pad, spectrogram, …).
  const moduleEl = typeof document !== "undefined"
    ? document.querySelector?.(`.dsp-node[data-node="${CSS.escape(id)}"]`)
    : null;
  if (moduleEl) {
    for (const canvas of moduleEl.querySelectorAll("canvas")) {
      if (canvas instanceof HTMLCanvasElement) {
        canvases.add(canvas);
      }
    }
  }

  // Scope slots → burn / fallback canvases (covers detached-then-reattached faces).
  if (typeof nodeGraphModuleScopeSlots === "function") {
    for (const slot of nodeGraphModuleScopeSlots() || []) {
      if (String(slot?.nodeId || "") !== id) {
        continue;
      }
      if (typeof nodeGraphScope2dBurnCanvasForSlot === "function") {
        try {
          const burn = nodeGraphScope2dBurnCanvasForSlot(slot);
          if (burn instanceof HTMLCanvasElement) {
            canvases.add(burn);
          }
        } catch (_error) {
          // Best-effort.
        }
      }
      if (typeof nodeGraphModuleScopeLocalFallbackCanvas === "function") {
        try {
          const local = nodeGraphModuleScopeLocalFallbackCanvas(slot);
          if (local instanceof HTMLCanvasElement) {
            canvases.add(local);
          }
        } catch (_error) {
          // Best-effort.
        }
      }
    }
  }

  return canvases;
}

/** Latest absolute frame for this node's scope capture buffers (for cursor pin). */
function nodeGraphClearAbsoluteFrameForNode(nodeId) {
  const id = String(nodeId || "").trim();
  let endFrame = NaN;
  const consider = (frame) => {
    const f = Number(frame);
    if (!Number.isFinite(f)) {
      return;
    }
    endFrame = Number.isFinite(endFrame) ? Math.max(endFrame, f) : f;
  };
  const buffers = typeof nodeGraphModuleScopeState === "object"
    ? nodeGraphModuleScopeState?.buffers
    : null;
  if (buffers?.forEach) {
    buffers.forEach((buf, key) => {
      const k = String(key || "");
      if (k === id || k.startsWith(`${id}:`)) {
        consider(buf?.nodeGraphScopeAbsoluteFrame);
      }
    });
  }
  if (typeof nodeGraphModuleScopeSlots === "function") {
    for (const slot of nodeGraphModuleScopeSlots() || []) {
      if (String(slot?.nodeId || "") !== id) {
        continue;
      }
      const buffer = typeof nodeGraphModuleScopeCapturedBufferForSlot === "function"
        ? nodeGraphModuleScopeCapturedBufferForSlot(slot)
        : null;
      consider(buffer?.nodeGraphScopeAbsoluteFrame);
    }
  }
  return endFrame;
}

/**
 * Wipe phosphor residual for one module face (or many when multi-select).
 * Display Settings → Clear. Works while paused: clears energy FBOs in place
 * (no destroy), pins draw cursors (so force-draw does not re-stamp history),
 * paints a cold plate, and forces a draw so unpause can deposit again.
 *
 * @param {string|string[]|null} nodeIdOrIds  One id, multi ids, or null → resolve.
 * @param {{ scheduleDraw?: boolean }} [options]
 *   scheduleDraw (default true) — one force draw after the batch.
 */
function clearNodeGraphDisplaySettingsPhosphor(nodeIdOrIds = null, options = {}) {
  const ids = nodeGraphTraceDisplaySettingsIdsForClearAction(nodeIdOrIds);
  if (!ids.length) {
    return false;
  }
  const scheduleDraw = options?.scheduleDraw !== false;
  const phosphorKeys = ["_phosphorEnergyGl", "_xyPadPhosphorEnergyGl"];
  let anyCanvas = false;

  for (const id of ids) {
    const canvases = nodeGraphClearCollectFaceCanvasesForNode(id);
    if (canvases.size) {
      anyCanvas = true;
    }

    for (const canvas of canvases) {
      // Prefer in-place energy wipe — destroy + re-ensure while paused left
      // faces stuck (energyActive false / dead canvas until Stop+Play).
      for (const key of phosphorKeys) {
        const face = canvas[key];
        if (!face) {
          continue;
        }
        let cleared = false;
        if (typeof nodeGraphPhosphorEnergyGlClear === "function") {
          try {
            cleared = Boolean(nodeGraphPhosphorEnergyGlClear(face));
          } catch (_error) {
            cleared = false;
          }
        }
        if (!cleared && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
          try {
            nodeGraphPhosphorEnergyGlDestroy(face);
          } catch (_error) {
            // Best-effort.
          }
          canvas[key] = null;
        }
      }
      // Drop last-point bridge only (not the frame cursor — see absorb below).
      delete canvas._nodeGraphScope2dLastDrawnPoint;
      // Do NOT dispose legacy WebGL-on-face burn here — that permanently poisons
      // the canvas so getContext("2d") fails and the face never draws again.
      let context = null;
      try {
        context = canvas.getContext?.("2d") || null;
      } catch (_error) {
        context = null;
      }
      if (!context) {
        nodeGraphDropScopeFaceCanvas(canvas, id);
        continue;
      }
      if (canvas.width > 0 && canvas.height > 0) {
        const bg = typeof nodeGraphModuleScopePlateBackgroundForElement === "function"
          ? nodeGraphModuleScopePlateBackgroundForElement(canvas)
          : "#000000";
        if (typeof nodeGraphFacePlateFillCanvas === "function") {
          nodeGraphFacePlateFillCanvas(context, canvas, bg);
        } else {
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.globalCompositeOperation = "source-over";
          context.fillStyle = bg || "#000000";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();
        }
        canvas._outputPauseBannerStamped = false;
        canvas._traceScroll = null;
        canvas._waterfall = null;
        delete canvas._waterfallLastY;
        delete canvas._waterfallLastLeftY;
        delete canvas._waterfallLastRightY;
        delete canvas._waterfallLastDrawnFrame;
        delete canvas._waterfallPendingEndFrame;
        delete canvas._traceWaterfallLastPoint;
        delete canvas._traceWaterfallLastLeft;
        delete canvas._traceWaterfallLastRight;
        delete canvas._traceWaterfallLastDrawnFrame;
        delete canvas._traceWaterfallPendingEndFrame;
      }
    }

    // Pin undrawn-window cursor to "now" so the following force draw does not
    // re-stamp the whole capture buffer (looked like Clear only hit one face).
    const endFrame = nodeGraphClearAbsoluteFrameForNode(id);
    if (Number.isFinite(endFrame)) {
      if (typeof absorbNodeGraphPhosphorDrawCursorOnCanvas === "function") {
        for (const canvas of canvases) {
          absorbNodeGraphPhosphorDrawCursorOnCanvas(canvas, endFrame);
        }
      } else {
        for (const canvas of canvases) {
          canvas._nodeGraphScope2dLastDrawnFrame = endFrame;
          canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = endFrame;
          canvas._phosphorScope2dLastFrame = endFrame;
          canvas._phosphorDrawCursorAbsFrame = endFrame;
          if (canvas._nodeGraphScope2dBurnRenderer) {
            canvas._nodeGraphScope2dBurnRenderer.lastFrame = endFrame;
            canvas._nodeGraphScope2dBurnRenderer._nodeGraphScope2dLastDrawnFrame = endFrame;
          }
        }
      }
    }

    if (typeof clearNodeGraphSpectrogramHistoryForNode === "function") {
      try {
        clearNodeGraphSpectrogramHistoryForNode(id);
      } catch (_error) {
        // Best-effort.
      }
    }
    if (typeof invalidateNodeGraphNumberReadoutPaintCache === "function") {
      try {
        invalidateNodeGraphNumberReadoutPaintCache(id);
      } catch (_error) {
        // Best-effort.
      }
    } else {
      for (const canvas of canvases) {
        canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
        canvas._nodeGraphNumberReadoutText = null;
      }
    }

    // XY Pad has its own residual path.
    if (typeof nodeGraphXyPadResetCanvas === "function") {
      try {
        nodeGraphXyPadResetCanvas(id);
      } catch (_error) {
        // Best-effort.
      }
    }

    // Instant Trace skips redraw when the sample signature is unchanged. Clear
    // blacks the face without new samples — without busting this cache, unpause
    // after Clear-while-paused early-outs as "unchanged" until Stop+Play.
    if (typeof nodeGraphModuleScopeState === "object" && nodeGraphModuleScopeState) {
      try {
        nodeGraphModuleScopeState.traceDisplayDrawCache?.delete?.(id);
        nodeGraphModuleScopeState.traceDisplayScratch?.delete?.(id);
        nodeGraphModuleScopeState.traceDisplaySyncLocks?.delete?.(id);
      } catch (_error) {
        // Best-effort.
      }
    }
  }

  if (typeof stampNodeGraphOutputPauseBanners === "function") {
    stampNodeGraphOutputPauseBanners();
  }
  // Force a draw even while paused so energy re-binds and the plate stays black.
  // Without this, pause early-outs only absorb cursors and never re-ensure GL.
  // One schedule for the whole multi-select batch.
  if (scheduleDraw) {
    if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
      scheduleNodeGraphModuleScopeDraw({ force: true });
    } else if (typeof runNodeGraphModuleScopeDrawFrame === "function") {
      runNodeGraphModuleScopeDrawFrame("phosphor-clear", { force: true });
    }
  }
  return anyCanvas || ids.length > 0;
}

/**
 * Clear capture rings / optionally wipe painted faces.
 *
 * App policy: only intentional Stop / full offline reset should set
 * preserveDisplay:false (cold-boot wipe). Wire reconnects, plan re-arms,
 * pause, and bypass must pass preserveDisplay:true so phosphor residual
 * (Value LED / Pitch / 1D / 2D energy) is never killed.
 */
function clearNodeGraphModuleScopeBuffers(options = {}) {
  const preserveDisplay = options?.preserveDisplay === true;
  const preserveBuffers = options?.preserveBuffers === true;
  if (nodeGraphModuleScopeState.drawFrame) {
    window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);
    nodeGraphModuleScopeState.drawFrame = 0;
  }
  if (nodeGraphModuleScopeState.drawFrameWatchdog) {
    window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
    nodeGraphModuleScopeState.drawFrameWatchdog = 0;
  }
  if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
    window.clearInterval(nodeGraphModuleScopeState.drawFrameHeartbeat);
    nodeGraphModuleScopeState.drawFrameHeartbeat = 0;
  }
  if (!preserveBuffers) {
    nodeGraphModuleScopeState.buffers.clear();
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
    nodeGraphModuleScopeState.lightDisplayStates.clear();
    nodeGraphModuleScopeState.frames = 0;
    nodeGraphModuleScopeState.monitorFingerprint = "";
    nodeGraphModuleScopeState.mode = "";
    resetNodeGraphModuleScopeFrameClocks();
    nodeGraphModuleScopeState.oscillatorPhasors.clear();
    nodeGraphModuleScopeState.patchFingerprint = "";
    nodeGraphModuleScopeState.sampleRate = 0;
  }
  // Keep animation clocks when holding display — a soft re-arm must not
  // force a full residual resync burst that looks like a wipe.
  if (!preserveDisplay) {
    nodeGraphModuleScopeState.animationLastTime = 0;
    nodeGraphModuleScopeState.animationTime = 0;
    nodeGraphModuleScopeState.animationDeltaSeconds = 0;
    setNodeGraphModuleScopesEnabled(false);
    clearNodeGraphModuleScopeCanvas();
    // Full cold-boot wipe: energy residual + painted face pixels + CSS lamps.
    // stopNodeGraphLiveAudio calls this so Stop turns the simulation off.
    wipeNodeGraphModuleScopeScreensToColdBoot();
  }
}

function clearNodeGraphRenderedModuleScopeBuffers() {
  if (nodeGraphModuleScopeState.mode === "live") {
    return;
  }
  // Never start a model-mode RAF loop when the engine is stopped/paused.
  // Offline oscillator/clock "model displays" used to schedule continuous
  // draws after Stop / offline render and thrash main-thread FPS.
  if (
    typeof nodeGraphModuleScopeHasModelDisplay === "function"
    && nodeGraphModuleScopeHasModelDisplay()
    && typeof nodeGraphModuleScopePaused === "function"
    && !nodeGraphModuleScopePaused()
  ) {
    nodeGraphModuleScopeState.buffers.clear();
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
    nodeGraphModuleScopeState.frames = 0;
    nodeGraphModuleScopeState.monitorFingerprint = "";
    nodeGraphModuleScopeState.mode = "model";
    nodeGraphModuleScopeState.patchFingerprint = nodeGraphPatchFingerprint();
    nodeGraphModuleScopeState.sampleRate = nodeGraphMvp.sampleRate || 44100;
    scheduleNodeGraphModuleScopeDraw();
    return;
  }
  // Offline reset while paused: keep painted residual. Also keep rings —
  // move/resize used to hit this via render-pending and blank LCD/trace.
  if (typeof nodeGraphModuleScopePaused === "function" && nodeGraphModuleScopePaused()) {
    clearNodeGraphModuleScopeBuffers({ preserveDisplay: true, preserveBuffers: true });
    return;
  }
  clearNodeGraphModuleScopeBuffers();
}

// Scope monitors → node-graph-module-scope-monitors.js
