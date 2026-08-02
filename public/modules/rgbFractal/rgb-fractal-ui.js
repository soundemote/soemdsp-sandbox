// Soft Fractal face + rAF evolution (WebGL paints full-face each tick; CPU fallback throttles).

function createNodeGraphRgbFractalBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-rgb-fractal-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "1";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} soft fractal`);

  const canvas = document.createElement("canvas");
  canvas.className = "node-rgb-fractal-canvas";
  canvas.setAttribute("aria-hidden", "true");
  face.append(canvas);
  return face;
}

function nodeGraphRgbFractalStopLoop(face) {
  if (!face) {
    return;
  }
  if (face._rgbFractalRaf) {
    cancelAnimationFrame(face._rgbFractalRaf);
    face._rgbFractalRaf = 0;
  }
  face._rgbFractalRunning = false;
}

function nodeGraphRgbFractalStartLoop(face, nodeId) {
  if (!face || face._rgbFractalRunning) {
    return;
  }
  face._rgbFractalRunning = true;
  if (typeof nodeGraphRgbFractalEnsurePhasors === "function") {
    nodeGraphRgbFractalEnsurePhasors(face);
  } else {
    if (!Number.isFinite(face._rgbFractalOrbitPhasor)) {
      face._rgbFractalOrbitPhasor = Number(face._rgbFractalPhase) || 0;
    }
    if (!Number.isFinite(face._rgbFractalFlowPhasor)) face._rgbFractalFlowPhasor = 0;
    if (!Number.isFinite(face._rgbFractalWarpPhasor)) face._rgbFractalWarpPhasor = 0;
    if (!Number.isFinite(face._rgbFractalRotationPhasor)) {
      face._rgbFractalRotationPhasor = (Number(face._rgbFractalFlowPhasor) || 0) * 0.85;
    }
    if (!Number.isFinite(face._rgbFractalColorPhasor)) {
      face._rgbFractalColorPhasor = (Number(face._rgbFractalOrbitPhasor) || 0) * 0.14;
    }
    face._rgbFractalPhase = face._rgbFractalOrbitPhasor;
  }
  face._rgbFractalLastTs = 0;
  face._rgbFractalPendingDt = 0;

  const tick = (ts) => {
    if (!face.isConnected) {
      nodeGraphRgbFractalStopLoop(face);
      return;
    }
    const last = face._rgbFractalLastTs || ts;
    let dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    // Tab resume / first frame: do not dump a large phase step.
    if (!face._rgbFractalLastTs) {
      dt = 0;
    }
    face._rgbFractalLastTs = ts;
    if (typeof paintNodeGraphRgbFractalFaceForNode === "function") {
      paintNodeGraphRgbFractalFaceForNode(nodeId, { dt, face });
    }
    face._rgbFractalRaf = requestAnimationFrame(tick);
  };
  face._rgbFractalRaf = requestAnimationFrame(tick);
}

registerNodeGraphChromelessModuleUi("rgbFractal", {
  createBody: createNodeGraphRgbFractalBody,
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
      if (typeof paintNodeGraphRgbFractalFaceForNode === "function") {
        // force: still frame while paused (seed/warp scrub) or immediate param response.
        paintNodeGraphRgbFractalFaceForNode(node, { face: body, dt: 0, force: true });
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
    // Teardown: tick exits on !face.isConnected (no document-wide MutationObserver).
    nodeGraphRgbFractalStartLoop(body, node);
    repaint();
    requestAnimationFrame(repaint);
  },
});
