// Metamodule face canvas — the layout-canvas arrangement, live on the shell.
//
// SSOT: patch.view.canvases.byMetamodule[metaId] (same pins / x y w h as F canvas).
// Root view: reparent pinned child faces onto the Meta face (so Hypersaw etc. have
// a real layout box — hidden interior articles are display:none / 0×0).
// Inside Meta or fullscreen F: faces stay on their modules / the F stage.
//
// Legacy metamodule.displays[{ childId, enabled, order }] is migrated once into
// the canvas bucket, then cleared.

const NODE_GRAPH_METAMODULE_CANVAS_SESSIONS = new Map(); // metaId → { items, stage, ro }

// Child-module faces on the Meta plate are not release-ready. Keep the
// "Double-click to enter" empty face until that feature is turned back on.
const NODE_GRAPH_METAMODULE_FACE_CHILD_DISPLAYS = false;

function nodeGraphMetamoduleCanvasPinnedElements(metaId, patch = nodeGraphMvp?.patch) {
  const id = String(metaId || "");
  if (!id) return [];
  if (typeof nodeGraphLayoutCanvasPinnedElementsForScope === "function") {
    return nodeGraphLayoutCanvasPinnedElementsForScope(id, patch);
  }
  return [];
}

function nodeGraphMetamoduleMirroredChildIdSet(patch = nodeGraphMvp?.patch) {
  const out = new Set();
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  for (const node of nodes) {
    if (!nodeGraphIsContainerShellType?.(node?.type)) continue;
    for (const el of nodeGraphMetamoduleCanvasPinnedElements(node.id, patch)) {
      const childId = String(el?.nodeId || "");
      if (childId) out.add(childId);
    }
  }
  return out;
}

function nodeGraphMetamoduleChildIsMirrorSubscribed(nodeId, patch = nodeGraphMvp?.patch) {
  const id = String(nodeId || "");
  if (!id) return false;
  return nodeGraphMetamoduleMirroredChildIdSet(patch).has(id);
}

/** Compat shape for older call sites: canvas pins as { childId, enabled, order }. */
function nodeGraphMetamoduleEnabledDisplayEntries(metaNode) {
  const id = String(metaNode?.id || "");
  return nodeGraphMetamoduleCanvasPinnedElements(id).map((el, index) => ({
    childId: String(el.nodeId || ""),
    enabled: true,
    order: Number.isFinite(Number(el.z)) ? Number(el.z) : index,
  }));
}

function nodeGraphMetamoduleMigrateDisplaysToCanvas(metaNode, patch = nodeGraphMvp?.patch) {
  if (!metaNode || !nodeGraphIsContainerShellType?.(metaNode.type)) return 0;
  const payload = typeof nodeGraphEnsureMetamodulePayload === "function"
    ? nodeGraphEnsureMetamodulePayload(metaNode)
    : metaNode.metamodule;
  const displays = Array.isArray(payload?.displays) ? payload.displays : [];
  const enabled = displays.filter((entry) => entry && entry.enabled && entry.childId);
  if (!enabled.length) return 0;
  if (typeof nodeGraphLayoutCanvasEnsureView !== "function"
    || typeof nodeGraphLayoutCanvasNormalizeRect !== "function") {
    return 0;
  }
  const canvases = nodeGraphLayoutCanvasEnsureView(patch);
  if (!canvases) return 0;
  const metaId = String(metaNode.id || "");
  if (!canvases.byMetamodule[metaId] || typeof canvases.byMetamodule[metaId] !== "object") {
    canvases.byMetamodule[metaId] = { elements: [] };
  }
  const bucket = canvases.byMetamodule[metaId];
  if (!Array.isArray(bucket.elements)) bucket.elements = [];
  const have = new Set(bucket.elements.map((el) => String(el?.nodeId || "")));
  const n = enabled.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  let added = 0;
  for (let i = 0; i < n; i += 1) {
    const childId = String(enabled[i].childId || "");
    if (!childId || have.has(childId)) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    bucket.elements.push({
      nodeId: childId,
      enabled: true,
      ...nodeGraphLayoutCanvasNormalizeRect({
        x: col / cols,
        y: row / rows,
        w: 1 / cols,
        h: 1 / rows,
        z: i,
      }, i),
    });
    have.add(childId);
    added += 1;
  }
  payload.displays = [];
  return added;
}

