// Layout canvas: pinned displays fullscreen (phone button + F).
// F cycle: off → perform → edit → off.
// Freeform x/y/w/h only — no auto-grid / auto-organize.
// Root → patch.view.canvases.root; metamodule → byMetamodule[metaId].

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

function nodeGraphLayoutCanvasElements(patch = nodeGraphMvp?.patch) {
  const bucket = nodeGraphLayoutCanvasBucket(patch);
  return Array.isArray(bucket?.elements) ? bucket.elements : [];
}

function nodeGraphLayoutCanvasPinnedNodeIds(patch = nodeGraphMvp?.patch) {
  return nodeGraphLayoutCanvasElements(patch)
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

function nodeGraphLayoutCanvasClamp01(n, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, v));
}

function nodeGraphLayoutCanvasNormalizeRect(raw, index = 0) {
  const i = Math.max(0, Math.round(Number(index) || 0));
  // Default: center-ish tile — NOT an auto-grid of all pins.
  const base = {
    x: 0.08 + (i % 5) * 0.02,
    y: 0.08 + (i % 5) * 0.02,
    w: 0.36,
    h: 0.32,
    z: i,
  };
  const src = raw && typeof raw === "object" ? raw : {};
  let w = nodeGraphLayoutCanvasClamp01(src.w, base.w);
  let h = nodeGraphLayoutCanvasClamp01(src.h, base.h);
  w = Math.max(0.08, w);
  h = Math.max(0.08, h);
  let x = nodeGraphLayoutCanvasClamp01(src.x, base.x);
  let y = nodeGraphLayoutCanvasClamp01(src.y, base.y);
  if (x + w > 1) {
    x = Math.max(0, 1 - w);
  }
  if (y + h > 1) {
    y = Math.max(0, 1 - h);
  }
  const z = Number.isFinite(Number(src.z)) ? Math.round(Number(src.z)) : base.z;
  return { x, y, w, h, z };
}

function nodeGraphLayoutCanvasElementForNode(nodeId, patch = nodeGraphMvp?.patch) {
  const id = String(nodeId || "").trim();
  return nodeGraphLayoutCanvasElements(patch).find((el) => String(el?.nodeId || "") === id) || null;
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
      Object.assign(els[idx], nodeGraphLayoutCanvasNormalizeRect(els[idx], idx));
    } else {
      els.push({
        nodeId: id,
        enabled: true,
        ...nodeGraphLayoutCanvasNormalizeRect(null, els.length),
      });
    }
  } else if (idx >= 0) {
    els.splice(idx, 1);
  }
  if (options.persist !== false && typeof markNodeGraphPatchDirty === "function") {
    markNodeGraphPatchDirty();
  }
  if (options.refresh !== false && nodeGraphLayoutCanvasMode() !== "off") {
    nodeGraphLayoutCanvasRefreshOpenStage();
  }
  return true;
}

function nodeGraphLayoutCanvasWriteRect(nodeId, rect, options = {}) {
  const id = String(nodeId || "").trim();
  const patch = options.patch || nodeGraphMvp?.patch;
  if (!id || !patch) {
    return false;
  }
  const el = nodeGraphLayoutCanvasElementForNode(id, patch);
  if (!el) {
    return false;
  }
  Object.assign(el, nodeGraphLayoutCanvasNormalizeRect({ ...el, ...rect }, el.z || 0));
  if (options.persist !== false && typeof markNodeGraphPatchDirty === "function") {
    markNodeGraphPatchDirty();
  }
  return true;
}

/** @returns {"off"|"perform"|"edit"} */
function nodeGraphLayoutCanvasMode() {
  const mode = String(nodeGraphMvp?.layoutCanvasMode || "").trim();
  if (mode === "perform" || mode === "edit") {
    return mode;
  }
  if (nodeGraphMvp?.layoutCanvasActive) {
    return "perform";
  }
  return "off";
}

function nodeGraphLayoutCanvasIsActive() {
  return nodeGraphLayoutCanvasMode() !== "off";
}

