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
  // Double-click-to-add-text-box is disabled for now (binding intentionally
  // commented out, not removed -- handleNodeGraphWorkspaceDoubleClickToAddTextBox
  // in node-graph-module-actions.js is untouched, ready to re-enable by
  // uncommenting this one line).
  // document
  //   .getElementById("nodeGraphWorkspace")
  //   .addEventListener("dblclick", handleNodeGraphWorkspaceDoubleClickToAddTextBox);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      nodeGraphWireInteractions.cancelPortConnectionMode();
      if (typeof setNodeGraphWorkspaceSnakeCircleCursor === "function") {
        setNodeGraphWorkspaceSnakeCircleCursor(false);
      }
    }
  });
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
    .addEventListener("pointerdown", handleNodeGraphWorkspaceSnakeCircleCursorPointerDown);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerup", handleNodeGraphWorkspaceSnakeCircleCursorPointerUp);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointercancel", handleNodeGraphWorkspaceSnakeCircleCursorPointerUp);
  document
    .getElementById("nodeGraphWorkspace")
    .addEventListener("pointerdown", beginNodeGraphMarqueeSelection);
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

function bindNodeGraphConstraintOverlayToggles() {
  for (const input of document.querySelectorAll("[data-constraint-toggle]")) {
    input.addEventListener("change", syncNodeGraphConstraintOverlayToggles);
  }
  syncNodeGraphConstraintOverlayToggles();
  startNodeGraphConstraintResourceMetrics();
}

function syncNodeGraphConstraintOverlayToggles() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  for (const constraint of ["cpu", "ram", "gpu"]) {
    const active = Boolean(document.querySelector(`[data-constraint-toggle="${constraint}"]`)?.checked);
    document.body.classList.toggle(`node-constraint-${constraint}-active`, active);
    workspace?.classList.toggle(`node-constraint-${constraint}-active`, active);
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
    return "--.-";
  }
  return Math.min(999.9, fps).toFixed(1).padStart(5, "0");
}

function formatNodeGraphConstraintMetricMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) {
    return "--.-";
  }
  return Math.min(999.9, ms).toFixed(1).padStart(5, "0");
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
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='fps']", "--.-");
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='lag']", "--.-");
    setNodeGraphConstraintMetricText(root, "[data-scope-cpu-debug='summary']", "cpu debug --");
    root.dataset.debugSnapshot = "";
    return;
  }
  const metrics = nodeGraphMvp.constraintResourceMetrics || {};
  const frameRate = Number(metrics.mainFrameRate) || 0;
  const lagMs = Math.max(0, Number(metrics.mainThreadLagMs) || 0);
  const busyPct = Math.min(100, Math.max(0, Math.round(lagMs * 6)));
  setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='fps']", formatNodeGraphConstraintMetricFps(frameRate));
  setNodeGraphConstraintMetricText(root, "[data-scope-cpu-metric='lag']", formatNodeGraphConstraintMetricMs(lagMs));
  const snapshot = {
    busyPct,
    domNodes: document.getElementsByTagName("*").length,
    frameRate,
    lagMs,
  };
  root.dataset.debugSnapshot = JSON.stringify(snapshot);
  setNodeGraphConstraintMetricText(
    root,
    "[data-scope-cpu-debug='summary']",
    `busy${formatNodeGraphConstraintMetricNumber(busyPct, 3)}% DOM nodes ${formatNodeGraphConstraintMetricNumber(snapshot.domNodes, 5)}`,
  );
}

function syncNodeGraphRamConstraintMetrics() {
  const root = document.getElementById("nodeScopeRamMetrics");
  if (!root) {
    return;
  }
  if (!document.body.classList.contains("node-constraint-ram-active")) {
    setNodeGraphConstraintMetricText(root, "[data-scope-ram-metric='used']", "----");
    setNodeGraphConstraintMetricText(root, "[data-scope-ram-metric='limit']", "----");
    setNodeGraphConstraintMetricText(root, "[data-scope-ram-debug='summary']", "ram debug --");
    root.dataset.debugSnapshot = "";
    return;
  }
  const memory = performance?.memory || {};
  const usedMb = memory.usedJSHeapSize ? memory.usedJSHeapSize / (1024 * 1024) : 0;
  const limitMb = memory.jsHeapSizeLimit ? memory.jsHeapSizeLimit / (1024 * 1024) : 0;
  const totalMb = memory.totalJSHeapSize ? memory.totalJSHeapSize / (1024 * 1024) : 0;
  const domNodes = document.getElementsByTagName("*").length;
  setNodeGraphConstraintMetricText(root, "[data-scope-ram-metric='used']", usedMb ? formatNodeGraphConstraintMetricNumber(usedMb, 4) : "n/a ");
  setNodeGraphConstraintMetricText(root, "[data-scope-ram-metric='limit']", limitMb ? formatNodeGraphConstraintMetricNumber(limitMb, 4) : "n/a ");
  const snapshot = {
    domNodes,
    heapLimitMb: limitMb,
    heapTotalMb: totalMb,
    heapUsedMb: usedMb,
  };
  root.dataset.debugSnapshot = JSON.stringify(snapshot);
  setNodeGraphConstraintMetricText(
    root,
    "[data-scope-ram-debug='summary']",
    `total${totalMb ? formatNodeGraphConstraintMetricNumber(totalMb, 4) : "n/a "}mb DOM nodes ${formatNodeGraphConstraintMetricNumber(domNodes, 5)}`,
  );
}

function syncNodeGraphConstraintResourceMetrics() {
  syncNodeGraphCpuConstraintMetrics();
  syncNodeGraphRamConstraintMetrics();
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
