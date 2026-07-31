// Number Readout solid-module face: the scope surface IS the module center.
// Draw path (DSEG + residual) stays in node-graph-module-scopes.js via the
// registered scope slot — same contract as LED's afterMount.

function createNodeGraphNumberReadoutBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-number-readout-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} number readout`);
  return face;
}

registerNodeGraphChromelessModuleUi("numberReadout", {
  createBody: createNodeGraphNumberReadoutBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
        viewDrag: false,
      });
    }
  },
});
