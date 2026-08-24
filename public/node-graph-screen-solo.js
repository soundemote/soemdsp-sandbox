// F cycles selected screens: fit (no stretch) → stretch → off. Escape restores.
// Double-click no longer opens or solos a screen (keypad / pads stay playable).

const NODE_GRAPH_SCREEN_SOLO_FACE_SEL = [
  "[data-light-source='screen']",
  ".node-module-scope-window",
  ".node-filter-curve-display",
  ".node-round-shape-display",
  ".node-basic-shape-display",
  ".node-envelope-curve-display",
  ".node-phone-tone-display",
  ".node-pulse-curve-display",
  ".node-phosphor-waveform-display",
  ".node-wall-room-display",
  ".node-asciiscope-face",
  ".node-matrix-display-face",
  ".node-matrix-face",
  ".node-fbm-field-face",
  ".node-keypad-face",
  ".node-led-face",
  ".node-number-readout-face",
  ".node-value-lcd-face",
  ".node-xy-pad",
  ".node-raster-rgb-face",
  ".node-ray-bouncer-face",
  ".node-module-graph-display",
  ".node-text-box-body",
  ".node-module-face",
].join(", ");

const NODE_GRAPH_SCREEN_SOLO_SKIP_SEL = [
  ".dsp-node-header",
  ".dsp-node-io-section",
  ".node-slider-readout",
  ".node-parameter-row",
  ".node-knob-face",
].join(", ");

function nodeGraphScreenSoloSession() {
  if (!nodeGraphMvp.screenSolo) {
    nodeGraphMvp.screenSolo = {
      items: [],
      face: null,
      host: null,
      nodeId: "",
      parent: null,
      placeholder: null,
      fit: "",
      sourceWidth: 0,
      sourceHeight: 0,
      cols: 0,
      rows: 0,
    };
  }
  if (!Array.isArray(nodeGraphMvp.screenSolo.items)) {
    nodeGraphMvp.screenSolo.items = [];
  }
  return nodeGraphMvp.screenSolo;
}

function nodeGraphScreenSoloItems() {
  return nodeGraphScreenSoloSession().items || [];
}

function nodeGraphScreenSoloNodeId() {
  const items = nodeGraphScreenSoloItems();
  if (items.length) {
    return String(items[0].nodeId || "");
  }
  return String(nodeGraphMvp?.screenSolo?.nodeId || nodeGraphMvp?.screenSoloNodeId || "");
}

function nodeGraphScreenSoloNodeIds() {
  return nodeGraphScreenSoloItems().map((item) => String(item.nodeId || "")).filter(Boolean);
}

function nodeGraphScreenSoloIsActive() {
  return nodeGraphScreenSoloItems().length > 0 || Boolean(nodeGraphScreenSoloNodeId());
}

function nodeGraphScreenSoloLiveFace() {
  const items = nodeGraphScreenSoloItems();
  return items[0]?.face || nodeGraphScreenSoloSession().face || null;
}

function nodeGraphScreenSoloItemForNode(nodeId) {
  const id = String(nodeId || "");
  return nodeGraphScreenSoloItems().find((item) => String(item.nodeId) === id) || null;
}

function nodeGraphDisplayNodeIdFromElement(el) {
  if (!(el instanceof Element)) {
    return "";
  }
  if (el.dataset?.node) {
    return String(el.dataset.node);
  }
  const host = el.closest?.(".dsp-node");
  if (host?.dataset?.node) {
    return String(host.dataset.node);
  }
  const hit = nodeGraphScreenSoloItems().find((item) => (
    item.face && (el === item.face || item.face.contains(el))
  ));
  return hit ? String(hit.nodeId || "") : "";
}

function nodeGraphScreenSoloAllowsNode(nodeId) {
  if (!nodeGraphScreenSoloIsActive()) {
    return true;
  }
  const id = String(nodeId || "");
  return nodeGraphScreenSoloNodeIds().includes(id);
}

