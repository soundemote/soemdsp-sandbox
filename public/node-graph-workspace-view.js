function applyNodeGraphPan(options = {}) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  // Light CSS pan every sample; heavy chrome coalesced during gestures.
  if (typeof applyNodeGraphViewportCssLight === "function") {
    applyNodeGraphViewportCssLight({ zoom: false, pan: true, zoomButtons: false });
  } else {
    const pan = nodeGraphMvp.pan || { x: 0, y: 0 };
    const originOffset = nodeGraphRenderedOriginOffset(pan, workspace);
    workspace.style.setProperty("--node-graph-pan-x", `${originOffset.x}px`);
    workspace.style.setProperty("--node-graph-pan-y", `${originOffset.y}px`);
    workspace.dataset.panX = String(pan.x);
    workspace.dataset.panY = String(pan.y);
    syncNodeGraphOriginMarker();
    syncNodeGraphWorldPositionReadout();
  }
  if (options.immediate) {
    if (typeof flushNodeGraphViewportImmediate === "function") {
      flushNodeGraphViewportImmediate({ zoom: true, pan: true, persist: options.persist !== false });
    } else {
      updateNodeGraphGridHeatmap();
      drawNodeGraphWires();
      if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
        scheduleNodeGraphModuleScopeDraw();
      }
    }
    syncNodeGraphWorkspaceResizeHandlePosition();
    return;
  }
  if (options.skipHeavy) {
    // Caller already scheduled heavy chrome (e.g. setNodeGraphZoom).
    syncNodeGraphWorkspaceResizeHandlePosition();
    return;
  }
  if (options.gesture) {
    if (typeof markNodeGraphViewportGesture === "function") {
      markNodeGraphViewportGesture(options.gestureKind || "pan");
    } else {
      updateNodeGraphGridHeatmap();
      drawNodeGraphWires();
      if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
        scheduleNodeGraphModuleScopeDraw();
      }
    }
  } else if (typeof flushNodeGraphViewportImmediate === "function") {
    // Programmatic pan (recenter, snap, load): full chrome, no gesture hold.
    flushNodeGraphViewportImmediate({
      zoom: false,
      pan: true,
      persist: options.persist !== false,
    });
  } else {
    updateNodeGraphGridHeatmap();
    drawNodeGraphWires();
    if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
      scheduleNodeGraphModuleScopeDraw();
    }
  }
  syncNodeGraphWorkspaceResizeHandlePosition();
}

function syncNodeGraphWorkspaceResizeHandlePosition() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const handle = document.getElementById("nodeGraphResizeHandle");
  if (!workspace || !handle) {
    return;
  }
  if (handle.parentElement !== workspace) {
    workspace.appendChild(handle);
  }
  handle.style.removeProperty("--node-graph-resize-handle-left");
  handle.style.removeProperty("--node-graph-resize-handle-top");
  handle.style.visibility = "";
}

function syncNodeGraphOriginMarker() {
  const marker = document.getElementById("nodeGraphOriginMarker");
  if (!marker) {
    return;
  }
  marker.classList.toggle("node-graph-origin-marker", true);
  if (typeof nodeGraphApplyTooltip === "function") {
    nodeGraphApplyTooltip(marker, "workspace.origin");
  } else {
    marker.title = "World origin: X 0, Y 0";
  }
}