function nodeGraphMetamoduleEnsureMirrorCanvas(face) {
  if (!face) return null;
  return face.querySelector(":scope > .node-metamodule-mirror-canvas");
}

function nodeGraphMetamoduleCanvasStageEl(face) {
  if (!face) return null;
  let stage = face.querySelector(":scope > .node-metamodule-canvas-stage");
  if (!stage) {
    stage = document.createElement("div");
    stage.className = "node-metamodule-canvas-stage";
    stage.hidden = true;
    face.appendChild(stage);
  }
  return stage;
}

function nodeGraphMetamoduleRestoreCanvasSession(metaId) {
  const id = String(metaId || "");
  const session = NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.get(id);
  if (!session) return;
  if (session.ro) {
    try { session.ro.disconnect(); } catch (_e) { /* ignore */ }
  }
  for (const item of session.items || []) {
    item.face?.classList.remove("node-layout-canvas-face", "node-metamodule-canvas-face");
    if (typeof nodeGraphScreenSoloRestoreItem === "function") {
      nodeGraphScreenSoloRestoreItem(item);
    }
    item.tile?.remove();
  }
  NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.delete(id);
}

function nodeGraphMetamoduleRestoreCanvasSessionsForNodes(nodeIds) {
  const want = new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "")));
  if (!want.size) return;
  for (const metaId of [...NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.keys()]) {
    const session = NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.get(metaId);
    const hit = (session?.items || []).some((item) => want.has(String(item.nodeId || "")));
    if (hit) nodeGraphMetamoduleRestoreCanvasSession(metaId);
  }
}

function nodeGraphMetamoduleShouldPresentOnFace(metaId) {
  if (!NODE_GRAPH_METAMODULE_FACE_CHILD_DISPLAYS) return false;
  const id = String(metaId || "");
  if (!id) return false;
  if (typeof nodeGraphMetamoduleViewId === "function" && nodeGraphMetamoduleViewId() === id) {
    return false;
  }
  if (
    typeof nodeGraphLayoutCanvasIsActive === "function"
    && nodeGraphLayoutCanvasIsActive()
    && typeof nodeGraphLayoutCanvasActiveScopeId === "function"
    && nodeGraphLayoutCanvasActiveScopeId() === id
  ) {
    return false;
  }
  return true;
}

function nodeGraphMetamoduleRelayoutCanvasSession(metaId) {
  const session = NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.get(String(metaId || ""));
  if (!session?.stage || !session.items?.length) return;
  const elements = nodeGraphMetamoduleCanvasPinnedElements(metaId);
  for (const item of session.items) {
    const el = elements.find((entry) => String(entry.nodeId) === String(item.nodeId));
    if (typeof nodeGraphLayoutCanvasApplyTileRect === "function") {
      nodeGraphLayoutCanvasApplyTileRect(item.tile, el || item.rect, session.stage);
    }
  }
}

function nodeGraphMetamoduleBuildFaceTile(entry, collected, index, stage) {
  const found = collected.find((c) => String(c.id) === String(entry.nodeId));
  if (!found?.face?.parentNode) return null;
  const parent = found.face.parentNode;
  const savedLayout = typeof nodeGraphScreenSoloCaptureFaceLayout === "function"
    ? nodeGraphScreenSoloCaptureFaceLayout(found.face)
    : { gridColumn: "", gridRow: "" };
  const nextSibling = found.face.nextSibling;
  const placeholder = document.createElement("div");
  placeholder.className = "node-screen-solo-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  parent.insertBefore(placeholder, found.face);
  if (!found.face.dataset.node) found.face.dataset.node = found.id;
  found.host?.classList.add("node-screen-solo-host");
  found.face.classList.add("node-screen-solo-face", "node-layout-canvas-face", "node-metamodule-canvas-face");

  const tile = document.createElement("div");
  tile.className = "node-layout-canvas-tile";
  tile.dataset.node = found.id;
  tile.append(found.face);

  const rect = typeof nodeGraphLayoutCanvasNormalizeRect === "function"
    ? nodeGraphLayoutCanvasNormalizeRect(entry, index)
    : { x: 0, y: 0, w: 1, h: 1, z: index };
  if (typeof nodeGraphLayoutCanvasApplyTileRect === "function") {
    nodeGraphLayoutCanvasApplyTileRect(tile, rect, stage);
  }
  stage.append(tile);
  return {
    nodeId: found.id,
    face: found.face,
    host: found.host,
    parent,
    placeholder,
    nextSibling,
    savedLayout,
    tile,
    rect,
  };
}

