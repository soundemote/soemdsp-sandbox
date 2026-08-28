function bindNodeGraphWorkspaceInteractionEvents() {
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("nodegraph:environment-command", handleNodeGraphEnvironmentCommand);
  document.addEventListener("contextmenu", openNodeSceneContextMenu);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeSliderDrag, true);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", completeNodeGraphModulePlacement, true);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("auxclick", preventNodeGraphMiddleMouseAuxClick);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("mousedown", preventNodeGraphMiddleMouseDefault, true);
  document.addEventListener("auxclick", preventNodeGraphMiddleMouseAuxClick, true);
  document.addEventListener("mousedown", preventNodeGraphMiddleMouseDefault, true);
  document.addEventListener("wheel", preventNodeGraphOuterWheelScroll, { passive: false, capture: true });
  // X/Y readout: mouse click only. Never tab-stop or Space/Enter (keyboard
  // must stay with the workspace / modules — not these status chips).
  const worldPosReadout = document.getElementById("nodeWorldPositionReadout");
  if (worldPosReadout) {
    worldPosReadout.addEventListener("pointerdown", (event) => {
      // Keep focus wherever it was (prevents accidental focus steal on click).
      if (event.button === 0) {
        event.preventDefault();
      }
    });
    worldPosReadout.addEventListener("click", recenterNodeGraphViewAtWorldOrigin);
  }
  // W/H is display-only — no pointer focus steal either.
  document.getElementById("nodeModularViewSizeReadout")?.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      event.preventDefault();
    }
  });
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("click", nodeGraphWireInteractions.handleWorkspaceClick);
  // Empty-canvas double-click does not open the module shop / spawn menu.
  // Right-click is the add-module path.
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("dblclick", (event) => {
      if (typeof nodeGraphEventTargetIsEmptyWorkspaceArea === "function"
        && nodeGraphEventTargetIsEmptyWorkspaceArea(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (typeof nodeGraphScreenSoloIsActive === "function" && nodeGraphScreenSoloIsActive()) {
        event.preventDefault();
        endNodeGraphScreenSolo();
        return;
      }
      nodeGraphWireInteractions.cancelPortConnectionMode();
      if (typeof endNodeGraphMagnifier === "function") {
        endNodeGraphMagnifier();
      }
    }
  });
  if (typeof bindNodeGraphScreenSoloEvents === "function") {
    bindNodeGraphScreenSoloEvents();
  }
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphWorkspacePinchZoom, true);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphWorkspacePan, true);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphSmoothZoomDrag, true);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphMagnifier);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointermove", moveNodeGraphMagnifier);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerup", endNodeGraphMagnifierFromPointer);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointercancel", endNodeGraphMagnifierFromPointer);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphMarqueeSelection);
  if (typeof bindNodeGraphMarqueeModifierKeys === "function") {
    bindNodeGraphMarqueeModifierKeys();
  }
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointermove", beginNodeGraphMarqueeSelectionOnEntry);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointermove", updateNodeGraphMouseLight);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerleave", () => {
      nodeGraphWireInteractions.clearHover();
      clearNodeGraphMouseLight();
    });
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointermove", dragNodeGraphMarqueeSelection);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerup", endNodeGraphMarqueeSelection);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointercancel", endNodeGraphMarqueeSelection);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("wheel", handleNodeGraphWorkspaceWheel, { passive: false });
  document
    .getElementById("nodeGraphResizeHandle")
    .addEventListener("pointerdown", beginNodeGraphWorkspaceResize);
  bindNodeGraphConstraintOverlayToggles();

  document.addEventListener("pointermove", nodeGraphWireInteractions.updateConnectionModeCursor);
  document.addEventListener("pointermove", nodeGraphWireInteractions.handleWireDragMove);
  document.addEventListener("pointerup", nodeGraphWireInteractions.handleWireDragEnd);
  document.addEventListener("pointercancel", nodeGraphWireInteractions.handleWireDragEnd);
  document.addEventListener("pointermove", dragNodeGraphNode);
  document.addEventListener("pointerup", endNodeGraphNodeDrag);
  document.addEventListener("pointercancel", endNodeGraphNodeDrag);
  document.addEventListener("pointermove", dragNodeGraphModulePlacement);
  document.addEventListener("pointerdown", completeNodeGraphModulePlacement, true);
  document.addEventListener("pointermove", dragNodeGraphScopeNumber);
  document.addEventListener("pointerup", endNodeGraphScopeNumberDrag);
  document.addEventListener("pointercancel", endNodeGraphScopeNumberDrag);
  document.addEventListener("pointermove", dragNodeGraphWorkspaceResize);
  document.addEventListener("pointerup", endNodeGraphWorkspaceResize);
  document.addEventListener("pointercancel", endNodeGraphWorkspaceResize);
  document.addEventListener("pointermove", dragNodeGraphWorkspacePinchZoom);
  document.addEventListener("pointerup", endNodeGraphWorkspacePinchZoom);
  document.addEventListener("pointercancel", endNodeGraphWorkspacePinchZoom);
  document.addEventListener("pointermove", dragNodeGraphWorkspacePan);
  document.addEventListener("pointerup", endNodeGraphWorkspacePan);
  document.addEventListener("pointercancel", endNodeGraphWorkspacePan);
  document.addEventListener("pointermove", dragNodeGraphSmoothZoom);
  document.addEventListener("pointermove", nodeGraphWireInteractions.handlePatchPointHover);
  document.addEventListener("pointerup", endNodeGraphSmoothZoomDrag);
  document.addEventListener("pointercancel", endNodeGraphSmoothZoomDrag);
  document.addEventListener("pointerdown", trackNodeGraphOutsideMarqueePointer, true);
  document.addEventListener("pointerup", clearNodeGraphOutsideMarqueePointer, true);
  document.addEventListener("pointercancel", clearNodeGraphOutsideMarqueePointer, true);
  document.addEventListener("click", handleNodeGraphDocumentClick);
  window.addEventListener("resize", handleNodeGraphWindowResize);
  // Floating window drag/resize for registry windows (command center, metadata,
  // etc.): nodeGraphFloatingWindowRegistryPointerBridge in floating-windows.js
}

