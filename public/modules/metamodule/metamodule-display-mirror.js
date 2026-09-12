// Metamodule shell display — F-inside-meta pins selected child faces onto the
// parent Meta face as a cell grid (like layout canvas / screen-solo cells).
// Patch SSOT: metamodule.displays[{ childId, enabled, order }].

const NODE_GRAPH_METAMODULE_MIRROR_RAF = new Map(); // metaId → raf id

function nodeGraphMetamoduleMirroredChildIdSet(patch = nodeGraphMvp?.patch) {
  const out = new Set();
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  for (const node of nodes) {
    if (!nodeGraphIsContainerShellType?.(node?.type)) continue;
    const payload = typeof nodeGraphEnsureMetamodulePayload === "function"
      ? nodeGraphEnsureMetamodulePayload(node)
      : node?.metamodule;
    for (const entry of payload?.displays || []) {
      if (entry?.enabled && entry.childId) {
        out.add(String(entry.childId));
      }
    }
  }
  return out;
}

function nodeGraphMetamoduleChildIsMirrorSubscribed(nodeId, patch = nodeGraphMvp?.patch) {
  const id = String(nodeId || "");
  if (!id) return false;
  return nodeGraphMetamoduleMirroredChildIdSet(patch).has(id);
}

/** Resolve a live face canvas for a module (works even when article.hidden). */
function nodeGraphResolveModuleFaceCanvas(nodeId) {
  const id = String(nodeId || "");
  if (!id) return null;

  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined"
    && nodeGraphModuleScopePersistentCanvases instanceof Map
    && nodeGraphModuleScopePersistentCanvases.has(id)) {
    const cached = nodeGraphModuleScopePersistentCanvases.get(id);
    if (cached && cached.width > 0 && cached.height > 0) return cached;
  }

  const slot = typeof nodeGraphModuleScopeState !== "undefined"
    ? nodeGraphModuleScopeState?.slots?.get?.(id)
    : null;
  if (slot && typeof peekNodeGraphModuleScopeFaceCanvas === "function") {
    const peeked = peekNodeGraphModuleScopeFaceCanvas(slot);
    if (peeked && peeked.width > 0 && peeked.height > 0) return peeked;
  }
  if (slot && typeof ensureNodeGraphModuleScopeFaceCanvas === "function") {
    // Ensure mounts into the (possibly hidden) scope window so paint can run.
    const ensured = ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "peek" })
      || ensureNodeGraphModuleScopeFaceCanvas(slot, { mode: "auto" });
    if (ensured && ensured.width > 0 && ensured.height > 0) return ensured;
  }

  const host = typeof document !== "undefined"
    ? document.querySelector(`.dsp-node[data-node="${CSS.escape(id)}"]`)
    : null;
  if (!host) return null;
  const canvas = host.querySelector(
    "canvas.node-module-scope-local-fallback-canvas, "
    + "canvas.node-custom-display-canvas, "
    + ".node-module-face > canvas, "
    + ".node-solid-module-custom-ui canvas, "
    + ".node-asciiscope-face canvas, "
    + ".node-xy-pad canvas, "
    + ".node-fbm-field-face canvas, "
    + ".node-keypad-face canvas, "
    + ".node-led-face canvas, "
    + ".node-number-readout-face canvas, "
    + ".node-value-lcd-face canvas, "
    + ".node-raster-rgb-face canvas",
  );
  if (canvas && canvas.width > 0 && canvas.height > 0
    && !canvas.classList.contains("node-metamodule-mirror-canvas")) {
    return canvas;
  }
  return null;
}

function nodeGraphMetamoduleEnabledDisplayEntries(metaNode) {
  const payload = typeof nodeGraphEnsureMetamodulePayload === "function"
    ? nodeGraphEnsureMetamodulePayload(metaNode)
    : metaNode?.metamodule;
  const list = Array.isArray(payload?.displays) ? payload.displays : [];
  return list
    .filter((entry) => entry && entry.enabled && entry.childId)
    .slice()
    .sort((a, b) => (nodeGraphFiniteNumber(a.order)) - (nodeGraphFiniteNumber(b.order)));
}

/**
 * Toggle enabled display layers for child ids on a metamodule.
 * Returns { changed, enabledIds }.
 */
