// FBM Field face body + rAF evolution loop.

function createNodeGraphFbmFieldBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-fbm-field-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} FBM field`);
  face.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;background:#05060a;";

  const canvas = document.createElement("canvas");
  canvas.className = "node-fbm-field-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%;";
  face.append(canvas);
  return face;
}

function nodeGraphFbmFieldStopLoop(face) {
  if (!face) {
    return;
  }
  if (face._fbmFieldRaf) {
    cancelAnimationFrame(face._fbmFieldRaf);
    face._fbmFieldRaf = 0;
  }
  face._fbmFieldRunning = false;
}

function nodeGraphFbmFieldStartLoop(face, nodeId) {
  if (!face || face._fbmFieldRunning) {
    return;
  }
  face._fbmFieldRunning = true;
  if (!Number.isFinite(face._fbmFieldTime)) {
    face._fbmFieldTime = 0;
  }
  face._fbmFieldLastTs = 0;

  const tick = (ts) => {
    if (!face.isConnected) {
      nodeGraphFbmFieldStopLoop(face);
      return;
    }
    const last = face._fbmFieldLastTs || ts;
    let dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    // Tab resume / first frame: do not dump a large phase step.
    if (!face._fbmFieldLastTs) {
      dt = 0;
    }
    face._fbmFieldLastTs = ts;
    // paint handles: black when circuit off; freeze when Evolve=0 / engine pause.
    if (typeof paintNodeGraphFbmFieldFaceForNode === "function") {
      paintNodeGraphFbmFieldFaceForNode(nodeId, { dt, face });
    }
    face._fbmFieldRaf = requestAnimationFrame(tick);
  };
  face._fbmFieldRaf = requestAnimationFrame(tick);
}

registerNodeGraphChromelessModuleUi("fbmField", {
  createBody: createNodeGraphFbmFieldBody,
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
      if (typeof paintNodeGraphFbmFieldFaceForNode === "function") {
        paintNodeGraphFbmFieldFaceForNode(node, { face: body, dt: 0, force: true });
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
    nodeGraphFbmFieldStartLoop(body, node);
    repaint();
    requestAnimationFrame(repaint);
  },
});
