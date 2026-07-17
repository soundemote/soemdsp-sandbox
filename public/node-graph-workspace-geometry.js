const nodeGraphZoomLimits = Object.freeze({
  max: 50,
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
  // "View Buttons" off: let the modular-only workspace fill the viewport
  // edge-to-edge instead of clamping it to the patch's saved grid size.
  const modularOnlyExpanded = nodeGraphMvp.modularOnlyControlsVisible === false
    && Boolean(workspace.closest(".node-wiring-panel.modular-only-view"));
  const view = normalizeNodeGraphPatchView(nodeGraphMvp.patch.view);
  const visibleView = view.widthGu > 0 && view.heightGu > 0
    ? clampNodeGraphWorkspaceGridSizeToViewport(view, workspace)
    : view;
  const widthCss = !modularOnlyExpanded && visibleView.widthGu > 0
    ? nodeGraphWorkspaceWidthCss(visibleView.widthGu * nodeGraphGridWidth())
    : null;
  const heightCss = !modularOnlyExpanded && visibleView.heightGu > 0
    ? nodeGraphWorkspaceHeightCss(visibleView.heightGu * nodeGraphGridHeight())
    : null;
  applyNodeGraphWorkspaceSizeCss(workspace, widthCss, heightCss);
  if (widthCss) {
    workspace.parentElement?.style.setProperty("--node-workspace-view-width", widthCss);
  } else {
    workspace.parentElement?.style.removeProperty("--node-workspace-view-width");
  }
  workspace.dataset.widthGu = String(visibleView.widthGu);
  workspace.dataset.heightGu = String(visibleView.heightGu);
  if (typeof syncNodeGraphModularViewSizeReadout === "function") {
    syncNodeGraphModularViewSizeReadout();
  }
  if (typeof syncNodeGraphWorkspaceResizeHandlePosition === "function") {
    syncNodeGraphWorkspaceResizeHandlePosition();
  }
  if (typeof applyNodeGraphPan === "function") {
    applyNodeGraphPan();
  }
  scheduleNodeGraphWorkspaceOriginSync();
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
      if (typeof applyNodeGraphPan === "function") {
        applyNodeGraphPan();
      }
    });
  });
}