function nodeGraphWorldPositionLabel(value) {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function syncNodeGraphWorldPositionReadout() {
  const readout = document.getElementById("nodeWorldPositionReadout");
  if (!readout) {
    return;
  }
  const pan = nodeGraphMvp.pan || { x: 0, y: 0 };
  const zoom = Math.max(0.0001, nodeGraphZoom());
  const worldX = -((Number(pan.x) || 0) / zoom) / nodeGraphGridWidth();
  const worldY = -((Number(pan.y) || 0) / zoom) / nodeGraphGridHeight();
  readout.replaceChildren(
    Object.assign(document.createElement("span"), { textContent: `X ${nodeGraphWorldPositionLabel(worldX)}` }),
    Object.assign(document.createElement("span"), { textContent: `Y ${nodeGraphWorldPositionLabel(worldY)}` }),
  );
  readout.setAttribute(
    "aria-label",
    `World position X ${nodeGraphWorldPositionLabel(worldX)}, Y ${nodeGraphWorldPositionLabel(worldY)}. Click to recenter view at X 0, Y 0.`,
  );
  if (typeof nodeGraphApplyTooltip === "function") {
    nodeGraphApplyTooltip(readout, "workspace.recenterOrigin");
  }
}

function syncNodeGraphModularViewSizeReadout(size = null) {
  const readout = document.getElementById("nodeModularViewSizeReadout");
  if (!readout) {
    return;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const view = size && typeof size === "object"
    ? size
    : (typeof normalizeNodeGraphPatchView === "function"
      ? normalizeNodeGraphPatchView(nodeGraphMvp.patch?.view)
      : (nodeGraphMvp.patch?.view || {}));
  // Prefer an explicit positive size from the caller / patch view / dataset.
  // widthGu/heightGu of 0 means “auto / fill viewport” — not a real readout
  // value — so fall through to a live measurement of the modular canvas.
  const pickGu = (...candidates) => {
    for (const candidate of candidates) {
      const n = Math.round(Number(candidate));
      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }
    return 0;
  };
  let widthGu = pickGu(
    size?.widthGu,
    view?.widthGu,
    workspace?.dataset?.widthGu,
  );
  let heightGu = pickGu(
    size?.heightGu,
    view?.heightGu,
    workspace?.dataset?.heightGu,
  );
  if (!(widthGu > 0) || !(heightGu > 0)) {
    // Measured grid units of the visible modular canvas (auto-sized views).
    const measured = typeof nodeGraphWorkspaceCurrentGridSize === "function"
      ? nodeGraphWorkspaceCurrentGridSize()
      : null;
    if (!(widthGu > 0)) {
      widthGu = pickGu(measured?.widthGu);
    }
    if (!(heightGu > 0)) {
      heightGu = pickGu(measured?.heightGu);
    }
  }
  widthGu = Math.max(0, widthGu);
  heightGu = Math.max(0, heightGu);
  readout.replaceChildren(
    Object.assign(document.createElement("span"), { textContent: `W ${widthGu}` }),
    Object.assign(document.createElement("span"), { textContent: `H ${heightGu}` }),
  );
  readout.setAttribute(
    "aria-label",
    `Modular view size width ${widthGu} grid units, height ${heightGu} grid units.`,
  );
  if (workspace) {
    if (widthGu > 0) workspace.dataset.widthGu = String(widthGu);
    if (heightGu > 0) workspace.dataset.heightGu = String(heightGu);
  }
}

function recenterNodeGraphViewAtWorldOrigin(event) {
  setNodeGraphPan(0, 0);
  setNodeInteractionHelp("View centered at X 0, Y 0.");
  event?.preventDefault?.();
}

function handleNodeGraphWorldPositionReadoutKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  recenterNodeGraphViewAtWorldOrigin(event);
}

function setNodeGraphPan(x, y, options = {}) {
  nodeGraphMvp.pan = {
    x: Number.isFinite(Number(x)) ? Number(x) : 0,
    y: Number.isFinite(Number(y)) ? Number(y) : 0,
  };
  // Gesture lite path only when explicitly requested (workspace pan drag).
  // Programmatic pan (recenter, load, snap) flushes full chrome immediately.
  const isGesture = options.gesture === true && options.immediate !== true;
  applyNodeGraphPan({
    gesture: isGesture,
    immediate: options.immediate === true || !isGesture,
    skipHeavy: options.skipHeavy === true,
  });
  if (options.persist !== false) {
    if (typeof scheduleNodeGraphWorkspaceViewPersist === "function") {
      scheduleNodeGraphWorkspaceViewPersist();
    } else if (typeof saveNodeGraphWorkspaceViewToUserSettings === "function") {
      saveNodeGraphWorkspaceViewToUserSettings({ status: false });
    }
  }
}

function nodeGraphVisualControlValue(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 999999999) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Math.abs(number)));
}

function nodeGraphVisualControlSignedValue(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 999999999) {
    return fallback;
  }
  return Math.max(-1, Math.min(1, number));
}

// nodeGraphVisualHslToRgb now lives in
// public/modules/rgbaHsla/rgba-hsla-live-evaluator.js (this file's copy
// was byte-for-byte equivalent -- Math.max/min(0,1) vs clampNodeSliderValue
// to the same range).

function nodeGraphSetVisualControls(values = {}) {
  const current = nodeGraphMvp.visualControls || {};
  nodeGraphMvp.visualControls = {
    ...current,
    blue: nodeGraphVisualControlValue(values.blue, current.blue || 0),
    chromaAlpha: nodeGraphVisualControlValue(values.chromaAlpha, current.chromaAlpha || 0),
    chromaDrift: nodeGraphVisualControlValue(values.chromaDrift, current.chromaDrift || 0),
    chromaHue: nodeGraphVisualControlValue(values.chromaHue, current.chromaHue || 0),
    chromaLightness: nodeGraphVisualControlValue(values.chromaLightness, current.chromaLightness || 0),
    chromaSaturation: nodeGraphVisualControlValue(values.chromaSaturation, current.chromaSaturation || 0),
    chromaSpread: nodeGraphVisualControlValue(values.chromaSpread, current.chromaSpread || 0),
    green: nodeGraphVisualControlValue(values.green, current.green || 0),
    red: nodeGraphVisualControlValue(values.red, current.red || 0),
    scopePaused: nodeGraphVisualControlValue(values.scopePaused, current.scopePaused || 0),
    scopeTracesOff: nodeGraphVisualControlValue(values.scopeTracesOff, current.scopeTracesOff || 0),
    screenDim: nodeGraphVisualControlValue(values.screenDim, current.screenDim || 0),
    screenShake: nodeGraphVisualControlValue(values.screenShake, current.screenShake || 0),
    visualBloom: nodeGraphVisualControlValue(values.visualBloom, current.visualBloom || 0),
    visualBrightness: nodeGraphVisualControlValue(values.visualBrightness, current.visualBrightness || 0),
    visualGlow: nodeGraphVisualControlValue(values.visualGlow, current.visualGlow || 0),
    x: nodeGraphVisualControlSignedValue(values.x, current.x || 0),
    y: nodeGraphVisualControlSignedValue(values.y, current.y || 0),
  };
  if (
    nodeGraphMvp.visualControls.scopeTracesOff > 0.5 &&
    current.scopeTracesOff <= 0.5 &&
    typeof clearNodeGraphModuleScopeCanvas === "function"
  ) {
    clearNodeGraphModuleScopeCanvas();
  }
  if (
    nodeGraphMvp.visualControls.scopePaused <= 0.5 &&
    current.scopePaused > 0.5 &&
    typeof scheduleNodeGraphModuleScopeDraw === "function"
  ) {
    scheduleNodeGraphModuleScopeDraw();
  }
  nodeGraphScheduleVisualControlAnimation();
}

