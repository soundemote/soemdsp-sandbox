// Viewport (zoom/pan) performance: light CSS every event, heavy chrome
// (wires / heatmap / scopes) coalesced to rAF; full fidelity + settings
// persist after the gesture settles.

const nodeGraphViewportPerf = {
  heavyRaf: 0,
  settleTimer: 0,
  persistTimer: 0,
  wheelActiveUntil: 0,
  lastWirePlanKey: "",
  lastWirePlan: null,
  settleMs: 140,
  persistMs: 220,
  wheelHoldMs: 160,
};

function nodeGraphViewportWheelActive() {
  return (performance.now?.() || Date.now()) < (nodeGraphViewportPerf.wheelActiveUntil || 0);
}

function nodeGraphViewportGestureActive() {
  return Boolean(
    nodeGraphMvp?.workspacePanning
    || nodeGraphMvp?.smoothZoomDragging
    || nodeGraphMvp?.workspacePinchZooming
    || nodeGraphViewportWheelActive(),
  );
}

/** Mark an interactive viewport gesture (wheel / pan / pinch / smooth-zoom). */
function markNodeGraphViewportGesture(kind = "gesture") {
  if (kind === "wheel") {
    nodeGraphViewportPerf.wheelActiveUntil = (performance.now?.() || Date.now())
      + nodeGraphViewportPerf.wheelHoldMs;
  }
  document.getElementById("nodeGraphWorkspace")?.classList.add("viewport-gesturing");
  scheduleNodeGraphViewportHeavyChrome();
  scheduleNodeGraphViewportSettle();
}

function clearNodeGraphViewportGestureClass() {
  document.getElementById("nodeGraphWorkspace")?.classList.remove("viewport-gesturing");
}

/**
 * Light path only: CSS zoom/pan vars + cheap chrome (buttons, world readout).
 * Safe to call every wheel/pointermove sample.
 */
function applyNodeGraphViewportCssLight(options = {}) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  if (options.zoom !== false) {
    const zoom = typeof nodeGraphZoom === "function" ? nodeGraphZoom() : (nodeGraphMvp?.zoom || 1);
    workspace.style.setProperty("--node-graph-zoom", String(zoom));
    workspace.dataset.zoom = Number(zoom).toFixed(2);
    workspace.classList.toggle("pixelated-canvas-zoom", zoom >= 2.5);
  }
  if (options.pan !== false) {
    const pan = nodeGraphMvp.pan || { x: 0, y: 0 };
    const originOffset = typeof nodeGraphRenderedOriginOffset === "function"
      ? nodeGraphRenderedOriginOffset(pan, workspace)
      : pan;
    workspace.style.setProperty("--node-graph-pan-x", `${originOffset.x}px`);
    workspace.style.setProperty("--node-graph-pan-y", `${originOffset.y}px`);
    workspace.dataset.panX = String(pan.x);
    workspace.dataset.panY = String(pan.y);
  }
  if (options.zoomButtons !== false && options.zoom !== false) {
    const zoomOutButton = document.getElementById("nodeZoomOutButton");
    const zoomResetButton = document.getElementById("nodeZoomResetButton");
    const zoomInButton = document.getElementById("nodeZoomInButton");
    const z = typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1;
    const limits = typeof nodeGraphZoomLimits !== "undefined" ? nodeGraphZoomLimits : { min: 0.1, max: 100 };
    if (zoomOutButton) {
      zoomOutButton.disabled = z <= limits.min + 0.001;
    }
    if (zoomInButton) {
      zoomInButton.disabled = z >= limits.max - 0.001;
    }
    if (zoomResetButton && zoomResetButton.dataset.editingZoom !== "true") {
      const zoomLabel = typeof nodeGraphZoomLabel === "function" ? nodeGraphZoomLabel() : `${Math.round(z * 100)}%`;
      zoomResetButton.textContent = zoomLabel;
      zoomResetButton.setAttribute("aria-label", `Current zoom ${zoomLabel}. Reset graph zoom to 1:1`);
      zoomResetButton.removeAttribute("title");
    }
  }
  if (options.readouts !== false) {
    if (typeof syncNodeGraphWorldPositionReadout === "function") {
      syncNodeGraphWorldPositionReadout();
    }
    if (typeof syncNodeGraphOriginMarker === "function") {
      syncNodeGraphOriginMarker();
    }
  }
}

