// Shape face: canvas in the LayoutB cell; paint path is rgb-shape-display.js.

function createNodeGraphRgbShapeBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-rgb-shape-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} shape`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-rgb-shape-canvas";
  canvas.setAttribute("aria-hidden", "true");
  face.append(canvas);
  return face;
}

registerNodeGraphChromelessModuleUi("rgbShape", {
  createBody: createNodeGraphRgbShapeBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
        viewDrag: false,
      });
    }
    const repaint = () => {
      if (typeof paintNodeGraphRgbShapeFaceForNode === "function") {
        paintNodeGraphRgbShapeFaceForNode(node);
      }
    };
    // Live param drags (engine off or on) — face is not audio-only.
    article.addEventListener("input", (event) => {
      if (event.target?.dataset?.param) {
        repaint();
      }
    });
    article.addEventListener("change", (event) => {
      if (event.target?.dataset?.param) {
        repaint();
      }
    });
    repaint();
    requestAnimationFrame(repaint);
  },
});
