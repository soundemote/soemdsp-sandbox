// Scope canvas clear / pause / backing size / sync (Phase D).
// Load after scopes.js (+ lifecycle). Extract-only.

function nodeGraphModuleScopeBuffersCurrent() {
  // Model displays used to report "current" with empty buffers so offline
  // clocks/oscillators could animate without live capture. That kept the
  // draw path alive after Stop. While paused/stopped, require real buffers
  // (or force) — force is handled by callers that skip this check.
  if (
    nodeGraphModuleScopeHasModelDisplay()
    && (typeof nodeGraphModuleScopePaused !== "function" || !nodeGraphModuleScopePaused())
  ) {
    return true;
  }
  if (!nodeGraphModuleScopeState.buffers.size) {
    return false;
  }
  const patch = nodeGraphMvp?.patch;
  if (nodeGraphModuleScopeState.mode === "live") {
    // Live rings stay valid while the audio session is up. Layout commits
    // change the full patch fingerprint without invalidating sample history;
    // do not treat that as "stale" or scopes go blank until the next plan sync.
    return Boolean(nodeGraphMvp?.live?.node);
  }
  return nodeGraphModuleScopeState.patchFingerprint === nodeGraphPatchFingerprint()
    && nodeGraphModuleScopeState.monitorFingerprint === nodeGraphModuleScopeMonitorFingerprint(
      nodeGraphModuleScopeCaptureMonitors(patch),
    );
}

