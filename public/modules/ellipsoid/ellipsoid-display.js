// RoundShape face — cheap vector orbit (filter-curve family).
// Stroke samples the same math as the signal. Cursor is a vector circle
// on that stroke. KickEnvelope reuses this plate with a decaying spiral.

function createNodeGraphRoundShapeDisplay(nodeId, type = "ellipsoid") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-round-shape-display node-module-face";
  section.dataset.node = id;
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

function nodeGraphRoundShapeReadScopePort(nodeId, port) {
  if (typeof nodeGraphModuleScopeLatestOutputValue !== "function") {
    return Number.NaN;
  }
  const value = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, port, Number.NaN));
  return Number.isFinite(value) ? value : Number.NaN;
}

function nodeGraphRoundShapeLivePlaying() {
  if (typeof nodeGraphDisplaysFrozen === "function" && nodeGraphDisplaysFrozen()) {
    return false;
  }
  if (typeof nodeGraphMvp === "undefined" || !nodeGraphMvp?.live?.node) {
    return false;
  }
  const speed = Number(nodeGraphMvp.live.speedMultiplier);
  return !Number.isFinite(speed) || speed > 0;
}

/** Unit-orbit cursor from live oscillator phase (same math as the stroke). */
function nodeGraphRoundShapeLiveCursor(nodeId, node, section) {
  const shape = Math.max(0, Math.min(1, Number(nodeGraphRoundShapeLiveParam(node, "morph", 0)) || 0));
  let phase = nodeGraphRoundShapeReadScopePort(nodeId, "__Phase");
  if (!Number.isFinite(phase) && typeof nodeGraphMvp !== "undefined") {
    const stored = nodeGraphMvp?.live?.runtime?.phases?.get?.(nodeId);
    if (Number.isFinite(Number(stored))) {
      const offset = Number(nodeGraphRoundShapeLiveParam(node, "phase", 0)) || 0;
      phase = Number(stored) + offset;
    }
  }
  if (!Number.isFinite(phase) && nodeGraphRoundShapeLivePlaying()) {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const freq = Number(nodeGraphRoundShapeLiveParam(node, "frequency", 1)) || 0;
    const offset = Number(nodeGraphRoundShapeLiveParam(node, "phase", 0)) || 0;
    const speed = Number(nodeGraphMvp?.live?.speedMultiplier);
    const mul = Number.isFinite(speed) ? speed : 1;
    if (section && Number.isFinite(section._roundShapeClock)) {
      const dt = Math.max(0, Math.min(0.25, now - section._roundShapeClock));
      let next = (Number(section._roundShapePhase) || 0) + freq * dt * mul;
      next -= Math.floor(next);
      section._roundShapePhase = next;
      section._roundShapeClock = now;
      phase = next;
    } else {
      if (section) {
        section._roundShapeClock = now;
        section._roundShapePhase = offset;
      }
      phase = offset;
    }
  }
  if (!Number.isFinite(phase)) {
    return null;
  }
  phase -= Math.floor(phase);
  return nodeGraphRoundShapeEllipsoidPoint(phase, shape);
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
    backgroundPaint: String(face.backgroundPaint || face.background || face.backgroundColor || "#020609"),
    strokeColor: String(face.strokeColor || face.dot1Color || face.color || "rgba(120, 220, 200, 0.92)"),
    strokePaint: String(face.strokePaint || face.strokeColor || "rgba(120, 220, 200, 0.92)"),
    dotColor: String(face.dotColor || "#ffffff"),
    dotPaint: String(face.dotPaint || face.dotColor || "#ffffff"),
    lineThickness: Math.max(0.25, Number(face.lineThickness) || 2),
    dotThickness: Math.max(0.25, Number(face.dotThickness) || 5),
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

function nodeGraphRoundShapeEllipsoidOscPoint(phase01, node) {
  const phase = (Number(phase01) || 0) * Math.PI * 2;
  const params = {
    amplitude: nodeGraphRoundShapeLiveParam(node, "amplitude", 1),
    frequencyHz: 0,
    offsetX: nodeGraphRoundShapeLiveParam(node, "offsetX", 0),
    offsetY: nodeGraphRoundShapeLiveParam(node, "offsetY", 0),
    sampleRate: 44100,
    scaleX: nodeGraphRoundShapeLiveParam(node, "scaleX", 1),
    scaleY: nodeGraphRoundShapeLiveParam(node, "scaleY", 1),
    shapeX: nodeGraphRoundShapeLiveParam(node, "shapeX", 0),
    shapeY: nodeGraphRoundShapeLiveParam(node, "shapeY", 0),
  };
  if (typeof nodeGraphEllipsoidVectorSample === "function") {
    const v = nodeGraphEllipsoidVectorSample(phase, params);
    const x = Number(v.X);
    const y = Number(v.Y);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  }
  return { x: Math.cos(phase), y: Math.sin(phase) };
}

function nodeGraphRoundShapeEllipsoidPoint(phase, shape) {
  if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
    const v = nodeGraphEllipsoidSineToSquareVector(phase, {
      amplitude: 1,
      shape,
      frequencyHz: 0,
      sampleRate: 44100,
    });
    const x = Number(v["Bi X"]);
    const y = Number(v["Bi Y"]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  }
  const ang = phase * Math.PI * 2;
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

function drawNodeGraphRoundShapeDisplayInner(section) {
  const nodeId = section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-round-shape-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  const isKick = node.type === "kickEnvelope" || node.type === "sineKick";
  const isEllipsoidOsc = node.type === "ellipsoidOsc";
  let shape = Number(nodeGraphRoundShapeLiveParam(node, isKick ? "sharpness" : "morph", 0));
  if (isKick && !(shape > 0)) {
    const legacy = Number(nodeGraphRoundShapeLiveParam(node, "roundness", 0));
    if (legacy > 0) shape = legacy;
  }
  shape = Math.max(0, Math.min(1, Number.isFinite(shape) ? shape : 0));
  const low = Number(nodeGraphRoundShapeLiveParam(node, "low", 0));
  const high = Number(nodeGraphRoundShapeLiveParam(node, "high", 1));
  const look = nodeGraphRoundShapeFaceLook(node);
  const strokeColor = look.strokePaint || look.strokeColor;
  const plateBg = look.backgroundPaint || look.background;
  const dotColor = look.dotPaint || look.dotColor;
  const strokeW = look.lineThickness;
  const dotW = Number.isFinite(Number(look.dotThickness)) ? Number(look.dotThickness) : 5;
  const lineBlur = look.lineBlur;
  const pixelDensity = look.pixelDensity;
  let rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  let rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
    if (stage?.id === "nodeScreenSoloStage") {
      const cols = Math.max(1, Number(stage.style.getPropertyValue("--node-screen-solo-cols")) || 1);
      const rows = Math.max(1, Number(stage.style.getPropertyValue("--node-screen-solo-rows")) || 1);
      rawW = Math.max(rawW, Math.floor((stage.clientWidth || window.innerWidth || 0) / cols));
      rawH = Math.max(rawH, Math.floor((stage.clientHeight || window.innerHeight || 0) / rows));
    }
  }
  const signature = [
    isKick ? "kick" : (isEllipsoidOsc ? "ellipsoidOsc" : "orbit"),
    shape.toFixed(4),
    low.toFixed(4),
    high.toFixed(4),
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "offsetX", 0).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "offsetY", 0).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "shapeX", 0).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "shapeY", 0).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "scaleX", 1).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "scaleY", 1).toFixed(4) : "",
    isEllipsoidOsc ? nodeGraphRoundShapeLiveParam(node, "amplitude", 1).toFixed(4) : "",
    strokeColor,
    plateBg,
    dotColor,
    strokeW.toFixed(2),
    dotW.toFixed(2),
    lineBlur.toFixed(2),
    pixelDensity.toFixed(3),
    Number(look.lineHue || 0).toFixed(1),
    Number(look.lineBrightness || 0).toFixed(3),
    Number(look.dotHue || 0).toFixed(1),
    Number(look.dotBrightness || 0).toFixed(3),
    Number(look.backgroundHue || 0).toFixed(1),
    Number(look.backgroundBrightness || 0).toFixed(3),
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");
  const livePlaying = nodeGraphRoundShapeLivePlaying();
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

  const orbitDirty = section._roundShapeOrbitSig !== signature
    || !section._roundShapeOrbitCanvas
    || section._roundShapeForceDraw;
  section._roundShapeSignature = signature;
  section._roundShapeForceDraw = false;
  section._roundShapeLaidOut = true;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // Drawable CSS box (buffer / transform), not section.client* — the
  // backing store can be up to ~1px short, which eats the +X square side.
  const drawW = Math.max(1, canvas.width / pixelRatio);
  const drawH = Math.max(1, canvas.height / pixelRatio);
  if (!orbitDirty) {
    context.drawImage(section._roundShapeOrbitCanvas, 0, 0, drawW, drawH);
  } else {
    context.clearRect(0, 0, drawW, drawH);
    context.fillStyle = plateBg;
    context.fillRect(0, 0, drawW, drawH);
  }

  const samples = 256;
  const strokeInset = strokeW * 0.5 + 1 / Math.max(pixelRatio, 1);
  const pad = Math.max(6, Math.min(drawW, drawH) * 0.08) + strokeInset;
  const innerW = Math.max(4, drawW - pad * 2);
  const innerH = Math.max(4, drawH - pad * 2);
  const cx = drawW * 0.5;
  const cy = drawH * 0.5;
  const half = Math.max(4, Math.min(drawW, drawH) * 0.5 - pad);
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

  if (orbitDirty) {
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
    } else if (isEllipsoidOsc) {
      const eps = 0.5 / samples;
      for (let i = 0; i < samples; i += 1) {
        let phase = i / samples + eps;
        phase -= Math.floor(phase);
        const pt = nodeGraphRoundShapeEllipsoidOscPoint(phase, node);
        const x = cx + pt.x * viewScale;
        const y = cy - pt.y * viewScale;
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
    } else if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
      // Phase 0/1 is the mid-point of the +X side at shape=1. Starting
      // and ending there drops that whole side (open path + clip). Walk
      // from just after the seam and close so the right edge is a join.
      const eps = 0.5 / samples;
      for (let i = 0; i < samples; i += 1) {
        let phase = i / samples + eps;
        phase -= Math.floor(phase);
        const pt = nodeGraphRoundShapeEllipsoidPoint(phase, shape);
        const x = cx + pt.x * viewScale;
        const y = cy - pt.y * viewScale;
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
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
    if (!section._roundShapeOrbitCanvas) {
      section._roundShapeOrbitCanvas = document.createElement("canvas");
    }
    const orbit = section._roundShapeOrbitCanvas;
    if (orbit.width !== canvas.width || orbit.height !== canvas.height) {
      orbit.width = canvas.width;
      orbit.height = canvas.height;
    }
    const orbitCtx = orbit.getContext("2d");
    if (orbitCtx) {
      orbitCtx.setTransform(1, 0, 0, 1, 0, 0);
      orbitCtx.clearRect(0, 0, orbit.width, orbit.height);
      orbitCtx.drawImage(canvas, 0, 0);
      section._roundShapeOrbitSig = signature;
    }
  }

  // Cursor: worklet live uses scope Bi X / Bi Y (no main-thread phases Map).
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
  } else if (isEllipsoidOsc) {
    const liveX = liveOut && Number.isFinite(Number(liveOut.X))
      ? Number(liveOut.X)
      : (typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "X", Number.NaN)
        : Number.NaN);
    const liveY = liveOut && Number.isFinite(Number(liveOut.Y))
      ? Number(liveOut.Y)
      : (typeof nodeGraphModuleScopeLatestOutputValue === "function"
        ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Y", Number.NaN)
        : Number.NaN);
    if (Number.isFinite(liveX) && Number.isFinite(liveY)) {
      px = cx + liveX * viewScale;
      py = cy - liveY * viewScale;
    } else {
      const start = nodeGraphRoundShapeEllipsoidOscPoint(0, node);
      px = cx + start.x * viewScale;
      py = cy - start.y * viewScale;
    }
  } else {
    const cursor = nodeGraphRoundShapeLiveCursor(nodeId, node, section);
    if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
      px = cx + cursor.x * viewScale;
      py = cy - cursor.y * viewScale;
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
    context.arc(px, py, Math.max(0.5, dotW * 0.5), 0, Math.PI * 2);
    context.fill();
  }
  if (livePlaying) {
    scheduleNodeGraphRoundShapePlayhead(section);
  }
}

