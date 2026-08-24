// LCD Dot face — Vector Dot stamp on a Value-LCD plate (drawNodeGraphVectorDotItem).

function createNodeGraphLcdDotBody(node, type) {
  const face = typeof createNodeGraphModuleScopeSection === "function"
    ? createNodeGraphModuleScopeSection(node, type)
    : document.createElement("div");
  if (!face.classList.contains("node-module-scope-window")) {
    face.className = "node-module-scope-window node-module-face node-light-source";
    face.dataset.node = node;
    face.dataset.nodeType = type;
    face.dataset.lightSource = "screen";
    const surface = document.createElement("div");
    surface.className = "node-module-scope-window-surface";
    face.append(surface);
  }
  face.classList.add("node-lcd-dot-face", "node-value-lcd-face");
  face.dataset.nodeType = type || "lcdDot";
  face.dataset.valueFaceStyle = "lcd";
  if (typeof nodeGraphNumberReadoutApplyLcdLightCutout === "function") {
    nodeGraphNumberReadoutApplyLcdLightCutout(face);
  } else {
    face.dataset.lightStrength = String(2 / 3);
  }
  const label = typeof nodeGraphNodeDisplayName === "function"
    ? nodeGraphNodeDisplayName(node)
    : String(node || "lcdDot");
  face.setAttribute("aria-label", `${label} LCD Dot`);
  return face;
}

function mountNodeGraphLcdDotFace(article, body, node, type) {
  if (typeof registerNodeGraphModuleScopeSlot !== "function") {
    return;
  }
  const face = body?.classList?.contains("node-module-scope-window")
    ? body
    : (body?.querySelector?.(".node-module-scope-window") || body);
  registerNodeGraphModuleScopeSlot(article, {
    nodeId: node,
    scopeElement: face,
    type: type || "lcdDot",
    viewDrag: false,
  });
}

registerNodeGraphChromelessModuleUi("lcdDot", {
  createBody: createNodeGraphLcdDotBody,
  afterMount: mountNodeGraphLcdDotFace,
});
