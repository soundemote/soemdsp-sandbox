const nodeGraphZoomLimits = Object.freeze({
  max: 100,
  min: 0.1,
  buttonRatio: 1.12,
  fineRatio: 1.05,
  quarterRatio: 1.08,
  wheelRatio: 1.12,
});

function applyNodeGraphWorkspaceView() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }

  workspace.style.setProperty("--node-grid-height", `${nodeGraphGridHeight()}px`);
  workspace.style.setProperty("--node-grid-size", `${nodeGraphGridSize()}px`);
  workspace.style.setProperty("--node-grid-width", `${nodeGraphGridWidth()}px`);
  // SSOT for canvas box size:
  //   📱/M on  → fixed frame from patch.view (resize handle owns the size)
  //   M off    → clear fixed width/height so the workspace fills the panel
  //              (💻/V only hides bars; must NOT keep the condensed frame size)
  const modularWindowed = Boolean(workspace.closest(".node-wiring-panel.modular-only-view"));
  const view = normalizeNodeGraphPatchView(nodeGraphMvp.patch?.view);
  const visibleView = view.widthGu > 0 && view.heightGu > 0
    ? clampNodeGraphWorkspaceGridSizeToViewport(view, workspace)
    : view;
  const useFixedFrameSize = modularWindowed
    && visibleView.widthGu > 0
    && visibleView.heightGu > 0;
  const widthCss = useFixedFrameSize
    ? nodeGraphWorkspaceWidthCss(visibleView.widthGu * nodeGraphGridWidth())
    : null;
  const heightCss = useFixedFrameSize
    ? nodeGraphWorkspaceHeightCss(visibleView.heightGu * nodeGraphGridHeight())
    : null;
  applyNodeGraphWorkspaceSizeCss(workspace, widthCss, heightCss);
  if (widthCss) {
    workspace.parentElement?.style.setProperty("--node-workspace-view-width", widthCss);
  } else {
    workspace.parentElement?.style.removeProperty("--node-workspace-view-width");
  }
  // Persist measured size when view is auto (0×0 fill); otherwise store patch view.
  if (visibleView.widthGu > 0 && visibleView.heightGu > 0) {
    workspace.dataset.widthGu = String(visibleView.widthGu);
    workspace.dataset.heightGu = String(visibleView.heightGu);
  } else if (typeof nodeGraphWorkspaceCurrentGridSize === "function") {
    const measured = nodeGraphWorkspaceCurrentGridSize();
    workspace.dataset.widthGu = String(measured.widthGu);
    workspace.dataset.heightGu = String(measured.heightGu);
  } else {
    workspace.dataset.widthGu = String(visibleView.widthGu);
    workspace.dataset.heightGu = String(visibleView.heightGu);
  }
  if (typeof syncNodeGraphModularViewSizeReadout === "function") {
    syncNodeGraphModularViewSizeReadout();
  }
  if (typeof syncNodeGraphWorkspaceResizeHandlePosition === "function") {
    syncNodeGraphWorkspaceResizeHandlePosition();
  }
  workspace.classList.toggle("patch-locked", Boolean(view.locked));
  workspace.classList.toggle("patch-unused-ports-hidden", Boolean(view.hideUnusedPorts));
  if (typeof syncNodeGraphReadyPanelChrome === "function") {
    syncNodeGraphReadyPanelChrome();
  }
  if (typeof pinNodeGraphWorkspaceCameraToScreen === "function") {
    pinNodeGraphWorkspaceCameraToScreen(workspace);
  }
  if (typeof applyNodeGraphPan === "function") {
    applyNodeGraphPan();
  }
  scheduleNodeGraphWorkspaceOriginSync();
  if (typeof scheduleNodeGraphSliderReadoutRelayout === "function") {
    scheduleNodeGraphSliderReadoutRelayout();
  }
}

