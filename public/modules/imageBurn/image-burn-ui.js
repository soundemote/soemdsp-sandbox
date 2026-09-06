// Image Ghost face: LayoutB cell + canvas; paint in image-burn-display.js.

function createNodeGraphImageBurnBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-image-burn-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} image ghost`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-image-burn-canvas";
  canvas.setAttribute("aria-hidden", "true");
  face.append(canvas);
  return face;
}

registerNodeGraphChromelessModuleUi("imageBurn", {
  createBody: createNodeGraphImageBurnBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
        viewDrag: false,
      });
    }
    // Cold paint so the face is not an empty square before the first buffer.
    const paint = () => {
      const slot = typeof nodeGraphModuleScopeState !== "undefined"
        ? nodeGraphModuleScopeState?.slots?.get?.(node)
        : null;
      if (typeof drawNodeGraphImageBurnFaceItem === "function") {
        drawNodeGraphImageBurnFaceItem(null, {
          buffer: null,
          screenElement: body,
          slot: slot || { nodeId: node, scopeElement: body, type },
        }, Math.max(1, window.devicePixelRatio || 1));
      }
    };
    requestAnimationFrame(paint);
    requestAnimationFrame(() => requestAnimationFrame(paint));
  },
});