function nodeGraphClearVisualControls() {
  if (nodeGraphMvp.visualControlAnimationFrame) {
    window.cancelAnimationFrame(nodeGraphMvp.visualControlAnimationFrame);
  }
  nodeGraphMvp.visualControlAnimationFrame = 0;
  nodeGraphMvp.visualControls = {
    blue: 0,
    chromaAlpha: 0,
    chromaDrift: 0,
    chromaHue: 0,
    chromaLightness: 0,
    chromaSaturation: 0,
    chromaSpread: 0,
    green: 0,
    red: 0,
    scopePaused: 0,
    scopeTracesOff: 0,
    screenDim: 0,
    screenShake: 0,
    visualBloom: 0,
    visualBrightness: 0,
    visualGlow: 0,
    x: 0,
    y: 0,
  };
  nodeGraphMvp.visualControlState = {
    directX: 0,
    directY: 0,
    screenShakeX: 0,
    screenShakeY: 0,
  };
  const workspace = document.getElementById("nodeGraphWorkspace");
  workspace?.style.setProperty("--node-visual-shake-x", "0px");
  workspace?.style.setProperty("--node-visual-shake-y", "0px");
  workspace?.style.setProperty("--node-visual-bloom", "0");
  workspace?.style.setProperty("--node-visual-brightness", "0");
  workspace?.style.setProperty("--node-visual-glow", "0");
  workspace?.style.setProperty("--node-visual-wash-alpha", "0");
  workspace?.style.setProperty("--node-visual-wash-rgb", "0 0 0");
  if (workspace) {
    workspace.dataset.visualBloom = "0";
    workspace.dataset.visualBrightness = "0";
    workspace.dataset.visualChromaAlpha = "0";
    workspace.dataset.visualGlow = "0";
    workspace.dataset.visualScreenShake = "0";
    workspace.dataset.visualScreenDim = "0";
    workspace.dataset.visualScopePaused = "0";
  }
}

function nodeGraphScheduleVisualControlAnimation() {
  if (nodeGraphMvp.visualControlAnimationFrame) {
    return;
  }
  nodeGraphMvp.visualControlAnimationFrame = window.requestAnimationFrame(nodeGraphAnimateVisualControls);
}

function nodeGraphAnimateVisualControls(time = performance.now()) {
  nodeGraphMvp.visualControlAnimationFrame = 0;
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const controls = nodeGraphMvp.visualControls || {};
  const screenShake = nodeGraphVisualControlValue(controls.screenShake, 0);
  const directX = nodeGraphVisualControlSignedValue(controls.x, 0) * 22;
  const directY = nodeGraphVisualControlSignedValue(controls.y, 0) * 22;
  const screenDim = nodeGraphVisualControlValue(controls.screenDim, 0);
  const red = nodeGraphVisualControlValue(controls.red, 0);
  const green = nodeGraphVisualControlValue(controls.green, 0);
  const blue = nodeGraphVisualControlValue(controls.blue, 0);
  const chromaAlpha = nodeGraphVisualControlValue(controls.chromaAlpha, 0);
  const chromaDrift = nodeGraphVisualControlValue(controls.chromaDrift, 0);
  const chromaHue = nodeGraphVisualControlValue(controls.chromaHue, 0);
  const chromaLightness = nodeGraphVisualControlValue(controls.chromaLightness, 0);
  const chromaSaturation = nodeGraphVisualControlValue(controls.chromaSaturation, 0);
  const chromaSpread = nodeGraphVisualControlValue(controls.chromaSpread, 0);
  const scopePaused = nodeGraphVisualControlValue(controls.scopePaused, 0);
  const scopeTracesOff = nodeGraphVisualControlValue(controls.scopeTracesOff, 0);
  const visualBloom = nodeGraphVisualControlValue(controls.visualBloom, 0);
  const visualBrightness = nodeGraphVisualControlValue(controls.visualBrightness, 0);
  const visualGlow = nodeGraphVisualControlValue(controls.visualGlow, 0);
  const amplitude = screenShake * screenShake * 22;
  let x = 0;
  let y = 0;
  if (amplitude > 0.001) {
    x = (
      Math.sin(time * 0.0217) +
      Math.sin(time * 0.0471 + 1.9) * 0.47 +
      Math.sin(time * 0.0833 + 4.1) * 0.22
    ) * amplitude;
    y = (
      Math.sin(time * 0.0189 + 2.7) +
      Math.sin(time * 0.0529 + 0.4) * 0.43 +
      Math.sin(time * 0.0777 + 3.2) * 0.24
    ) * amplitude;
  }
  const finalX = x + directX;
  const finalY = y + directY;
  nodeGraphMvp.visualControlState = {
    directX,
    directY,
    screenShakeX: x,
    screenShakeY: y,
  };
  workspace.style.setProperty("--node-visual-shake-x", `${finalX.toFixed(3)}px`);
  workspace.style.setProperty("--node-visual-shake-y", `${finalY.toFixed(3)}px`);
  workspace.style.setProperty("--node-visual-bloom", visualBloom.toFixed(4));
  workspace.style.setProperty("--node-visual-brightness", visualBrightness.toFixed(4));
  workspace.style.setProperty("--node-visual-glow", visualGlow.toFixed(4));
  const chromaMotion = (time * 0.000035 * chromaDrift) + (Math.sin(time * 0.0017) * chromaSpread * 0.08);
  const chromaRgb = nodeGraphVisualHslToRgb(
    chromaHue + chromaMotion,
    chromaSaturation,
    chromaLightness,
  );
  const colorMix = chromaAlpha;
  const washRed = red * (1 - colorMix) + chromaRgb[0] * colorMix;
  const washGreen = green * (1 - colorMix) + chromaRgb[1] * colorMix;
  const washBlue = blue * (1 - colorMix) + chromaRgb[2] * colorMix;
  const washAlpha = Math.max(screenDim, chromaAlpha);
  workspace.style.setProperty("--node-visual-wash-alpha", washAlpha.toFixed(4));
  workspace.style.setProperty(
    "--node-visual-wash-rgb",
    `${Math.round(washRed * 255)} ${Math.round(washGreen * 255)} ${Math.round(washBlue * 255)}`,
  );
  workspace.dataset.visualScreenShake = String(Number(screenShake.toFixed(4)));
  workspace.dataset.visualScreenDim = String(Number(washAlpha.toFixed(4)));
  workspace.dataset.visualBloom = String(Number(visualBloom.toFixed(4)));
  workspace.dataset.visualBrightness = String(Number(visualBrightness.toFixed(4)));
  workspace.dataset.visualChromaAlpha = String(Number(chromaAlpha.toFixed(4)));
  workspace.dataset.visualGlow = String(Number(visualGlow.toFixed(4)));
  workspace.dataset.visualScopePaused = String(Number(scopePaused.toFixed(4)));
  workspace.dataset.visualScopeTracesOff = String(Number(scopeTracesOff.toFixed(4)));
  if (screenShake > 0.0001 || visualBloom > 0.0001 || visualGlow > 0.0001 || chromaAlpha > 0.0001) {
    nodeGraphScheduleVisualControlAnimation();
  }
}