function normalizeNodeGraphConstraintToggles(value) {
  const src = value && typeof value === "object" ? value : {};
  return {
    cpu: Boolean(src.cpu),
    ram: Boolean(src.ram),
    gpu: Boolean(src.gpu),
  };
}

function bindNodeGraphConstraintOverlayToggles() {
  for (const input of document.querySelectorAll("[data-constraint-toggle]")) {
    input.addEventListener("change", () => {
      syncNodeGraphConstraintOverlayToggles({ persist: true });
    });
  }
  applyNodeGraphConstraintToggles(nodeGraphMvp?.constraintToggles, { persist: false });
  startNodeGraphConstraintResourceMetrics();
}

function applyNodeGraphConstraintToggles(toggles, options = {}) {
  const next = normalizeNodeGraphConstraintToggles(toggles);
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.constraintToggles = next;
  }
  for (const constraint of ["cpu", "ram", "gpu"]) {
    const input = document.querySelector(`[data-constraint-toggle="${constraint}"]`);
    if (input) {
      input.checked = Boolean(next[constraint]);
    }
  }
  syncNodeGraphConstraintOverlayToggles({ persist: options.persist === true });
}

function syncNodeGraphConstraintOverlayToggles(options = {}) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const next = { cpu: false, ram: false, gpu: false };
  for (const constraint of ["cpu", "ram", "gpu"]) {
    const active = Boolean(document.querySelector(`[data-constraint-toggle="${constraint}"]`)?.checked);
    next[constraint] = active;
    document.body.classList.toggle(`node-constraint-${constraint}-active`, active);
    workspace?.classList.toggle(`node-constraint-${constraint}-active`, active);
  }
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.constraintToggles = next;
  }
  if (options.persist && typeof persistNodeGraphDebugChromePreference === "function") {
    persistNodeGraphDebugChromePreference();
  }
  syncNodeGraphConstraintResourceMetrics();
}

function formatNodeGraphConstraintMetricNumber(value, digits = 4) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  return String(Math.min(number, (10 ** digits) - 1)).padStart(digits, "0");
}