function nodeGraphMetamoduleToggleDisplays(metaId, childIds, patch = nodeGraphMvp?.patch) {
  const id = String(metaId || "");
  const kids = (Array.isArray(childIds) ? childIds : [childIds])
    .map((c) => String(c || ""))
    .filter(Boolean);
  if (!id || !kids.length || !patch?.nodes) {
    return { changed: 0, enabledIds: [] };
  }
  const meta = patch.nodes.find((n) => n?.id === id);
  if (!nodeGraphIsContainerShellType?.(meta?.type)) {
    return { changed: 0, enabledIds: [] };
  }
  const payload = nodeGraphEnsureMetamodulePayload(meta);
  if (!Array.isArray(payload.displays)) payload.displays = [];

  let maxOrder = -1;
  for (const entry of payload.displays) {
    maxOrder = Math.max(maxOrder, nodeGraphFiniteNumber(entry?.order));
  }

  let changed = 0;
  for (const childId of kids) {
    const owned = patch.nodes.find((n) => n?.id === childId);
    if (!owned || String(owned.ownerMetamoduleId || "") !== id) continue;

    let entry = payload.displays.find((e) => e && String(e.childId) === childId);
    if (!entry) {
      maxOrder += 1;
      entry = { childId, enabled: false, order: maxOrder };
      payload.displays.push(entry);
    }
    entry.enabled = !entry.enabled;
    if (entry.enabled) {
      maxOrder += 1;
      entry.order = maxOrder;
    }
    changed += 1;
  }

  const enabledIds = nodeGraphMetamoduleEnabledDisplayEntries(meta).map((e) => String(e.childId));
  return { changed, enabledIds };
}

function nodeGraphMetamoduleEnsureMirrorCanvas(face) {
  if (!face) return null;
  let canvas = face.querySelector(":scope > .node-metamodule-mirror-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-metamodule-mirror-canvas";
    canvas.setAttribute("aria-hidden", "true");
    face.appendChild(canvas);
  }
  return canvas;
}

function nodeGraphMetamoduleStopMirrorLoop(metaId) {
  const id = String(metaId || "");
  const raf = NODE_GRAPH_METAMODULE_MIRROR_RAF.get(id);
  if (raf) {
    cancelAnimationFrame(raf);
    NODE_GRAPH_METAMODULE_MIRROR_RAF.delete(id);
  }
}

function nodeGraphMetamoduleStopAllMirrorLoops() {
  for (const id of [...NODE_GRAPH_METAMODULE_MIRROR_RAF.keys()]) {
    nodeGraphMetamoduleStopMirrorLoop(id);
  }
}

function nodeGraphMetamodulePaintMirror(metaId) {
  const id = String(metaId || "");
  const face = typeof document !== "undefined"
    ? document.querySelector(`.node-metamodule-face[data-node="${CSS.escape(id)}"]`)
    : null;
  if (!face) {
    nodeGraphMetamoduleStopMirrorLoop(id);
    return false;
  }
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  const enabled = nodeGraphMetamoduleEnabledDisplayEntries(meta);
  const empty = face.querySelector(".node-metamodule-face-empty");
  const canvas = nodeGraphMetamoduleEnsureMirrorCanvas(face);

  if (!enabled.length) {
    if (canvas) canvas.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Double-click to enter";
    }
    nodeGraphMetamoduleStopMirrorLoop(id);
    return false;
  }
  // Display stack active — never show the enter hint over the mirror.
  if (empty) {
    empty.hidden = true;
    empty.textContent = "";
  }
  if (canvas) canvas.hidden = false;

  if (!canvas) return false;

  // Wake pinned children so their face canvases keep painting while hidden on Root
  // (same idea as layout-canvas / screen-solo cells).
  for (const entry of enabled) {
    const childId = String(entry.childId || "");
    if (!childId) continue;
    const host = document.querySelector(`.dsp-node[data-node="${CSS.escape(childId)}"]`);
    if (host && typeof nodeGraphViewportCullWakePainters === "function") {
      try { nodeGraphViewportCullWakePainters(host); } catch (_e) { /* ignore */ }
    }
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    try { scheduleNodeGraphModuleScopeDraw(); } catch (_e) { /* ignore */ }
  }

  // Layout CSS size (client/offset) — NOT getBoundingClientRect.
  let cssW = Number(face.clientWidth || face.offsetWidth || 0);
  let cssH = Number(face.clientHeight || face.offsetHeight || 0);
  if (!(cssW > 0) || !(cssH > 0)) {
    const host = face.closest?.(".dsp-node") || face;
    try {
      const style = getComputedStyle(host);
      const gridPx = Number.parseFloat(
        style.getPropertyValue("--node-grid-height")
        || style.getPropertyValue("--node-grid-size")
        || "",
      ) || 28;
      if (!(cssH > 0)) {
        const displayGu = Number.parseFloat(
          style.getPropertyValue("--node-module-display-height-units") || "",
        );
        if (Number.isFinite(displayGu) && displayGu > 0) {
          cssH = displayGu * gridPx;
        }
      }
      if (!(cssW > 0)) {
        const widthGu = Number.parseFloat(
          style.getPropertyValue("--node-grid-width-units") || "",
        );
        const gw = Number.parseFloat(
          style.getPropertyValue("--node-grid-width")
          || style.getPropertyValue("--node-grid-size")
          || "",
        ) || gridPx;
        const inset = Number.parseFloat(
          style.getPropertyValue("--node-module-grid-inset") || "",
        ) || 0;
        if (Number.isFinite(widthGu) && widthGu > 0) {
          cssW = Math.max(1, widthGu * gw - inset * 2);
        }
      }
    } catch (_error) {
      // Best-effort fallbacks only.
    }
  }
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  const cssWSafe = Math.max(1, Math.round(cssW || 1));
  const cssHSafe = Math.max(1, Math.round(cssH || 1));
  const bufW = Math.max(1, Math.round(cssWSafe * dpr));
  const bufH = Math.max(1, Math.round(cssHSafe * dpr));
  if (canvas.width !== bufW) canvas.width = bufW;
  if (canvas.height !== bufH) canvas.height = bufH;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, bufW, bufH);

  // Cell grid like screen-solo / layout canvas — one placed display per cell.
  const n = enabled.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = bufW / cols;
  const cellH = bufH / rows;
  let drawn = 0;
  for (let i = 0; i < n; i += 1) {
    const entry = enabled[i];
    const source = nodeGraphResolveModuleFaceCanvas(entry.childId);
    if (!source) continue;
    const srcW = Number(source.videoWidth || source.naturalWidth || source.width) || 0;
    const srcH = Number(source.videoHeight || source.naturalHeight || source.height) || 0;
    if (!(srcW > 0) || !(srcH > 0)) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = col * cellW;
    const cy = row * cellH;
    const scale = Math.min(cellW / srcW, cellH / srcH);
    const dw = Math.max(1, Math.round(srcW * scale));
    const dh = Math.max(1, Math.round(srcH * scale));
    const dx = Math.floor(cx + (cellW - dw) * 0.5);
    const dy = Math.floor(cy + (cellH - dh) * 0.5);
    try {
      ctx.drawImage(source, 0, 0, srcW, srcH, dx, dy, dw, dh);
      drawn += 1;
    } catch (_err) {
      // Detached / tainted source — skip cell.
    }
  }
  return drawn > 0 || n > 0;
}

