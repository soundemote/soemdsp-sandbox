// Coup de grâce: double-click a module screen to give it the whole view.
// Other screens stop painting. Escape or another double-click restores.

const NODE_GRAPH_SCREEN_SOLO_FACE_SEL = [
  ".node-module-scope-window",
  ".node-filter-curve-display",
  ".node-phosphor-waveform-display",
  ".node-wall-room-display",
].join(", ");

const NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL = [
  ".node-module-graph-display",
  ".node-knob-face",
  ".node-keypad-face",
  ".node-xy-pad",
  ".node-text-box-body",
  ".node-text-box-input",
  ".node-phosphillator-draw-display",
  ".node-slider-readout",
  "input",
  "textarea",
  "select",
  "button",
].join(", ");

function nodeGraphScreenSoloNodeId() {
  return String(nodeGraphMvp?.screenSoloNodeId || "");
}

function nodeGraphScreenSoloIsActive() {
  return Boolean(nodeGraphScreenSoloNodeId());
}

function nodeGraphScreenSoloAllowsNode(nodeId) {
  const solo = nodeGraphScreenSoloNodeId();
  if (!solo) {
    return true;
  }
  return String(nodeId || "") === solo;
}

function nodeGraphScreenSoloAllowsClock(clockKey) {
  const solo = nodeGraphScreenSoloNodeId();
  if (!solo) {
    return true;
  }
  const key = String(clockKey || "");
  const colon = key.indexOf(":");
  if (colon >= 0) {
    return key.slice(colon + 1) === solo;
  }
  if (!key || key === "__default") {
    return true;
  }
  const type = typeof nodeGraphPatchNode === "function"
    ? String(nodeGraphPatchNode(solo)?.type || "")
    : "";
  if (key === "rasterRgb") {
    return type === "rasterRgb";
  }
  if (key === "asciiscope") {
    return type === "asciiscope";
  }
  if (key === "matrixDisplay") {
    return type === "matrixDisplay" || type === "matrixWaterfall";
  }
  return key === type;
}

function nodeGraphScreenSoloFaceFromEvent(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return null;
  }
  if (target.closest(NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL)) {
    return null;
  }
  return target.closest(NODE_GRAPH_SCREEN_SOLO_FACE_SEL);
}

function ensureNodeGraphScreenSoloVeil() {
  let veil = document.getElementById("nodeScreenSoloVeil");
  if (veil) {
    return veil;
  }
  veil = document.createElement("div");
  veil.id = "nodeScreenSoloVeil";
  veil.className = "node-screen-solo-veil";
  veil.hidden = true;
  veil.setAttribute("aria-hidden", "true");
  document.body.append(veil);
  return veil;
}

function nodeGraphScreenSoloRefreshPaint() {
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  if (typeof scheduleNodeGraphRasterRgbPump === "function") {
    scheduleNodeGraphRasterRgbPump();
  }
}

function beginNodeGraphScreenSolo(nodeId, face) {
  const id = String(nodeId || "");
  const screen = face instanceof Element
    ? face
    : document.querySelector(`.dsp-node[data-node="${id}"] ${NODE_GRAPH_SCREEN_SOLO_FACE_SEL}`);
  if (!id || !screen) {
    return false;
  }
  if (nodeGraphScreenSoloNodeId() === id && screen.classList.contains("node-screen-solo-face")) {
    return true;
  }
  endNodeGraphScreenSolo({ silent: true });
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.screenSoloNodeId = id;
  }
  const host = screen.closest(".dsp-node");
  document.body.classList.add("node-screen-solo-active");
  host?.classList.add("node-screen-solo-host");
  screen.classList.add("node-screen-solo-face");
  const veil = ensureNodeGraphScreenSoloVeil();
  veil.hidden = false;
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (node.dataset?.node === id) {
      continue;
    }
    if (typeof nodeGraphViewportCullSleepPainters === "function") {
      nodeGraphViewportCullSleepPainters(node);
    }
  }
  nodeGraphScreenSoloRefreshPaint();
  return true;
}

function endNodeGraphScreenSolo(options = {}) {
  const keepId = nodeGraphScreenSoloNodeId();
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.screenSoloNodeId = "";
  }
  document.body.classList.remove("node-screen-solo-active");
  document.querySelectorAll(".node-screen-solo-host").forEach((el) => {
    el.classList.remove("node-screen-solo-host");
  });
  document.querySelectorAll(".node-screen-solo-face").forEach((el) => {
    el.classList.remove("node-screen-solo-face");
  });
  const veil = document.getElementById("nodeScreenSoloVeil");
  if (veil) {
    veil.hidden = true;
  }
  if (!options.silent) {
    for (const node of document.querySelectorAll(".dsp-node:not(.viewport-asleep)")) {
      if (typeof nodeGraphViewportCullWakePainters === "function") {
        nodeGraphViewportCullWakePainters(node);
      }
    }
    nodeGraphScreenSoloRefreshPaint();
  }
  return Boolean(keepId);
}

function toggleNodeGraphScreenSolo(nodeId, face) {
  const id = String(nodeId || "");
  if (!id) {
    return false;
  }
  if (nodeGraphScreenSoloNodeId() === id) {
    return endNodeGraphScreenSolo();
  }
  return beginNodeGraphScreenSolo(id, face);
}

function handleNodeGraphScreenSoloDoubleClick(event) {
  const face = nodeGraphScreenSoloFaceFromEvent(event);
  if (!face) {
    return false;
  }
  const nodeId = face.dataset?.node || face.closest(".dsp-node")?.dataset?.node || "";
  if (!nodeId) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  toggleNodeGraphScreenSolo(nodeId, face);
  return true;
}

function bindNodeGraphScreenSoloEvents() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace || workspace.dataset.screenSoloBound === "true") {
    return;
  }
  workspace.dataset.screenSoloBound = "true";
  workspace.addEventListener("dblclick", handleNodeGraphScreenSoloDoubleClick, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !nodeGraphScreenSoloIsActive()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    endNodeGraphScreenSolo();
  }, true);
}