function scheduleNodeGraphWorkspaceOriginSync() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return;
  }
  if (nodeGraphMvp.workspaceOriginSyncFrame) {
    window.cancelAnimationFrame(nodeGraphMvp.workspaceOriginSyncFrame);
  }
  nodeGraphMvp.workspaceOriginSyncFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp.workspaceOriginSyncFrame = window.requestAnimationFrame(() => {
      nodeGraphMvp.workspaceOriginSyncFrame = 0;
      if (typeof pinNodeGraphWorkspaceCameraToScreen === "function") {
        pinNodeGraphWorkspaceCameraToScreen();
      }
      if (typeof applyNodeGraphPan === "function") {
        applyNodeGraphPan();
      }
    });
  });
}

function nodeGraphZoom() {
  return Number.isFinite(nodeGraphMvp?.zoom) ? nodeGraphMvp.zoom : 1;
}

function nodeGraphZoomLabel() {
  return nodeGraphZoom().toFixed(2);
}

function nodeGraphRenderedPanValue(value, origin = 0) {
  const number = Number(value) || 0;
  const originNumber = Number(origin) || 0;
  const rendered = Math.round(originNumber + number) - originNumber;
  return Object.is(rendered, -0) ? 0 : rendered;
}

function invalidateNodeGraphWorkspaceLayoutMetrics() {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp._workspaceLayoutMetrics = null;
  }
}

function nodeGraphWorkspaceLayoutMetrics(container = document.getElementById("nodeGraphWorkspace")) {
  const gesturing = typeof nodeGraphViewportGestureActive === "function"
    && nodeGraphViewportGestureActive();
  if (gesturing && nodeGraphMvp?._workspaceLayoutMetrics) {
    return nodeGraphMvp._workspaceLayoutMetrics;
  }
  const rect = container?.getBoundingClientRect?.();
  const style = container ? getComputedStyle(container) : null;
  const metrics = {
    borderBottom: Number.parseFloat(style?.borderBottomWidth) || 0,
    borderLeft: Number.parseFloat(style?.borderLeftWidth) || 0,
    borderRight: Number.parseFloat(style?.borderRightWidth) || 0,
    borderTop: Number.parseFloat(style?.borderTopWidth) || 0,
    height: Number(rect?.height) || 0,
    left: Number(rect?.left) || 0,
    top: Number(rect?.top) || 0,
    width: Number(rect?.width) || 0,
  };
  if (gesturing && typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp._workspaceLayoutMetrics = metrics;
  }
  return metrics;
}

function nodeGraphWorkspaceCenterOffset(container = document.getElementById("nodeGraphWorkspace")) {
  const box = nodeGraphWorkspaceLayoutMetrics(container);
  return {
    x: box.borderLeft + Math.max(0, box.width - box.borderLeft - box.borderRight) * 0.5,
    y: box.borderTop + Math.max(0, box.height - box.borderTop - box.borderBottom) * 0.5,
  };
}

function nodeGraphRenderedPan(pan = nodeGraphMvp.pan || { x: 0, y: 0 }, container = document.getElementById("nodeGraphWorkspace")) {
  const box = nodeGraphWorkspaceLayoutMetrics(container);
  return {
    x: nodeGraphRenderedPanValue(pan.x, box.left + box.borderLeft),
    y: nodeGraphRenderedPanValue(pan.y, box.top + box.borderTop),
  };
}

function nodeGraphWorkspaceCameraBox(container = document.getElementById("nodeGraphWorkspace")) {
  if (!container?.getBoundingClientRect) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  const center = nodeGraphWorkspaceCenterOffset(container);
  return {
    left: rect.left,
    top: rect.top,
    centerX: center.x,
    centerY: center.y,
  };
}

function rememberNodeGraphWorkspaceCameraBox(container = document.getElementById("nodeGraphWorkspace")) {
  const box = nodeGraphWorkspaceCameraBox(container);
  if (box && typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.workspaceCameraBox = box;
  }
  return box;
}