function nodeGraphMetamoduleArmMirrorLoop(metaId) {
  const id = String(metaId || "");
  if (!id || NODE_GRAPH_METAMODULE_MIRROR_RAF.has(id)) return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof scopePaintIsDrawingLive === "function" && !scopePaintIsDrawingLive()) return;

  const tick = () => {
    NODE_GRAPH_METAMODULE_MIRROR_RAF.delete(id);
    if (typeof document !== "undefined" && document.hidden) return;
    if (typeof scopePaintIsDrawingLive === "function" && !scopePaintIsDrawingLive()) return;
    const should = typeof nodeGraphSimFpsShouldPaint === "function"
      ? nodeGraphSimFpsShouldPaint(`meta-mirror:${id}`, false)
      : true;
    if (should) {
      const ok = nodeGraphMetamodulePaintMirror(id);
      if (!ok) return;
    } else {
      // Still check enabled — stop if cleared.
      const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
      if (!nodeGraphMetamoduleEnabledDisplayEntries(meta).length) return;
    }
    if (!NODE_GRAPH_METAMODULE_MIRROR_RAF.has(id)) {
      const next = requestAnimationFrame(tick);
      NODE_GRAPH_METAMODULE_MIRROR_RAF.set(id, next);
    }
  };
  const raf = requestAnimationFrame(tick);
  NODE_GRAPH_METAMODULE_MIRROR_RAF.set(id, raf);
}

function nodeGraphMetamoduleRefreshAllMirrors() {
  if (typeof document !== "undefined" && document.hidden) {
    nodeGraphMetamoduleStopAllMirrorLoops();
    return;
  }
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  for (const node of nodes) {
    if (!nodeGraphIsContainerShellType?.(node?.type)) continue;
    const enabled = nodeGraphMetamoduleEnabledDisplayEntries(node);
    if (enabled.length) {
      nodeGraphMetamodulePaintMirror(node.id);
      nodeGraphMetamoduleArmMirrorLoop(node.id);
    } else {
      nodeGraphMetamoduleStopMirrorLoop(node.id);
      nodeGraphMetamodulePaintMirror(node.id);
    }
  }
}

/**
 * Inside-meta F: toggle selected owned children onto the parent meta display stack.
 * Returns true when handled.
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
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Select modules inside this Metamodule, then press F to pin their displays.");
    }
    return true; // handled (inside meta) — do not fall through to fullscreen
  }

  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : nodeGraphMvp.patch;
  const result = nodeGraphMetamoduleToggleDisplays(viewId, childIds, patch);
  if (!result.changed) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("No display layers toggled.");
    }
    return true;
  }
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      status: result.enabledIds.length
        ? `Metamodule display: ${result.enabledIds.length} layer(s)`
        : "Metamodule display cleared",
      topologyEdit: true,
    });
  } else {
    nodeGraphMvp.patch = patch;
  }
  nodeGraphMetamodulePaintMirror(viewId);
  if (result.enabledIds.length) {
    nodeGraphMetamoduleArmMirrorLoop(viewId);
  }
  // Wake paint for newly mirrored children (may be about to hide on exit).
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      result.enabledIds.length
        ? `Pinned ${result.enabledIds.length} display(s) on Metamodule. F again on a selection toggles.`
        : "Metamodule display stack empty.",
    );
  }
  return true;
}
