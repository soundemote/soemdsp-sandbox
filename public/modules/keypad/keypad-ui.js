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

/** Room-dimmer hole: 50% like LCD plates (not a full phosphor punch). */
const NODE_GRAPH_KEYPAD_DISPLAY_LIGHT_STRENGTH = 0.5;

function nodeGraphKeypadApplyScreenLight(face) {
  if (!face) return;
  const s = NODE_GRAPH_KEYPAD_DISPLAY_LIGHT_STRENGTH;
  face.classList.add("node-light-source");
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = String(s);
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(face, s);
  }
}

function nodeGraphKeypadApplyLayout(face, layout) {
  if (!face) return;
  const next = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout(layout)
    : layout || {};
  const d = typeof NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS !== "undefined"
    ? NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS
    : {};
  face.style.setProperty("--node-keypad-background-color", next.backgroundColor || d.backgroundColor || "#000000");
  const bgSrc = next.backgroundImage?.dataUrl || "";
  face.style.setProperty("--node-keypad-background-image", bgSrc ? `url("${bgSrc}")` : "none");
  face.classList.toggle("has-background-image", Boolean(bgSrc));
  face.style.setProperty("--node-keypad-button-color", next.buttonColor || d.buttonColor || "#c4c2a6");
  face.style.setProperty("--node-keypad-hover-color", next.hoverColor || d.hoverColor || "#89bfc2");
  face.style.setProperty("--node-keypad-down-color", next.downColor || d.downColor || "#d9d9d9");
  face.style.setProperty("--node-keypad-text-color", next.textColor || d.textColor || "#2d2d2d");
  face.style.setProperty("--node-keypad-stroke-color", next.strokeColor || d.strokeColor || "#5c5071");
  face.style.setProperty("--node-keypad-button-width", String(next.buttonWidth ?? d.buttonWidth ?? 1));
  face.style.setProperty("--node-keypad-button-height", String(next.buttonHeight ?? d.buttonHeight ?? 1));
  face.style.setProperty("--node-keypad-button-size", String(next.buttonSize ?? d.buttonSize ?? 1));
  face.style.setProperty("--node-keypad-pad", `${Math.max(0, Number(next.padPx ?? d.padPx) || 0)}px`);
  face.dataset.keypadPad = String(Math.max(0, Number(next.padPx ?? d.padPx) || 0));
  face.dataset.keypadSquare = next.squareRatio === false ? "0" : (next.squareRatio ? "1" : "0");
  face.classList.toggle("is-square-ratio", next.squareRatio === true);
  face.style.setProperty(
    "--node-keypad-font",
    typeof nodeGraphKeypadFontFamily === "function"
      ? nodeGraphKeypadFontFamily(next.font)
      : (next.fontFamily || "\"Thasadith\", sans-serif"),
  );
  face.style.setProperty("--node-keypad-text-size", String(next.textSize ?? d.textSize ?? 0.87708066581306));
  face.style.setProperty("--node-keypad-text-weight", String(next.textWeight ?? d.textWeight ?? 900));
  face.style.setProperty("--node-keypad-rounding", String(next.rounding ?? d.rounding ?? 48.2527147087858));
  face.style.setProperty(
    "--node-keypad-corner-shape",
    next.cornerShape === "pill" ? "round" : "squircle",
  );
  face.dataset.keypadStroke = String(next.stroke ?? d.stroke ?? 0.0705278719888686);
  face.dataset.keypadRounding = String(next.rounding ?? d.rounding ?? 48.2527147087858);
  const labels = typeof nodeGraphKeypadLabelsList === "function"
    ? nodeGraphKeypadLabelsList(next.labels)
    : (typeof NODE_GRAPH_KEYPAD_LABELS !== "undefined"
      ? NODE_GRAPH_KEYPAD_LABELS
      : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]);
  const images = Array.isArray(next.keyImages) ? next.keyImages : [];
  for (const key of face.querySelectorAll(".node-keypad-key")) {
    const slot = Number(key.dataset.slot);
    const src = images[slot]?.dataUrl || "";
    const glyph = labels[slot] ?? "";
    const labelEl = key.querySelector(".node-keypad-key-label");
    if (labelEl && labelEl.textContent !== glyph) {
      labelEl.textContent = glyph;
    }
    key.setAttribute("aria-label", `Key ${glyph || slot + 1}`);
    key.classList.toggle("has-image", Boolean(src));
    key.style.backgroundImage = src ? `url("${src}")` : "";
  }
  const gone = (next.buttonWidth ?? 0) <= 0
    || (next.buttonHeight ?? 0) <= 0
    || (next.buttonSize ?? 1) <= 0;
  face.classList.toggle("is-empty", gone);
  nodeGraphKeypadSyncGridGeometry(face, next);
  nodeGraphKeypadSyncLookPixels(face, next);
  nodeGraphKeypadEnsureStrokeWatch(face);
}