function nodeGraphWorkspaceChromePin() {
  const pin = typeof nodeGraphMvp === "object" ? nodeGraphMvp?.workspaceChromePin : null;
  return {
    x: Number(pin?.x) || 0,
    y: Number(pin?.y) || 0,
  };
}

/**
 * Chrome (tips band, controller dock) changes #nodeGraphWorkspace's box.
 * Origin is workspace-center + pan, so a height change would slide lamps
 * (and, if pan is reapplied, modules). Hold the graph on the same screen
 * pixels by accumulating a chrome pin — user pan is left alone.
 * Skip while the user is dragging the workspace frame (centered clip).
 */
function pinNodeGraphWorkspaceCameraToScreen(container = document.getElementById("nodeGraphWorkspace")) {
  if (!container || typeof nodeGraphMvp !== "object" || !nodeGraphMvp) {
    return false;
  }
  if (nodeGraphMvp.workspaceResizing) {
    rememberNodeGraphWorkspaceCameraBox(container);
    return false;
  }
  const next = nodeGraphWorkspaceCameraBox(container);
  if (!next) {
    return false;
  }
  const prev = nodeGraphMvp.workspaceCameraBox;
  nodeGraphMvp.workspaceCameraBox = next;
  if (!prev) {
    return false;
  }
  const dx = (prev.left + prev.centerX) - (next.left + next.centerX);
  const dy = (prev.top + prev.centerY) - (next.top + next.centerY);
  if (!(Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05)) {
    return false;
  }
  const pin = nodeGraphWorkspaceChromePin();
  nodeGraphMvp.workspaceChromePin = { x: pin.x + dx, y: pin.y + dy };
  nodeGraphMvp._mouseLightWorkspaceRect = null;
  return true;
}

function setNodeGraphChromeSectionResizing(on) {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.chromeSectionResizing = Boolean(on);
  }
  document.body.classList.toggle("is-resizing-chrome-section", Boolean(on));
}

/**
 * Taskbar / Start / leaving the browser window often delivers pointercancel
 * or a ghost client point (0,0 or a huge jump). Keep the last good sample.
 */
function nodeGraphSectionResizeAcceptPoint(event, lastPoint) {
  if (!event) {
    return null;
  }
  const type = String(event.type || "");
  if (type === "pointercancel" || type === "lostpointercapture") {
    return null;
  }
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (lastPoint) {
    const span = Math.min(Number(window.innerWidth) || 800, Number(window.innerHeight) || 600);
    const maxJump = Math.max(160, Math.round(span * 0.4));
    if (Math.abs(x - lastPoint.x) > maxJump || Math.abs(y - lastPoint.y) > maxJump) {
      return null;
    }
  }
  return { x, y };
}

function watchNodeGraphSectionResizeDrag(event, options = {}) {
  const handle = options.handle || event.currentTarget;
  const pointerId = event.pointerId;
  let lastPoint = nodeGraphSectionResizeAcceptPoint(event, null) || {
    x: Number(event.clientX) || 0,
    y: Number(event.clientY) || 0,
  };
  let finished = false;
  setNodeGraphChromeSectionResizing(true);
  handle?.classList.add("is-dragging");
  try {
    handle?.setPointerCapture?.(pointerId);
  } catch {
    // ignore
  }

  const onMove = (moveEvent) => {
    if (finished) {
      return;
    }
    if (moveEvent.pointerId != null && pointerId != null && moveEvent.pointerId !== pointerId) {
      return;
    }
    const point = nodeGraphSectionResizeAcceptPoint(moveEvent, lastPoint);
    if (!point) {
      return;
    }
    lastPoint = point;
    options.onMove?.(point, moveEvent);
  };

  const onEnd = (endEvent) => {
    if (finished) {
      return;
    }
    if (endEvent?.pointerId != null && pointerId != null && endEvent.pointerId !== pointerId) {
      return;
    }
    finished = true;
    handle?.classList.remove("is-dragging");
    try {
      if (pointerId != null && handle?.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onEnd, true);
    document.removeEventListener("pointercancel", onEnd, true);
    handle?.removeEventListener("lostpointercapture", onEnd);
    setNodeGraphChromeSectionResizing(false);
    options.onEnd?.(endEvent, lastPoint);
  };

  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onEnd, true);
  document.addEventListener("pointercancel", onEnd, true);
  handle?.addEventListener("lostpointercapture", onEnd);
}

