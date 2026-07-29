// Ray Bouncer solid-module face: the 2D phosphor scope surface is the center
// custom UI. Scope registration uses the same slot contract as LED/Number Readout.

function createNodeGraphRayBouncerBody(node, type) {
  // Prefer the shared scope section factory so display modes / settings / burn
  // stay identical to the classic traceDisplay shell — only chrome changes.
  if (typeof createNodeGraphModuleScopeSection === "function") {
    const section = createNodeGraphModuleScopeSection(node, type);
    section.classList.add("node-ray-bouncer-face", "node-solid-module-custom-ui");
    return section;
  }
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-ray-bouncer-face";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} ray bouncer`);
  return face;
}

registerNodeGraphChromelessModuleUi("rayBouncer", {
  createBody: createNodeGraphRayBouncerBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
      });
    }
  },
});
