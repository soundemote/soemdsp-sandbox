// LED's UI (moved out of the shared node-graph-module-factories.js -- see
// node-graph-chromeless-module-registry.js for the pattern this and
// public/modules/stepGrid/step-grid-ui.js both follow).

function createNodeGraphLedFace(node, type) {
  // LayoutB center cell is a scope plate. Phosphor Dot stamps onto the
  // shared local-fallback canvas (same path as 0D Burn / Display → Phosphor Dot).
  const face = document.createElement("div");
  face.className = "node-led-face";
  face.classList.add("node-module-scope-window", "node-light-source");
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} LED`);
  return face;
}

registerNodeGraphChromelessModuleUi("led", {
  createBody: createNodeGraphLedFace,
  afterMount(article, body, node, type) {
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: node,
      scopeElement: body,
      type,
      viewDrag: false,
    });
  },
});