function nodeGraphLayoutCanvasApplyTileRect(tile, rect, stage) {
  if (!(tile instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
    return;
  }
  const r = nodeGraphLayoutCanvasNormalizeRect(rect);
  const sw = Math.max(1, stage.clientWidth || 1);
  const sh = Math.max(1, stage.clientHeight || 1);
  tile.style.left = `${r.x * sw}px`;
  tile.style.top = `${r.y * sh}px`;
  tile.style.width = `${r.w * sw}px`;
  tile.style.height = `${r.h * sh}px`;
  tile.style.zIndex = String(100 + (r.z || 0));
  tile.dataset.canvasX = String(r.x);
  tile.dataset.canvasY = String(r.y);
  tile.dataset.canvasW = String(r.w);
  tile.dataset.canvasH = String(r.h);
}

function nodeGraphLayoutCanvasClearStageChrome(stage) {
  if (!(stage instanceof HTMLElement)) {
    return;
  }
  stage.classList.remove("node-layout-canvas-stage", "node-layout-canvas-edit");
  stage.querySelectorAll(".node-layout-canvas-tile").forEach((tile) => {
    const face = tile.querySelector(".node-screen-solo-face, .node-layout-canvas-face");
    if (face && tile.parentNode) {
      tile.replaceWith(face);
    } else {
      tile.remove();
    }
  });
}

/**
 * Freeform stage: reparent faces into absolute tiles from persisted rects.
 * Does NOT auto-grid / auto-organize existing pins.
 */
function beginNodeGraphLayoutCanvasStage(nodeIds, mode = "perform") {
  const ids = (Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length || typeof nodeGraphScreenSoloCollectFaces !== "function") {
    return false;
  }
  if (typeof endNodeGraphScreenSolo === "function") {
    endNodeGraphScreenSolo({ silent: true });
  }
  const collected = nodeGraphScreenSoloCollectFaces(ids);
  if (!collected.length) {
    return false;
  }
  const session = typeof nodeGraphScreenSoloSession === "function"
    ? nodeGraphScreenSoloSession()
    : (nodeGraphMvp.screenSolo = nodeGraphMvp.screenSolo || { items: [] });
  const stage = typeof ensureNodeGraphScreenSoloStage === "function"
    ? ensureNodeGraphScreenSoloStage()
    : document.getElementById("nodeScreenSoloStage");
  if (!stage) {
    return false;
  }
  nodeGraphLayoutCanvasClearStageChrome(stage);

  const items = [];
  const patch = nodeGraphMvp?.patch;
  for (let i = 0; i < collected.length; i += 1) {
    const entry = collected[i];
    const parent = entry.face.parentNode;
    if (!parent) {
      continue;
    }
    const savedLayout = typeof nodeGraphScreenSoloCaptureFaceLayout === "function"
      ? nodeGraphScreenSoloCaptureFaceLayout(entry.face)
      : { gridColumn: "", gridRow: "" };
    const nextSibling = entry.face.nextSibling;
    const placeholder = document.createElement("div");
    placeholder.className = "node-screen-solo-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    parent.insertBefore(placeholder, entry.face);
    if (!entry.face.dataset.node) {
      entry.face.dataset.node = entry.id;
    }
    entry.host?.classList.add("node-screen-solo-host");
    entry.face.classList.add("node-screen-solo-face", "node-layout-canvas-face");

    const tile = document.createElement("div");
    tile.className = "node-layout-canvas-tile";
    tile.dataset.node = entry.id;
    tile.append(entry.face);

    const frame = document.createElement("div");
    frame.className = "node-layout-canvas-frame";
    frame.setAttribute("aria-hidden", "true");
    tile.append(frame);

    for (const corner of ["nw", "ne", "sw", "se"]) {
      const grip = document.createElement("div");
      grip.className = `node-layout-canvas-grip node-layout-canvas-grip-${corner}`;
      grip.dataset.corner = corner;
      grip.setAttribute("aria-hidden", "true");
      tile.append(grip);
    }

    const stored = nodeGraphLayoutCanvasElementForNode(entry.id, patch);
    const rect = nodeGraphLayoutCanvasNormalizeRect(stored, i);
    if (stored) {
      Object.assign(stored, rect);
    }

    items.push({
      nodeId: entry.id,
      face: entry.face,
      host: entry.host,
      parent,
      placeholder,
      nextSibling,
      savedLayout,
      sourceWidth: Math.max(1, entry.face.clientWidth || 1),
      sourceHeight: Math.max(1, entry.face.clientHeight || 1),
      tile,
      rect,
    });
  }
  if (!items.length) {
    return false;
  }

  session.items = items.map(({ tile, ...rest }) => rest);
  // Keep tile refs for layout chrome (not in classic solo session shape).
  session.layoutCanvasTiles = items;
  session.nodeId = items[0].nodeId;
  session.face = items[0].face;
  session.host = items[0].host;
  session.parent = items[0].parent;
  session.placeholder = items[0].placeholder;
  session.layoutCanvas = true;
  session.fit = "";
  nodeGraphMvp.screenSoloNodeId = items[0].nodeId;

  document.body.classList.add("node-screen-solo-active", "node-layout-canvas-active");
  stage.hidden = false;
  stage.classList.add("node-layout-canvas-stage");
  stage.classList.toggle("node-layout-canvas-edit", mode === "edit");
  // Freeform — kill CSS grid auto-organize.
  stage.style.display = "block";
  stage.style.removeProperty("--node-screen-solo-cols");
  stage.style.removeProperty("--node-screen-solo-rows");

  for (const item of items) {
    stage.append(item.tile);
    nodeGraphLayoutCanvasApplyTileRect(item.tile, item.rect, stage);
  }

  const keep = new Set(items.map((item) => item.nodeId));
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (keep.has(node.dataset?.node)) {
      continue;
    }
    if (typeof nodeGraphViewportCullSleepPainters === "function") {
      nodeGraphViewportCullSleepPainters(node);
    }
  }
  for (const item of items) {
    if (typeof nodeGraphViewportCullWakePainters === "function" && item.host) {
      nodeGraphViewportCullWakePainters(item.host);
    }
    if (typeof nodeGraphScreenSoloWakeFace === "function") {
      nodeGraphScreenSoloWakeFace(item.face);
    }
  }
  window.requestAnimationFrame(() => {
    if (typeof nodeGraphScreenSoloRefreshPaint === "function") {
      nodeGraphScreenSoloRefreshPaint();
    }
  });
  return true;
}

