function nodeGraphNodeIsKeypad(nodeOrId) {
  const node = typeof nodeOrId === "string"
    ? (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeOrId) : null)
    : nodeOrId;
  return node?.type === "keypad";
}

function openNodeKeypadDisplaySettings(event, nodeElement = null) {
  const type = String(event?.type || "");
  const fromDisplayGear = Boolean(
    event?.currentTarget?.classList?.contains("node-display-settings-button"),
  );
  // Right-click (and the display-gear button) own Command Center / Display
  // Settings. A left click on the pad must only play a key.
  if (type && type !== "contextmenu" && !fromDisplayGear) {
    return false;
  }
  const nodeEl = nodeElement
    || event?.currentTarget?.closest?.(".dsp-node")
    || event?.target?.closest?.(".dsp-node");
  const nodeId = String(nodeEl?.dataset?.node || "").trim();
  if (!nodeGraphNodeIsKeypad(nodeId)) {
    return false;
  }
  if (typeof openNodeGraphTraceDisplaySettings !== "function") {
    return false;
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return openNodeGraphTraceDisplaySettings(nodeId, event);
}

function nodeGraphKeypadFaceFor(nodeId) {
  return document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId || ""))}"] .node-keypad-face`);
}

function nodeGraphKeypadApplyLayout(face, layout) {
  if (!face) return;
  const next = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout(layout)
    : layout || {};
  face.style.setProperty("--node-keypad-background-color", next.backgroundColor || "#f4f3f0");
  face.style.setProperty("--node-keypad-button-color", next.buttonColor || "#f3f1ec");
  face.style.setProperty("--node-keypad-hover-color", next.hoverColor || "#ddd9d2");
  face.style.setProperty("--node-keypad-down-color", next.downColor || "#c4bdb3");
  face.style.setProperty("--node-keypad-text-color", next.textColor || "#2d2d2d");
  face.style.setProperty("--node-keypad-stroke-color", next.strokeColor || next.textColor || "#2d2d2d");
  face.style.setProperty("--node-keypad-button-width", String(next.buttonWidth ?? 0.94));
  face.style.setProperty("--node-keypad-button-height", String(next.buttonHeight ?? 0.94));
  face.style.setProperty("--node-keypad-button-size", String(next.buttonSize ?? 1));
  face.style.setProperty(
    "--node-keypad-font",
    typeof nodeGraphKeypadFontFamily === "function"
      ? nodeGraphKeypadFontFamily(next.font)
      : (next.fontFamily || "\"Poiret One\", sans-serif"),
  );
  face.style.setProperty("--node-keypad-text-size", String(next.textSize ?? 0.55));
  face.style.setProperty("--node-keypad-text-weight", String(next.textWeight ?? 400));
  face.style.setProperty("--node-keypad-rounding", String(next.rounding ?? 50));
  face.style.setProperty(
    "--node-keypad-corner-shape",
    next.cornerShape === "pill" ? "round" : "squircle",
  );
  face.dataset.keypadStroke = String(next.stroke ?? 0);
  face.dataset.keypadRounding = String(next.rounding ?? 50);
  const images = Array.isArray(next.keyImages) ? next.keyImages : [];
  for (const key of face.querySelectorAll(".node-keypad-key")) {
    const slot = Number(key.dataset.slot);
    const src = images[slot]?.dataUrl || "";
    key.classList.toggle("has-image", Boolean(src));
    key.style.backgroundImage = src ? `url("${src}")` : "";
  }
  const gone = (next.buttonWidth ?? 0) <= 0
    || (next.buttonHeight ?? 0) <= 0
    || (next.buttonSize ?? 1) <= 0;
  face.classList.toggle("is-empty", gone);
  nodeGraphKeypadSyncLookPixels(face, next);
  nodeGraphKeypadEnsureStrokeWatch(face);
}

function nodeGraphKeypadSyncLookPixels(face, layout) {
  if (!face) return;
  const key = face.querySelector(".node-keypad-key");
  const width = key?.offsetWidth || 0;
  const height = key?.offsetHeight || 0;
  const stroke = layout?.stroke ?? (Number(face.dataset.keypadStroke) || 0);
  const rounding = layout?.rounding ?? (Number(face.dataset.keypadRounding) || 0);
  const strokePx = typeof nodeGraphKeypadStrokePixels === "function"
    ? nodeGraphKeypadStrokePixels(stroke, width, height)
    : 0;
  const maxRadius = Math.max(0, Math.min(width, height) * 0.5);
  const radiusPx = Math.round(Math.max(0, Math.min(100, Number(rounding) || 0)) / 100 * maxRadius);
  face.style.setProperty("--node-keypad-stroke", `${strokePx}px`);
  face.style.setProperty("--node-keypad-radius", `${radiusPx}px`);
}

