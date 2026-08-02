// Picture face: canvas in LayoutB cell; paint + file load in rgb-picture-display.js.

function createNodeGraphRgbPictureBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-rgb-picture-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} picture`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-rgb-picture-canvas";
  canvas.setAttribute("aria-hidden", "true");
  face.append(canvas);
  return face;
}

registerNodeGraphChromelessModuleUi("rgbPicture", {
  createBody: createNodeGraphRgbPictureBody,
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
      if (typeof paintNodeGraphRgbPictureFaceForNode === "function") {
        paintNodeGraphRgbPictureFaceForNode(node);
      }
    };
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