function snapNodeGraphWorkspaceEdgesToGrid(zoom = nodeGraphZoom()) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const rect = workspace.getBoundingClientRect();
  const chromeWidth = nodeGraphWorkspaceChromeSize("x");
  const chromeHeight = nodeGraphWorkspaceChromeSize("y");
  const contentWidth = Math.max(0, rect.width - chromeWidth);
  const contentHeight = Math.max(0, rect.height - chromeHeight);
  const renderedGridWidth = nodeGraphGridWidth() * zoom;
  const renderedGridHeight = nodeGraphGridHeight() * zoom;
  const snapContentSize = (value, step, minGridUnits) => {
    if (!Number.isFinite(step) || step <= 0) {
      return value;
    }
    const min = step * minGridUnits;
    return Math.max(min, Math.round(value / step) * step);
  };
  const snappedContentWidth = snapContentSize(
    contentWidth,
    renderedGridWidth,
    nodeGraphWorkspaceViewLimits.minWidthGu,
  );
  const snappedContentHeight = snapContentSize(
    contentHeight,
    renderedGridHeight,
    nodeGraphWorkspaceViewLimits.minHeightGu,
  );
  withNodeGraphWorkspaceContentAnchored(workspace, () => {
    const widthCss = nodeGraphWorkspaceWidthCss(snappedContentWidth);
    const heightCss = nodeGraphWorkspaceHeightCss(snappedContentHeight);
    applyNodeGraphWorkspaceSizeCss(workspace, widthCss, heightCss);
  });
  drawNodeGraphWires();
}

function snapNodeGraphPanValueToGrid(value, gridSize, zoom = nodeGraphZoom(), options = {}) {
  const units = options.halfGrid ? 2 : 1;
  const step = (gridSize * zoom) / units;
  return Number.isFinite(step) && step > 0
    ? Math.round((Number(value) || 0) / step) * step
    : Number(value) || 0;
}

function renderNodeGraphSnapGridButton() {
  const button = document.getElementById("nodeSnapGridViewButton");
  if (!button) {
    return;
  }
  const active = Boolean(nodeGraphMvp.snapGridWhilePanning);
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  button.removeAttribute("title");
}

