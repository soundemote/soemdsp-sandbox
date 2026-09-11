// Layout canvas: pinned displays fullscreen (phone button + F).
// Root → patch.view.canvases.root; inside metamodule → byMetamodule[metaId].
// Condensed modular-windowed phone frame is retired — this is the canvas.

function nodeGraphLayoutCanvasEnsureView(patch = nodeGraphMvp?.patch) {
  if (!patch || typeof patch !== "object") {
    return null;
  }
  if (!patch.view || typeof patch.view !== "object") {
    patch.view = {};
  }
  if (!patch.view.canvases || typeof patch.view.canvases !== "object") {
    patch.view.canvases = { root: { elements: [] }, byMetamodule: {} };
  }
  if (!patch.view.canvases.root || typeof patch.view.canvases.root !== "object") {
    patch.view.canvases.root = { elements: [] };
  }
  if (!Array.isArray(patch.view.canvases.root.elements)) {
    patch.view.canvases.root.elements = [];
  }
  if (!patch.view.canvases.byMetamodule || typeof patch.view.canvases.byMetamodule !== "object") {
    patch.view.canvases.byMetamodule = {};
  }
  return patch.view.canvases;
}

function nodeGraphLayoutCanvasActiveScopeId() {
  if (typeof nodeGraphMetamoduleViewId === "function") {
    const id = String(nodeGraphMetamoduleViewId() || "").trim();
    if (id) {
      return id;
    }
  }
  return "";
}

function nodeGraphLayoutCanvasBucket(patch = nodeGraphMvp?.patch) {
  const canvases = nodeGraphLayoutCanvasEnsureView(patch);
  if (!canvases) {
    return { elements: [] };
  }
  const metaId = nodeGraphLayoutCanvasActiveScopeId();
  if (!metaId) {
    return canvases.root;
  }
  if (!canvases.byMetamodule[metaId] || typeof canvases.byMetamodule[metaId] !== "object") {
    canvases.byMetamodule[metaId] = { elements: [] };
  }
  if (!Array.isArray(canvases.byMetamodule[metaId].elements)) {
    canvases.byMetamodule[metaId].elements = [];
  }
  return canvases.byMetamodule[metaId];
}

function nodeGraphLayoutCanvasPinnedNodeIds(patch = nodeGraphMvp?.patch) {
  const bucket = nodeGraphLayoutCanvasBucket(patch);
  const els = Array.isArray(bucket?.elements) ? bucket.elements : [];
  return els
    .filter((el) => el && el.enabled !== false)
    .map((el) => String(el.nodeId || "").trim())
    .filter(Boolean);
}

function nodeGraphLayoutCanvasIsPinned(nodeId, patch = nodeGraphMvp?.patch) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  return nodeGraphLayoutCanvasPinnedNodeIds(patch).includes(id);
}

function nodeGraphLayoutCanvasDefaultRect(index) {
  const i = Math.max(0, Math.round(Number(index) || 0));
  const cols = 2;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const w = 0.46;
  const h = 0.42;
  const gap = 0.04;
  return {
    x: gap + col * (w + gap),
    y: gap + row * (h + gap),
    w,
    h,
    z: i,
  };
}

function nodeGraphLayoutCanvasSetPinned(nodeId, pinned, options = {}) {
  const id = String(nodeId || "").trim();
  const patch = options.patch || nodeGraphMvp?.patch;
  if (!id || !patch) {
    return false;
  }
  const bucket = nodeGraphLayoutCanvasBucket(patch);
  const els = bucket.elements;
  const idx = els.findIndex((el) => String(el?.nodeId || "") === id);
  const on = Boolean(pinned);
  if (on) {
    if (idx >= 0) {
      els[idx].enabled = true;
    } else {
      els.push({
        nodeId: id,
        enabled: true,
        ...nodeGraphLayoutCanvasDefaultRect(els.length),
      });
    }
  } else if (idx >= 0) {
    els.splice(idx, 1);
  }
  if (options.persist !== false && typeof markNodeGraphPatchDirty === "function") {
    markNodeGraphPatchDirty();
  }
  if (options.refresh !== false && nodeGraphLayoutCanvasIsActive()) {
    nodeGraphLayoutCanvasRefreshOpenStage();
  }
  return true;
}

function nodeGraphLayoutCanvasTogglePinned(nodeId, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  return nodeGraphLayoutCanvasSetPinned(id, !nodeGraphLayoutCanvasIsPinned(id), options);
}

function nodeGraphLayoutCanvasIsActive() {
  return Boolean(nodeGraphMvp?.layoutCanvasActive)
    || (typeof nodeGraphScreenSoloIsActive === "function" && nodeGraphScreenSoloIsActive()
      && nodeGraphMvp?.screenSolo?.layoutCanvas);
}

function nodeGraphLayoutCanvasRefreshOpenStage() {
  if (!nodeGraphLayoutCanvasIsActive()) {
    return false;
  }
  if (typeof endNodeGraphScreenSolo === "function") {
    endNodeGraphScreenSolo({ silent: true });
  }
  return nodeGraphLayoutCanvasOpen({ silent: true });
}