function nodeGraphMetamoduleWakePresentedItem(item) {
  if (typeof nodeGraphScreenSoloWakeFace === "function") {
    nodeGraphScreenSoloWakeFace(item.face);
  }
  const slot = typeof nodeGraphModuleScopeState !== "undefined"
    ? nodeGraphModuleScopeState?.slots?.get?.(item.nodeId)
    : null;
  if (slot && typeof invalidateNodeGraphModuleScopeFaceLayout === "function") {
    invalidateNodeGraphModuleScopeFaceLayout(slot);
  }
}

function nodeGraphMetamodulePresentCanvasOnFace(metaId) {
  const id = String(metaId || "");
  const face = typeof document !== "undefined"
    ? document.querySelector(`.node-metamodule-face[data-node="${CSS.escape(id)}"]`)
    : null;
  if (!face) {
    nodeGraphMetamoduleRestoreCanvasSession(id);
    return false;
  }
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  nodeGraphMetamoduleMigrateDisplaysToCanvas(meta);
  const elements = nodeGraphMetamoduleCanvasPinnedElements(id);
  const empty = face.querySelector(".node-metamodule-face-empty");
  const blit = nodeGraphMetamoduleEnsureMirrorCanvas(face);
  const stage = nodeGraphMetamoduleCanvasStageEl(face);

  if (!elements.length || !nodeGraphMetamoduleShouldPresentOnFace(id)) {
    nodeGraphMetamoduleRestoreCanvasSession(id);
    if (stage) stage.hidden = true;
    if (blit) blit.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Double-click to enter";
    }
    return false;
  }

  if (empty) {
    empty.hidden = true;
    empty.textContent = "";
  }
  if (blit) blit.hidden = true;
  if (stage) stage.hidden = false;

  const ids = elements.map((el) => String(el.nodeId));
  const prev = NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.get(id);
  const prevKey = (prev?.items || []).map((item) => item.nodeId).join(",");
  const nextKey = ids.join(",");
  if (
    prev
    && prevKey === nextKey
    && prev.stage?.isConnected
    && (prev.items || []).every((item) => item.face?.isConnected && item.tile?.isConnected)
  ) {
    nodeGraphMetamoduleRelayoutCanvasSession(id);
    for (const item of prev.items || []) nodeGraphMetamoduleWakePresentedItem(item);
    return true;
  }

  nodeGraphMetamoduleRestoreCanvasSession(id);
  const collected = typeof nodeGraphScreenSoloCollectFaces === "function"
    ? nodeGraphScreenSoloCollectFaces(ids)
    : [];
  if (!collected.length) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Double-click to enter";
    }
    return false;
  }

  const items = [];
  for (let i = 0; i < elements.length; i += 1) {
    const item = nodeGraphMetamoduleBuildFaceTile(elements[i], collected, i, stage);
    if (item) items.push(item);
  }
  if (!items.length) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Double-click to enter";
    }
    return false;
  }

  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => nodeGraphMetamoduleRelayoutCanvasSession(id));
    try { ro.observe(stage); } catch (_e) { ro = null; }
  }
  NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.set(id, { items, stage, ro });
  for (const item of items) nodeGraphMetamoduleWakePresentedItem(item);
  if (typeof installNodeGraphMidiKeyboardLayoutResizeObserver === "function") {
    installNodeGraphMidiKeyboardLayoutResizeObserver();
  }
  if (typeof applyNodeGraphMidiKeyboardLayout === "function") {
    applyNodeGraphMidiKeyboardLayout();
  }
  if (typeof renderNodeGraphMidiKeyboardKeys === "function") {
    renderNodeGraphMidiKeyboardKeys();
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  return true;
}