function nodeGraphKeypadSyncGridGeometry(face, layout) {
  if (!face) {
    return;
  }
  const grid = face.querySelector(".node-keypad-grid");
  if (!grid) {
    return;
  }
  const next = layout && typeof layout === "object" ? layout : {};
  const pad = Math.max(0, Number(next.padPx ?? face.dataset.keypadPad) || 0);
  const square = next.squareRatio !== undefined
    ? next.squareRatio !== false
    : face.dataset.keypadSquare !== "0";
  const innerW = Math.max(0, (face.clientWidth || 0) - pad * 2);
  const innerH = Math.max(0, (face.clientHeight || 0) - pad * 2);
  const metrics = typeof nodeGraphKeypadGridMetrics === "function"
    ? nodeGraphKeypadGridMetrics(innerW, innerH, square)
    : null;
  if (square && metrics && metrics.width > 0 && metrics.height > 0) {
    grid.style.width = `${metrics.width}px`;
    grid.style.height = `${metrics.height}px`;
  } else {
    grid.style.width = "100%";
    grid.style.height = "100%";
  }
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
    nodeGraphKeypadSyncGridGeometry(face);
    nodeGraphKeypadSyncLookPixels(face);
  });
  ro.observe(face);
}

function nodeGraphKeypadPaintSlot(face, slot, down, hoverSlot = null) {
  if (!face) return;
  const has = slot != null && Number.isFinite(Number(slot));
  const wrap = typeof nodeGraphKeypadWrap === "function"
    ? nodeGraphKeypadWrap
    : (value) => Math.max(0, Math.round(Number(value) || 0));
  const active = has ? wrap(slot) : -1;
  const hoverHas = hoverSlot != null && Number.isFinite(Number(hoverSlot));
  const hover = hoverHas ? wrap(hoverSlot) : -1;
  for (const key of face.querySelectorAll(".node-keypad-key")) {
    const index = Number(key.dataset.slot);
    const on = has && index === active;
    const lit = hoverHas && index === hover && !on;
    key.classList.toggle("is-active", on);
    key.classList.toggle("is-down", Boolean(down) && on);
    key.classList.toggle("is-hover", lit);
    key.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function nodeGraphKeypadIndexSlot(patchNode) {
  const raw = Number(patchNode?.params?.offset);
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return typeof nodeGraphKeypadDigitalToSlot === "function"
    ? nodeGraphKeypadDigitalToSlot(raw)
    : Math.max(0, Math.round(raw) - 1);
}

function nodeGraphKeypadPaintWithOffset(face, downSlot, down, patchNode) {
  if (!face) {
    return;
  }
  const node = patchNode
    || (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(face.dataset.node) : null);
  const indexSlot = nodeGraphKeypadNodeIsLatch(node) ? nodeGraphKeypadIndexSlot(node) : null;
  face.classList.toggle("has-offset-hover", indexSlot != null);
  nodeGraphKeypadPaintSlot(face, downSlot, down, indexSlot);
}

function nodeGraphKeypadApplyIndexSliderChrome(root) {
  const article = root?.closest?.(".dsp-node") || root;
  const slider = article?.querySelector?.('input[data-param="offset"]');
  if (!slider) {
    return;
  }
  slider.dataset.divideChoicesVisibly = "false";
  if (typeof syncNodeSliderReadout === "function") {
    syncNodeSliderReadout(slider);
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
        : { down: 0, latched: 0, needsRestore: false, pointerSlot: null }
    );
    state.needsRestore = false;
    if (update.down !== undefined) state.down = update.down ? 1 : 0;
    if (update.latched !== undefined) state.latched = update.latched ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(update, "pointerSlot")) {
      if (update.pointerSlot == null || update.pointerSlot === "") {
        state.pointerSlot = null;
      } else {
        state.pointerSlot = typeof nodeGraphKeypadWrap === "function"
          ? nodeGraphKeypadWrap(update.pointerSlot)
          : Math.round(Number(update.pointerSlot) || 0);
      }
    }
    runtime.keypadStates.set(nodeId, state);
  }
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp.live?.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      down: update.down,
      latched: update.latched,
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

function nodeGraphKeypadNodeDragEnabled(node) {
  return typeof nodeGraphKeypadDragEnabled !== "function"
    || nodeGraphKeypadDragEnabled(node?.params?.drag);
}

function nodeGraphKeypadKeyFromPoint(face, clientX, clientY) {
  if (!face) {
    return null;
  }
  const stack = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)];
  for (const el of stack || []) {
    const key = el?.classList?.contains("node-keypad-key")
      ? el
      : el?.closest?.(".node-keypad-key");
    if (key && face.contains(key)) {
      return key;
    }
  }
  return null;
}

