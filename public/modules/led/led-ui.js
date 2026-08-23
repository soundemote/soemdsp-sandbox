// LED face — Vector Dot paints the local fallback canvas on this cell.

function createNodeGraphLedFace(node, type) {
  const root = document.createElement("div");
  root.className = "node-led-face";
  root.dataset.node = node;
  root.dataset.nodeType = type;
  root.dataset.lightSource = "screen";
  root.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} LED`);
  return root;
}

registerNodeGraphChromelessModuleUi("led", {
  createBody: createNodeGraphLedFace,
  afterMount(article, body, node, type) {
    const face = body?.classList?.contains("node-led-face")
      ? body
      : (body?.querySelector?.(".node-led-face") || body);
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: node,
      scopeElement: face,
      type,
      viewDrag: false,
    });
  },
});