function nodeGraphKeypadSyncStrokePixels(face, stroke) {
  nodeGraphKeypadSyncLookPixels(face, { stroke, rounding: Number(face.dataset.keypadRounding) });
}

function nodeGraphKeypadEnsureStrokeWatch(face) {
  if (!face || face.dataset.keypadStrokeWatch === "1") return;
  face.dataset.keypadStrokeWatch = "1";
  if (typeof ResizeObserver !== "function") return;
  const ro = new ResizeObserver(() => {
    nodeGraphKeypadSyncLookPixels(face);
  });
  ro.observe(face);
}

function nodeGraphKeypadPaintSlot(face, slot, down) {
  if (!face) return;
  const has = slot != null && Number.isFinite(Number(slot));
  const active = has
    ? (typeof nodeGraphKeypadWrap === "function"
      ? nodeGraphKeypadWrap(slot)
      : Math.max(0, Math.round(Number(slot) || 0)))
    : -1;
  for (const key of face.querySelectorAll(".node-keypad-key")) {
    const index = Number(key.dataset.slot);
    const on = has && index === active;
    key.classList.toggle("is-active", on);
    key.classList.toggle("is-down", Boolean(down) && on);
    key.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function setNodeGraphKeypadInteraction(nodeId, update = {}) {
  if (!nodeId) return false;
  const runtime = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.live?.runtime : null;
  if (runtime) {
    if (!(runtime.keypadStates instanceof Map)) runtime.keypadStates = new Map();
    const state = runtime.keypadStates.get(nodeId) || (
      typeof createNodeGraphKeypadState === "function"
        ? createNodeGraphKeypadState()
        : { down: 0, pointerSlot: 0 }
    );
    if (update.down !== undefined) state.down = update.down ? 1 : 0;
    if (update.pointerSlot !== undefined) {
      state.pointerSlot = typeof nodeGraphKeypadWrap === "function"
        ? nodeGraphKeypadWrap(update.pointerSlot)
        : Math.round(Number(update.pointerSlot) || 0);
    }
    runtime.keypadStates.set(nodeId, state);
  }
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp.live?.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      down: update.down,
      nodeId,
      pointerSlot: update.pointerSlot,
      type: "keypadInteraction",
    });
  }
  return true;
}

function nodeGraphKeypadNodeIsLatch(node) {
  return typeof nodeGraphKeypadIsLatch === "function"
    && nodeGraphKeypadIsLatch(node?.params?.mode);
}

function setNodeGraphKeypadPointerSlot(nodeId, slot, event) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("keypad")) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode || patchNode.type !== "keypad") return false;
  const nextSlot = typeof nodeGraphKeypadWrap === "function"
    ? nodeGraphKeypadWrap(slot)
    : Math.round(Number(slot) || 0);
  let down = 1;
  if (nodeGraphKeypadNodeIsLatch(patchNode)) {
    const runtime = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.live?.runtime : null;
    const state = runtime?.keypadStates?.get?.(nodeId);
    const same = Number(state?.pointerSlot) === nextSlot && Number(state?.down) > 0;
    down = same ? 0 : 1;
  }
  setNodeGraphKeypadInteraction(nodeId, { down, pointerSlot: nextSlot });
  nodeGraphKeypadPaintSlot(nodeGraphKeypadFaceFor(nodeId), nextSlot, down > 0);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const target = patch.nodes.find((node) => node.id === nodeId);
  if (target) {
    target.params = {
      ...(target.params || {}),
      slot: nextSlot,
    };
    commitNodeGraphPatch(patch, {
      record: false,
      skipLivePlan: true,
      softDom: true,
      status: "keypad slot",
    });
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function createNodeGraphKeypadBody(node) {
  const nodeId = String(node || "");
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const face = document.createElement("div");
  face.className = "node-keypad-face node-module-face";
  face.dataset.node = nodeId;
  face.dataset.nodeType = "keypad";
  face.dataset.moduleBand = "face";
  face.setAttribute("aria-label", "Keypad");
  const grid = document.createElement("div");
  grid.className = "node-keypad-grid";
  grid.setAttribute("role", "group");
  const labels = typeof NODE_GRAPH_KEYPAD_LABELS !== "undefined"
    ? NODE_GRAPH_KEYPAD_LABELS
    : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  labels.forEach((label, slot) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "node-keypad-key";
    key.dataset.slot = String(slot);
    const glyph = document.createElement("span");
    glyph.className = "node-keypad-key-label";
    glyph.textContent = label;
    key.append(glyph);
    key.setAttribute("aria-label", `Key ${label}`);
    key.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      key.setPointerCapture?.(event.pointerId);
      setNodeGraphKeypadPointerSlot(nodeId, slot, event);
    });
    grid.append(key);
  });
  face.append(grid);
  face.addEventListener("pointerup", (event) => {
    if (event.button !== 0) return;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (nodeGraphKeypadNodeIsLatch(live)) return;
    setNodeGraphKeypadInteraction(nodeId, { down: 0 });
    nodeGraphKeypadPaintSlot(face, null, false);
  });
  face.addEventListener("pointercancel", () => {
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (nodeGraphKeypadNodeIsLatch(live)) return;
    setNodeGraphKeypadInteraction(nodeId, { down: 0 });
  });
  face.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  });
  nodeGraphKeypadApplyLayout(face, patchNode?.layout);
  nodeGraphKeypadPaintSlot(face, null, false);
  return face;
}

