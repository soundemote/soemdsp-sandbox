// RoundShape face — cheapest static representation of sine→square X/Y orbit.
// Not phosphor / not residual / not WebGL. Same family as unanimated filter curves:
// black plate + 2px green stroke, redrawn only when shape (or layout) changes.
// No title text; amplitude does not affect face size.

function createNodeGraphRoundShapeDisplay(nodeId, type = "ellipsoid") {
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-round-shape-display";
  section.dataset.node = String(nodeId || "");
  section.dataset.nodeType = String(type || "ellipsoid");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.66";
  section.syncFromParameters = () => {
    section._roundShapeForceDraw = true;
    drawNodeGraphRoundShapeDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-round-shape-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.66";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._roundShapeForceDraw = true;
      section._roundShapeLaidOut = false;
      drawNodeGraphRoundShapeDisplay(section);
    });
    ro.observe(section);
    section._roundShapeResizeObserver = ro;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => drawNodeGraphRoundShapeDisplay(section));
  });
  return section;
}

function nodeGraphRoundShapeLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function drawNodeGraphRoundShapeDisplay(section) {
  try {
    drawNodeGraphRoundShapeDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[round-shape] draw failed", detail, error);
    if (section) {
      section._roundShapeForceDraw = true;
      section._roundShapeLaidOut = false;
    }
  }
}

function drawNodeGraphRoundShapeDisplayInner(section) {
  const nodeId = section?.dataset?.node || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-round-shape-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  // Preview uses shape only — amplitude must not change orbit size on the face.
  const shape = Math.max(0, Math.min(1,
    Number(nodeGraphRoundShapeLiveParam(node, "shape", 0)) || 0,
  ));
  const signature = shape.toFixed(4);
  if (
    section._roundShapeSignature === signature
    && !section._roundShapeForceDraw
    && section._roundShapeLaidOut === true
  ) {
    return;
  }

  const rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  const rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  if (rawW < 8 || rawH < 8) {
    section._roundShapeLaidOut = false;
    section._roundShapeForceDraw = true;
    if (!section._roundShapeRetryFrame) {
      section._roundShapeRetryFrame = requestAnimationFrame(() => {
        section._roundShapeRetryFrame = 0;
        drawNodeGraphRoundShapeDisplay(section);
      });
    }
    return;
  }

  let context;
  let width;
  let height;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
    if (!metrics) {
      return;
    }
    context = metrics.context;
    width = metrics.cssWidth;
    height = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = Math.max(1, Math.floor(rawW));
    height = Math.max(1, Math.floor(rawH));
    canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(height * pixelRatio));
    context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  if (!(width >= 8) || !(height >= 8) || !context) {
    return;
  }

  section._roundShapeSignature = signature;
  section._roundShapeForceDraw = false;
  section._roundShapeLaidOut = true;

  // Black plate (same cheap language as filter curves).
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#020609";
  context.fillRect(0, 0, width, height);

  // Sample closed Bi X / Bi Y orbit — fixed sample count, no live audio.
  // frequencyHz 0 → no Limit-AA floor so shape 0 stays circular on the face.
  // Amplitude is ignored: face size is fixed to the plate (unit amplitude only).
  const samples = 96;
  const sampleRate = 44100;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const pad = Math.max(6, Math.min(width, height) * 0.12);
  const half = Math.max(4, Math.min(width, height) * 0.5 - pad);
  const viewScale = half;

  context.beginPath();
  let started = false;
  if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
    for (let i = 0; i <= samples; i += 1) {
      const phase = i / samples;
      const v = nodeGraphEllipsoidSineToSquareVector(phase, {
        amplitude: 1,
        shape,
        frequencyHz: 0,
        sampleRate,
      });
      const x = cx + (Number(v["Bi X"]) || 0) * viewScale;
      const y = cy - (Number(v["Bi Y"]) || 0) * viewScale;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
  } else {
    // Fallback circle if math not loaded.
    context.arc(cx, cy, half * 0.85, 0, Math.PI * 2);
  }

  // Fixed 2 CSS-px stroke (less jagged than 1px hairline on DPR canvases).
  context.strokeStyle = "rgba(120, 220, 200, 0.92)";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

function drawNodeGraphRoundShapeDisplays() {
  document.querySelectorAll(".node-round-shape-display").forEach(drawNodeGraphRoundShapeDisplay);
}
