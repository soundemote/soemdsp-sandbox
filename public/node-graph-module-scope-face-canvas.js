// Module face canvas SSOT — tape vs burn.
//
// Instant Trace / Output pause use mode "tape" (never dispose/recreate).
// Energy / line / hypersaw / videoscope burn use mode "burn" (versioned recreate).
// Peek never allocates. Do not name this "fallback" — the face canvas is primary.
//
// CSS class stays `.node-module-scope-local-fallback-canvas` for styles/rescue.
// Load before phosphor.js so absorb/wipe/capture can call ensure at runtime.

const NODE_GRAPH_FACE_KIND_TAPE = "tape";
const NODE_GRAPH_FACE_KIND_BURN = "burn";
const NODE_GRAPH_FACE_TAPE_RENDERER_TAG = "sample-history-trace-1";
const NODE_GRAPH_FACE_CSS_CLASS = "node-module-scope-local-fallback-canvas";

/** Burn renderers that own energy FBO / versioned recreate. */
const NODE_GRAPH_FACE_BURN_RENDERERS = new Set([
  "lineBurn",
  "hypersawBurn",
  "scope2d",
  "phosphorLight",
  "videoscopeBurn",
  "oscilloscopeBankBurn",
]);

/** Tape / Instant Trace style faces — never burn-recreate. */
const NODE_GRAPH_FACE_TAPE_RENDERERS = new Set([
  "scope2dTrace",
  "trace",
  "traceRgb",
  "traceXyz",
  "value",
  "numberReadout",
  "vectorDot",
  "dot",
  "pulseDot",
  "lcdDot",
]);

// Persistent canvas cache — survives module DOM rebuilds. Keyed by nodeId.
const nodeGraphModuleScopePersistentCanvases = new Map();

function nodeGraphFaceBurnRendererVersion() {
  if (typeof nodeGraphScope2dBurnRendererVersion === "string" && nodeGraphScope2dBurnRendererVersion) {
    return nodeGraphScope2dBurnRendererVersion;
  }
  return "energy-mono-lut-soft-beam-1";
}

function nodeGraphScopeFaceCanvasIsUsable(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  try {
    return Boolean(canvas.getContext("2d"));
  } catch (_error) {
    return false;
  }
}

function nodeGraphModuleScopeFaceHasTapeMarkers(canvas) {
  if (!canvas) {
    return false;
  }
  if (
    canvas._waterfall?.started
    || canvas._traceScroll?.started
    || canvas._outputPausePlateReady
    || canvas._waterfallDestHistory
    || canvas._outputPauseBannerStamped
  ) {
    return true;
  }
  if (canvas.classList?.contains("node-module-scope-vector-trace")) {
    return true;
  }
  const tag = String(canvas.dataset?.scope2dRenderer || "");
  if (tag.startsWith("sample-history-trace") || tag.startsWith("instant-trace")) {
    return true;
  }
  return String(canvas.dataset?.faceKind || "") === NODE_GRAPH_FACE_KIND_TAPE;
}

function nodeGraphModuleScopeFaceKindForSlot(slot) {
  const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
    ? String(nodeGraphModuleDisplayRendererForSlot(slot) || "")
    : "";
  if (NODE_GRAPH_FACE_BURN_RENDERERS.has(renderer)) {
    return NODE_GRAPH_FACE_KIND_BURN;
  }
  if (NODE_GRAPH_FACE_TAPE_RENDERERS.has(renderer)) {
    return NODE_GRAPH_FACE_KIND_TAPE;
  }
  const type = String(slot?.type || "");
  if (type === "output") {
    return NODE_GRAPH_FACE_KIND_TAPE;
  }
  // Conservative: unknown → tape (never auto-recreate).
  return NODE_GRAPH_FACE_KIND_TAPE;
}

