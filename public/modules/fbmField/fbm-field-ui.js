// FBM Field Layout B body + rAF. Face paints WASM field grid (not XY scope).

function createNodeGraphFbmFieldBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-fbm-field-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "0";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} FBM field`);
  face.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;background:#000000;";

  const canvas = document.createElement("canvas");
  canvas.className = "node-fbm-field-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%;";
  face.append(canvas);
  return face;
}

function nodeGraphFbmFieldStopLoop(face) {
  if (!face) return;
  if (face._fbmFieldRaf) {
    cancelAnimationFrame(face._fbmFieldRaf);
    face._fbmFieldRaf = 0;
  }
  face._fbmFieldRunning = false;
}

function nodeGraphFbmFieldStartLoop(face, nodeId) {
  if (!face || face._fbmFieldRunning) return;
  // Never spin the face while the engine is fully stopped.
  if (typeof nodeGraphFbmFieldCircuitRunning === "function" && !nodeGraphFbmFieldCircuitRunning()) {
    return;
  }
  face._fbmFieldRunning = true;
  if (!Number.isFinite(face._fbmFieldTime)) face._fbmFieldTime = 0;
  face._fbmFieldLastTs = 0;

  const tick = (ts) => {
    if (!face.isConnected) {
      nodeGraphFbmFieldStopLoop(face);
      return;
    }
    // Engine went off mid-loop — black + halt (paint also stops the loop).
    if (typeof nodeGraphFbmFieldCircuitRunning === "function" && !nodeGraphFbmFieldCircuitRunning()) {
      if (typeof paintNodeGraphFbmFieldFaceForNode === "function") {
        paintNodeGraphFbmFieldFaceForNode(nodeId, { dt: 0, face, force: true });
      }
      nodeGraphFbmFieldStopLoop(face);
      return;
    }
    const last = face._fbmFieldLastTs || ts;
    let dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    if (!face._fbmFieldLastTs) dt = 0;
    face._fbmFieldLastTs = ts;
    if (typeof paintNodeGraphFbmFieldFaceForNode === "function") {
      paintNodeGraphFbmFieldFaceForNode(nodeId, { dt, face });
    }
    // paint may have stopped the loop (engine off); only reschedule if still live.
    if (face._fbmFieldRunning) {
      face._fbmFieldRaf = requestAnimationFrame(tick);
    }
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
      // Param scrub only while live (and while paused/frozen holds last frame).
      // When stopped, keep the screen black — no idle field preview.
      if (event.target?.dataset?.param) repaint();
    });
    article.addEventListener("change", (event) => {
      if (event.target?.dataset?.param) repaint();
    });
    if (typeof nodeGraphFbmFieldLoadWasm === "function") {
      nodeGraphFbmFieldLoadWasm();
    }
    // Cold mount with engine stopped: plate black, do not start rAF.
    // When engine starts, syncNodeGraphFbmFieldFacesToLiveState() starts loops.
    const circuitOn = typeof nodeGraphFbmFieldCircuitRunning === "function"
      ? nodeGraphFbmFieldCircuitRunning()
      : false;
    if (circuitOn) {
      nodeGraphFbmFieldStartLoop(body, node);
    } else {
      nodeGraphFbmFieldStopLoop(body);
      const canvas = body.querySelector?.(".node-fbm-field-canvas");
      if (canvas && typeof nodeGraphFbmFieldFillBlack === "function") {
        nodeGraphFbmFieldFillBlack(canvas, body);
      }
    }
    repaint();
    requestAnimationFrame(repaint);
  },
});