function nodeGraphScreenSoloAllowsClock(clockKey) {
  if (!nodeGraphScreenSoloIsActive()) {
    return true;
  }
  const key = String(clockKey || "");
  const colon = key.indexOf(":");
  if (colon >= 0) {
    return nodeGraphScreenSoloAllowsNode(key.slice(colon + 1));
  }
  if (!key || key === "__default") {
    return true;
  }
  const types = new Set(
    nodeGraphScreenSoloNodeIds().map((id) => (
      typeof nodeGraphPatchNode === "function" ? String(nodeGraphPatchNode(id)?.type || "") : ""
    )),
  );
  if (key === "rasterRgb") {
    return types.has("rasterRgb");
  }
  if (key === "asciiscope") {
    return types.has("asciiscope");
  }
  if (key === "matrixDisplay") {
    return types.has("matrixDisplay") || types.has("matrixWaterfall");
  }
  return types.has(key);
}

function nodeGraphScreenSoloWrapCandidate(el) {
  if (!(el instanceof Element)) {
    return null;
  }
  // Skip chrome wrappers, but keep the face itself when it matches a face sel
  // (e.g. Text Box body used to be skipped and F on one text box did nothing).
  const skipHost = el.closest(NODE_GRAPH_SCREEN_SOLO_SKIP_SEL);
  if (skipHost && skipHost !== el && !el.matches(NODE_GRAPH_SCREEN_SOLO_FACE_SEL)) {
    return null;
  }
  if (el.matches("canvas, svg")) {
    return el.closest(
      "section, .node-module-face, .node-solid-module-custom-ui, .node-filter-curve-display, .node-text-box-body",
    ) || el;
  }
  return el;
}

function nodeGraphScreenSoloFaceScore(face) {
  if (!(face instanceof Element)) {
    return -1;
  }
  let score = 0;
  if (face.hidden) score -= 50;
  if (face.getAttribute("aria-hidden") === "true") score -= 20;
  if (face.dataset?.lightSource === "screen") score += 40;
  if (face.classList.contains("node-filter-curve-display")) score += 30;
  if (face.classList.contains("node-round-shape-display")) score += 35;
  if (face.classList.contains("node-basic-shape-display")) score += 35;
  if (face.classList.contains("node-module-scope-window")) score += 25;
  if (face.classList.contains("node-module-face")) score += 10;
  if (face.classList.contains("node-text-box-body")) score += 30;
  const w = Number(face.clientWidth || face.offsetWidth) || 0;
  const h = Number(face.clientHeight || face.offsetHeight) || 0;
  if (w >= 8 && h >= 8) score += 20;
  return score;
}

function nodeGraphScreenSoloFaceForHost(host) {
  if (!(host instanceof Element)) {
    return null;
  }
  const seen = new Set();
  const candidates = [];
  for (const raw of host.querySelectorAll(NODE_GRAPH_SCREEN_SOLO_FACE_SEL)) {
    const face = nodeGraphScreenSoloWrapCandidate(raw);
    if (!face || seen.has(face)) {
      continue;
    }
    seen.add(face);
    candidates.push(face);
  }
  if (!candidates.length) {
    return null;
  }
  candidates.sort((a, b) => nodeGraphScreenSoloFaceScore(b) - nodeGraphScreenSoloFaceScore(a));
  return candidates[0];
}

function nodeGraphScreenSoloFindFace(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return null;
  }
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, "");
  const host = document.querySelector(`.dsp-node[data-node="${escaped}"]`);
  const fromHost = nodeGraphScreenSoloFaceForHost(host);
  if (fromHost) {
    return { id, host, face: fromHost };
  }
  const loose = document.querySelector(
    `[data-node="${escaped}"].node-filter-curve-display, `
    + `[data-node="${escaped}"].node-round-shape-display, `
    + `[data-node="${escaped}"].node-basic-shape-display, `
    + `[data-node="${escaped}"].node-module-scope-window, `
    + `[data-node="${escaped}"][data-light-source="screen"]`,
  );
  if (loose) {
    return { id, host: loose.closest(".dsp-node"), face: loose };
  }
  return null;
}

function nodeGraphScreenSoloSelectedNodeIds() {
  if (typeof nodeGraphSelectedNodeIdsInOrder === "function") {
    return nodeGraphSelectedNodeIdsInOrder();
  }
  const selection = nodeGraphMvp?.selected;
  if (selection?.type === "nodes" && Array.isArray(selection.ids)) {
    return selection.ids.map((id) => String(id || "")).filter(Boolean);
  }
  if (selection?.type === "node" && selection.id) {
    return [String(selection.id)];
  }
  if (typeof nodeGraphSelectedNodeIds === "function") {
    return [...nodeGraphSelectedNodeIds()];
  }
  return [];
}