function syncNodeGraphKeypadElement(element, patchNode) {
  const face = element?.querySelector?.(".node-keypad-face");
  if (!face || !patchNode) return;
  nodeGraphKeypadApplyLayout(face, patchNode.layout);
}

function nodeGraphKeypadTargetNodeId() {
  if (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function") {
    const id = String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim();
    if (id) return id;
  }
  return String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
}

function commitNodeGraphKeypadKeyImage(slot, image) {
  const nodeId = nodeGraphKeypadTargetNodeId();
  const patch = typeof cloneNodeGraphPatch === "function" ? cloneNodeGraphPatch(nodeGraphMvp.patch) : null;
  const target = patch?.nodes?.find?.((node) => node.id === nodeId);
  if (!target || target.type !== "keypad") {
    return false;
  }
  const current = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout(target.layout)
    : (target.layout || {});
  const images = typeof nodeGraphKeypadNormalizeKeyImages === "function"
    ? nodeGraphKeypadNormalizeKeyImages(current.keyImages)
    : [...(current.keyImages || [])];
  const index = Math.max(0, Math.round(Number(slot) || 0));
  images[index] = image && image.dataUrl
    ? { dataUrl: String(image.dataUrl), fileName: String(image.fileName || "") }
    : { dataUrl: "", fileName: "" };
  target.layout = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout({ ...current, keyImages: images })
    : { ...current, keyImages: images };
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      record: true,
      skipLivePlan: true,
      softDom: true,
      status: image?.dataUrl ? "keypad key image loaded" : "keypad key image cleared",
    });
  }
  if (typeof applyNodeGraphKeypadDisplaySettingsToFace === "function") {
    applyNodeGraphKeypadDisplaySettingsToFace(target);
  }
  const panel = document.querySelector("[data-keypad-display-settings-panel]");
  if (panel && typeof syncNodeGraphKeypadDisplaySettingsControls === "function") {
    syncNodeGraphKeypadDisplaySettingsControls(panel, target.layout);
  }
  return true;
}

function pickNodeGraphKeypadKeyImage(slot) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) return;
      commitNodeGraphKeypadKeyImage(slot, { dataUrl, fileName: file.name || "image" });
    };
    reader.readAsDataURL(file);
  });
  document.body.append(input);
  input.click();
}

registerNodeGraphChromelessModuleUi("keypad", {
  createBody: createNodeGraphKeypadBody,
});

if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
  addNodeGraphModuleScopeSnapshotListener(() => {
    for (const face of document.querySelectorAll(".node-keypad-face[data-node]")) {
      const nodeId = face.dataset.node;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      const digital = typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Index", 0)
        : 0;
      const gate = typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Gate", 0)
        : 0;
      const slot = typeof nodeGraphKeypadDigitalToSlot === "function"
        ? nodeGraphKeypadDigitalToSlot(digital)
        : (Number(digital) > 0 ? Number(digital) - 1 : null);
      nodeGraphKeypadPaintSlot(face, slot, gate > 0.5);
    }
  });
}