function nodeGraphKeypadFaceLatchOn(face) {
  return face?.dataset?.keypadLatched === "1";
}

function nodeGraphKeypadFaceLatchSlot(face) {
  const raw = face?.dataset?.keypadSlot;
  if (raw === "" || raw == null) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return null;
  }
  return typeof nodeGraphKeypadWrap === "function" ? nodeGraphKeypadWrap(n) : n;
}

function nodeGraphKeypadWriteFaceLatch(face, slot, latched) {
  if (!face) {
    return;
  }
  face.dataset.keypadLatched = latched ? "1" : "0";
  face.dataset.keypadSlot = latched && slot != null ? String(slot) : "";
}

function nodeGraphKeypadPaintLatchFromPatch(face, patchNode) {
  if (!face) {
    return;
  }
  if (!nodeGraphKeypadNodeIsLatch(patchNode)) {
    nodeGraphKeypadWriteFaceLatch(face, null, false);
    nodeGraphKeypadPaintWithOffset(face, null, false, patchNode);
    return;
  }
  const stored = typeof nodeGraphKeypadStoredSlot === "function"
    ? nodeGraphKeypadStoredSlot(patchNode?.params)
    : null;
  const on = stored != null;
  nodeGraphKeypadWriteFaceLatch(face, stored, on);
  nodeGraphKeypadPaintWithOffset(face, stored, on, patchNode);
}