function ensureNodeGraphScreenSoloStage() {
  let stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    return stage;
  }
  stage = document.createElement("div");
  stage.id = "nodeScreenSoloStage";
  stage.className = "node-screen-solo-stage";
  stage.hidden = true;
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-label", "Fullscreen screens. Press F or Escape to restore.");
  document.body.append(stage);
  return stage;
}

function nodeGraphScreenSoloWakeFace(face) {
  if (!(face instanceof Element)) {
    return;
  }
  face.hidden = false;
  face.removeAttribute("hidden");
  if (face.classList.contains("node-round-shape-display")) {
    face._roundShapeForceDraw = true;
    face._roundShapeLaidOut = false;
    if (typeof drawNodeGraphRoundShapeDisplay === "function") {
      drawNodeGraphRoundShapeDisplay(face);
    }
  }
  if (face.classList.contains("node-basic-shape-display")) {
    face._basicShapeForceDraw = true;
    face._basicShapeLaidOut = false;
    if (typeof drawNodeGraphBasicShapeDisplay === "function") {
      drawNodeGraphBasicShapeDisplay(face);
    }
  }
  if (face.classList.contains("node-filter-curve-display")) {
    face._filterCurveForceDraw = true;
    face._filterCurveLaidOut = false;
    face._filterCurveRetryCount = 0;
  }
  if (typeof scheduleNodeGraphFilterCurveDraw === "function"
    && face.classList.contains("node-filter-curve-display")) {
    scheduleNodeGraphFilterCurveDraw();
  }
}

function nodeGraphScreenSoloRefreshPaint() {
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  if (typeof scheduleNodeGraphRasterRgbPump === "function") {
    scheduleNodeGraphRasterRgbPump();
  }
  if (typeof drawNodeGraphFilterCurveDisplays === "function") {
    drawNodeGraphFilterCurveDisplays();
  }
  for (const item of nodeGraphScreenSoloItems()) {
    nodeGraphScreenSoloWakeFace(item.face);
    if (item.face?.classList?.contains("node-fbm-field-face") && item.nodeId
      && typeof nodeGraphFbmFieldStartLoop === "function") {
      nodeGraphFbmFieldStartLoop(item.face, item.nodeId);
    }
  }
}

function nodeGraphScreenSoloClearFitClasses() {
  document.body.classList.remove("node-screen-solo-fit-contain", "node-screen-solo-fit-fill");
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    stage.removeAttribute("data-fit");
    stage.style.removeProperty("--node-screen-solo-w");
    stage.style.removeProperty("--node-screen-solo-h");
    stage.style.removeProperty("--node-screen-solo-cols");
    stage.style.removeProperty("--node-screen-solo-rows");
  }
}

function nodeGraphScreenSoloFacePrefersFill(face) {
  return Boolean(
    face?.classList?.contains("node-phosphor-waveform-display")
    || face?.classList?.contains("node-module-scope-window"),
  );
}

function nodeGraphScreenSoloInitialFit(items) {
  if (items.length === 1 && nodeGraphScreenSoloFacePrefersFill(items[0]?.face)) {
    return "fill";
  }
  return "contain";
}

function nodeGraphScreenSoloGcd(a, b) {
  let x = Math.abs(Math.round(a) || 1);
  let y = Math.abs(Math.round(b) || 1);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return Math.max(1, x);
}

function nodeGraphScreenSoloLcm(a, b) {
  const x = Math.max(1, Math.round(a) || 1);
  const y = Math.max(1, Math.round(b) || 1);
  return Math.max(1, (x / nodeGraphScreenSoloGcd(x, y)) * y);
}

/**
 * Row occupancy for F-grid:
 *   1 → [1]
 *   2 → [2]          (one row split)
 *   3 → [1, 2]       (1 top / 2 bottom)
 *   4 → [2, 2]
 *   5 → [2, 3]
 *   6 → [3, 3]       (2×3)
 *   perfect square → equal rows (9 → [3,3,3])
 *   else → two rows floor(n/2) / ceil(n/2)
 */