function nodeGraphWirePlanCacheKey() {
  const nodes = nodeGraphMvp?.patch?.nodes;
  const n = Array.isArray(nodes) ? nodes.length : 0;
  const c = nodeGraphMvp?.connections?.length || 0;
  const m = nodeGraphMvp?.modulations?.length || 0;
  const g = nodeGraphMvp?.graphConnections?.length || 0;
  // Order / bypass can change feedback highlighting without connection counts.
  const orderLen = nodeGraphMvp?.live?.planEvidence?.order?.length
    ?? nodeGraphMvp?.executionPlan?.order?.length
    ?? 0;
  return `${n}|${c}|${m}|${g}|${orderLen}`;
}

function nodeGraphViewportCompileWirePlan() {
  const key = nodeGraphWirePlanCacheKey();
  if (
    nodeGraphViewportPerf.lastWirePlan
    && nodeGraphViewportPerf.lastWirePlanKey === key
  ) {
    return nodeGraphViewportPerf.lastWirePlan;
  }
  const plan = typeof compileNodeGraphExecutionPlan === "function"
    ? compileNodeGraphExecutionPlan()
    : null;
  nodeGraphViewportPerf.lastWirePlanKey = key;
  nodeGraphViewportPerf.lastWirePlan = plan;
  return plan;
}

/** Invalidate wire plan cache (call after patch/wire edits). */
function invalidateNodeGraphViewportWirePlanCache() {
  nodeGraphViewportPerf.lastWirePlan = null;
  nodeGraphViewportPerf.lastWirePlanKey = "";
}

/**
 * Heavy chrome: wires + heatmap. During a gesture, skip hit paths and scopes.
 * Full fidelity on settle.
 */
function flushNodeGraphViewportHeavyChrome(options = {}) {
  const full = options.full === true || !nodeGraphViewportGestureActive();
  if (typeof updateNodeGraphGridHeatmap === "function") {
    updateNodeGraphGridHeatmap();
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires({
      lite: !full,
      // Heatmap already updated above — avoid a second layout pass.
      skipHeatmap: true,
      skipScopes: !full,
      skipSelection: !full,
    });
  }
  if (full) {
    if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
      scheduleNodeGraphModuleScopeDraw();
    }
    if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
      scheduleNodeGraphModuleFramesUpdate({ force: false });
    }
  }
}

function scheduleNodeGraphViewportHeavyChrome() {
  if (nodeGraphViewportPerf.heavyRaf) {
    return;
  }
  nodeGraphViewportPerf.heavyRaf = window.requestAnimationFrame(() => {
    nodeGraphViewportPerf.heavyRaf = 0;
    flushNodeGraphViewportHeavyChrome({ full: false });
  });
}

function scheduleNodeGraphViewportSettle() {
  if (nodeGraphViewportPerf.settleTimer) {
    window.clearTimeout(nodeGraphViewportPerf.settleTimer);
  }
  nodeGraphViewportPerf.settleTimer = window.setTimeout(() => {
    nodeGraphViewportPerf.settleTimer = 0;
    nodeGraphViewportPerf.wheelActiveUntil = 0;
    clearNodeGraphViewportGestureClass();
    flushNodeGraphViewportHeavyChrome({ full: true });
    // Persist after settle so wheel doesn't thrash localStorage.
    scheduleNodeGraphWorkspaceViewPersist();
  }, nodeGraphViewportPerf.settleMs);
}

function scheduleNodeGraphWorkspaceViewPersist() {
  if (typeof saveNodeGraphWorkspaceViewToUserSettings !== "function") {
    return;
  }
  if (nodeGraphViewportPerf.persistTimer) {
    window.clearTimeout(nodeGraphViewportPerf.persistTimer);
  }
  nodeGraphViewportPerf.persistTimer = window.setTimeout(() => {
    nodeGraphViewportPerf.persistTimer = 0;
    saveNodeGraphWorkspaceViewToUserSettings({ status: false });
  }, nodeGraphViewportPerf.persistMs);
}

/** Immediate full chrome (no gesture). Use after reset / auto-frame. */
function flushNodeGraphViewportImmediate(options = {}) {
  if (nodeGraphViewportPerf.heavyRaf) {
    window.cancelAnimationFrame(nodeGraphViewportPerf.heavyRaf);
    nodeGraphViewportPerf.heavyRaf = 0;
  }
  if (nodeGraphViewportPerf.settleTimer) {
    window.clearTimeout(nodeGraphViewportPerf.settleTimer);
    nodeGraphViewportPerf.settleTimer = 0;
  }
  nodeGraphViewportPerf.wheelActiveUntil = 0;
  clearNodeGraphViewportGestureClass();
  applyNodeGraphViewportCssLight({
    zoom: options.zoom !== false,
    pan: options.pan !== false,
  });
  flushNodeGraphViewportHeavyChrome({ full: true });
  if (options.persist !== false) {
    scheduleNodeGraphWorkspaceViewPersist();
  }
}