function clearNodeGraphModuleScopeCanvas() {
  const canvas = nodeGraphModuleScopeCanvas();
  const lightCanvas = nodeGraphModuleScopeLightCanvas();
  if (lightCanvas) {
    const context = lightCanvas.getContext("2d");
    context?.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  }
  if (!canvas) return;
  if (nodeGraphModuleScopeState.renderer?.kind === "webgl") {
    const gl = nodeGraphModuleScopeState.renderer.gl;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  canvas.width = canvas.width;
}

function nodeGraphModuleScopeTracesOff() {
  const value = Number(nodeGraphMvp?.visualControls?.scopeTracesOff) || 0;
  return value > 0.5;
}

function nodeGraphModuleScopeCircuitRunning() {
  const live = nodeGraphMvp?.live || {};
  const contextState = String(live.context?.state || "");
  // Prefer engine transport over AudioContext.state alone — "suspended" can
  // lag a resume and used to freeze Instant Trace (only force paints from
  // Display Settings / Unpause advanced the face).
  const speed = Number(live.speedMultiplier);
  if (Number.isFinite(speed) && speed > 0 && live.node && live.outputEnabled) {
    if (contextState === "closed") {
      return false;
    }
    return true;
  }
  return Boolean(
    live.outputEnabled &&
    live.node &&
    live.context &&
    contextState !== "closed" &&
    contextState !== "suspended"
  );
}

// Live / pause / freeze / schedule policy:
//   node-graph-module-scope-paint-gate.js  (scopePaintIsLive, …)
// Compatibility shims (enginePaused / livePaintActive / phosphorFrozen) live there.
// nodeGraphModuleScopePaused keeps the extra “no drawable slots” idle case.

/**
 * True when full live draw should idle (cold plate only unless force).
 * Paint gate owns engine/visual pause; this adds “nothing to draw” idle.
 */
function nodeGraphModuleScopePaused() {
  if (typeof scopePaintIsPaused === "function") {
    if (scopePaintIsPaused()) {
      return true;
    }
  } else if (typeof scopePaintIsLive === "function") {
    if (!scopePaintIsLive()) {
      return true;
    }
  } else {
    // Fallback if paint-gate script failed to load.
    const speed = Number(nodeGraphMvp?.live?.speedMultiplier);
    if (Number.isFinite(speed) && speed <= 0) {
      return true;
    }
    if (!nodeGraphModuleScopeCircuitRunning()) {
      return true;
    }
  }
  return !nodeGraphModuleScopeHasModelDisplay() && !nodeGraphModuleScopeHasRenderableSlots();
}

// absorbNodeGraphPhosphorDrawCursorOnCanvas → node-graph-module-scope-phosphor.js
// absorbNodeGraphModuleScopePhosphorDrawCursors → node-graph-module-scope-phosphor.js
function nodeGraphModuleScopeBackingPixelRatio(rect, requestedPixelRatio = window.devicePixelRatio || 1) {
  const width = Math.max(1, Number(rect?.width) || 1);
  const height = Math.max(1, Number(rect?.height) || 1);
  const requested = Math.max(0.25, Number(requestedPixelRatio) || 1);
  const maxSize = Math.max(256, Number(nodeGraphModuleScopeMaxBackingStoreSize) || 4096);
  return Math.max(
    0.25,
    Math.min(
      requested,
      maxSize / width,
      maxSize / height,
    ),
  );
}

/**
 * Fixed pixel-grid backing for face-local scopes (scope2d burn / Lorenz,
 * PhosphorLight, Number Readout, local fallback canvases).
 *
 * Uses layout CSS size (clientWidth/offsetWidth) × devicePixelRatio — the same
 * contract as nodeGraphSizeDisplayCanvas (filter curve, phosphor waveform).
 * Workspace zoom must NOT grow the buffer: getBoundingClientRect is screen-
 * space and balloons with zoom, killing FPS on burn/energy FBOs. CSS width/
 * height 100% scales the fixed bitmap; .pixelated-canvas-zoom keeps it crisp
 * (blocky) when zoomed in instead of bilinear mush.
 */
function nodeGraphModuleScopeFaceBackingSize(screenElement, requestedPixelRatio = window.devicePixelRatio || 1) {
  if (!screenElement) {
    return null;
  }
  const rect = typeof screenElement.getBoundingClientRect === "function"
    ? screenElement.getBoundingClientRect()
    : { width: 0, height: 0 };
  const zoom = Math.max(
    0.01,
    Number(
      typeof nodeGraphZoom === "function"
        ? nodeGraphZoom()
        : (nodeGraphMvp && nodeGraphMvp.zoom),
    ) || 1,
  );
  // Layout (pre-transform) CSS pixels — stable under workspace zoom.
  // Prefer client/offset; if layout has not resolved yet (0×0 common before
  // first reflow), fall back to CSS display-height vars so faces still get a
  // real buffer instead of a 1×1 plate that never looks painted.
  let cssWidth = Number(screenElement.clientWidth || screenElement.offsetWidth || 0);
  let cssHeight = Number(screenElement.clientHeight || screenElement.offsetHeight || 0);
  if (!(cssWidth > 0) || !(cssHeight > 0)) {
    const host = screenElement.closest?.(".dsp-node") || screenElement;
    let gridPx = 28;
    try {
      const style = getComputedStyle(host);
      const raw = Number.parseFloat(style.getPropertyValue("--node-grid-height") || style.getPropertyValue("--node-grid-size") || "");
      if (Number.isFinite(raw) && raw > 0) {
        gridPx = raw;
      }
      if (!(cssHeight > 0)) {
        const displayGu = Number.parseFloat(style.getPropertyValue("--node-module-display-height-units") || "");
        if (Number.isFinite(displayGu) && displayGu > 0) {
          cssHeight = displayGu * gridPx;
        }
      }
      if (!(cssWidth > 0)) {
        const widthGu = Number.parseFloat(style.getPropertyValue("--node-grid-width-units") || "");
        if (Number.isFinite(widthGu) && widthGu > 0) {
          const gw = Number.parseFloat(style.getPropertyValue("--node-grid-width") || style.getPropertyValue("--node-grid-size") || "");
          cssWidth = widthGu * (Number.isFinite(gw) && gw > 0 ? gw : gridPx);
        }
      }
    } catch (_error) {
      // Best-effort CSS var fallback.
    }
  }
  if (!(cssWidth > 0)) {
    cssWidth = (Number(rect.width) || 1) / zoom;
  }
  if (!(cssHeight > 0)) {
    cssHeight = (Number(rect.height) || 1) / zoom;
  }
  cssWidth = Math.max(1, cssWidth);
  cssHeight = Math.max(1, cssHeight);
  // Face buffers use devicePixelRatio only (capped by max store vs layout size).
  // Do not inherit a workspace-rect-derived ratio that shrank for the whole
  // graph, and never scale by workspace zoom.
  const requested = Math.max(
    0.25,
    Number(window.devicePixelRatio)
      || Number(requestedPixelRatio)
      || 1,
  );
  const pixelRatio = nodeGraphModuleScopeBackingPixelRatio(
    { width: cssWidth, height: cssHeight },
    requested,
  );
  return {
    cssHeight,
    cssWidth,
    height: Math.max(1, Math.round(cssHeight * pixelRatio)),
    pixelRatio,
    width: Math.max(1, Math.round(cssWidth * pixelRatio)),
  };
}

function syncNodeGraphModuleScopeCanvas() {
  const canvas = nodeGraphModuleScopeCanvas();
  const lightCanvas = nodeGraphModuleScopeLightCanvas();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!canvas || !workspace) {
    return false;
  }

  const rect = workspace.getBoundingClientRect();
  const pixelRatio = nodeGraphModuleScopeBackingPixelRatio(rect);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  nodeGraphModuleScopeState.backingPixelRatio = pixelRatio;
  if (nodeGraphModuleScopeState.renderer?.canvas === canvas) {
    nodeGraphModuleScopeState.renderer.pixelRatio = pixelRatio;
  }
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  if (lightCanvas) {
    if (lightCanvas.width !== width) {
      lightCanvas.width = width;
    }
    if (lightCanvas.height !== height) {
      lightCanvas.height = height;
    }
  }
  return true;
}

// Scope WebGL → node-graph-module-scope-webgl.js
// Scope buffer views → node-graph-module-scope-buffer-view.js