function formatNodeGraphConstraintMetricFps(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return "--";
  }
  return String(Math.round(Math.min(999, fps)));
}

function setNodeGraphConstraintMetricText(root, selector, text) {
  const element = root?.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
}

function syncNodeGraphCpuConstraintMetrics() {
  const root = document.getElementById("nodeScopeCpuMetrics");
  if (!root) {
    return;
  }
  if (!document.body.classList.contains("node-constraint-cpu-active")) {
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='fps']", "--");
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='busy']", "--");
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='audio']", "--");
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='overruns']", "--");
    return;
  }
  const metrics = nodeGraphMvp.constraintResourceMetrics || {};
  const frameRate = Number(metrics.mainFrameRate) || 0;
  const busyPct = frameRate > 0
    ? Math.min(100, Math.max(0, Math.round((1 - Math.min(frameRate, 60) / 60) * 100)))
    : Math.min(100, Math.max(0, Math.round((Number(metrics.mainThreadLagMs) || 0) / 10)));
  // Audio % comes from the worklet meter (block wall time / quantum budget).
  const audioPctRaw = Number(metrics.audioLoadPct);
  const audioPct = Number.isFinite(audioPctRaw)
    ? Math.max(0, Math.round(audioPctRaw))
    : null;
  const overruns = Math.max(0, Math.floor(Number(metrics.audioOverrunCount) || 0));
  setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='fps']", formatNodeGraphConstraintMetricFps(frameRate));
  setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='busy']", String(busyPct));
  setNodeGraphConstraintMetricText(
    root,
    "[data-scope-cpu-metric='audio']",
    audioPct === null ? "--" : String(audioPct),
  );
  setNodeGraphConstraintMetricText(
    root,
    "[data-scope-cpu-metric='overruns']",
    audioPct === null ? "--" : String(overruns),
  );
  root.dataset.audioStressed = audioPct !== null && (audioPct >= 85 || overruns > 0) ? "1" : "0";
}

function syncNodeGraphRamConstraintMetrics() {
  const root = document.getElementById("nodeScopeRamMetrics");
  if (!root) {
    return;
  }
  if (!document.body.classList.contains("node-constraint-ram-active")) {
    setNodeGraphConstraintMetricText(root, "[data-scope-ram-metric='used']", "--");
    return;
  }
  const memory = performance?.memory || {};
  const usedMb = memory.usedJSHeapSize ? memory.usedJSHeapSize / (1024 * 1024) : 0;
  setNodeGraphConstraintMetricText(
    root,
    "[data-scope-ram-metric='used']",
    usedMb ? String(Math.round(usedMb)) : "n/a",
  );
}

function syncNodeGraphConstraintResourceMetrics() {
  syncNodeGraphCpuConstraintMetrics();
  syncNodeGraphRamConstraintMetrics();
  if (typeof syncNodeGraphScopeGpuMetricsDisplay === "function") {
    syncNodeGraphScopeGpuMetricsDisplay();
  }
}

function startNodeGraphConstraintResourceMetrics() {
  if (nodeGraphMvp.constraintResourceMetricsStarted) {
    return;
  }
  nodeGraphMvp.constraintResourceMetricsStarted = true;
  const metrics = {
    frameCount: 0,
    lastFrameAt: performance.now(),
    lastFpsAt: performance.now(),
    mainFrameRate: 0,
    mainThreadLagMs: 0,
    tickExpectedAt: performance.now() + 1000,
  };
  nodeGraphMvp.constraintResourceMetrics = metrics;
  const frame = (now) => {
    metrics.frameCount += 1;
    if (now - metrics.lastFpsAt >= 1000) {
      metrics.mainFrameRate = (metrics.frameCount * 1000) / Math.max(1, now - metrics.lastFpsAt);
      metrics.frameCount = 0;
      metrics.lastFpsAt = now;
      syncNodeGraphConstraintResourceMetrics();
    }
    metrics.lastFrameAt = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.setInterval(() => {
    const now = performance.now();
    metrics.mainThreadLagMs = Math.max(0, now - metrics.tickExpectedAt);
    metrics.tickExpectedAt = now + 1000;
    syncNodeGraphConstraintResourceMetrics();
  }, 1000);
}