function nodeGraphRenderedOriginOffset(
  pan = nodeGraphMvp.pan || { x: 0, y: 0 },
  container = document.getElementById("nodeGraphWorkspace"),
) {
  const center = nodeGraphWorkspaceCenterOffset(container);
  const renderedPan = nodeGraphRenderedPan(pan, container);
  const pin = nodeGraphWorkspaceChromePin();
  return {
    x: center.x + renderedPan.x + pin.x,
    y: center.y + renderedPan.y + pin.y,
  };
}

function nodeGraphZoomSurface() {
  return document.getElementById("nodeGraphZoomSurface");
}

// Same rounding bug as the one fixed below for nodeGraphZoomSurfaceClientScale,
// just showing up in a second place: this used to return offsetWidth/
// offsetHeight (rounded to integer CSS pixels), which drawNodeGraphWires
// feeds straight into the wire SVG's viewBox. Since the SVG is itself a
// descendant of the zoomed surface, its rendered box is sub-pixel precise,
// but the viewBox denominator was an integer -- so viewBox-to-rendered scale
// drifted from the true zoom (measured ~0.22 out of 8 at zoom 8x), which
// visibly desynced wires from their ports as zoom changed. Deriving the
// local size from the precise getBoundingClientRect() divided by the true
// zoom keeps the ratio exact.
function nodeGraphGraphRect() {
  const surface = nodeGraphZoomSurface();
  const graphElement = surface || document.getElementById("nodeGraphWorkspace");
  const rect = graphElement?.getBoundingClientRect?.();
  if (!rect) {
    return { height: 0, width: 0 };
  }
  const zoom = Math.max(0.0001, nodeGraphZoom());
  return {
    height: rect.height / zoom,
    width: rect.width / zoom,
  };
}

// Camera scale is nodeGraphZoom() (compositor transform scale). Do not
// reverse-engineer from getBoundingClientRect / offsetWidth.
function nodeGraphZoomSurfaceClientScale(surface = nodeGraphZoomSurface()) {
  const zoom = Math.max(0.0001, nodeGraphZoom());
  return { x: zoom, y: zoom };
}

function nodeGraphClientToZoomSurfacePoint(clientX, clientY, surface = nodeGraphZoomSurface()) {
  const rect = surface?.getBoundingClientRect?.();
  if (!rect) {
    return { x: 0, y: 0 };
  }
  const scale = nodeGraphZoomSurfaceClientScale(surface);
  return {
    x: (clientX - rect.left) / scale.x,
    y: (clientY - rect.top) / scale.y,
  };
}

function nodeGraphClientPoint(event) {
  return nodeGraphClientToZoomSurfacePoint(event.clientX, event.clientY);
}

function positionNodeGraphNode(node, point, options = {}) {
  const graphRect = nodeGraphGraphRect();
  const maxX = Math.max(0, graphRect.width - node.offsetWidth - 10);
  const maxY = Math.max(0, graphRect.height - node.offsetHeight - 10);
  const snapOptions = { halfGrid: options.halfGrid === true };
  const positionedPoint = options.snap === false ? point : snapNodeGraphPointToGrid(point, snapOptions);
  const x = options.clamp === false
    ? positionedPoint.x
    : Math.max(0, Math.min(maxX, positionedPoint.x));
  const y = options.clamp === false
    ? positionedPoint.y
    : Math.max(0, Math.min(maxY, positionedPoint.y));
  node.style.setProperty("--node-x", `${x}px`);
  node.style.setProperty("--node-y", `${y}px`);
}

