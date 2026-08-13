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
  settleMs: 280,
  persistMs: 220,
  wheelHoldMs: 320,
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

/** Zoom-ish gesture kinds: hide wires + port jacks while active (CSS). */
function nodeGraphViewportGestureIsZoom(kind = "") {
  const k = String(kind || "").toLowerCase();
  return k === "zoom" || k === "wheel" || k === "pinch" || k === "smooth-zoom" || k === "smoothzoom";
}

/** Mark an interactive viewport gesture (wheel / pan / pinch / smooth-zoom). */
function markNodeGraphViewportGesture(kind = "gesture") {
  nodeGraphViewportPerf.lastGestureKind = String(kind || "gesture");
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  workspace.classList.add("viewport-gesturing");
  // Hide inlet/outlet dots + wires only while zooming (not pan) for FPS/clarity.
  if (
    nodeGraphViewportGestureIsZoom(kind)
    || nodeGraphMvp?.smoothZoomDragging
    || nodeGraphMvp?.workspacePinchZooming
  ) {
    workspace.classList.add("viewport-zooming");
  }
  // Pan / drag-zoom: lights + wires stay frozen until pointerup (no settle timer
  // mid-drag). Wheel has no mouse-up, so only wheel schedules a settle.
  if (kind === "wheel") {
    nodeGraphViewportPerf.wheelActiveUntil = (performance.now?.() || Date.now())
      + nodeGraphViewportPerf.wheelHoldMs;
    scheduleNodeGraphViewportSettle();
  }
}

/**
 * Pointer-up end of pan / pinch / smooth-zoom: one full lights+wires pass.
 * No debounce timer — user asked for mouse-up only.
 */
function flushNodeGraphViewportOnPointerUp(options = {}) {
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
  if (typeof applyNodeGraphViewportCssLight === "function") {
    applyNodeGraphViewportCssLight({
      zoom: options.zoom !== false,
      pan: options.pan !== false,
    });
  }
  flushNodeGraphViewportHeavyChrome({ full: true });
  if (options.persist !== false) {
    scheduleNodeGraphWorkspaceViewPersist();
  }
}

function clearNodeGraphViewportGestureClass() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  workspace.classList.remove("viewport-gesturing", "viewport-zooming");
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
  if (typeof scheduleNodeGraphRoomDimmerDraw === "function") {
    scheduleNodeGraphRoomDimmerDraw();
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
 * Heavy chrome: wires + module lights (heatmap).
 * During pan/zoom the surface is CSS-transformed — do not redraw lights or
 * wires mid-gesture. full:true only (pointer-up / wheel settle / immediate).
 */
function flushNodeGraphViewportHeavyChrome(options = {}) {
  const gesturing = nodeGraphViewportGestureActive();
  if (typeof scheduleNodeGraphRoomDimmerDraw === "function") {
    scheduleNodeGraphRoomDimmerDraw();
  }
  const full = options.full === true || !gesturing;
  if (!full) {
    // Frozen mid-gesture: no lights, no wires.
    return;
  }
  if (
    typeof updateNodeGraphGridHeatmap === "function"
    && nodeGraphMvp?.gridLightVisible !== false
  ) {
    updateNodeGraphGridHeatmap();
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires({
      lite: false,
      skipHeatmap: true,
      skipScopes: false,
      skipSelection: false,
    });
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
    scheduleNodeGraphModuleFramesUpdate({ force: false });
  }
}

function scheduleNodeGraphViewportHeavyChrome() {
  // Kept for call sites. Never rebuild lights/wires while a gesture is active.
  if (nodeGraphViewportPerf.heavyRaf) {
    return;
  }
  nodeGraphViewportPerf.heavyRaf = window.requestAnimationFrame(() => {
    nodeGraphViewportPerf.heavyRaf = 0;
    if (nodeGraphViewportGestureActive()) {
      return;
    }
    flushNodeGraphViewportHeavyChrome({ full: true });
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
const nodeGraphViewportCull = {
  observer: null,
};

function nodeGraphModuleIsViewportAsleep(nodeOrElement) {
  const element = nodeOrElement instanceof Element
    ? (nodeOrElement.classList.contains("dsp-node")
      ? nodeOrElement
      : nodeOrElement.closest?.(".dsp-node"))
    : (typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(nodeOrElement)
      : null);
  return Boolean(element?.classList.contains("viewport-asleep"));
}

function nodeGraphViewportCullWakePainters(element) {
  if (!element) {
    return;
  }
  const nodeId = String(element.dataset?.node || "");
  for (const face of element.querySelectorAll(".node-fbm-field-face")) {
    if (typeof nodeGraphFbmFieldStartLoop === "function") {
      nodeGraphFbmFieldStartLoop(face, nodeId || face.dataset?.node);
    }
  }
  element.dispatchEvent(new CustomEvent("nodegraphviewport", {
    bubbles: false,
    detail: { asleep: false },
  }));
}

function nodeGraphViewportCullSleepPainters(element) {
  if (!element) {
    return;
  }
  for (const face of element.querySelectorAll(".node-fbm-field-face")) {
    if (typeof nodeGraphFbmFieldStopLoop === "function") {
      nodeGraphFbmFieldStopLoop(face);
    }
  }
  element.dispatchEvent(new CustomEvent("nodegraphviewport", {
    bubbles: false,
    detail: { asleep: true },
  }));
}

function nodeGraphViewportCullApply(element, intersecting) {
  if (!element?.classList?.contains("dsp-node")) {
    return;
  }
  const nodeId = String(element.dataset?.node || "");
  const selected = Boolean(
    nodeId
    && typeof nodeGraphSelectedNodeIds === "function"
    && nodeGraphSelectedNodeIds().has(nodeId),
  );
  const awake = intersecting || selected;
  const wasAsleep = element.classList.contains("viewport-asleep");
  element.classList.toggle("viewport-asleep", !awake);
  if (wasAsleep === !awake) {
    return;
  }
  if (awake) {
    nodeGraphViewportCullWakePainters(element);
  } else {
    nodeGraphViewportCullSleepPainters(element);
  }
}

function ensureNodeGraphViewportModuleCull() {
  const root = document.getElementById("nodeGraphWorkspace");
  if (!root || typeof IntersectionObserver !== "function") {
    return null;
  }
  if (nodeGraphViewportCull.observer) {
    return nodeGraphViewportCull.observer;
  }
  nodeGraphViewportCull.observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const node = entry.target?.classList?.contains("dsp-node")
        ? entry.target
        : entry.target?.closest?.(".dsp-node");
      if (node) {
        nodeGraphViewportCullApply(node, entry.isIntersecting);
      }
    }
  }, {
    root,
    rootMargin: "160px",
    threshold: 0,
  });
  return nodeGraphViewportCull.observer;
}

function nodeGraphViewportCullObserve(element) {
  const node = element?.classList?.contains("dsp-node")
    ? element
    : element?.closest?.(".dsp-node");
  if (!node) {
    return;
  }
  const observer = ensureNodeGraphViewportModuleCull();
  if (!observer) {
    return;
  }
  try {
    observer.observe(node);
  } catch (_error) {
    // Ignore detached / double-observe.
  }
}

function nodeGraphViewportCullSyncSelection() {
  const selected = typeof nodeGraphSelectedNodeIds === "function"
    ? nodeGraphSelectedNodeIds()
    : new Set();
  for (const id of selected) {
    const element = typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(id)
      : null;
    if (element?.classList.contains("viewport-asleep")) {
      nodeGraphViewportCullApply(element, true);
    }
  }
}

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
