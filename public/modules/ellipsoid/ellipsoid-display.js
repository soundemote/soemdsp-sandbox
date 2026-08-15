// RoundShape face — cheap vector orbit (filter-curve family).
// Stroke samples the same math as the signal. Cursor is a vector circle
// on that stroke. KickEnvelope reuses this plate with a decaying spiral.

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

function nodeGraphRoundShapeFaceLook(node) {
  if (typeof normalizeNodeGraphRoundShapeFaceSettings === "function") {
    return normalizeNodeGraphRoundShapeFaceSettings(node?.traceDisplaySettings);
  }
  const face = node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  return {
    background: String(face.background || face.backgroundColor || "#020609"),
    strokeColor: String(face.strokeColor || face.dot1Color || face.color || "rgba(120, 220, 200, 0.92)"),
    dotColor: String(face.dotColor || "#ffffff"),
    lineThickness: Math.max(0.25, Number(face.lineThickness) || 2),
    lineBlur: Math.max(0, Number(face.lineBlur) || 0),
    pixelDensity: Number.isFinite(Number(face.pixelDensity)) ? Number(face.pixelDensity) : 1,
  };
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

function nodeGraphRoundShapeEllipsoidPoint(phase, shape) {
  if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
    const v = nodeGraphEllipsoidSineToSquareVector(phase, {
      amplitude: 1,
      shape,
      frequencyHz: 0,
      sampleRate: 44100,
    });
    return {
      x: Number(v["Bi X"]) || 0,
      y: Number(v["Bi Y"]) || 0,
    };
  }
  const ang = phase * Math.PI * 2;
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

function drawNodeGraphRoundShapeDisplayInner(section) {
  const nodeId = section?.dataset?.node || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-round-shape-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  const isKick = node.type === "kickEnvelope" || node.type === "sineKick";
  let shape = Number(nodeGraphRoundShapeLiveParam(node, isKick ? "sharpness" : "shape", 0));
  if (isKick && !(shape > 0)) {
    const legacy = Number(nodeGraphRoundShapeLiveParam(node, "roundness", 0));
    if (legacy > 0) shape = legacy;
  }
  shape = Math.max(0, Math.min(1, Number.isFinite(shape) ? shape : 0));
  const low = Number(nodeGraphRoundShapeLiveParam(node, "low", 0));
  const high = Number(nodeGraphRoundShapeLiveParam(node, "high", 1));
  const look = nodeGraphRoundShapeFaceLook(node);
  const strokeColor = look.strokeColor;
  const plateBg = look.background;
  const dotColor = look.dotColor;
  const strokeW = look.lineThickness;
  const lineBlur = look.lineBlur;
  const pixelDensity = look.pixelDensity;
  const rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  const rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  const signature = [
    isKick ? "kick" : "orbit",
    shape.toFixed(4),
    low.toFixed(4),
    high.toFixed(4),
    strokeColor,
    plateBg,
    dotColor,
    strokeW.toFixed(2),
    lineBlur.toFixed(2),
    pixelDensity.toFixed(3),
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");
  const livePlaying = typeof nodeGraphMvp !== "undefined"
    && nodeGraphMvp?.live?.node
    && Number(nodeGraphMvp.live.speedMultiplier) > 0;
  if (
    !livePlaying
    && section._roundShapeSignature === signature
    && !section._roundShapeForceDraw
    && section._roundShapeLaidOut === true
  ) {
    return;
  }
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
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas, { pixelDensity });
    if (!metrics) {
      return;
    }
    context = metrics.context;
    width = metrics.cssWidth;
    height = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const density = Math.max(0, Math.min(1, Number(pixelDensity) || 1));
    pixelRatio = dpr * Math.max(density, 1e-6);
    width = Math.max(1, Math.floor(rawW));
    height = Math.max(1, Math.floor(rawH));
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context = canvas.getContext("2d");
    if (!context) {
      return;
    }
  }
  if (!(width >= 8) || !(height >= 8) || !context) {
    return;
  }

  section._roundShapeSignature = signature;
  section._roundShapeForceDraw = false;
  section._roundShapeLaidOut = true;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = plateBg;
  context.fillRect(0, 0, width, height);

  const samples = 256;
  const pad = Math.max(6, Math.min(width, height) * 0.08) + strokeW;
  const innerW = Math.max(4, width - pad * 2);
  const innerH = Math.max(4, height - pad * 2);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const half = Math.max(4, Math.min(width, height) * 0.5 - pad);
  const viewScale = half;
  // Kick envelope: always a square plate (largest inscribed), so the
  // bottom-left quarter stays circular when the module is resized.
  const kickSide = Math.max(4, Math.min(innerW, innerH));
  const kickOx = pad + (innerW - kickSide) * 0.5;
  const kickOy = pad + (innerH - kickSide) * 0.5;

  const kickToFace = (qx, qy) => ({
    x: kickOx + (Number(qx) + 1) * kickSide,
    y: kickOy + (-Number(qy)) * kickSide,
  });

  context.beginPath();
  if (isKick) {
    const quarter = typeof nodeGraphKickEnvelopeQuarterPoint === "function"
      ? nodeGraphKickEnvelopeQuarterPoint
      : (u) => {
        const th = Math.PI + u * Math.PI * 0.5;
        return { x: Math.cos(th), y: Math.sin(th) };
      };
    for (let i = 0; i <= samples; i += 1) {
      const pt = quarter(i / samples, shape);
      const p = kickToFace(pt.x, pt.y);
      if (i === 0) {
        context.moveTo(p.x, p.y);
      } else {
        context.lineTo(p.x, p.y);
      }
    }
  } else if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
    for (let i = 0; i <= samples; i += 1) {
      const pt = nodeGraphRoundShapeEllipsoidPoint(i / samples, shape);
      const x = cx + pt.x * viewScale;
      const y = cy - pt.y * viewScale;
      if (i === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
  } else {
    context.arc(cx, cy, half * 0.85, 0, Math.PI * 2);
  }

  if (typeof nodeGraphStrokePathWithLineBlur === "function") {
    nodeGraphStrokePathWithLineBlur(context, {
      strokeStyle: strokeColor,
      lineWidth: strokeW,
      lineBlur,
      lineJoin: "round",
      lineCap: "round",
    });
  } else {
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeW;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  // Cursor: same math as the stroke (unit amplitude / live kick X Y).
  let px = null;
  let py = null;
  const liveOut = typeof nodeGraphMvp !== "undefined"
    ? nodeGraphMvp?.live?.runtime?.nodeOutputs?.get?.(nodeId)
    : null;
  if (isKick) {
    const liveA = liveOut && Number.isFinite(Number(liveOut.A))
      ? Number(liveOut.A)
      : (typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "A", Number.NaN)
        : Number.NaN);
    const liveU = liveOut && Number.isFinite(Number(liveOut.U))
      ? Number(liveOut.U)
      : Number.NaN;
    if (Number.isFinite(liveU) && typeof nodeGraphKickEnvelopeQuarterPoint === "function") {
      const pt = nodeGraphKickEnvelopeQuarterPoint(liveU, shape);
      const p = kickToFace(pt.x, pt.y);
      px = p.x;
      py = p.y;
    } else if (Number.isFinite(liveA) && typeof nodeGraphKickEnvelopePointForA === "function") {
      const pt = nodeGraphKickEnvelopePointForA(liveA, low, high, shape);
      const p = kickToFace(pt.x, pt.y);
      px = p.x;
      py = p.y;
    } else if (liveOut && Number.isFinite(Number(liveOut.X)) && Number.isFinite(Number(liveOut.Y))) {
      const p = kickToFace(liveOut.X, liveOut.Y);
      px = p.x;
      py = p.y;
    } else {
      const rest = typeof nodeGraphKickEnvelopeQuarterPoint === "function"
        ? nodeGraphKickEnvelopeQuarterPoint(1, shape)
        : { x: 0, y: -1 };
      const p = kickToFace(rest.x, rest.y);
      px = p.x;
      py = p.y;
    }
  } else {
    let phase = null;
    if (typeof nodeGraphMvp !== "undefined") {
      const stored = nodeGraphMvp?.live?.runtime?.phases?.get?.(nodeId);
      if (Number.isFinite(Number(stored))) {
        phase = Number(stored);
      }
    }
    if (Number.isFinite(phase)) {
      const offset = Number(nodeGraphRoundShapeLiveParam(node, "phase", 0)) || 0;
      let samplePhase = phase + offset;
      samplePhase -= Math.floor(samplePhase);
      const pt = nodeGraphRoundShapeEllipsoidPoint(samplePhase, shape);
      px = cx + pt.x * viewScale;
      py = cy - pt.y * viewScale;
    } else if (liveOut && typeof liveOut === "object") {
      const amp = Math.max(1e-9, Math.abs(Number(nodeGraphRoundShapeLiveParam(node, "amplitude", 1)) || 1));
      const bx = Number(liveOut["Bi X"]);
      const by = Number(liveOut["Bi Y"]);
      if (Number.isFinite(bx) && Number.isFinite(by)) {
        px = cx + (bx / amp) * viewScale;
        py = cy - (by / amp) * viewScale;
      }
    }
  }
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    if (isKick) {
      const rest = typeof nodeGraphKickEnvelopeQuarterPoint === "function"
        ? nodeGraphKickEnvelopeQuarterPoint(1, shape)
        : { x: 0, y: -1 };
      const p = kickToFace(rest.x, rest.y);
      px = p.x;
      py = p.y;
    } else {
      const start = nodeGraphRoundShapeEllipsoidPoint(0, shape);
      px = cx + start.x * viewScale;
      py = cy - start.y * viewScale;
    }
  }
  if (Number.isFinite(px) && Number.isFinite(py)) {
    context.beginPath();
    context.fillStyle = dotColor;
    context.arc(px, py, Math.max(2.5, strokeW * 1.15), 0, Math.PI * 2);
    context.fill();
  }
  if (livePlaying && !section._roundShapePlayheadRaf) {
    section._roundShapePlayheadRaf = requestAnimationFrame(() => {
      section._roundShapePlayheadRaf = 0;
      section._roundShapeForceDraw = true;
      drawNodeGraphRoundShapeDisplay(section);
    });
  }
}

function drawNodeGraphRoundShapeDisplays() {
  document.querySelectorAll(".node-round-shape-display").forEach(drawNodeGraphRoundShapeDisplay);
}
