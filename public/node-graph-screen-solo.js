// Coup de grâce: double-click a module screen to give it the whole view.
// Cycle: 1) fit, unskewed  2) stretch to fill  3) restore the patch.
// Escape always restores. Other screens stop painting while solo.
// The live face is reparented onto a body-level stage so CSS zoom/transform
// on the modular surface cannot trap it under the black veil.

const NODE_GRAPH_SCREEN_SOLO_FACE_SEL = [
  ".node-module-scope-window",
  ".node-filter-curve-display",
  ".node-phosphor-waveform-display",
  ".node-wall-room-display",
  ".node-asciiscope-face",
  ".node-matrix-display-face",
  ".node-fbm-field-face",
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

const NODE_GRAPH_SCREEN_SOLO_DBL_MS = 400;
const NODE_GRAPH_SCREEN_SOLO_DBL_PX = 10;

let nodeGraphScreenSoloLastPointer = { t: 0, x: 0, y: 0 };
let nodeGraphScreenSoloToggleAt = 0;

function nodeGraphScreenSoloSession() {
  if (!nodeGraphMvp.screenSolo) {
    nodeGraphMvp.screenSolo = {
      face: null,
      host: null,
      nodeId: "",
      parent: null,
      placeholder: null,
      fit: "",
      sourceWidth: 0,
      sourceHeight: 0,
    };
  }
  return nodeGraphMvp.screenSolo;
}

function nodeGraphScreenSoloNodeId() {
  return String(nodeGraphMvp?.screenSolo?.nodeId || nodeGraphMvp?.screenSoloNodeId || "");
}

function nodeGraphScreenSoloIsActive() {
  return Boolean(nodeGraphScreenSoloNodeId());
}

function nodeGraphScreenSoloLiveFace() {
  return nodeGraphScreenSoloSession().face || null;
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
  const session = nodeGraphScreenSoloSession();
  if (session.face && (el === session.face || session.face.contains(el))) {
    return String(session.nodeId || "");
  }
  return "";
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

function nodeGraphScreenSoloFaceIsBlocked(face) {
  if (!(face instanceof Element)) {
    return true;
  }
  if (face.matches(NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL)) {
    return true;
  }
  return Boolean(face.closest(NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL));
}

function nodeGraphScreenSoloFaceFromEvent(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return null;
  }
  if (target.closest(NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL)) {
    return null;
  }
  const face = target.closest(NODE_GRAPH_SCREEN_SOLO_FACE_SEL);
  if (!face || nodeGraphScreenSoloFaceIsBlocked(face)) {
    return null;
  }
  return face;
}

function nodeGraphScreenSoloFaceFromPoint(x, y) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return null;
  }
  const hit = document.elementFromPoint(px, py);
  if (hit instanceof Element) {
    if (!hit.closest(NODE_GRAPH_SCREEN_SOLO_BLOCK_SEL)) {
      const direct = hit.closest(NODE_GRAPH_SCREEN_SOLO_FACE_SEL);
      if (direct && !nodeGraphScreenSoloFaceIsBlocked(direct)) {
        return direct;
      }
    }
    const module = hit.closest(".dsp-node");
    if (module) {
      for (const face of module.querySelectorAll(NODE_GRAPH_SCREEN_SOLO_FACE_SEL)) {
        if (nodeGraphScreenSoloFaceIsBlocked(face)) {
          continue;
        }
        const box = face.getBoundingClientRect();
        if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) {
          return face;
        }
      }
    }
  }
  const session = nodeGraphScreenSoloSession();
  if (session.face) {
    const box = session.face.getBoundingClientRect();
    if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) {
      return session.face;
    }
  }
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage && !stage.hidden) {
    const box = stage.getBoundingClientRect();
    if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) {
      return session.face || stage;
    }
  }
  return null;
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
  stage.setAttribute("aria-label", "Maximized screen. Double-click to stretch, again to restore, or press Escape.");
  document.body.append(stage);
  return stage;
}

function nodeGraphScreenSoloRefreshPaint() {
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  if (typeof scheduleNodeGraphRasterRgbPump === "function") {
    scheduleNodeGraphRasterRgbPump();
  }
  const face = nodeGraphScreenSoloLiveFace();
  const nodeId = nodeGraphScreenSoloNodeId();
  if (face && nodeId && typeof nodeGraphFbmFieldStartLoop === "function"
    && face.classList.contains("node-fbm-field-face")) {
    nodeGraphFbmFieldStartLoop(face, nodeId);
  }
}