function nodeGraphLayoutCanvasRefreshOpenStage() {
  const mode = nodeGraphLayoutCanvasMode();
  if (mode === "off") {
    return false;
  }
  return nodeGraphLayoutCanvasOpen(mode, { silent: true });
}

function nodeGraphLayoutCanvasOpen(mode = "perform", options = {}) {
  const next = mode === "edit" ? "edit" : "perform";
  const ids = nodeGraphLayoutCanvasPinnedNodeIds();
  if (!ids.length) {
    nodeGraphMvp.layoutCanvasMode = "off";
    nodeGraphMvp.layoutCanvasActive = false;
    if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        "Canvas is empty. Open Display Settings on a module and enable “Show in canvas”.",
      );
    }
    return false;
  }
  const started = beginNodeGraphLayoutCanvasStage(ids, next);
  if (!started) {
    nodeGraphMvp.layoutCanvasMode = "off";
    nodeGraphMvp.layoutCanvasActive = false;
    if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Pinned modules have no display faces to show on the canvas.");
    }
    return false;
  }
  nodeGraphMvp.layoutCanvasMode = next;
  nodeGraphMvp.layoutCanvasActive = true;
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    stage.setAttribute(
      "aria-label",
      next === "edit"
        ? "Layout canvas edit. Drag tiles to move, corners to resize. F exits edit, F again exits canvas."
        : "Layout canvas. F enters edit mode, F again exits.",
    );
  }
  if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
    const n = ids.length;
    const scope = nodeGraphLayoutCanvasActiveScopeId() ? "metamodule" : "root";
    setNodeInteractionHelp(
      next === "edit"
        ? `Canvas edit (${scope}): move/resize ${n} display${n === 1 ? "" : "s"}. F exits edit.`
        : `Canvas (${scope}): ${n} display${n === 1 ? "" : "s"}. F = edit layout.`,
    );
  }
  if (typeof renderNodeGraphModularViewModeButtons === "function") {
    renderNodeGraphModularViewModeButtons();
  }
  return true;
}

