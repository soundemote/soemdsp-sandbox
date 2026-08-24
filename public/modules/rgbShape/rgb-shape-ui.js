// Shape face: canvas in the LayoutB cell; paint path is rgb-shape-display.js.
// Frame-rate vector redraw (same idea as RoundShape / BasicShape).

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

  face.syncFromParameters = () => {
    face._rgbShapeForceDraw = true;
    drawNodeGraphRgbShapeFaceLoop(face);
  };

  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      face._rgbShapeForceDraw = true;
      face._rgbShapeLaidOut = false;
      drawNodeGraphRgbShapeFaceLoop(face);
    });
    ro.observe(face);
    face._rgbShapeResizeObserver = ro;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => drawNodeGraphRgbShapeFaceLoop(face));
  });
  return face;
}

function drawNodeGraphRgbShapeFaceLoop(face) {
  if (!face?.isConnected) {
    face._rgbShapeRaf = 0;
    return;
  }
  const nodeId = face.dataset?.node || "";
  if (typeof nodeGraphModuleIsViewportAsleep === "function"
    && nodeGraphModuleIsViewportAsleep(face)) {
    face._rgbShapeRaf = requestAnimationFrame(() => {
      face._rgbShapeRaf = 0;
      drawNodeGraphRgbShapeFaceLoop(face);
    });
    return;
  }
  if (typeof nodeGraphScreenSoloIsActive === "function"
    && nodeGraphScreenSoloIsActive()
    && typeof nodeGraphScreenSoloAllowsNode === "function"
    && !nodeGraphScreenSoloAllowsNode(nodeId)) {
    face._rgbShapeRaf = requestAnimationFrame(() => {
      face._rgbShapeRaf = 0;
      drawNodeGraphRgbShapeFaceLoop(face);
    });
    return;
  }

  const canvas = face.querySelector?.(".node-rgb-shape-canvas");
  if (canvas && typeof paintNodeGraphRgbShapeFace === "function") {
    try {
      paintNodeGraphRgbShapeFace(canvas, face, nodeId, null);
    } catch (error) {
      console.warn("[rgb-shape] draw failed", nodeId, error);
    }
  }

  face._rgbShapeRaf = requestAnimationFrame(() => {
    face._rgbShapeRaf = 0;
    drawNodeGraphRgbShapeFaceLoop(face);
  });
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
