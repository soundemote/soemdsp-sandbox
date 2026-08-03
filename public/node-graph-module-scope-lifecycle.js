// Scope enable / heartbeat / plate background (Phase D).
// Load after scopes.js. Extract-only.

function nodeGraphModuleScopeCanvas() {
  return document.getElementById("nodeModuleScopeCanvas");
}

function nodeGraphModuleScopeLightCanvas() {
  return document.getElementById("nodeModuleScopeLightCanvas");
}

function nodeGraphModuleScopesEnabled() {
  return Boolean(nodeGraphModuleScopeState.enabled);
}

function setNodeGraphModuleScopesEnabled(enabled) {
  nodeGraphModuleScopeState.enabled = Boolean(enabled);
  document.getElementById("nodeGraphWorkspace")
    ?.classList.toggle("module-scopes-enabled", nodeGraphModuleScopesEnabled());
  syncNodeGraphModuleScopeHeartbeat();
  syncNodeGraphModuleScopeCanvas();
}

function syncNodeGraphModuleScopeHeartbeat() {
  if (!nodeGraphModuleScopesEnabled()) {
    if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
      window.clearInterval(nodeGraphModuleScopeState.drawFrameHeartbeat);
      nodeGraphModuleScopeState.drawFrameHeartbeat = 0;
    }
    return;
  }
  if (nodeGraphModuleScopeState.drawFrameHeartbeat) {
    return;
  }
  nodeGraphModuleScopeState.drawFrameHeartbeat = window.setInterval(() => {
    syncNodeGraphScopeGpuDebugDisplay();
    if (!nodeGraphModuleScopeHasDrawableSlots()) {
      return;
    }
    if (nodeGraphModuleScopePaused()) {
      // While frozen, only absorb phosphor sample cursors — never step energy.
      absorbNodeGraphModuleScopePhosphorDrawCursors();
      return;
    }
    const pendingFrame = Number(nodeGraphModuleScopeState.drawFrame) || 0;
    const requestedAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
    const now = (performance.now?.() || Date.now());
    if (pendingFrame && requestedAt > 0 && now - requestedAt <= 250) {
      return;
    }
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      nodeGraphModuleScopeState.drawFrame = 0;
      nodeGraphModuleScopeState.drawFrameRequestedAt = 0;
    }
    if (nodeGraphModuleScopeState.drawFrameWatchdog) {
      window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);
      nodeGraphModuleScopeState.drawFrameWatchdog = 0;
    }
    scheduleNodeGraphModuleScopeDraw();
  }, 100);
}

// Scope slots → node-graph-module-scope-slots.js
function resetNodeGraphModuleScopeFrameClocks() {
  nodeGraphModuleScopeState.modelFrameTimes.clear();
  nodeGraphModuleScopeState.clockPhasors.clear();
  nodeGraphModuleScopeState.phosphorFrame = {
    key: "",
    lastUpdate: 0,
  };
}

/**
 * Resolve the LCD/plate color under a face canvas (CSS token, then solid bg).
 * Used when simulation stops so screens return to a cold dark plate, not a
 * frozen last frame.
 */
function nodeGraphModuleScopePlateBackgroundForElement(element) {
  if (!element || typeof getComputedStyle !== "function") {
    return nodeGraphFacePlateDefaultBackground;
  }
  const host = element.closest?.(
    ".node-module-scope-window, .node-module-scope-window-surface, .node-xy-pad, .node-led-face, .dsp-node",
  ) || element.parentElement || element;
  try {
    const style = getComputedStyle(host);
    const token = String(style.getPropertyValue("--node-scope-background") || "").trim();
    if (token) {
      return token;
    }
    const bg = String(style.backgroundColor || "").trim();
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      return bg;
    }
  } catch (_error) {
    // Best-effort; fall through to default plate.
  }
  return nodeGraphFacePlateDefaultBackground;
}

/**
 * Wipe every module screen back to idle plate — same cold look as app start.
 * Drops phosphor residual FBOs and paints face canvases solid plate color so
 * stop feels like powering the simulation off (not freezing mid-trail).
 */
// Scope wipe → node-graph-module-scope-wipe.js