function nodeGraphScreenSoloRowPlan(count) {
  const n = Math.max(1, Math.round(Number(count) || 1));
  if (n === 1) {
    return { rows: [1], cols: 1 };
  }
  if (n === 2) {
    return { rows: [2], cols: 2 };
  }
  const root = Math.sqrt(n);
  if (Number.isInteger(root) && root >= 2) {
    return { rows: Array.from({ length: root }, () => root), cols: root };
  }
  const top = Math.floor(n / 2);
  const bottom = n - top;
  return {
    rows: [top, bottom],
    cols: nodeGraphScreenSoloLcm(top, bottom),
  };
}

function nodeGraphScreenSoloGridSize(count) {
  const plan = nodeGraphScreenSoloRowPlan(count);
  return { cols: plan.cols, rows: plan.rows.length, rowSizes: plan.rows };
}

function nodeGraphScreenSoloPlaceItems(items, plan) {
  const cols = Math.max(1, plan.cols || 1);
  const rowSizes = Array.isArray(plan.rowSizes) ? plan.rowSizes : [items.length];
  let index = 0;
  for (let r = 0; r < rowSizes.length; r += 1) {
    const countInRow = Math.max(1, Math.round(rowSizes[r]) || 1);
    const span = Math.max(1, Math.round(cols / countInRow));
    for (let c = 0; c < countInRow && index < items.length; c += 1) {
      const face = items[index]?.face;
      index += 1;
      if (!face) {
        continue;
      }
      const start = c * span + 1;
      const end = Math.min(cols + 1, start + span);
      face.style.gridColumn = `${start} / ${end}`;
      face.style.gridRow = `${r + 1}`;
    }
  }
  while (index < items.length) {
    const face = items[index]?.face;
    index += 1;
    if (!face) {
      continue;
    }
    face.style.gridColumn = "1 / -1";
    face.style.gridRow = "auto";
  }
}

function applyNodeGraphScreenSoloFit(mode) {
  const session = nodeGraphScreenSoloSession();
  const items = nodeGraphScreenSoloItems();
  if (!items.length) {
    return;
  }
  const fit = mode === "fill" ? "fill" : "contain";
  const stage = ensureNodeGraphScreenSoloStage();
  const plan = nodeGraphScreenSoloGridSize(items.length);
  const { cols, rows, rowSizes } = plan;
  session.cols = cols;
  session.rows = rows;
  session.fit = fit;
  document.body.classList.toggle("node-screen-solo-fit-contain", fit === "contain");
  document.body.classList.toggle("node-screen-solo-fit-fill", fit === "fill");
  stage.setAttribute("data-fit", fit);
  stage.style.setProperty("--node-screen-solo-cols", String(cols));
  stage.style.setProperty("--node-screen-solo-rows", String(rows));
  nodeGraphScreenSoloPlaceItems(items, plan);
  const stageW = Math.max(1, stage.clientWidth || window.innerWidth || 1);
  const stageH = Math.max(1, stage.clientHeight || window.innerHeight || 1);
  // Per-item cell size from its row occupancy (uneven rows like 1+2, 2+3).
  let itemIndex = 0;
  for (let r = 0; r < rowSizes.length; r += 1) {
    const countInRow = Math.max(1, Math.round(rowSizes[r]) || 1);
    const cellW = Math.max(1, Math.floor(stageW / countInRow));
    const cellH = Math.max(1, Math.floor(stageH / rows));
    for (let c = 0; c < countInRow && itemIndex < items.length; c += 1) {
      const item = items[itemIndex];
      itemIndex += 1;
      if (fit === "contain") {
        const srcW = Math.max(1, Number(item.sourceWidth) || 1);
        const srcH = Math.max(1, Number(item.sourceHeight) || 1);
        const scale = Math.min(cellW / srcW, cellH / srcH);
        const w = Math.max(1, Math.round(srcW * scale));
        const h = Math.max(1, Math.round(srcH * scale));
        item.face?.style.setProperty("--node-screen-solo-item-w", `${w}px`);
        item.face?.style.setProperty("--node-screen-solo-item-h", `${h}px`);
        item.face?.setAttribute("data-solo-fit", "contain");
      } else {
        item.face?.style.removeProperty("--node-screen-solo-item-w");
        item.face?.style.removeProperty("--node-screen-solo-item-h");
        item.face?.setAttribute("data-solo-fit", "fill");
      }
    }
  }
  const n = items.length;
  const noun = n === 1 ? "screen" : `${n} screens`;
  stage.setAttribute(
    "aria-label",
    fit === "contain"
      ? `Fullscreen ${noun}, original ratio. Press F to stretch, or Escape to restore.`
      : `Fullscreen ${noun}, stretched. Press F or Escape to restore.`,
  );
  window.requestAnimationFrame(() => {
    nodeGraphScreenSoloRefreshPaint();
  });
}

