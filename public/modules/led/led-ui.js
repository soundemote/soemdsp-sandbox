// LED's UI (moved out of the shared node-graph-module-factories.js -- see
// node-graph-chromeless-module-registry.js for the pattern this and
// public/modules/stepGrid/step-grid-ui.js both follow).

function createNodeGraphLedFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-led-face";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} LED`);
  return face;
}

registerNodeGraphChromelessModuleUi("led", {
  createBody: createNodeGraphLedFace,
  // LED's light-up visual is driven through the module-scope monitoring
  // system, not a per-sample DSP dispatch entry -- this is the one bit of
  // LED-specific setup beyond "create the body" that the generic chromeless
  // rendering dispatch (node-graph-module-rendering.js) can't do for it.
  afterMount(article, body, node, type) {
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: node,
      scopeElement: body,
      type,
      viewDrag: false,
    });
  },
});