function nodeGraphRoundShapeScopeFps() {
  if (typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function") {
    return normalizeNodeGraphModuleScopeFramesPerSecond(
      nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60,
    );
  }
  const n = Math.round(Number(nodeGraphMvp?.moduleScopeFramesPerSecond) || 60);
  return Number.isFinite(n) ? Math.max(0, Math.min(240, n)) : 60;
}

function scheduleNodeGraphRoundShapePlayhead(section) {
  if (!section || section._roundShapePlayheadRaf) {
    return;
  }
  if (!nodeGraphRoundShapeLivePlaying()) {
    return;
  }
  const nodeId = section.dataset?.node || "";
  if (typeof nodeGraphModuleIsViewportAsleep === "function"
    && nodeGraphModuleIsViewportAsleep(section)) {
    return;
  }
  if (typeof nodeGraphScreenSoloIsActive === "function"
    && nodeGraphScreenSoloIsActive()
    && typeof nodeGraphScreenSoloAllowsNode === "function"
    && !nodeGraphScreenSoloAllowsNode(nodeId)) {
    return;
  }
  section._roundShapePlayheadRaf = requestAnimationFrame(() => {
    section._roundShapePlayheadRaf = 0;
    drawNodeGraphRoundShapeDisplay(section);
  });
}

function drawNodeGraphRoundShapeDisplays() {
  document.querySelectorAll(".node-round-shape-display").forEach(drawNodeGraphRoundShapeDisplay);
}