function applyNodeGraphScreenSoloGrid() {
  applyNodeGraphScreenSoloFit(nodeGraphScreenSoloSession().fit || "contain");
}

function handleNodeGraphScreenSoloResize() {
  if (nodeGraphScreenSoloIsActive()) {
    applyNodeGraphScreenSoloFit(nodeGraphScreenSoloSession().fit || "contain");
  }
}

function nodeGraphScreenSoloRestoreItem(item) {
  const face = item?.face;
  if (!face) {
    return;
  }
  face.classList.remove("node-screen-solo-face");
  face.removeAttribute("data-solo-fit");
  face.style.removeProperty("grid-column");
  face.style.removeProperty("grid-row");
  face.style.removeProperty("--node-screen-solo-item-w");
  face.style.removeProperty("--node-screen-solo-item-h");
  if (item.placeholder?.parentNode) {
    item.placeholder.replaceWith(face);
  } else if (item.parent?.isConnected) {
    item.parent.append(face);
  }
  if (item.placeholder?.isConnected) {
    item.placeholder.remove();
  }
}

function nodeGraphScreenSoloCollectFaces(nodeIds) {
  const seen = new Set();
  const collected = [];
  for (const rawId of nodeIds || []) {
    const found = nodeGraphScreenSoloFindFace(rawId);
    if (!found || seen.has(found.id)) {
      continue;
    }
    // Solo must show the face even if the module currently hides scopes / faces.
    found.host?.classList.remove("oscilloscope-hidden");
    found.face.hidden = false;
    found.face.removeAttribute("hidden");
    found.face.style.display = "";
    found.face.style.visibility = "visible";
    if (!found.face.dataset.node) {
      found.face.dataset.node = found.id;
    }
    seen.add(found.id);
    collected.push(found);
  }
  return collected;
}

function beginNodeGraphScreenSoloGrid(nodeIds) {
  const collected = nodeGraphScreenSoloCollectFaces(nodeIds);
  if (!collected.length) {
    return false;
  }
  endNodeGraphScreenSolo({ silent: true });
  const session = nodeGraphScreenSoloSession();
  const stage = ensureNodeGraphScreenSoloStage();
  const items = [];
  for (const entry of collected) {
    const parent = entry.face.parentNode;
    if (!parent) {
      continue;
    }
    const sourceBox = entry.face.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "node-screen-solo-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    parent.insertBefore(placeholder, entry.face);
    if (!entry.face.dataset.node) {
      entry.face.dataset.node = entry.id;
    }
    entry.host?.classList.add("node-screen-solo-host");
    entry.face.classList.add("node-screen-solo-face");
    items.push({
      nodeId: entry.id,
      face: entry.face,
      host: entry.host,
      parent,
      placeholder,
      sourceWidth: Math.max(1, sourceBox.width || entry.face.clientWidth || 1),
      sourceHeight: Math.max(1, sourceBox.height || entry.face.clientHeight || 1),
    });
  }
  if (!items.length) {
    return false;
  }
  session.items = items;
  session.nodeId = items[0].nodeId;
  session.face = items[0].face;
  session.host = items[0].host;
  session.parent = items[0].parent;
  session.placeholder = items[0].placeholder;
  session.sourceWidth = items[0].sourceWidth;
  session.sourceHeight = items[0].sourceHeight;
  nodeGraphMvp.screenSoloNodeId = items[0].nodeId;
  document.body.classList.add("node-screen-solo-active");
  stage.hidden = false;
  for (const item of items) {
    stage.append(item.face);
  }
  applyNodeGraphScreenSoloFit(nodeGraphScreenSoloInitialFit(items));
  const keep = new Set(items.map((item) => item.nodeId));
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (keep.has(node.dataset?.node)) {
      continue;
    }
    if (typeof nodeGraphViewportCullSleepPainters === "function") {
      nodeGraphViewportCullSleepPainters(node);
    }
  }
  window.requestAnimationFrame(() => {
    nodeGraphScreenSoloRefreshPaint();
  });
  return true;
}

