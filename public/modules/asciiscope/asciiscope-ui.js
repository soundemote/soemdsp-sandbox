// Matrix Waterfall + Matrix Display face UI (full-bleed canvas).
// Settings (glyphs / message / gradient) live in right-click Display Settings.

function matrixCreateFaceShell(node, options = {}) {
  const {
    type = "matrixDisplay",
    kind = "plate", // "waterfall" | "plate"
    label = "Matrix",
    faceClass = "node-matrix-face",
    stageClass = "node-matrix-stage",
    canvasClass = "node-matrix-canvas",
  } = options;

  const face = document.createElement("div");
  face.className = `${faceClass} node-asciiscope-face`;
  if (kind === "waterfall") {
    face.classList.add("node-matrix-waterfall-face");
  } else {
    face.classList.add("node-matrix-plate-face");
  }
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.matrixKind = kind;
  face.setAttribute("aria-label", label);
  face.title = "Right-click for Display Settings";

  const stage = document.createElement("div");
  stage.className = `${stageClass} node-asciiscope-stage node-light-source`;
  stage.dataset.lightSource = "screen";

  const canvas = document.createElement("canvas");
  canvas.className = `${canvasClass} node-asciiscope-canvas`;
  canvas.dataset.lightSource = "screen";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  stage.append(canvas);
  face.append(stage);

  face.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof setNodeGraphSelection === "function") {
      setNodeGraphSelection({ type: "node", id: node });
    }
    if (typeof nodeGraphMvp !== "undefined") {
      nodeGraphMvp.sceneContextTargetNode = node;
      nodeGraphMvp.lastModuleActionTargetNode = node;
      nodeGraphMvp.scopeContextTargetNode = node;
    }
    if (typeof openNodeGraphTraceDisplaySettings === "function") {
      openNodeGraphTraceDisplaySettings(node, event);
    }
  });

  if (typeof asciiscopeStartPump === "function") {
    asciiscopeStartPump();
  }
  return face;
}

/** Matrix Waterfall — parameter-only rain face. */
function createNodeGraphMatrixWaterfallFace(node) {
  return matrixCreateFaceShell(node, {
    type: "matrixWaterfall",
    kind: "waterfall",
    label: "Matrix Waterfall",
  });
}

/** Matrix Display — Info / Serial plate face. */
function createNodeGraphMatrixPlateFace(node) {
  return matrixCreateFaceShell(node, {
    type: "matrixDisplay",
    kind: "plate",
    label: "Matrix Display",
  });
}

// Historical name (layout "asciiscope" used to create rain). Prefer plate now.
function createNodeGraphAsciiscopeFace(node) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
  if (patchNode?.type === "matrixWaterfall") {
    return createNodeGraphMatrixWaterfallFace(node);
  }
  return createNodeGraphMatrixPlateFace(node);
}

function commitNodeGraphMatrixDisplayField(nodeId, field, text) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("matrixDisplay")
    && !nodeGraphScriptReadyForGraphAction("matrixWaterfall")
    && !nodeGraphScriptReadyForGraphAction("asciiscope")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((c) => c.id === nodeId);
  if (!patchNode) return false;

  if (patchNode.type === "matrixWaterfall") {
    const prev = typeof normalizeNodeGraphMatrixWaterfall === "function"
      ? normalizeNodeGraphMatrixWaterfall(patchNode.matrixWaterfall || patchNode.matrixDisplay)
      : { glyphTable: matrixDefaultGlyphTable() };
    const next = { ...prev };
    if (field === "glyphTable") next.glyphTable = text;
    patchNode.matrixWaterfall = typeof normalizeNodeGraphMatrixWaterfall === "function"
      ? normalizeNodeGraphMatrixWaterfall(next)
      : next;
    commitNodeGraphPatch(patch, { status: "Matrix Waterfall glyphs", record: true });
    return true;
  }

  const prev = typeof normalizeNodeGraphMatrixPlate === "function"
    ? normalizeNodeGraphMatrixPlate(patchNode.matrixDisplay)
    : { message: MATRIX_DEFAULT_MESSAGE };
  const next = { ...prev };
  if (field === "message") next.message = text;
  else if (field === "glyphTable") next.message = text;
  patchNode.matrixDisplay = typeof normalizeNodeGraphMatrixPlate === "function"
    ? normalizeNodeGraphMatrixPlate(next)
    : next;
  commitNodeGraphPatch(patch, { status: "Matrix Display message", record: true });
  return true;
}

function commitNodeGraphAsciiscopeGlyphTable(nodeId, tableText) {
  return commitNodeGraphMatrixDisplayField(nodeId, "glyphTable", tableText);
}