function alignNodeGraphViewToGridWithOptions(options = {}) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const rect = workspace?.getBoundingClientRect();
  const oldZoom = nodeGraphZoom();
  const oldPan = nodeGraphMvp.pan || { x: 0, y: 0 };
  const oldOrigin = workspace ? nodeGraphRenderedOriginOffset(oldPan, workspace) : oldPan;
  const zoomStep = 1 / Math.max(1, nodeGraphGridSize());
  const nextZoom = Math.max(
    nodeGraphZoomLimits.min,
    Math.min(nodeGraphZoomLimits.max, Math.round(oldZoom / zoomStep) * zoomStep),
  );
  const anchor = rect
    ? {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    : null;
  const anchoredContentPoint = rect && anchor
    ? {
      x: (anchor.x - rect.left - (Number(oldOrigin.x) || 0)) / oldZoom,
      y: (anchor.y - rect.top - (Number(oldOrigin.y) || 0)) / oldZoom,
    }
    : null;
  nodeGraphMvp.zoom = nextZoom;
  if (typeof syncNodeGraphPatchViewZoom === "function") {
    syncNodeGraphPatchViewZoom(nextZoom);
  }
  applyNodeGraphZoom({ immediate: true, forceLayout: true, persist: false });
  if (options.snapWorkspaceEdges) {
    snapNodeGraphWorkspaceEdgesToGrid(nextZoom);
  }
  const nextRect = workspace?.getBoundingClientRect();
  const nextAnchor = nextRect
    ? {
      x: nextRect.left + nextRect.width / 2,
      y: nextRect.top + nextRect.height / 2,
    }
    : anchor;
  const nextCenter = workspace ? nodeGraphWorkspaceCenterOffset(workspace) : { x: 0, y: 0 };
  const unsnappedPan = nextRect && nextAnchor && anchoredContentPoint
    ? {
      x: nextAnchor.x - nextRect.left - nextCenter.x - anchoredContentPoint.x * nextZoom,
      y: nextAnchor.y - nextRect.top - nextCenter.y - anchoredContentPoint.y * nextZoom,
    }
    : oldPan;
  const snapPan = (value, gridSize) => snapNodeGraphPanValueToGrid(value, gridSize, nextZoom);
  nodeGraphMvp.pan = {
    x: snapPan(unsnappedPan.x, nodeGraphGridWidth()),
    y: snapPan(unsnappedPan.y, nodeGraphGridHeight()),
  };
  applyNodeGraphPan({ immediate: true, persist: false });
  if (typeof scheduleNodeGraphWorkspaceViewPersist === "function") {
    scheduleNodeGraphWorkspaceViewPersist();
  } else if (typeof saveNodeGraphWorkspaceViewToUserSettings === "function") {
    saveNodeGraphWorkspaceViewToUserSettings({ status: false });
  }
  setNodeInteractionHelp(options.snapWorkspaceEdges
    ? "View snapped to complete grid cells."
    : "View aligned to grid. Hotkey: Ctrl+Shift+G.");
}

function alignNodeGraphViewToGrid() {
  alignNodeGraphViewToGridWithOptions();
}

function snapNodeGraphViewToGrid() {
  alignNodeGraphViewToGridWithOptions({ snapWorkspaceEdges: true });
}

function handleNodeGraphSnapGridButtonClick(event) {
  if (event.shiftKey) {
    nodeGraphMvp.snapGridWhilePanning = !nodeGraphMvp.snapGridWhilePanning;
    renderNodeGraphSnapGridButton();
    setNodeInteractionHelp(nodeGraphMvp.snapGridWhilePanning
      ? "Grid snap while moving is on."
      : "Grid snap while moving is off.");
    return;
  }
  snapNodeGraphViewToGrid();
}

function nodeGraphWorkspaceCurrentGridSize() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const rect = workspace.getBoundingClientRect();
  const contentWidth = Math.max(0, rect.width - nodeGraphWorkspaceChromeSize("x"));
  const contentHeight = Math.max(0, rect.height - nodeGraphWorkspaceChromeSize("y"));
  return {
    heightGu: Math.max(
      nodeGraphWorkspaceViewLimits.minHeightGu,
      Math.round(contentHeight / nodeGraphGridHeight()),
    ),
    widthGu: Math.max(
      nodeGraphWorkspaceViewLimits.minWidthGu,
      Math.round(contentWidth / nodeGraphGridWidth()),
    ),
  };
}

const nodeGraphWorkspaceResizeSteps = Object.freeze({
  widthGu: 2,
  heightGu: 1,
});

function nodeGraphWorkspaceResizeDeltaGu(pixelDelta, gridSize, stepGu = 1) {
  const safeStep = Math.max(1, Math.round(Number(stepGu) || 1));
  return Math.round((Number(pixelDelta) || 0) / Math.max(1, gridSize)) * safeStep;
}

function setNodeGraphWorkspacePreviewSize(widthGu, heightGu) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const visibleSize = clampNodeGraphWorkspaceGridSizeToViewport({ widthGu, heightGu }, workspace);
  withNodeGraphWorkspaceContentAnchored(workspace, () => {
    applyNodeGraphWorkspaceSizeCss(
      workspace,
      nodeGraphWorkspaceWidthCss(visibleSize.widthGu * nodeGraphGridWidth()),
      nodeGraphWorkspaceHeightCss(visibleSize.heightGu * nodeGraphGridHeight()),
    );
  });
  workspace.dataset.widthGu = String(visibleSize.widthGu);
  workspace.dataset.heightGu = String(visibleSize.heightGu);
  syncNodeGraphModularViewSizeReadout(visibleSize);
  drawNodeGraphWires();
  syncNodeGraphWorkspaceResizeHandlePosition();
  return visibleSize;
}

