function nodeGraphGridSize() {
  return normalizeNodeGraphPatchGrid(nodeGraphMvp.patch?.grid).sizePx;
}

function nodeGraphGridWidth() {
  return normalizeNodeGraphPatchGrid(nodeGraphMvp.patch?.grid).widthPx;
}

function nodeGraphGridHeight() {
  return normalizeNodeGraphPatchGrid(nodeGraphMvp.patch?.grid).heightPx;
}

function withNodeGraphWorkspaceContentAnchored(workspace, update) {
  update();
  applyNodeGraphPan();
}

function nodeGraphWorkspaceChromeSize(axis) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return 0;
  }
  const styles = getComputedStyle(workspace);
  const keys = axis === "y"
    ? ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"]
    : ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"];
  return keys.reduce((total, key) => total + (Number.parseFloat(styles[key]) || 0), 0);
}

function nodeGraphWorkspaceWidthCss(widthPx) {
  return `${Math.round(widthPx + nodeGraphWorkspaceChromeSize("x"))}px`;
}

function nodeGraphWorkspaceHeightCss(heightPx) {
  return `${Math.round(heightPx + nodeGraphWorkspaceChromeSize("y"))}px`;
}

function nodeGraphWorkspaceViewportInsetPx(workspace = document.getElementById("nodeGraphWorkspace")) {
  if (!workspace?.closest?.(".node-wiring-panel.modular-only-view")) {
    return 0;
  }
  const panel = workspace.closest(".node-wiring-panel");
  const value = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--node-modular-only-inset"));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nodeGraphWorkspaceMaxViewportGridSize(workspace = document.getElementById("nodeGraphWorkspace")) {
  const inset = nodeGraphWorkspaceViewportInsetPx(workspace);
  const limits = typeof nodeGraphWorkspaceViewLimits === "object"
    ? nodeGraphWorkspaceViewLimits
    : { minWidthGu: 1, minHeightGu: 1 };
  const maxWidthPx = Math.max(0, window.innerWidth - inset * 2 - nodeGraphWorkspaceChromeSize("x"));
  const maxHeightPx = Math.max(0, window.innerHeight - inset * 2 - nodeGraphWorkspaceChromeSize("y"));
  return {
    heightGu: Math.max(limits.minHeightGu, Math.floor(maxHeightPx / Math.max(1, nodeGraphGridHeight()))),
    widthGu: Math.max(limits.minWidthGu, Math.floor(maxWidthPx / Math.max(1, nodeGraphGridWidth()))),
  };
}

function clampNodeGraphWorkspaceGridSizeToViewport(size = {}, workspace = document.getElementById("nodeGraphWorkspace")) {
  const maxSize = nodeGraphWorkspaceMaxViewportGridSize(workspace);
  const limits = typeof nodeGraphWorkspaceViewLimits === "object"
    ? nodeGraphWorkspaceViewLimits
    : { minWidthGu: 1, minHeightGu: 1 };
  return {
    heightGu: Math.max(limits.minHeightGu, Math.min(maxSize.heightGu, Math.round(nodeGraphFiniteNumber(size.heightGu)))),
    widthGu: Math.max(limits.minWidthGu, Math.min(maxSize.widthGu, Math.round(nodeGraphFiniteNumber(size.widthGu)))),
  };
}

function applyNodeGraphWorkspaceSizeCss(workspace, widthCss = null, heightCss = null) {
  const setSize = (property, customProperty, value) => {
    if (value) {
      workspace.style[property] = value;
      workspace.style.setProperty(customProperty, value);
      return;
    }
    workspace.style.removeProperty(property);
    workspace.style.removeProperty(customProperty);
  };
  setSize("width", "--node-modular-only-view-width", widthCss);
  setSize("height", "--node-modular-only-view-height", heightCss);
  workspace.style.removeProperty("aspect-ratio");
}

function defaultNodeGraphModuleGridInsetPx() {
  return 6;
}

function nodeGraphModuleGridInsetPx() {
  const inputValue = Number(document.getElementById("nodeUiDevModuleGridInset")?.value);
  if (Number.isFinite(inputValue)) {
    return Math.max(0, Math.min(20, inputValue));
  }
  return defaultNodeGraphModuleGridInsetPx();
}

function nodeGraphGridSnapOffset() {
  return nodeGraphModuleGridInsetPx();
}

function nodeGraphGridToPixel(point) {
  const offset = nodeGraphGridSnapOffset();
  return {
    x: point.gx * nodeGraphGridWidth() + offset,
    y: point.gy * nodeGraphGridHeight() + offset,
  };
}

function nodeGraphGridSnapUnits(options = {}) {
  return options.halfGrid ? 2 : 1;
}

function roundNodeGraphGridCoordinate(value, options = {}) {
  const units = nodeGraphGridSnapUnits(options);
  return Math.round((nodeGraphFiniteNumber(value)) * units) / units;
}

function nodeGraphPixelToGrid(point, options = {}) {
  const offset = nodeGraphGridSnapOffset();
  return {
    gx: roundNodeGraphGridCoordinate((point.x - offset) / nodeGraphGridWidth(), options),
    gy: roundNodeGraphGridCoordinate((point.y - offset) / nodeGraphGridHeight(), options),
  };
}

function snapNodeGraphPointToGrid(point, options = {}) {
  return nodeGraphGridToPixel(nodeGraphPixelToGrid(point, options));
}
