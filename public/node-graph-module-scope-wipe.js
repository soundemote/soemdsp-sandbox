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
    shell.style?.setProperty?.("--node-led-face-color", "rgb(0, 0, 0)");
    shell.style?.setProperty?.("--node-led-face-glow", "none");
    if (face.dataset) {
      face.dataset.lightStrength = "0";
      delete face.dataset.ledAppearance;
    }
  }
  // Room-light emitters go dark with the simulation. Number Readout LCD keeps
  // a full hole; Knob only re-lights when face art is present (paint).
  for (const el of document.querySelectorAll("[data-light-strength], [data-light-source]")) {
    if (el.dataset && !el.classList?.contains("node-number-readout-face")) {
      el.dataset.lightStrength = "0";
    }
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
 * Wipe phosphor residual for one module face (Display Settings → Clear).
 * Works while paused: clears energy FBOs in place (no destroy), resets draw
 * cursors, paints a cold plate, and forces a draw so unpause can deposit again.
 */
function clearNodeGraphDisplaySettingsPhosphor(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const phosphorKeys = ["_phosphorEnergyGl", "_xyPadPhosphorEnergyGl"];
  const canvases = new Set();

  // Persistent scope face for this node.
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined"
    && nodeGraphModuleScopePersistentCanvases?.get) {
    const persistent = nodeGraphModuleScopePersistentCanvases.get(id);
    if (persistent instanceof HTMLCanvasElement) {
      canvases.add(persistent);
    }
  }

  // Live DOM under the module shell (scope windows, XY pad, spectrogram).
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
    // Drop draw-cursor so the next live frame deposits fresh samples without
    // a resume dump, and so a rewound absolute frame cannot stick lastFrame ahead.
    delete canvas._nodeGraphScope2dLastDrawnFrame;
    delete canvas._nodeGraphScope2dLastDrawnPoint;
    delete canvas._nodeGraphOneDimensionalBurnLastDrawnFrame;
    delete canvas._phosphorDrawCursorAbsFrame;
    delete canvas._phosphorScope2dLastFrame;
    if (canvas._nodeGraphScope2dBurnRenderer) {
      canvas._nodeGraphScope2dBurnRenderer.lastFrame = NaN;
      canvas._nodeGraphScope2dBurnRenderer._nodeGraphScope2dLastDrawnFrame = undefined;
    }
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

  // Force a draw even while paused so energy re-binds and the plate stays black.
  // Without this, pause early-outs only absorb cursors and never re-ensure GL.
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  } else if (typeof runNodeGraphModuleScopeDrawFrame === "function") {
    runNodeGraphModuleScopeDrawFrame("phosphor-clear", { force: true });
  }
  return canvases.size > 0;
}

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
  nodeGraphModuleScopeState.animationLastTime = 0;
  nodeGraphModuleScopeState.animationTime = 0;
  nodeGraphModuleScopeState.animationDeltaSeconds = 0;
  if (!preserveDisplay) {
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
  clearNodeGraphModuleScopeBuffers();
}

// Scope monitors → node-graph-module-scope-monitors.js