function nodeGraphLayoutCanvasClose(options = {}) {
  nodeGraphMvp.layoutCanvasMode = "off";
  nodeGraphMvp.layoutCanvasActive = false;
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    nodeGraphLayoutCanvasClearStageChrome(stage);
    stage.style.removeProperty("display");
  }
  document.body.classList.remove("node-layout-canvas-active", "node-layout-canvas-edit");
  if (typeof endNodeGraphScreenSolo === "function"
    && typeof nodeGraphScreenSoloIsActive === "function"
    && nodeGraphScreenSoloIsActive()) {
    endNodeGraphScreenSolo({ silent: options.silent === true });
  }
  if (options.silent !== true && typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("Canvas off.");
  }
  if (typeof renderNodeGraphModularViewModeButtons === "function") {
    renderNodeGraphModularViewModeButtons();
  }
  return true;
}

function nodeGraphLayoutCanvasStageIsLive() {
  if (!document.body.classList.contains("node-layout-canvas-active")) {
    return false;
  }
  if (typeof nodeGraphScreenSoloIsActive === "function" && !nodeGraphScreenSoloIsActive()) {
    return false;
  }
  const stage = document.getElementById("nodeScreenSoloStage");
  return Boolean(stage && stage.childElementCount > 0);
}

/**
 * Phone + F cycle: off → perform → edit → off.
 * No auto-organize; freeform rects only.
 */
function toggleNodeGraphLayoutCanvasView(options = {}) {
  let mode = nodeGraphLayoutCanvasMode();
  // Repair desync: mode says canvas is on but stage was torn down (common after
  // heavy face layout thrash / Music Player interaction in canvas). Treat as off
  // so F can re-enter instead of silently no-oping mid-cycle.
  if ((mode === "perform" || mode === "edit") && !nodeGraphLayoutCanvasStageIsLive()) {
    nodeGraphMvp.layoutCanvasMode = "off";
    nodeGraphMvp.layoutCanvasActive = false;
    mode = "off";
  }
  if (mode === "off") {
    return nodeGraphLayoutCanvasOpen("perform", options);
  }
  if (mode === "perform") {
    return nodeGraphLayoutCanvasOpen("edit", options);
  }
  return nodeGraphLayoutCanvasClose(options);
}

function syncNodeGraphLayoutCanvasSettingsControl() {
  const input = document.getElementById("nodeLayoutCanvasShowInCanvas");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const id = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim()
    : String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
  const hasTarget = Boolean(id && typeof nodeGraphPatchNode === "function" && nodeGraphPatchNode(id));
  input.disabled = !hasTarget;
  input.checked = hasTarget && nodeGraphLayoutCanvasIsPinned(id);
  const row = input.closest("label") || input.parentElement;
  if (row) {
    row.hidden = false;
    row.classList.toggle("is-disabled", !hasTarget);
  }
}

function bindNodeGraphLayoutCanvasSettingsControl() {
  const input = document.getElementById("nodeLayoutCanvasShowInCanvas");
  if (!(input instanceof HTMLInputElement) || input.dataset.bound === "true") {
    return;
  }
  input.dataset.bound = "true";
  input.addEventListener("change", () => {
    const id = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim()
      : String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
    if (!id) {
      input.checked = false;
      return;
    }
    nodeGraphLayoutCanvasSetPinned(id, input.checked);
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        input.checked
          ? "Show in canvas on. Press F or 📱 for canvas (F again = edit layout)."
          : "Removed from canvas.",
      );
    }
  });
}