function tagNodeGraphModuleScopeFaceCanvas(canvas, kind) {
  if (!canvas?.dataset) {
    return canvas;
  }
  const faceKind = kind === NODE_GRAPH_FACE_KIND_BURN
    ? NODE_GRAPH_FACE_KIND_BURN
    : NODE_GRAPH_FACE_KIND_TAPE;
  canvas.dataset.faceKind = faceKind;
  if (faceKind === NODE_GRAPH_FACE_KIND_BURN) {
    canvas.dataset.scope2dRenderer = nodeGraphFaceBurnRendererVersion();
  } else if (!canvas.dataset.scope2dRenderer || canvas.dataset.scope2dRenderer === nodeGraphFaceBurnRendererVersion()) {
    // Do not overwrite a more specific tape tag (e.g. sample-history-trace-1).
    if (!String(canvas.dataset.scope2dRenderer || "").startsWith("sample-history-trace")) {
      canvas.dataset.scope2dRenderer = NODE_GRAPH_FACE_TAPE_RENDERER_TAG;
    }
  }
  return canvas;
}

function nodeGraphModuleScopeInferFaceKind(canvas, slot) {
  if (!canvas) {
    return nodeGraphModuleScopeFaceKindForSlot(slot);
  }
  const tagged = String(canvas.dataset?.faceKind || "");
  if (tagged === NODE_GRAPH_FACE_KIND_BURN || tagged === NODE_GRAPH_FACE_KIND_TAPE) {
    return tagged;
  }
  if (nodeGraphModuleScopeFaceHasTapeMarkers(canvas)) {
    return NODE_GRAPH_FACE_KIND_TAPE;
  }
  if (
    canvas._phosphorEnergyGl
    || canvas._nodeGraphScope2dBurnRenderer
    || String(canvas.dataset?.scope2dRenderer || "") === nodeGraphFaceBurnRendererVersion()
  ) {
    return NODE_GRAPH_FACE_KIND_BURN;
  }
  return nodeGraphModuleScopeFaceKindForSlot(slot);
}

function nodeGraphModuleScopeFaceScreenElement(slot) {
  return slot?.scopeElement || null;
}

function nodeGraphModuleScopeDisposeBurnFaceCanvas(canvas, nodeId) {
  if (typeof disposeNodeGraphScope2dBurnRendererForCanvas === "function") {
    try {
      disposeNodeGraphScope2dBurnRendererForCanvas(canvas);
    } catch (_error) { /* best-effort */ }
  }
  if (typeof nodeGraphPhosphorEnergyGlDestroy === "function" && canvas?._phosphorEnergyGl) {
    try {
      nodeGraphPhosphorEnergyGlDestroy(canvas._phosphorEnergyGl);
    } catch (_error) { /* ignore */ }
    canvas._phosphorEnergyGl = null;
  }
  try {
    canvas?.remove?.();
  } catch (_error) { /* ignore */ }
  if (nodeId) {
    nodeGraphModuleScopePersistentCanvases.delete(nodeId);
  }
}

function nodeGraphModuleScopeCreateFaceCanvasElement(kind) {
  const canvas = document.createElement("canvas");
  canvas.className = NODE_GRAPH_FACE_CSS_CLASS;
  canvas.style.mixBlendMode = "normal";
  canvas.setAttribute("aria-hidden", "true");
  tagNodeGraphModuleScopeFaceCanvas(canvas, kind);
  return canvas;
}

/**
 * Ensure / peek the module face canvas.
 * @param {object} slot
 * @param {{ mode?: 'peek'|'tape'|'burn'|'auto' }} [options]
 */