function setNodeGraphKeypadPointerSlot(nodeId, slot, event, options = {}) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("keypad")) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode || patchNode.type !== "keypad") return false;
  const nextSlot = typeof nodeGraphKeypadWrap === "function"
    ? nodeGraphKeypadWrap(slot)
    : Math.round(Number(slot) || 0);
  const face = nodeGraphKeypadFaceFor(nodeId);
  const latch = nodeGraphKeypadNodeIsLatch(patchNode);
  const runtime = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.live?.runtime : null;
  const state = runtime?.keypadStates?.get?.(nodeId);
  const currentSlot = state?.pointerSlot ?? nodeGraphKeypadFaceLatchSlot(face);
  const currentlyHeld = latch
    ? (Number(state?.latched) > 0 || nodeGraphKeypadFaceLatchOn(face))
    : Number(state?.down) > 0;
  const same = Number(currentSlot) === nextSlot && currentlyHeld;
  let down = 1;
  let latched = 0;
  if (options.glide) {
    if (same) {
      return true;
    }
    down = 1;
    latched = latch ? 1 : 0;
  } else if (latch) {
    down = same ? 0 : 1;
    latched = down;
  }
  const pointerSlot = latch && !latched ? null : nextSlot;
  setNodeGraphKeypadInteraction(nodeId, { down, latched, pointerSlot });
  if (latch) {
    nodeGraphKeypadWriteFaceLatch(face, pointerSlot, latched);
  } else if (face) {
    nodeGraphKeypadWriteFaceLatch(face, null, false);
  }
  nodeGraphKeypadPaintWithOffset(face, pointerSlot, down > 0, patchNode);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const target = patch.nodes.find((node) => node.id === nodeId);
  if (target) {
    const nextParams = { ...(target.params || {}) };
    if (latch && latched) {
      nextParams.slot = nextSlot;
    } else {
      nextParams.slot = "";
    }
    const prevSlot = target.params?.slot ?? "";
    if (String(nextParams.slot ?? "") !== String(prevSlot)) {
      target.params = nextParams;
      commitNodeGraphPatch(patch, {
        record: false,
        skipLivePlan: true,
        softDom: true,
        status: "keypad slot",
      });
    }
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function createNodeGraphKeypadBody(node) {
  const nodeId = String(node || "");
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const face = document.createElement("div");
  face.className = "node-keypad-face node-module-face node-light-source";
  face.dataset.node = nodeId;
  face.dataset.nodeType = "keypad";
  face.dataset.moduleBand = "face";
  face.setAttribute("aria-label", "Keypad");
  nodeGraphKeypadApplyScreenLight(face);
  const grid = document.createElement("div");
  grid.className = "node-keypad-grid";
  grid.setAttribute("role", "group");
  const labels = typeof NODE_GRAPH_KEYPAD_LABELS !== "undefined"
    ? NODE_GRAPH_KEYPAD_LABELS
    : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  labels.forEach((label, slot) => {
    const key = document.createElement("div");
    key.className = "node-keypad-key";
    key.dataset.slot = String(slot);
    key.setAttribute("role", "button");
    key.tabIndex = -1;
    const glyph = document.createElement("span");
    glyph.className = "node-keypad-key-label";
    glyph.textContent = label;
    key.append(glyph);
    key.setAttribute("aria-label", `Key ${label}`);
    key.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    key.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (nodeGraphKeypadNodeDragEnabled(live)) {
        face.setPointerCapture?.(event.pointerId);
      } else {
        key.setPointerCapture?.(event.pointerId);
      }
      setNodeGraphKeypadPointerSlot(nodeId, slot, event);
    });
    grid.append(key);
  });
  face.append(grid);
  const releaseMomentary = () => {
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (nodeGraphKeypadNodeIsLatch(live)) return;
    setNodeGraphKeypadInteraction(nodeId, { down: 0, latched: 0 });
    nodeGraphKeypadWriteFaceLatch(face, null, false);
    nodeGraphKeypadPaintWithOffset(face, null, false, live);
  };
  face.addEventListener("pointermove", (event) => {
    if (!(event.buttons & 1)) return;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!nodeGraphKeypadNodeDragEnabled(live)) return;
    const key = nodeGraphKeypadKeyFromPoint(face, event.clientX, event.clientY);
    if (!key) return;
    const nextSlot = Number(key.dataset.slot);
    if (!Number.isFinite(nextSlot)) return;
    setNodeGraphKeypadPointerSlot(nodeId, nextSlot, event, { glide: true });
  });
  face.addEventListener("pointerup", (event) => {
    if (event.button !== 0) return;
    releaseMomentary();
  });
  face.addEventListener("pointercancel", releaseMomentary);
  face.addEventListener("lostpointercapture", releaseMomentary);
  face.addEventListener("pointerover", (event) => {
    const key = event.target?.closest?.(".node-keypad-key");
    if (!key || !face.contains(key)) {
      return;
    }
    const next = String(key.dataset.slot ?? "");
    if (face.dataset.keypadHoverSlot === next) {
      return;
    }
    face.dataset.keypadHoverSlot = next;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!nodeGraphKeypadNodeIsLatch(live)) {
      return;
    }
    const downSlot = nodeGraphKeypadFaceLatchOn(face) ? nodeGraphKeypadFaceLatchSlot(face) : null;
    nodeGraphKeypadPaintWithOffset(face, downSlot, downSlot != null, live);
  });
  face.addEventListener("pointerout", (event) => {
    if (event.relatedTarget && face.contains(event.relatedTarget)) {
      return;
    }
    if (face.dataset.keypadHoverSlot == null || face.dataset.keypadHoverSlot === "") {
      return;
    }
    delete face.dataset.keypadHoverSlot;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!nodeGraphKeypadNodeIsLatch(live)) {
      return;
    }
    const downSlot = nodeGraphKeypadFaceLatchOn(face) ? nodeGraphKeypadFaceLatchSlot(face) : null;
    nodeGraphKeypadPaintWithOffset(face, downSlot, downSlot != null, live);
  });
  face.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (event.target?.closest?.(".node-keypad-key")) return;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!nodeGraphKeypadNodeDragEnabled(live)) return;
    face.setPointerCapture?.(event.pointerId);
    const key = nodeGraphKeypadKeyFromPoint(face, event.clientX, event.clientY);
    if (!key) return;
    setNodeGraphKeypadPointerSlot(nodeId, Number(key.dataset.slot), event);
  });
  nodeGraphKeypadApplyLayout(face, patchNode?.layout);
  nodeGraphKeypadPaintLatchFromPatch(face, patchNode);
  nodeGraphKeypadApplyIndexSliderChrome(face);
  return face;
}