function nodeGraphLayoutCanvasOpen(options = {}) {
  const ids = nodeGraphLayoutCanvasPinnedNodeIds();
  if (!ids.length) {
    if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        "Canvas is empty. Open Display Settings on a module and enable “Show in canvas”.",
      );
    }
    return false;
  }
  if (typeof beginNodeGraphScreenSoloGrid !== "function") {
    return false;
  }
  // Exit any prior solo first.
  if (typeof nodeGraphScreenSoloIsActive === "function" && nodeGraphScreenSoloIsActive()) {
    endNodeGraphScreenSolo({ silent: true });
  }
  const started = beginNodeGraphScreenSoloGrid(ids);
  if (!started) {
    if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Pinned modules have no display faces to show on the canvas.");
    }
    return false;
  }
  nodeGraphMvp.layoutCanvasActive = true;
  if (nodeGraphMvp.screenSolo) {
    nodeGraphMvp.screenSolo.layoutCanvas = true;
  }
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    stage.setAttribute(
      "aria-label",
      "Layout canvas. Press F or the phone button, or Escape, to exit.",
    );
    stage.classList.add("node-layout-canvas-stage");
  }
  // Canvas view: contain fit only (no stretch cycle on F).
  if (typeof applyNodeGraphScreenSoloFit === "function") {
    applyNodeGraphScreenSoloFit("contain");
  }
  if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
    const n = ids.length;
    const scope = nodeGraphLayoutCanvasActiveScopeId() ? "metamodule" : "root";
    setNodeInteractionHelp(
      `Canvas (${scope}): ${n} display${n === 1 ? "" : "s"}. F or 📱 exits.`,
    );
  }
  return true;
}

function nodeGraphLayoutCanvasClose(options = {}) {
  nodeGraphMvp.layoutCanvasActive = false;
  if (nodeGraphMvp.screenSolo) {
    nodeGraphMvp.screenSolo.layoutCanvas = false;
  }
  document.getElementById("nodeScreenSoloStage")?.classList.remove("node-layout-canvas-stage");
  if (typeof endNodeGraphScreenSolo === "function" && nodeGraphScreenSoloIsActive()) {
    endNodeGraphScreenSolo({ silent: options.silent === true });
  }
  if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("Canvas off.");
  }
  return true;
}

/** Phone button + F: toggle layout canvas for current scope. */
function toggleNodeGraphLayoutCanvasView(options = {}) {
  if (nodeGraphLayoutCanvasIsActive()) {
    return nodeGraphLayoutCanvasClose(options);
  }
  return nodeGraphLayoutCanvasOpen(options);
}

function syncNodeGraphLayoutCanvasSettingsControl() {
  const input = document.getElementById("nodeLayoutCanvasShowInCanvas");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const ids = typeof nodeGraphSelectedNodeIdsInOrder === "function"
    ? nodeGraphSelectedNodeIdsInOrder()
    : (typeof nodeGraphSelectedNodeIds === "function" ? [...nodeGraphSelectedNodeIds()] : []);
  const id = ids.length === 1 ? String(ids[0] || "") : "";
  const eligible = Boolean(id) && typeof nodeGraphScreenSoloFindFace === "function"
    && Boolean(nodeGraphScreenSoloFindFace(id));
  input.disabled = !eligible;
  input.checked = eligible && nodeGraphLayoutCanvasIsPinned(id);
  const row = input.closest("label") || input.parentElement;
  if (row) {
    row.hidden = false;
    row.classList.toggle("is-disabled", !eligible);
  }
}

function bindNodeGraphLayoutCanvasSettingsControl() {
  const input = document.getElementById("nodeLayoutCanvasShowInCanvas");
  if (!(input instanceof HTMLInputElement) || input.dataset.bound === "true") {
    return;
  }
  input.dataset.bound = "true";
  input.addEventListener("change", () => {
    const ids = typeof nodeGraphSelectedNodeIdsInOrder === "function"
      ? nodeGraphSelectedNodeIdsInOrder()
      : [];
    const id = ids.length === 1 ? String(ids[0] || "") : "";
    if (!id) {
      input.checked = false;
      return;
    }
    nodeGraphLayoutCanvasSetPinned(id, input.checked);
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        input.checked
          ? "Show in canvas on. Press F or 📱 to open the canvas."
          : "Removed from canvas.",
      );
    }
  });
}

function bindNodeGraphLayoutCanvasEvents() {
  if (document.documentElement.dataset.layoutCanvasBound === "true") {
    return;
  }
  document.documentElement.dataset.layoutCanvasBound = "true";
  bindNodeGraphLayoutCanvasSettingsControl();
  // Keep checkbox in sync when selection changes.
  document.addEventListener("nodegraph-selection-changed", () => {
    syncNodeGraphLayoutCanvasSettingsControl();
  });
  // Fallback: poll lightly when display settings menu opens.
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (menu) {
    const obs = new MutationObserver(() => {
      if (!menu.hidden) {
        syncNodeGraphLayoutCanvasSettingsControl();
      }
    });
    obs.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
  }
}