function nodeGraphRectFromPoints(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function nodeGraphNodeBounds(node) {
  const x = Number.parseFloat(node.style.getPropertyValue("--node-x")) || 0;
  const y = Number.parseFloat(node.style.getPropertyValue("--node-y")) || 0;
  return {
    bottom: y + node.offsetHeight,
    left: x,
    right: x + node.offsetWidth,
    top: y,
  };
}

function nodeGraphWorkspaceFloatProperty(element, property, fallback = 0) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(property));
  return Number.isFinite(value) ? value : fallback;
}

function nodeGraphGridVisualScaleCss(workspace) {
  const host = workspace || document.getElementById("nodeGraphWorkspace");
  if (!host) {
    return 1;
  }
  const raw = Number.parseFloat(
    host.style.getPropertyValue("--node-grid-visual-scale")
    || getComputedStyle(host).getPropertyValue("--node-grid-visual-scale")
    || "",
  );
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof nodeGraphGridVisualScaleFromMultiply === "function") {
    return nodeGraphGridVisualScaleFromMultiply(
      document.getElementById("nodeUiDevGridDivisionMultiply")?.value,
    );
  }
  return 1;
}

function nodeGraphGridScreenCellPx(workspace, zoom) {
  const z = Number.isFinite(Number(zoom)) ? Number(zoom) : (typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1);
  const visualScale = nodeGraphGridVisualScaleCss(workspace);
  return {
    height: nodeGraphGridHeight() * z * visualScale,
    width: nodeGraphGridWidth() * z * visualScale,
  };
}

function nodeGraphGridBackgroundPhase(origin, cell) {
  const period = Number(cell);
  if (!(period > 0) || !Number.isFinite(period)) {
    return 0;
  }
  const value = Number(origin) || 0;
  return ((value % period) + period) % period;
}

function applyNodeGraphGridVisualCellSize(workspace, heatmap, zoom) {
  const surface = heatmap || document.getElementById("nodeGridHeatmap");
  const host = workspace || document.getElementById("nodeGraphWorkspace");
  if (!surface || !host) {
    return null;
  }
  const cell = nodeGraphGridScreenCellPx(host, zoom);
  surface.style.setProperty(
    "--node-grid-heatmap-grid-size",
    `${cell.width}px ${cell.height}px`,
  );
  return cell;
}

function nodeGraphHeatmapWantsGrid() {
  return nodeGraphMvp?.gridVisible === true;
}

function nodeGraphHeatmapWantsLight() {
  return nodeGraphMvp?.gridLightVisible !== false;
}