function ensureNodeGraphModuleScopeFaceCanvas(slot, options = {}) {
  const screenElement = nodeGraphModuleScopeFaceScreenElement(slot);
  const nodeId = slot?.nodeId;
  if (!screenElement) {
    return null;
  }
  const rawMode = String(options.mode || "auto");
  const mode = (rawMode === "peek" || rawMode === "tape" || rawMode === "burn" || rawMode === "auto")
    ? rawMode
    : "auto";

  let canvas = screenElement.querySelector(`:scope > .${NODE_GRAPH_FACE_CSS_CLASS}`);
  if (!canvas && nodeId && nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
    canvas = nodeGraphModuleScopePersistentCanvases.get(nodeId);
    if (canvas && !nodeGraphScopeFaceCanvasIsUsable(canvas)) {
      nodeGraphModuleScopeDisposeBurnFaceCanvas(canvas, nodeId);
      canvas = null;
    } else if (canvas && canvas.parentNode !== screenElement) {
      screenElement.appendChild(canvas);
    }
  }

  if (mode === "peek") {
    return canvas || null;
  }

  const kindWanted = mode === "auto"
    ? nodeGraphModuleScopeInferFaceKind(canvas, slot)
    : mode;
  const kindExisting = nodeGraphModuleScopeInferFaceKind(canvas, slot);

  // Burn recreate only when caller asked for burn AND face is burn-kind.
  if (
    canvas
    && mode === "burn"
    && kindExisting === NODE_GRAPH_FACE_KIND_BURN
    && canvas.dataset.scope2dRenderer !== nodeGraphFaceBurnRendererVersion()
  ) {
    nodeGraphModuleScopeDisposeBurnFaceCanvas(canvas, nodeId);
    canvas = null;
  } else if (
    canvas
    && mode === "burn"
    && kindExisting === NODE_GRAPH_FACE_KIND_BURN
    && !nodeGraphScopeFaceCanvasIsUsable(canvas)
  ) {
    nodeGraphModuleScopeDisposeBurnFaceCanvas(canvas, nodeId);
    canvas = null;
  }

  // Tape (or burn-mode on a tape face): never dispose for version skew.
  if (canvas && (kindExisting === NODE_GRAPH_FACE_KIND_TAPE || mode === "tape")) {
    tagNodeGraphModuleScopeFaceCanvas(canvas, NODE_GRAPH_FACE_KIND_TAPE);
    if (canvas.style.mixBlendMode !== "normal") {
      canvas.style.mixBlendMode = "normal";
    }
    if (nodeId && !nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
      nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
    }
    return canvas;
  }

  if (!canvas) {
    canvas = nodeGraphModuleScopeCreateFaceCanvasElement(kindWanted);
    screenElement.appendChild(canvas);
    if (nodeId) {
      nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
    }
    return canvas;
  }

  tagNodeGraphModuleScopeFaceCanvas(canvas, kindWanted);
  if (canvas.style.mixBlendMode !== "normal") {
    canvas.style.mixBlendMode = "normal";
  }
  if (nodeId && !nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
    nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
  }
  return canvas;
}

function peekNodeGraphModuleScopeFaceCanvas(slot) {
  return ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "peek" });
}

/**
 * Sync face backing store.
 * @returns {{ resized: boolean, synced: boolean, density: number }}
 */
function syncNodeGraphModuleScopeFaceCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1, options = {}) {
  if (!canvas || !screenElement) {
    return { resized: false, synced: false, density: 1 };
  }
  let policy = String(options.policy || "auto");
  if (policy === "auto") {
    policy = String(canvas.dataset?.faceKind || "") === NODE_GRAPH_FACE_KIND_BURN
      ? NODE_GRAPH_FACE_KIND_BURN
      : NODE_GRAPH_FACE_KIND_TAPE;
  }
  if (policy === NODE_GRAPH_FACE_KIND_BURN) {
    return syncNodeGraphModuleScopeFaceCanvasBurn(canvas, screenElement, pixelRatio, pixelDensity);
  }
  return syncNodeGraphModuleScopeFaceCanvasTape(canvas, screenElement, pixelRatio, pixelDensity);
}