function beginNodeGraphScreenSolo(nodeId, face) {
  const id = String(nodeId || "");
  if (!id) {
    return false;
  }
  if (face instanceof Element && !face.matches(NODE_GRAPH_SCREEN_SOLO_FACE_SEL)) {
    return beginNodeGraphScreenSoloGrid([id]);
  }
  return beginNodeGraphScreenSoloGrid([id]);
}

function endNodeGraphScreenSolo(options = {}) {
  const session = nodeGraphScreenSoloSession();
  const items = nodeGraphScreenSoloItems();
  if (!items.length && !session.face) {
    document.body.classList.remove("node-screen-solo-active");
    return false;
  }
  nodeGraphMvp.screenSoloNodeId = "";
  session.nodeId = "";
  session.fit = "";
  session.sourceWidth = 0;
  session.sourceHeight = 0;
  session.cols = 0;
  session.rows = 0;
  for (const item of items) {
    item.host?.classList.remove("node-screen-solo-host");
    nodeGraphScreenSoloRestoreItem(item);
  }
  session.items = [];
  session.face = null;
  session.host = null;
  session.parent = null;
  session.placeholder = null;
  nodeGraphScreenSoloClearFitClasses();
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    stage.replaceChildren();
    stage.hidden = true;
  }
  document.body.classList.remove("node-screen-solo-active");
  if (!options.silent) {
    for (const node of document.querySelectorAll(".dsp-node")) {
      if (typeof nodeGraphViewportCullWakePainters === "function") {
        nodeGraphViewportCullWakePainters(node);
      }
    }
    window.requestAnimationFrame(() => {
      nodeGraphScreenSoloRefreshPaint();
    });
  }
  return true;
}

function toggleNodeGraphSelectedScreensFullscreen() {
  if (nodeGraphScreenSoloIsActive()) {
    const session = nodeGraphScreenSoloSession();
    if (session.fit !== "fill") {
      applyNodeGraphScreenSoloFit("fill");
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp("Fullscreen stretched. F again exits.");
      }
      return true;
    }
    const ended = endNodeGraphScreenSolo();
    if (ended && typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Fullscreen off.");
    }
    return ended;
  }
  const ids = nodeGraphScreenSoloSelectedNodeIds();
  const started = beginNodeGraphScreenSoloGrid(ids);
  if (!started && typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      ids.length
        ? "No screens on the selected modules. Select LCD, RoundShape, EQ, scopes, keypad, … then press F."
        : "Select one or more modules with screens, then press F.",
    );
  } else if (started && typeof setNodeInteractionHelp === "function") {
    const n = nodeGraphScreenSoloItems().length;
    const fit = nodeGraphScreenSoloSession().fit;
    setNodeInteractionHelp(
      n === 1 && fit === "fill"
        ? "Fullscreen stretched. F again exits."
        : n === 1
          ? "Fullscreen, original ratio. F stretches, F again exits."
          : `Fullscreen ${n} screens, original ratio. F stretches, F again exits.`,
    );
  }
  return started;
}

function toggleNodeGraphScreenSolo(nodeId, face) {
  if (nodeGraphScreenSoloIsActive()) {
    return endNodeGraphScreenSolo();
  }
  if (nodeId) {
    return beginNodeGraphScreenSolo(nodeId, face);
  }
  return toggleNodeGraphSelectedScreensFullscreen();
}

function bindNodeGraphScreenSoloEvents() {
  if (document.documentElement.dataset.screenSoloBound === "true") {
    return;
  }
  document.documentElement.dataset.screenSoloBound = "true";
  ensureNodeGraphScreenSoloStage();
  window.addEventListener("resize", handleNodeGraphScreenSoloResize);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !nodeGraphScreenSoloIsActive()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    endNodeGraphScreenSolo();
  }, true);
}