function nodeGraphZoom() {
  return Number.isFinite(nodeGraphMvp.zoom) ? nodeGraphMvp.zoom : 1;
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

function nodeGraphWorkspaceCenterOffset(container = document.getElementById("nodeGraphWorkspace")) {
  const rect = container?.getBoundingClientRect?.();
  const style = container ? getComputedStyle(container) : null;
  const borderLeft = Number.parseFloat(style?.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style?.borderTopWidth) || 0;
  const borderRight = Number.parseFloat(style?.borderRightWidth) || 0;
  const borderBottom = Number.parseFloat(style?.borderBottomWidth) || 0;
  return {
    x: borderLeft + Math.max(0, (Number(rect?.width) || 0) - borderLeft - borderRight) * 0.5,
    y: borderTop + Math.max(0, (Number(rect?.height) || 0) - borderTop - borderBottom) * 0.5,
  };
}

function nodeGraphRenderedPan(pan = nodeGraphMvp.pan || { x: 0, y: 0 }, container = document.getElementById("nodeGraphWorkspace")) {
  const rect = container?.getBoundingClientRect?.();
  const style = container ? getComputedStyle(container) : null;
  const borderLeft = Number.parseFloat(style?.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style?.borderTopWidth) || 0;
  return {
    x: nodeGraphRenderedPanValue(pan.x, (rect?.left || 0) + borderLeft),
    y: nodeGraphRenderedPanValue(pan.y, (rect?.top || 0) + borderTop),
  };
}

function nodeGraphRenderedOriginOffset(
  pan = nodeGraphMvp.pan || { x: 0, y: 0 },
  container = document.getElementById("nodeGraphWorkspace"),
) {
  const center = nodeGraphWorkspaceCenterOffset(container);
  const renderedPan = nodeGraphRenderedPan(pan, container);
  return {
    x: center.x + renderedPan.x,
    y: center.y + renderedPan.y,
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

// Long-standing bug: wires jittered and didn't quite land on their ports,
// worse the further you zoomed in. This used to measure the client<->surface
// scale as getBoundingClientRect().width / offsetWidth -- but CSS `zoom`
// (unlike transform: scale) affects layout, and offsetWidth/offsetHeight are
// spec-mandated to round to integer CSS pixels. Dividing a sub-pixel-precise
// rect by that rounded integer produced a scale that drifted from the true
// zoom by an amount that grew as the surface's own offsetWidth (the
// denominator) shrank at higher zoom -- e.g. measured drift of -0.42 out of
// 8 at zoom 8x. The zoom surface only ever has the one
// `zoom: var(--node-graph-zoom)` applied (verified no compounding ancestor
// zoom/transform), so the true scale is always exactly nodeGraphZoom() --
// no need to reverse-engineer it from an already-rounded DOM measurement.
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

function updateNodeGraphGridHeatmap() {
  const heatmap = document.getElementById("nodeGridHeatmap");
  const surface = nodeGraphZoomSurface();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!heatmap || !surface || !workspace) {
    return;
  }

  const glowLayers = [];
  const maskLayers = [];
  const visibleNodes = [...surface.querySelectorAll(".dsp-node:not(.removed):not([hidden])")];
  const zoom = nodeGraphZoom();
  const origin = nodeGraphRenderedOriginOffset();
  heatmap.style.setProperty("--node-grid-heatmap-grid-position", `${origin.x}px ${origin.y}px`);
  heatmap.style.setProperty(
    "--node-grid-heatmap-grid-size",
    `${(nodeGraphGridWidth() * zoom).toFixed(2)}px ${(nodeGraphGridHeight() * zoom).toFixed(2)}px`,
  );
  const spread = Math.max(
    0.4,
    Math.min(
      2.2,
      (Number.parseFloat(getComputedStyle(workspace).getPropertyValue("--node-module-light-spread")) || 1),
    ),
  );
  for (const node of visibleNodes) {
    const bounds = nodeGraphNodeBounds(node);
    const centerX = (bounds.left + (bounds.right - bounds.left) / 2) * zoom + (Number(origin.x) || 0);
    const centerY = (bounds.top + (bounds.bottom - bounds.top) / 2) * zoom + (Number(origin.y) || 0);
    const radiusX = Math.max(nodeGraphGridWidth() * 5, (bounds.right - bounds.left) * 1.18) * spread * zoom;
    const radiusY = Math.max(nodeGraphGridHeight() * 5, (bounds.bottom - bounds.top) * 1.35) * spread * zoom;
    glowLayers.push(
      `radial-gradient(ellipse ${radiusX.toFixed(2)}px ${radiusY.toFixed(2)}px at ${centerX.toFixed(2)}px ${centerY.toFixed(2)}px, rgba(127, 199, 217, 0.18) 0%, rgba(127, 199, 217, 0.15) 18%, rgba(226, 168, 109, 0.1) 38%, rgba(226, 168, 109, 0.045) 62%, transparent 92%)`,
    );
    maskLayers.push(
      `radial-gradient(ellipse ${radiusX.toFixed(2)}px ${radiusY.toFixed(2)}px at ${centerX.toFixed(2)}px ${centerY.toFixed(2)}px, black 0%, rgb(0 0 0 / 0.95) 22%, rgb(0 0 0 / 0.72) 48%, rgb(0 0 0 / 0.28) 74%, transparent 94%)`,
    );
  }
  const mouseAmount = Math.max(0, Math.min(2, nodeGraphWorkspaceFloatProperty(workspace, "--node-mouse-light-amount")));
  const mouseSpread = Math.max(0, Math.min(2, nodeGraphWorkspaceFloatProperty(workspace, "--node-mouse-light-spread")));
  const mousePoint = nodeGraphMvp.mouseLightPoint;
  if (mouseAmount > 0 && mouseSpread > 0 && mousePoint) {
    const radius = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * (3 + 10.5 * mouseSpread) * zoom;
    maskLayers.push(
      `radial-gradient(circle ${radius.toFixed(2)}px at ${mousePoint.x.toFixed(2)}px ${mousePoint.y.toFixed(2)}px, rgb(0 0 0 / ${(0.92 * mouseAmount).toFixed(3)}) 0%, rgb(0 0 0 / ${(0.68 * mouseAmount).toFixed(3)}) 32%, rgb(0 0 0 / ${(0.24 * mouseAmount).toFixed(3)}) 72%, transparent 96%)`,
    );
  }
  heatmap.style.setProperty("--node-grid-heatmap", glowLayers.length ? glowLayers.join(", ") : "none");
  heatmap.style.setProperty(
    "--node-grid-heatmap-mask",
    maskLayers.length ? maskLayers.join(", ") : "linear-gradient(transparent, transparent)",
  );
}

function scheduleNodeGraphGridHeatmapUpdate() {
  if (nodeGraphMvp.mouseLightFrame) {
    return;
  }
  nodeGraphMvp.mouseLightFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp.mouseLightFrame = 0;
    updateNodeGraphGridHeatmap();
  });
}

function updateNodeGraphMouseLight(event) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const rect = workspace.getBoundingClientRect();
  nodeGraphMvp.mouseLightPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  scheduleNodeGraphGridHeatmapUpdate();
}

function clearNodeGraphMouseLight() {
  nodeGraphMvp.mouseLightPoint = null;
  updateNodeGraphGridHeatmap();
}

function nodeGraphRectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