function beginNodeGraphWorkspaceResize(event) {
  if (event.button !== 0) {
    return;
  }
  if (!nodeGraphScriptReadyForGraphAction("resize workspace")) {
    return;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const startSize = nodeGraphWorkspaceCurrentGridSize();
  nodeGraphMvp.workspaceResizing = {
    heightGu: startSize.heightGu,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startHeightGu: startSize.heightGu,
    startWidthGu: startSize.widthGu,
    widthGu: startSize.widthGu,
  };
  workspace.classList.add("resizing");
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphWorkspaceResize(event) {
  const drag = nodeGraphMvp.workspaceResizing;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  const resizeGridWidth = nodeGraphGridWidth();
  const resizeGridHeight = nodeGraphGridHeight();
  const requestedWidthGu = Math.max(
    nodeGraphWorkspaceViewLimits.minWidthGu,
    drag.startWidthGu + nodeGraphWorkspaceResizeDeltaGu(
      event.clientX - drag.startClientX,
      resizeGridWidth,
      nodeGraphWorkspaceResizeSteps.widthGu,
    ),
  );
  const requestedHeightGu = Math.max(
    nodeGraphWorkspaceViewLimits.minHeightGu,
    drag.startHeightGu + nodeGraphWorkspaceResizeDeltaGu(
      event.clientY - drag.startClientY,
      resizeGridHeight,
      nodeGraphWorkspaceResizeSteps.heightGu,
    ),
  );
  const { widthGu, heightGu } = clampNodeGraphWorkspaceGridSizeToViewport({
    heightGu: requestedHeightGu,
    widthGu: requestedWidthGu,
  });
  if (widthGu === drag.widthGu && heightGu === drag.heightGu) {
    return;
  }
  drag.widthGu = widthGu;
  drag.heightGu = heightGu;
  setNodeGraphWorkspacePreviewSize(widthGu, heightGu);
}

function endNodeGraphWorkspaceResize(event) {
  const drag = nodeGraphMvp.workspaceResizing;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  const handle = document.getElementById("nodeGraphResizeHandle");
  if (handle?.hasPointerCapture?.(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }
  document.getElementById("nodeGraphWorkspace")?.classList.remove("resizing");
  nodeGraphMvp.workspaceResizing = null;
  if (drag.widthGu === drag.startWidthGu && drag.heightGu === drag.startHeightGu) {
    applyNodeGraphWorkspaceView();
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.view = {
    ...normalizeNodeGraphPatchView(patch.view),
    heightGu: Math.max(nodeGraphWorkspaceViewLimits.minHeightGu, drag.heightGu),
    widthGu: Math.max(nodeGraphWorkspaceViewLimits.minWidthGu, drag.widthGu),
  };
  commitNodeGraphPatch(patch, {
    markPending: false,
    status: "workspace resized",
  });
}

function handleNodeGraphWindowResize() {
  applyNodeGraphWorkspaceView();
  syncNodeGraphWorkspaceResizeHandlePosition();
  if (typeof syncNodeGraphSliderReadouts === "function") {
    syncNodeGraphSliderReadouts();
  }
  drawNodeGraphWires();
}

function beginNodeGraphWorkspacePanFrom(pointerId, clientX, clientY) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const pan = nodeGraphMvp.pan || { x: 0, y: 0 };
  nodeGraphMvp.workspacePanning = {
    pointerId,
    startClientX: clientX,
    startClientY: clientY,
    startPanX: pan.x,
    startPanY: pan.y,
  };
  workspace?.classList.add("panning");
  if (typeof markNodeGraphViewportGesture === "function") {
    markNodeGraphViewportGesture("pan");
  }
  if (workspace?.hasPointerCapture && !workspace.hasPointerCapture(pointerId)) {
    workspace.setPointerCapture(pointerId);
  }
}

function beginNodeGraphWorkspacePan(event) {
  if (nodeGraphMvp.workspacePinchZooming) {
    return;
  }
  if (!nodeGraphWorkspacePanPointerAllowed(event)) {
    return;
  }

  beginNodeGraphWorkspacePanFrom(event.pointerId, event.clientX, event.clientY);
  event.preventDefault();
  event.stopPropagation();
}

function nodeGraphWorkspacePinchTouchPoints() {
  if (!(nodeGraphMvp.workspacePinchTouchPointers instanceof Map)) {
    nodeGraphMvp.workspacePinchTouchPointers = new Map();
  }
  return nodeGraphMvp.workspacePinchTouchPointers;
}

function nodeGraphWorkspacePinchPoint(event) {
  return {
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
    pointerId: event.pointerId,
  };
}

function nodeGraphWorkspacePinchDistance(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }
  const dx = points[1].clientX - points[0].clientX;
  const dy = points[1].clientY - points[0].clientY;
  return Math.hypot(dx, dy);
}

function nodeGraphWorkspacePinchMidpoint(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  return {
    x: (points[0].clientX + points[1].clientX) / 2,
    y: (points[0].clientY + points[1].clientY) / 2,
  };
}

function cancelNodeGraphWorkspacePanForPinch() {
  const drag = nodeGraphMvp.workspacePanning;
  if (drag?.pointerId !== undefined) {
    const workspace = document.getElementById("nodeGraphWorkspace");
    if (workspace?.hasPointerCapture?.(drag.pointerId)) {
      workspace.releasePointerCapture(drag.pointerId);
    }
    workspace?.classList.remove("panning");
  }
  nodeGraphMvp.workspacePanning = null;
}

function beginNodeGraphWorkspacePinchZoom(event) {
  if (event.pointerType !== "touch" || !nodeGraphWorkspaceTouchPanTargetAllowed(event.target)) {
    return;
  }
  const touchPoints = nodeGraphWorkspacePinchTouchPoints();
  touchPoints.set(event.pointerId, nodeGraphWorkspacePinchPoint(event));
  if (touchPoints.size < 2) {
    return;
  }
  const points = [...touchPoints.values()].slice(-2);
  const distance = nodeGraphWorkspacePinchDistance(points);
  const anchor = nodeGraphWorkspacePinchMidpoint(points);
  if (distance <= 0 || !anchor) {
    return;
  }
  cancelNodeGraphWorkspacePanForPinch();
  nodeGraphMvp.workspacePinchZooming = {
    anchor,
    pointerIds: points.map((point) => point.pointerId),
    startDistance: distance,
    startZoom: nodeGraphZoom(),
  };
  document.getElementById("nodeGraphWorkspace")?.classList.add("panning");
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphWorkspacePinchZoom(event) {
  const touchPoints = nodeGraphWorkspacePinchTouchPoints();
  if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, nodeGraphWorkspacePinchPoint(event));
  }
  const pinch = nodeGraphMvp.workspacePinchZooming;
  if (!pinch) {
    return;
  }
  const points = pinch.pointerIds
    .map((pointerId) => touchPoints.get(pointerId))
    .filter(Boolean);
  if (points.length < 2) {
    nodeGraphMvp.workspacePinchZooming = null;
    return;
  }
  const distance = nodeGraphWorkspacePinchDistance(points);
  const anchor = nodeGraphWorkspacePinchMidpoint(points);
  if (distance <= 0 || !anchor || pinch.startDistance <= 0) {
    return;
  }
  setNodeGraphZoom(pinch.startZoom * (distance / pinch.startDistance), anchor);
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphWorkspacePinchZoom(event) {
  const touchPoints = nodeGraphWorkspacePinchTouchPoints();
  touchPoints.delete(event.pointerId);
  if (nodeGraphMvp.workspacePinchZooming?.pointerIds?.includes(event.pointerId)) {
    nodeGraphMvp.workspacePinchZooming = null;
    document.getElementById("nodeGraphWorkspace")?.classList.remove("panning");
    // One finger of the pinch lifted but the other is still down -- hand off
    // to a pan drag from the surviving finger instead of leaving it inert
    // until every finger lifts and a fresh pointerdown starts a new gesture.
    if (touchPoints.size === 1) {
      const [survivor] = touchPoints.values();
      beginNodeGraphWorkspacePanFrom(survivor.pointerId, survivor.clientX, survivor.clientY);
    } else if (typeof scheduleNodeGraphViewportSettle === "function") {
      scheduleNodeGraphViewportSettle();
    }
    event.preventDefault();
    event.stopPropagation();
  }
}

function nodeGraphWorkspacePanPointerAllowed(event) {
  if (event.ctrlKey || event.altKey) {
    return false;
  }
  if (event.pointerType === "touch") {
    return event.isPrimary !== false && nodeGraphWorkspaceTouchPanTargetAllowed(event.target);
  }
  return event.button === 1;
}

function nodeGraphWorkspaceTouchPanTargetAllowed(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest("#nodeGraphWorkspace")) {
    return false;
  }
  if (target.closest(nodeGraphWorkspaceTouchPanBlockSelector())) {
    return false;
  }
  return true;
}

function nodeGraphWorkspaceTouchPanBlockSelector() {
  return [
    ".dsp-node",
    ".node-camera-frame",
    ".node-graph-empty-module-button",
    ".node-graph-resize-handle",
    ".node-module-shop-card",
    ".node-port",
    ".node-param-port",
    ".node-ui-item",
    "a",
    "button",
    "input",
    "label",
    "output",
    "select",
    "textarea",
    "[contenteditable='true']",
    "[role='button']",
  ].join(",");
}

function dragNodeGraphWorkspacePan(event) {
  const drag = nodeGraphMvp.workspacePanning;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const nextX = drag.startPanX + event.clientX - drag.startClientX;
  const nextY = drag.startPanY + event.clientY - drag.startClientY;
  setNodeGraphPan(
    nodeGraphMvp.snapGridWhilePanning
      ? snapNodeGraphPanValueToGrid(nextX, nodeGraphGridWidth(), nodeGraphZoom(), { halfGrid: true })
      : nextX,
    nodeGraphMvp.snapGridWhilePanning
      ? snapNodeGraphPanValueToGrid(nextY, nodeGraphGridHeight(), nodeGraphZoom(), { halfGrid: true })
      : nextY,
    // Persist on settle only — not every pointermove sample.
    { gesture: true, persist: false },
  );
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphWorkspacePan(event) {
  const drag = nodeGraphMvp.workspacePanning;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const workspace = document.getElementById("nodeGraphWorkspace");
  if (workspace?.hasPointerCapture?.(event.pointerId)) {
    workspace.releasePointerCapture(event.pointerId);
  }
  workspace?.classList.remove("panning");
  nodeGraphMvp.workspacePanning = null;
  if (typeof scheduleNodeGraphViewportSettle === "function") {
    scheduleNodeGraphViewportSettle();
  } else {
    drawNodeGraphWires();
  }
  event.preventDefault();
  event.stopPropagation();
}

function preventNodeGraphMiddleMouseAuxClick(event) {
  if (event.button === 1 && !nodeGraphScrollableInnerTarget(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

const nodeGraphFloatingWindowSelector = [
  "#nodeSceneContextMenu",
  "#nodeModuleActionsWindow",
  "#nodeCodeBoxWindow",
  "#nodeModuleShopView",
  "#nodeSavedPatchesWindow",
  "#nodeVisibilityMenu",
  "#nodeParameterMetadataPopover",
  "#nodeTraceDisplaySettingsPopover",
  "#nodeUiDevHelper",
  "#nodeUserUiSettingsPanel",
  "#nodeGlobalScopeMenu",
].join(",");

/** Known scroll bodies inside floating inspectors (scrollbar may be hidden). */
const nodeGraphFloatingScrollBodySelector = [
  ":scope > .metadata-popover-grid",
  ":scope > .node-module-actions-window-body",
  ":scope > .node-trace-display-settings-grid",
  ".metadata-popover-grid",
  ".node-module-actions-window-body",
  ".node-trace-display-settings-grid",
].join(",");

function nodeGraphFloatingWindowFromTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  return element?.closest?.(nodeGraphFloatingWindowSelector) || null;
}

function nodeGraphPreferredFloatingScrollBody(floatingWindow) {
  if (!floatingWindow?.querySelector) {
    return null;
  }
  return floatingWindow.querySelector(nodeGraphFloatingScrollBodySelector) || null;
}

function nodeGraphElementIsScrollport(element) {
  if (!element) {
    return false;
  }
  const style = window.getComputedStyle(element);
  const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
  return /\b(auto|scroll|overlay)\b/.test(overflow);
}

function nodeGraphElementHasScrollRoom(element) {
  if (!element) {
    return false;
  }
  return (
    element.scrollHeight > element.clientHeight + 0.5
    || element.scrollWidth > element.clientWidth + 0.5
  );
}

function nodeGraphScrollableInnerTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element) {
    return null;
  }
  for (let current = element; current && current !== document.body; current = current.parentElement) {
    if (current.id === "nodeGraphWorkspace") {
      return null;
    }
    if (nodeGraphElementIsScrollport(current) && nodeGraphElementHasScrollRoom(current)) {
      return current;
    }
  }
  return null;
}

function nodeGraphScrollTargetCanConsumeWheel(scrollTarget, event) {
  if (!scrollTarget) {
    return false;
  }
  const deltaY = Number(event.deltaY) || 0;
  const deltaX = Number(event.deltaX) || 0;
  const canScrollUp = scrollTarget.scrollTop > 0;
  const canScrollDown =
    scrollTarget.scrollTop + scrollTarget.clientHeight < scrollTarget.scrollHeight - 0.5;
  const canScrollLeft = scrollTarget.scrollLeft > 0;
  const canScrollRight =
    scrollTarget.scrollLeft + scrollTarget.clientWidth < scrollTarget.scrollWidth - 0.5;
  const canConsumeY =
    (deltaY < 0 && canScrollUp) ||
    (deltaY > 0 && canScrollDown);
  const canConsumeX =
    (deltaX < 0 && canScrollLeft) ||
    (deltaX > 0 && canScrollRight);
  return canConsumeY || canConsumeX;
}

/**
 * Apply wheel delta to a scrollport. Returns true if scroll position changed.
 */
function nodeGraphApplyWheelToScrollTarget(scrollTarget, event) {
  if (!scrollTarget) {
    return false;
  }
  const dy = Number(event.deltaY) || 0;
  const dx = Number(event.deltaX) || 0;
  if (!dy && !dx) {
    return false;
  }
  const beforeTop = scrollTarget.scrollTop;
  const beforeLeft = scrollTarget.scrollLeft;
  if (dy) {
    scrollTarget.scrollTop = beforeTop + dy;
  }
  if (dx) {
    scrollTarget.scrollLeft = beforeLeft + dx;
  }
  return (
    scrollTarget.scrollTop !== beforeTop
    || scrollTarget.scrollLeft !== beforeLeft
  );
}

function preventNodeGraphMiddleMouseDefault(event) {
  if (event.button === 1 && !nodeGraphScrollableInnerTarget(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function preventNodeGraphOuterWheelScroll(event) {
  const floatingWindow = nodeGraphFloatingWindowFromTarget(event.target);
  if (floatingWindow) {
    // Prefer the dedicated body scrollport (hidden scrollbar) over the shell.
    let scrollTarget = nodeGraphScrollableInnerTarget(event.target);
    const preferred = nodeGraphPreferredFloatingScrollBody(floatingWindow);
    if (preferred && (nodeGraphElementHasScrollRoom(preferred) || !scrollTarget)) {
      scrollTarget = preferred;
    }
    // Manual wheel→scrollTop: capture-phase page guard otherwise eats the gesture
    // when native scroll + hidden scrollbars disagree about canConsume.
    if (scrollTarget && nodeGraphElementIsScrollport(scrollTarget)) {
      nodeGraphApplyWheelToScrollTarget(scrollTarget, event);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.target?.closest?.("#nodeGraphWorkspace")) {
    return;
  }
  if (!nodeGraphScrollableInnerTarget(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}
