// Shape face: canvas in the LayoutB cell; paint path is rgb-shape-display.js.
// Simulation-FPS vector redraw (same family as RoundShape / BasicShape).

function createNodeGraphRgbShapeBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-rgb-shape-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.dataset.parameterVisual = "true";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} shape`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-rgb-shape-canvas";
  canvas.setAttribute("aria-hidden", "true");
  face.append(canvas);

  const paint = (el) => {
    const target = el.querySelector?.(".node-rgb-shape-canvas");
    if (target && typeof paintNodeGraphRgbShapeFace === "function") {
      try {
        paintNodeGraphRgbShapeFace(target, el, el.dataset?.node || "", null);
      } catch (error) {
        console.warn("[rgb-shape] draw failed", el.dataset?.node, error);
      }
    }
    el._rgbShapeForceDraw = false;
  };

  nodeGraphInstallDrawingFacePump(face, {
    rafKey: "_rgbShapeRaf",
    forceKey: "_rgbShapeForceDraw",
    clockKey: (el) => `rgbShape:${el.dataset?.node || ""}`,
    paint,
    onResize: (el) => { el._rgbShapeLaidOut = false; },
    paintOnCreate: false,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      face._rgbShapeForceDraw = true;
      paint(face);
      face._startFaceLoop?.();
    });
  });
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
    body?.syncFromParameters?.();
  },
});