function updateNodeGraphGridHeatmap(options = {}) {
  const heatmap = document.getElementById("nodeGridHeatmap");
  const surface = nodeGraphZoomSurface();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!heatmap || !surface || !workspace) {
    return;
  }

  const wantGrid = nodeGraphHeatmapWantsGrid();
  const wantLight = nodeGraphHeatmapWantsLight();
  if (!wantGrid && !wantLight && options?.force !== true) {
    heatmap.style.setProperty("--node-grid-heatmap", "none");
    heatmap.style.setProperty(
      "--node-grid-reveal-mask",
      "linear-gradient(transparent, transparent)",
    );
    return;
  }

  const zoom = nodeGraphZoom();
  const origin = nodeGraphRenderedOriginOffset();
  // Phase-wrap into one cell. A raw origin of e.g. -3500 with a 4000px tile
  // puts the 1px line off-screen; Chrome then often skips the next tile, so
  // the line you zoomed in on vanishes once the cell exceeds the workspace.
  const cell = options?.phaseOnly === true
    ? nodeGraphGridScreenCellPx(workspace, zoom)
    : (applyNodeGraphGridVisualCellSize(workspace, heatmap, zoom)
      || nodeGraphGridScreenCellPx(workspace, zoom));
  const phaseX = nodeGraphGridBackgroundPhase(origin.x, cell.width);
  const phaseY = nodeGraphGridBackgroundPhase(origin.y, cell.height);
  heatmap.style.setProperty("--node-grid-heatmap-grid-position", `${phaseX}px ${phaseY}px`);

  const gesturing = typeof nodeGraphViewportGestureActive === "function"
    && nodeGraphViewportGestureActive();
  // Pause only the O(modules) light/mask rebuild. Grid position already updated.
  if (
    options?.lite === true
    || options?.phaseOnly === true
    || (gesturing && options?.force !== true)
  ) {
    return;
  }

  const glowLayers = [];
  const maskLayers = [];
  const visibleNodes = [...surface.querySelectorAll(".dsp-node:not(.removed):not([hidden])")];
  const lightSpread = Math.max(
    0.4,
    Math.min(2.2, nodeGraphWorkspaceFloatProperty(workspace, "--node-module-light-spread", 0.78)),
  );
  const gridSpread = Math.max(
    0.4,
    Math.min(2.2, nodeGraphWorkspaceFloatProperty(workspace, "--node-grid-reveal-spread", 0.78)),
  );
  const lightBright = Math.max(
    0,
    Math.min(1, nodeGraphWorkspaceFloatProperty(workspace, "--node-module-light-brightness", 1)),
  );
  const roomDim = typeof nodeGraphRoomDim === "function"
    ? Math.max(0, Math.min(1, Number(nodeGraphRoomDim()) || 0))
    : 0;
  const deep = typeof nodeGraphRoomDimDeep === "function"
    ? Math.max(0, Math.min(1, Number(nodeGraphRoomDimDeep()) || 0))
    : (roomDim <= 0.5 ? 0 : Math.min(1, (roomDim - 0.5) * 2));
  const moduleAmt = Math.max(0, 1 - deep);
  const moduleBright = lightBright * moduleAmt;
  for (const node of visibleNodes) {
    if (node.classList.contains("viewport-asleep")) {
      continue;
    }
    const bounds = nodeGraphNodeBounds(node);
    const centerX = (bounds.left + (bounds.right - bounds.left) / 2) * zoom + (Number(origin.x) || 0);
    const centerY = (bounds.top + (bounds.bottom - bounds.top) / 2) * zoom + (Number(origin.y) || 0);
    const baseX = Math.max(nodeGraphGridWidth() * 5, (bounds.right - bounds.left) * 1.18) * zoom;
    const baseY = Math.max(nodeGraphGridHeight() * 5, (bounds.bottom - bounds.top) * 1.35) * zoom;
    if (wantLight && moduleBright > 0) {
      const radiusX = baseX * lightSpread;
      const radiusY = baseY * lightSpread;
      const a0 = (0.18 * moduleBright).toFixed(3);
      const a1 = (0.15 * moduleBright).toFixed(3);
      const a2 = (0.10 * moduleBright).toFixed(3);
      const a3 = (0.045 * moduleBright).toFixed(3);
      glowLayers.push(
        `radial-gradient(ellipse ${radiusX.toFixed(2)}px ${radiusY.toFixed(2)}px at ${centerX.toFixed(2)}px ${centerY.toFixed(2)}px, rgba(127, 199, 217, ${a0}) 0%, rgba(127, 199, 217, ${a1}) 18%, rgba(226, 168, 109, ${a2}) 38%, rgba(226, 168, 109, ${a3}) 62%, transparent 92%)`,
      );
    }
    if (wantGrid && moduleAmt > 0.001) {
      const maskX = baseX * gridSpread;
      const maskY = baseY * gridSpread;
      maskLayers.push(
        `radial-gradient(ellipse ${maskX.toFixed(2)}px ${maskY.toFixed(2)}px at ${centerX.toFixed(2)}px ${centerY.toFixed(2)}px, rgb(0 0 0 / ${moduleAmt.toFixed(3)}) 0%, rgb(0 0 0 / ${(0.95 * moduleAmt).toFixed(3)}) 22%, rgb(0 0 0 / ${(0.72 * moduleAmt).toFixed(3)}) 48%, rgb(0 0 0 / ${(0.28 * moduleAmt).toFixed(3)}) 74%, transparent 94%)`,
      );
    }
  }
  // Screen glow is the veil SDF (sharp shape, smoothstep outward). Do not
  // stamp a CSS ellipse over the glass.
  let mouseAmount = Math.max(0, Math.min(2, nodeGraphWorkspaceFloatProperty(workspace, "--node-mouse-light-amount")));
  const mouseSpread = Math.max(0, Math.min(2, nodeGraphWorkspaceFloatProperty(workspace, "--node-mouse-light-spread")));
  const mousePoint = nodeGraphMvp.mouseLightPoint;
  // Without a mouse dimmer cutout, fade the mouse light with room dim so it
  // doesn't stay full-bright under the veil. With cutout on, keep full amount
  // (the hole reveals it at design strength).
  if (mouseAmount > 0 && nodeGraphMvp?.dimmerCutoutMouseEnabled !== true
    && typeof nodeGraphRoomDim === "function") {
    const roomDim = Math.max(0, Math.min(1, Number(nodeGraphRoomDim()) || 0));
    if (roomDim > 0.0005) {
      mouseAmount *= Math.max(0, 1 - roomDim);
    }
  }
  if (mouseAmount > 0 && mouseSpread > 0 && mousePoint) {
    const radius = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * (3 + 10.5 * mouseSpread) * zoom;
    maskLayers.push(
      `radial-gradient(circle ${radius.toFixed(2)}px at ${mousePoint.x.toFixed(2)}px ${mousePoint.y.toFixed(2)}px, rgb(0 0 0 / ${(0.92 * mouseAmount).toFixed(3)}) 0%, rgb(0 0 0 / ${(0.68 * mouseAmount).toFixed(3)}) 32%, rgb(0 0 0 / ${(0.24 * mouseAmount).toFixed(3)}) 72%, transparent 96%)`,
    );
  }
  heatmap.style.setProperty("--node-grid-heatmap", glowLayers.length ? glowLayers.join(", ") : "none");
  const mask = maskLayers.length ? maskLayers.join(", ") : "linear-gradient(transparent, transparent)";
  heatmap.style.setProperty("--node-grid-reveal-mask", mask);
  heatmap.style.setProperty("--node-grid-heatmap-mask", mask);
}

