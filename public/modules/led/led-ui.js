// LED's UI (moved out of the shared node-graph-module-factories.js -- see
// node-graph-chromeless-module-registry.js for the pattern this and
// public/modules/stepGrid/step-grid-ui.js both follow).

function createNodeGraphLedFace(node, type) {
  // Stack: bottom decoration → lit lamp plate → top decoration.
  // The root fills the LayoutB cell; the lamp is sized by fillPercent.
  const root = document.createElement("div");
  root.className = "node-led-face";
  root.dataset.node = node;
  root.dataset.nodeType = type;
  root.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} LED`);

  const bottom = document.createElement("img");
  bottom.className = "node-led-image-layer node-led-image-bottom";
  bottom.dataset.ledImage = "bottom";
  bottom.alt = "";
  bottom.draggable = false;
  bottom.hidden = true;

  const lamp = document.createElement("div");
  lamp.className = "node-led-lamp node-light-source";
  lamp.dataset.lightSource = "screen";
  lamp.setAttribute("aria-hidden", "true");

  const top = document.createElement("img");
  top.className = "node-led-image-layer node-led-image-top";
  top.dataset.ledImage = "top";
  top.alt = "";
  top.draggable = false;
  top.hidden = true;

  root.append(bottom, lamp, top);
  return root;
}

registerNodeGraphChromelessModuleUi("led", {
  createBody: createNodeGraphLedFace,
  // LED's light-up visual is driven through the module-scope monitoring
  // system, not a per-sample DSP dispatch entry -- this is the one bit of
  // LED-specific setup beyond "create the body" that the generic chromeless
  // rendering dispatch (node-graph-module-rendering.js) can't do for it.
  afterMount(article, body, node, type) {
    // Scope slot must target the lit lamp plate (not the whole stack).
    const face = body?.classList?.contains("node-led-face")
      ? body
      : (body?.querySelector?.(".node-led-face") || body);
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: node,
      scopeElement: face,
      type,
      viewDrag: false,
    });
    // Apply rounding / corner shape / fill / images with engine on or off.
    if (typeof scheduleNodeGraphLedFaceRefresh === "function") {
      scheduleNodeGraphLedFaceRefresh(node);
    } else if (typeof refreshNodeGraphLedFaceForNode === "function") {
      refreshNodeGraphLedFaceForNode(node);
      requestAnimationFrame(() => refreshNodeGraphLedFaceForNode(node));
    }
  },
});