function nodeGraphScreenSoloClearFitClasses() {
  document.body.classList.remove("node-screen-solo-fit-contain", "node-screen-solo-fit-fill");
  const stage = document.getElementById("nodeScreenSoloStage");
  if (stage) {
    stage.removeAttribute("data-fit");
    stage.style.removeProperty("--node-screen-solo-w");
    stage.style.removeProperty("--node-screen-solo-h");
  }
}

function applyNodeGraphScreenSoloFit(mode) {
  const fit = mode === "fill" ? "fill" : "contain";
  const session = nodeGraphScreenSoloSession();
  const face = session.face;
  const stage = ensureNodeGraphScreenSoloStage();
  session.fit = fit;
  document.body.classList.toggle("node-screen-solo-fit-contain", fit === "contain");
  document.body.classList.toggle("node-screen-solo-fit-fill", fit === "fill");
  stage.setAttribute("data-fit", fit);
  face?.setAttribute("data-solo-fit", fit);
  if (fit === "contain") {
    const vw = Math.max(1, stage.clientWidth || window.innerWidth || 1);
    const vh = Math.max(1, stage.clientHeight || window.innerHeight || 1);
    const srcW = Math.max(1, Number(session.sourceWidth) || 1);
    const srcH = Math.max(1, Number(session.sourceHeight) || 1);
    const scale = Math.min(vw / srcW, vh / srcH);
    stage.style.setProperty("--node-screen-solo-w", `${Math.max(1, Math.round(srcW * scale))}px`);
    stage.style.setProperty("--node-screen-solo-h", `${Math.max(1, Math.round(srcH * scale))}px`);
    stage.setAttribute("aria-label", "Maximized screen, original ratio. Double-click to stretch, or press Escape.");
  } else {
    stage.style.removeProperty("--node-screen-solo-w");
    stage.style.removeProperty("--node-screen-solo-h");
    stage.setAttribute("aria-label", "Maximized screen, stretched. Double-click or press Escape to restore.");
  }
  window.requestAnimationFrame(() => {
    nodeGraphScreenSoloRefreshPaint();
  });
}

function handleNodeGraphScreenSoloResize() {
  if (!nodeGraphScreenSoloIsActive()) {
    return;
  }
  if (nodeGraphScreenSoloSession().fit === "contain") {
    applyNodeGraphScreenSoloFit("contain");
  }
}

function nodeGraphScreenSoloRestoreFace(session) {
  const face = session?.face;
  const parent = session?.parent;
  const placeholder = session?.placeholder;
  if (!face) {
    return;
  }
  face.classList.remove("node-screen-solo-face");
  face.removeAttribute("data-solo-fit");
  if (placeholder?.parentNode) {
    placeholder.replaceWith(face);
  } else if (parent?.isConnected) {
    parent.append(face);
  }
  if (placeholder?.isConnected) {
    placeholder.remove();
  }
  session.face = null;
  session.parent = null;
  session.placeholder = null;
}