function scheduleNodeGraphGridHeatmapUpdate() {
  if (nodeGraphMvp.mouseLightFrame) {
    return;
  }
  if (!nodeGraphHeatmapWantsGrid() && !nodeGraphHeatmapWantsLight()) {
    return;
  }
  nodeGraphMvp.mouseLightFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp.mouseLightFrame = 0;
    const gesturing = typeof nodeGraphViewportGestureActive === "function"
      && nodeGraphViewportGestureActive();
    updateNodeGraphGridHeatmap({ lite: gesturing });
  });
}

function updateNodeGraphMouseLight(event) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  // Avoid getBoundingClientRect on every move when possible: workspace is the
  // event target for canvas moves; still need rect for origin. Cache for 1 frame.
  let rect = nodeGraphMvp._mouseLightWorkspaceRect;
  const now = performance.now?.() || Date.now();
  if (!rect || (now - (nodeGraphMvp._mouseLightWorkspaceRectAt || 0)) > 250) {
    rect = workspace.getBoundingClientRect();
    nodeGraphMvp._mouseLightWorkspaceRect = rect;
    nodeGraphMvp._mouseLightWorkspaceRectAt = now;
  }
  nodeGraphMvp.mouseLightPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  if (typeof nodeGraphViewportGestureActive === "function" && nodeGraphViewportGestureActive()) {
    updateNodeGraphGridHeatmap({ lite: true });
    return;
  }
  scheduleNodeGraphGridHeatmapUpdate();
}

function clearNodeGraphMouseLight() {
  nodeGraphMvp.mouseLightPoint = null;
  if (nodeGraphHeatmapWantsGrid() || nodeGraphHeatmapWantsLight()) {
    updateNodeGraphGridHeatmap();
  }
}

function nodeGraphRectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