function nodeGraphMetamoduleStopMirrorLoop(metaId) {
  nodeGraphMetamoduleRestoreCanvasSession(metaId);
}

function nodeGraphMetamoduleStopAllMirrorLoops() {
  for (const id of [...NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.keys()]) {
    nodeGraphMetamoduleRestoreCanvasSession(id);
  }
}

function nodeGraphMetamodulePaintMirror(metaId) {
  return nodeGraphMetamodulePresentCanvasOnFace(metaId);
}

function nodeGraphMetamoduleArmMirrorLoop(metaId) {
  nodeGraphMetamodulePresentCanvasOnFace(metaId);
}

function nodeGraphMetamoduleRefreshAllMirrors() {
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  const live = new Set();
  for (const node of nodes) {
    if (!nodeGraphIsContainerShellType?.(node?.type)) continue;
    nodeGraphMetamoduleMigrateDisplaysToCanvas(node);
    live.add(String(node.id || ""));
    nodeGraphMetamodulePresentCanvasOnFace(node.id);
  }
  for (const id of [...NODE_GRAPH_METAMODULE_CANVAS_SESSIONS.keys()]) {
    if (!live.has(id)) nodeGraphMetamoduleRestoreCanvasSession(id);
  }
}

/**
 * Inside-meta F with a child selection: toggle Show in canvas for those children.
 * No selection: return false so F runs the normal canvas cycle (perform / edit / off).
 */
function nodeGraphMetamoduleToggleDisplaysForSelection() {
  const viewId = typeof nodeGraphMetamoduleViewId === "function"
    ? nodeGraphMetamoduleViewId()
    : "";
  if (!viewId) return false;

  const selectedRaw = typeof nodeGraphSelectedNodeIds === "function"
    ? nodeGraphSelectedNodeIds()
    : (nodeGraphMvp?.selectedNodeIds || []);
  const selected = selectedRaw instanceof Set
    ? [...selectedRaw]
    : (Array.isArray(selectedRaw) ? selectedRaw : []);
  const childIds = selected
    .map((id) => String(id || ""))
    .filter((id) => {
      if (!id || id === viewId) return false;
      const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
      return node && String(node.ownerMetamoduleId || "") === viewId;
    });
  if (!childIds.length) {
    return false;
  }

  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : nodeGraphMvp.patch;
  const meta = patch?.nodes?.find((n) => n?.id === viewId);
  nodeGraphMetamoduleMigrateDisplaysToCanvas(meta, patch);

  let enabledCount = 0;
  for (const childId of childIds) {
    const on = typeof nodeGraphLayoutCanvasIsPinnedInScope === "function"
      ? nodeGraphLayoutCanvasIsPinnedInScope(childId, viewId, patch)
      : false;
    if (typeof nodeGraphLayoutCanvasSetPinned === "function") {
      nodeGraphLayoutCanvasSetPinned(childId, !on, {
        patch,
        scopeId: viewId,
        persist: false,
        refresh: false,
      });
    }
  }
  if (typeof nodeGraphLayoutCanvasPinnedElementsForScope === "function") {
    enabledCount = nodeGraphLayoutCanvasPinnedElementsForScope(viewId, patch).length;
  }
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      status: enabledCount
        ? `Canvas: ${enabledCount} display(s) on Metamodule`
        : "Metamodule canvas cleared",
      topologyEdit: false,
    });
  } else {
    nodeGraphMvp.patch = patch;
  }
  nodeGraphMetamoduleRefreshAllMirrors();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      enabledCount
        ? `Pinned ${enabledCount} display(s) on the Metamodule canvas. F with no selection opens canvas edit.`
        : "Metamodule canvas empty.",
    );
  }
  return true;
}