function syncNodeGraphModuleScopeFaceCanvasTape(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  const size = typeof nodeGraphModuleScopeFaceBackingSize === "function"
    ? nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio)
    : null;
  if (!size) {
    return { resized: false, synced: false, density: 1 };
  }
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity({ pixelDensity }, 1)
    : Math.max(0, Math.min(1, Number(pixelDensity) || 0));
  let width = Math.max(1, Math.round(size.width * density));
  let height = Math.max(1, Math.round(size.height * density));
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : false;
  const holdWaterfall = Boolean(canvas._waterfall?.started || canvas._traceScroll?.started);
  const holdVectorTrace = Boolean(canvas.classList?.contains("node-module-scope-vector-trace"));
  if ((frozen || holdWaterfall || holdVectorTrace) && canvas.width >= 2 && canvas.height >= 2) {
    const dw = Math.abs(width - canvas.width);
    const dh = Math.abs(height - canvas.height);
    const slop = (holdWaterfall || holdVectorTrace) ? 2 : 1;
    if (dw <= slop && dh <= slop) {
      width = canvas.width;
      height = canvas.height;
    }
  }
  let resized = false;
  if (canvas.width !== width || canvas.height !== height) {
    resized = true;
    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    let previousCanvas = null;
    if (previousWidth > 0 && previousHeight > 0) {
      previousCanvas = document.createElement("canvas");
      previousCanvas.width = previousWidth;
      previousCanvas.height = previousHeight;
      const previousContext = previousCanvas.getContext("2d");
      if (previousContext) {
        previousContext.drawImage(canvas, 0, 0);
      }
    }
    canvas.width = width;
    canvas.height = height;
    canvas._nodeGraphScope2dLastDrawnPoint = null;
    const context = previousCanvas ? canvas.getContext("2d") : null;
    if (context) {
      context.imageSmoothingEnabled = density >= 0.999;
      context.drawImage(previousCanvas, 0, 0, previousWidth, previousHeight, 0, 0, width, height);
    }
  }
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return { resized, synced: true, density };
}

function syncNodeGraphModuleScopeFaceCanvasBurn(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  const size = typeof nodeGraphModuleScopeFaceBackingSize === "function"
    ? nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio)
    : null;
  if (!size) {
    return { resized: false, synced: false, density: 1 };
  }
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity({ pixelDensity }, 1)
    : Math.max(0, Math.min(1, Number(pixelDensity) || 0));
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
  const resized = canvas.width !== width || canvas.height !== height;
  if (resized) {
    canvas.width = width;
    canvas.height = height;
    canvas._nodeGraphScope2dLastDrawnPoint = null;
    canvas._phosphorLiveOverlayPoints = null;
    canvas._phosphorLiveScratchInk = false;
  }
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return { resized, synced: true, density };
}

// Rescue: re-attach cached face canvases after module DOM rebuilds.
(function setupNodeGraphModuleScopeCanvasRescue() {
  if (typeof MutationObserver === "undefined") {
    return;
  }
  const rescue = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) {
          continue;
        }
        for (const el of [node, ...(node.querySelectorAll?.(`.${NODE_GRAPH_FACE_CSS_CLASS}`) || [])]) {
          if (el.className !== NODE_GRAPH_FACE_CSS_CLASS && el.nodeName !== "CANVAS") {
            continue;
          }
          for (const [nid, cached] of nodeGraphModuleScopePersistentCanvases) {
            if (cached !== el) {
              continue;
            }
            const host = document.querySelector(
              `.dsp-node[data-node="${nid}"], [data-node="${nid}"].dsp-node, [data-node-id="${nid}"]`,
            );
            const scopeEl = host?.querySelector?.(
              ".node-module-scope-window, .node-module-scope-window-surface, .node-module-scope",
            );
            if (scopeEl && cached.parentNode !== scopeEl) {
              scopeEl.appendChild(cached);
            }
            break;
          }
        }
      }
    }
  });
  const root = document.getElementById("nodeWiringPanel")
    || document.getElementById("nodeGraphWorkspace")
    || document.body;
  if (root) {
    rescue.observe(root, { childList: true, subtree: true });
  }
})();

// --- Temporary shims (removed after call-site migration) ---
function nodeGraphModuleScopeLocalFallbackCanvas(slot) {
  return ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "tape" });
}

function syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  const result = syncNodeGraphModuleScopeFaceCanvas(
    canvas, screenElement, pixelRatio, pixelDensity, { policy: "tape" },
  );
  return Boolean(result?.synced);
}

function nodeGraphScope2dBurnCanvasForSlot(slot) {
  return ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "burn" });
}

function syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  return syncNodeGraphModuleScopeFaceCanvas(
    canvas, screenElement, pixelRatio, pixelDensity, { policy: "burn" },
  );
}

function nodeGraphScope2dFaceCanvasIsUsable(canvas) {
  return nodeGraphScopeFaceCanvasIsUsable(canvas);
}