function beginNodeGraphScreenSolo(nodeId, face) {
  const id = String(nodeId || "");
  const screen = face instanceof Element
    ? face
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(id)}"] ${NODE_GRAPH_SCREEN_SOLO_FACE_SEL}`);
  if (!id || !screen) {
    return false;
  }
  const session = nodeGraphScreenSoloSession();
  if (session.nodeId === id && session.face === screen) {
    return true;
  }
  endNodeGraphScreenSolo({ silent: true });
  const host = screen.closest(".dsp-node");
  const parent = screen.parentNode;
  if (!parent) {
    return false;
  }
  const sourceBox = screen.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "node-screen-solo-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  parent.insertBefore(placeholder, screen);
  const stage = ensureNodeGraphScreenSoloStage();
  session.nodeId = id;
  session.face = screen;
  session.host = host;
  session.parent = parent;
  session.placeholder = placeholder;
  session.sourceWidth = Math.max(1, sourceBox.width || screen.clientWidth || 1);
  session.sourceHeight = Math.max(1, sourceBox.height || screen.clientHeight || 1);
  nodeGraphMvp.screenSoloNodeId = id;
  if (!screen.dataset.node) {
    screen.dataset.node = id;
  }
  document.body.classList.add("node-screen-solo-active");
  host?.classList.add("node-screen-solo-host");
  screen.classList.add("node-screen-solo-face");
  stage.hidden = false;
  stage.append(screen);
  applyNodeGraphScreenSoloFit("contain");
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (node.dataset?.node === id) {
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

function endNodeGraphScreenSolo(options = {}) {
  const session = nodeGraphScreenSoloSession();
  const keepId = session.nodeId;
  if (!keepId && !session.face) {
    document.body.classList.remove("node-screen-solo-active");
    return false;
  }
  nodeGraphMvp.screenSoloNodeId = "";
  session.nodeId = "";
  session.fit = "";
  session.sourceWidth = 0;
  session.sourceHeight = 0;
  session.host?.classList.remove("node-screen-solo-host");
  session.host = null;
  nodeGraphScreenSoloRestoreFace(session);
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
  return Boolean(keepId);
}

function toggleNodeGraphScreenSolo(nodeId, face) {
  const id = String(nodeId || "");
  if (nodeGraphScreenSoloIsActive()) {
    if (nodeGraphScreenSoloSession().fit !== "fill") {
      applyNodeGraphScreenSoloFit("fill");
      return true;
    }
    return endNodeGraphScreenSolo();
  }
  if (!id) {
    return false;
  }
  return beginNodeGraphScreenSolo(id, face);
}

function nodeGraphScreenSoloMarkToggled() {
  nodeGraphScreenSoloToggleAt = performance.now();
  nodeGraphScreenSoloLastPointer.t = 0;
}

function nodeGraphScreenSoloRecentlyToggled() {
  // One physical double-click must advance exactly one step. Native dblclick
  // plus our pointer pair both fire; ignore the extra for a full click interval.
  return (performance.now() - nodeGraphScreenSoloToggleAt) < 400;
}

function nodeGraphScreenSoloConsumeGesture(event) {
  if (!event) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function nodeGraphScreenSoloApplyFromGesture(event, faceHint) {
  if (nodeGraphScreenSoloRecentlyToggled()) {
    nodeGraphScreenSoloConsumeGesture(event);
    return true;
  }
  if (nodeGraphScreenSoloIsActive()) {
    nodeGraphScreenSoloConsumeGesture(event);
    if (nodeGraphScreenSoloSession().fit !== "fill") {
      applyNodeGraphScreenSoloFit("fill");
    } else {
      endNodeGraphScreenSolo();
    }
    nodeGraphScreenSoloMarkToggled();
    return true;
  }
  const face = faceHint instanceof Element
    ? faceHint
    : (nodeGraphScreenSoloFaceFromPoint(event.clientX, event.clientY)
      || nodeGraphScreenSoloFaceFromEvent(event));
  if (!face || face.id === "nodeScreenSoloStage") {
    return false;
  }
  const nodeId = nodeGraphDisplayNodeIdFromElement(face)
    || face.closest(".dsp-node")?.dataset?.node
    || "";
  if (!nodeId) {
    return false;
  }
  nodeGraphScreenSoloConsumeGesture(event);
  beginNodeGraphScreenSolo(nodeId, face);
  nodeGraphScreenSoloMarkToggled();
  return true;
}

function handleNodeGraphScreenSoloPointerDown(event) {
  if (event.button !== 0) {
    return false;
  }
  if (nodeGraphScreenSoloRecentlyToggled()) {
    return false;
  }
  const now = performance.now();
  const dt = now - nodeGraphScreenSoloLastPointer.t;
  const dist = Math.hypot(
    event.clientX - nodeGraphScreenSoloLastPointer.x,
    event.clientY - nodeGraphScreenSoloLastPointer.y,
  );
  const isDouble = dt > 0 && dt <= NODE_GRAPH_SCREEN_SOLO_DBL_MS && dist <= NODE_GRAPH_SCREEN_SOLO_DBL_PX;
  nodeGraphScreenSoloLastPointer = { t: now, x: event.clientX, y: event.clientY };
  if (!isDouble) {
    return false;
  }
  const face = nodeGraphScreenSoloIsActive()
    ? nodeGraphScreenSoloLiveFace()
    : (nodeGraphScreenSoloFaceFromPoint(event.clientX, event.clientY)
      || nodeGraphScreenSoloFaceFromEvent(event));
  if (!nodeGraphScreenSoloIsActive() && !face) {
    return false;
  }
  return nodeGraphScreenSoloApplyFromGesture(event, face);
}

function handleNodeGraphScreenSoloDoubleClick(event) {
  if (event.button != null && event.button !== 0) {
    return false;
  }
  // Native dblclick is a second event for the same gesture as the pointer pair.
  // Only swallow it after a step, or use it as a fallback if the pair missed.
  return nodeGraphScreenSoloApplyFromGesture(event);
}

function bindNodeGraphScreenSoloEvents() {
  if (document.documentElement.dataset.screenSoloBound === "true") {
    return;
  }
  document.documentElement.dataset.screenSoloBound = "true";
  ensureNodeGraphScreenSoloStage();
  document.addEventListener("pointerdown", handleNodeGraphScreenSoloPointerDown, true);
  document.addEventListener("dblclick", handleNodeGraphScreenSoloDoubleClick, true);
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
