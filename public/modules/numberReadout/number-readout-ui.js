// Value LED / Value LCD solid-module face: the scope surface IS the module center.
// Draw path (DSEG + Trail/Ghost residual) lives in node-graph-module-scope-number-readout.js.

function createNodeGraphNumberReadoutBody(node, type) {
  const face = document.createElement("div");
  const isLcd = type === "valueLcd";
  face.className = [
    "node-module-scope-window",
    "node-number-readout-face",
    isLcd ? "node-value-lcd-face" : "node-value-led-face",
    isLcd ? "" : "node-light-source",
  ].filter(Boolean).join(" ");
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.valueFaceStyle = isLcd ? "lcd" : "led";
  if (!isLcd) {
    face.dataset.lightSource = "screen";
  }
  const label = typeof nodeGraphNodeDisplayName === "function"
    ? nodeGraphNodeDisplayName(node)
    : String(node || "value");
  face.setAttribute("aria-label", `${label} ${isLcd ? "value LCD" : "value LED"}`);
  return face;
}

function mountNodeGraphNumberReadoutFace(article, body, node, type) {
  if (typeof registerNodeGraphModuleScopeSlot === "function") {
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: node,
      scopeElement: body,
      type,
      viewDrag: false,
    });
  }
}

registerNodeGraphChromelessModuleUi("numberReadout", {
  createBody: createNodeGraphNumberReadoutBody,
  afterMount: mountNodeGraphNumberReadoutFace,
});

registerNodeGraphChromelessModuleUi("valueLcd", {
  createBody: createNodeGraphNumberReadoutBody,
  afterMount: mountNodeGraphNumberReadoutFace,
});