function syncNodeGraphKeypadElement(element, patchNode) {
  const face = element?.querySelector?.(".node-keypad-face");
  if (!face || !patchNode) return;
  nodeGraphKeypadApplyScreenLight(face);
  nodeGraphKeypadApplyLayout(face, patchNode.layout);
  if (nodeGraphKeypadNodeIsLatch(patchNode) && nodeGraphKeypadFaceLatchOn(face)) {
    nodeGraphKeypadPaintWithOffset(face, nodeGraphKeypadFaceLatchSlot(face), true, patchNode);
  } else {
    nodeGraphKeypadPaintLatchFromPatch(face, patchNode);
  }
  nodeGraphKeypadApplyIndexSliderChrome(element);
}

function nodeGraphKeypadTargetNodeId() {
  if (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function") {
    const id = String(nodeGraphTraceDisplaySettingsTargetNodeId() || "").trim();
    if (id) return id;
  }
  return String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
}

function commitNodeGraphKeypadBackgroundImage(image) {
  const nodeId = nodeGraphKeypadTargetNodeId();
  const patch = typeof cloneNodeGraphPatch === "function" ? cloneNodeGraphPatch(nodeGraphMvp.patch) : null;
  const target = patch?.nodes?.find?.((node) => node.id === nodeId);
  if (!target || target.type !== "keypad") {
    return false;
  }
  const current = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout(target.layout)
    : (target.layout || {});
  const nextImage = image && image.dataUrl
    ? { dataUrl: String(image.dataUrl), fileName: String(image.fileName || "") }
    : { dataUrl: "", fileName: "" };
  target.layout = typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout({ ...current, backgroundImage: nextImage })
    : { ...current, backgroundImage: nextImage };
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      record: true,
      skipLivePlan: true,
      softDom: true,
      status: nextImage.dataUrl ? "keypad background image loaded" : "keypad background image cleared",
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

function pickNodeGraphKeypadBackgroundImage() {
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  nodeGraphPickImageFile((asset) => {
    commitNodeGraphKeypadBackgroundImage(asset);
  });
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
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  nodeGraphPickImageFile((asset) => {
    commitNodeGraphKeypadKeyImage(slot, asset);
  });
}

registerNodeGraphChromelessModuleUi("keypad", {
  createBody: createNodeGraphKeypadBody,
});

if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
  addNodeGraphModuleScopeSnapshotListener(() => {
    for (const face of document.querySelectorAll(".node-keypad-face[data-node]")) {
      const nodeId = face.dataset.node;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (nodeGraphKeypadNodeIsLatch(patchNode)) {
        const stored = nodeGraphKeypadFaceLatchOn(face)
          ? nodeGraphKeypadFaceLatchSlot(face)
          : (typeof nodeGraphKeypadStoredSlot === "function"
            ? nodeGraphKeypadStoredSlot(patchNode?.params)
            : null);
        nodeGraphKeypadPaintWithOffset(face, stored, stored != null, patchNode);
        continue;
      }
      const state = nodeGraphMvp?.live?.runtime?.keypadStates?.get?.(nodeId);
      const pointerHeld = Number(state?.down) > 0;
      const digital = typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Index", 0)
        : 0;
      const gate = typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Gate", 0)
        : 0;
      const slot = pointerHeld && state?.pointerSlot != null
        ? state.pointerSlot
        : (typeof nodeGraphKeypadDigitalToSlot === "function"
          ? nodeGraphKeypadDigitalToSlot(digital)
          : (Number(digital) > 0 ? Number(digital) - 1 : null));
      // Pointer-up wins over a lagged Gate sample so the key does not
      // flash down/hover again after the mouse is released.
      const showDown = pointerHeld || (gate > 0.5 && !state);
      nodeGraphKeypadPaintWithOffset(face, slot, showDown, patchNode);
    }
  });
}