function nodeGraphLayoutCanvasBindTileInteractions(stage) {
  if (!(stage instanceof HTMLElement) || stage.dataset.canvasInteractBound === "true") {
    return;
  }
  stage.dataset.canvasInteractBound = "true";

  let drag = null;

  const onMove = (event) => {
    if (!drag || nodeGraphLayoutCanvasMode() !== "edit") {
      return;
    }
    const sw = Math.max(1, stage.clientWidth || 1);
    const sh = Math.max(1, stage.clientHeight || 1);
    const dx = (event.clientX - drag.startX) / sw;
    const dy = (event.clientY - drag.startY) / sh;
    let { x, y, w, h } = drag.origin;
    if (drag.kind === "move") {
      x += dx;
      y += dy;
    } else if (drag.kind === "resize") {
      const c = drag.corner;
      if (c.includes("e")) {
        w += dx;
      }
      if (c.includes("s")) {
        h += dy;
      }
      if (c.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (c.includes("n")) {
        y += dy;
        h -= dy;
      }
    }
    const rect = nodeGraphLayoutCanvasNormalizeRect({ x, y, w, h, z: drag.origin.z }, drag.origin.z);
    nodeGraphLayoutCanvasApplyTileRect(drag.tile, rect, stage);
    drag.live = rect;
  };

  const onUp = () => {
    if (!drag) {
      return;
    }
    if (drag.live) {
      nodeGraphLayoutCanvasWriteRect(drag.nodeId, drag.live);
    }
    drag.tile.classList.remove("is-dragging");
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  stage.addEventListener("pointerdown", (event) => {
    if (nodeGraphLayoutCanvasMode() !== "edit") {
      return;
    }
    const grip = event.target?.closest?.(".node-layout-canvas-grip");
    const frame = event.target?.closest?.(".node-layout-canvas-frame");
    const tile = event.target?.closest?.(".node-layout-canvas-tile");
    if (!tile || (!grip && !frame)) {
      return;
    }
    // Don't steal clicks from the live face widgets.
    if (event.target?.closest?.(".node-layout-canvas-face") && !grip && !frame) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nodeId = String(tile.dataset.node || "");
    const origin = nodeGraphLayoutCanvasNormalizeRect({
      x: tile.dataset.canvasX,
      y: tile.dataset.canvasY,
      w: tile.dataset.canvasW,
      h: tile.dataset.canvasH,
      z: tile.style.zIndex,
    });
    drag = {
      tile,
      nodeId,
      kind: grip ? "resize" : "move",
      corner: grip?.dataset?.corner || "",
      startX: event.clientX,
      startY: event.clientY,
      origin,
      live: null,
    };
    tile.classList.add("is-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  window.addEventListener("resize", () => {
    if (nodeGraphLayoutCanvasMode() === "off") {
      return;
    }
    const tiles = stage.querySelectorAll(".node-layout-canvas-tile");
    tiles.forEach((tile) => {
      const nodeId = String(tile.dataset.node || "");
      const el = nodeGraphLayoutCanvasElementForNode(nodeId);
      nodeGraphLayoutCanvasApplyTileRect(tile, el || {
        x: tile.dataset.canvasX,
        y: tile.dataset.canvasY,
        w: tile.dataset.canvasW,
        h: tile.dataset.canvasH,
      }, stage);
    });
  });
}

function bindNodeGraphLayoutCanvasSettingsControl() {
  const input = document.getElementById("nodeLayoutCanvasShowInCanvas");
  if (!(input instanceof HTMLInputElement) || input.dataset.bound === "true") {
    return;
  }
  input.dataset.bound = "true";
  input.addEventListener("change", () => {
    const id = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim()
      : String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
    if (!id) {
      input.checked = false;
      return;
    }
    nodeGraphLayoutCanvasSetPinned(id, input.checked);
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        input.checked
          ? "Show in canvas on. F = canvas, F again = edit layout, F again = exit."
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
  document.addEventListener("nodegraph-selection-changed", () => {
    syncNodeGraphLayoutCanvasSettingsControl();
  });
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    const obs = new MutationObserver(() => {
      if (!popover.hidden) {
        bindNodeGraphLayoutCanvasSettingsControl();
        syncNodeGraphLayoutCanvasSettingsControl();
      }
    });
    obs.observe(popover, { attributes: true, attributeFilter: ["hidden"] });
  }
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    nodeGraphLayoutCanvasBindTileInteractions(stage);
  }
}
