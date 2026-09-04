// Fractal Brownian Field Layout B body + rAF. Face paints WASM field grid.

function createNodeGraphFbmFieldBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-fbm-field-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "0";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} Fractal Brownian Field`);
  face.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;background:#000000;";

  const canvas = document.createElement("canvas");
  canvas.className = "node-fbm-field-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%;";
  face.append(canvas);

  // Debug-only probe overlay (X/Y/Z sample points + motion-mode annotation).
  // Hidden via body.keyboard-debug-hidden .node-debug-only
  const overlay = document.createElement("div");
  overlay.className = "node-fbm-field-probe-overlay node-debug-only";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "overflow:hidden",
    "z-index:2",
  ].join(";");

  const modeTag = document.createElement("div");
  modeTag.className = "node-fbm-field-debug-mode-tag";
  modeTag.style.cssText = [
    "position:absolute",
    "left:4px",
    "top:3px",
    "padding:1px 4px",
    "border-radius:2px",
    "font:600 8px/1.2 ui-monospace,Consolas,monospace",
    "letter-spacing:0.04em",
    "color:rgba(255,255,255,0.9)",
    "background:rgba(0,0,0,0.55)",
    "border:1px solid rgba(255,255,255,0.25)",
    "text-shadow:0 1px 1px #000",
    "display:none",
  ].join(";");
  overlay.append(modeTag);

  // Volume-mode: triangle linking the three probes (same Z-slice)
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.classList.add("node-fbm-field-probe-svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;display:none;";
  const tri = document.createElementNS(svgNs, "polygon");
  tri.classList.add("node-fbm-field-volume-tri");
  tri.setAttribute("fill", "rgba(255,200,80,0.06)");
  tri.setAttribute("stroke", "rgba(255,200,80,0.45)");
  tri.setAttribute("stroke-width", "1");
  tri.setAttribute("stroke-dasharray", "3 2");
  tri.setAttribute("points", "");
  svg.append(tri);
  overlay.append(svg);

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
      "box-sizing:border-box",
    ].join(";");
    // Volume-only outer halo (depth / same-slice cue)
    const halo = document.createElement("span");
    halo.className = "node-fbm-field-probe-halo";
    halo.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:50%",
      "width:15px",
      "height:15px",
      "margin:-7.5px 0 0 -7.5px",
      "border:1px solid rgba(255,200,80,0.55)",
      "border-radius:50%",
      "box-sizing:border-box",
      "display:none",
      "pointer-events:none",
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
    mark.append(halo, ring, label);
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
    if (face.closest?.(".viewport-asleep")) {
      nodeGraphFbmFieldStopLoop(face);
      return;
    }
    if (typeof nodeGraphScreenSoloAllowsNode === "function" && !nodeGraphScreenSoloAllowsNode(nodeId)) {
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
    // Paint on the shared Simulation FPS clock. Do not defer to the compositor
    // alone — compositor early-outs (fps-gate wait, trace-unchanged, etc.) left
    // FBM faces blank while this loop only rAF-spun.
    const frameReady = typeof nodeGraphSimFpsShouldPaint === "function"
      ? nodeGraphSimFpsShouldPaint(`fbmField:${nodeId}`, false)
      : (typeof nodeGraphDisplayFrameReady === "function"
        ? nodeGraphDisplayFrameReady(`fbmField:${nodeId}`)
        : true);
    if (frameReady) {
      const last = face._fbmFieldLastTs || ts;
      let dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      if (!face._fbmFieldLastTs) dt = 0;
      face._fbmFieldLastTs = ts;
      if (typeof paintNodeGraphFbmFieldFaceForNode === "function") {
        paintNodeGraphFbmFieldFaceForNode(nodeId, { dt, face });
      }
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
    article.addEventListener("nodegraphviewport", (event) => {
      if (event.detail?.asleep) {
        nodeGraphFbmFieldStopLoop(body);
        return;
      }
      const circuitOn = typeof nodeGraphFbmFieldCircuitRunning === "function"
        ? nodeGraphFbmFieldCircuitRunning()
        : false;
      if (circuitOn) {
        nodeGraphFbmFieldStartLoop(body, node);
      }
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
