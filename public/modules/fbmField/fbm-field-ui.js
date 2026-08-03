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

  // Probe reticles (X/Y/Z sample points) — positions synced in display paint.
  const overlay = document.createElement("div");
  overlay.className = "node-fbm-field-probe-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "overflow:hidden",
    "z-index:2",
  ].join(";");
  for (const key of ["X", "Y", "Z"]) {
    const mark = document.createElement("div");
    mark.className = "node-fbm-field-probe-mark";
    mark.dataset.probe = key;
    mark.style.cssText = [
      "position:absolute",
      "width:0",
      "height:0",
      "transform:translate(-50%,-50%)",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "font:600 9px/1 ui-monospace,Consolas,monospace",
      "letter-spacing:0",
      "user-select:none",
    ].join(";");
    const ring = document.createElement("span");
    ring.className = "node-fbm-field-probe-ring";
    ring.style.cssText = [
      "display:block",
      "width:9px",
      "height:9px",
      "border:1.5px solid rgba(255,255,255,0.92)",
      "border-radius:50%",
      "box-shadow:0 0 0 1px rgba(0,0,0,0.75),0 0 4px rgba(0,0,0,0.5)",
      "background:rgba(0,0,0,0.15)",
    ].join(";");
    const label = document.createElement("span");
    label.className = "node-fbm-field-probe-label";
    label.textContent = key;
    label.style.cssText = [
      "position:absolute",
      "left:11px",
      "top:50%",
      "transform:translateY(-50%)",
      "color:#fff",
      "text-shadow:0 0 2px #000,0 1px 2px #000",
      "font-size:9px",
      "line-height:1",
    ].join(";");
    mark.append(ring, label);
    overlay.append(mark);
  }
  face.append(overlay);
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
