// Image Ghost face: Layout A, ports labeled under the picture. Paint in image-burn-display.js.

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
    if (typeof nodeGraphInstallDrawingFacePump === "function") {
      body._imageBurnOwnsClock = true;
      nodeGraphInstallDrawingFacePump(body, {
        rafKey: "_imageBurnRaf",
        forceKey: "_imageBurnForce",
        clockKey: "imageBurn",
        shouldAnimate: nodeGraphImageBurnShouldAnimate,
        paintOnCreate: true,
        paint(host) {
          if (typeof drawNodeGraphImageBurnFaceItem !== "function") {
            return;
          }
          const nodeId = host.dataset?.node || node;
          const slot = typeof nodeGraphModuleScopeState !== "undefined"
            ? nodeGraphModuleScopeState?.slots?.get?.(nodeId)
            : null;
          drawNodeGraphImageBurnFaceItem(null, {
            fromFaceLoop: true,
            screenElement: host,
            slot: slot || { nodeId, scopeElement: host, type },
          }, Math.max(1, window.devicePixelRatio || 1));
        },
      });
    }
  },
});

function nodeGraphImageBurnShouldAnimate(face) {
  if (typeof scopePaintIsVisualPaused === "function" && scopePaintIsVisualPaused()) {
    return false;
  }
  const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
  if (Number.isFinite(speed) && speed <= 0) {
    return false;
  }
  const nodeId = face?.dataset?.node || "";
  if (
    typeof nodeGraphModuleIsViewportAsleep === "function"
    && nodeGraphModuleIsViewportAsleep(face)
  ) {
    return false;
  }
  if (
    nodeId
    && typeof nodeGraphScreenSoloIsActive === "function"
    && nodeGraphScreenSoloIsActive()
    && typeof nodeGraphScreenSoloAllowsNode === "function"
    && !nodeGraphScreenSoloAllowsNode(nodeId)
  ) {
    return false;
  }
  return true;
}
