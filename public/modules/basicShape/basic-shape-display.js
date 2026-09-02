// BasicShape face — cheap 1D one-cycle of the selected wave + phase dot.
// Same family as RoundShape (frame-rate paint, no engine-rate ring).

function createNodeGraphBasicShapeDisplay(nodeId, type = "basicShape") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-basic-shape-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "basicShape");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.66";
  section.syncFromParameters = () => {
    section._basicShapeForceDraw = true;
    drawNodeGraphBasicShapeDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-basic-shape-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.66";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._basicShapeForceDraw = true;
      section._basicShapeLaidOut = false;
      drawNodeGraphBasicShapeDisplay(section);
    });
    ro.observe(section);
    section._basicShapeResizeObserver = ro;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => drawNodeGraphBasicShapeDisplay(section));
  });
  return section;
}

function nodeGraphBasicShapeLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphBasicShapeReadPhase(nodeId, node, section) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__Phase", Number.NaN));
    if (Number.isFinite(live)) {
      return live - Math.floor(live);
    }
  }
  if (typeof nodeGraphMvp !== "undefined") {
    const stored = Number(nodeGraphMvp?.live?.runtime?.phases?.get?.(nodeId));
    if (Number.isFinite(stored)) {
      const offset = Number(nodeGraphBasicShapeLiveParam(node, "phase", 0)) || 0;
      const phase = stored + offset;
      return phase - Math.floor(phase);
    }
  }
  if (typeof nodeGraphRoundShapeLivePlaying === "function" && nodeGraphRoundShapeLivePlaying()) {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const freq = Number(nodeGraphBasicShapeLiveParam(node, "frequency", 1)) || 0;
    const offset = Number(nodeGraphBasicShapeLiveParam(node, "phase", 0)) || 0;
    const speed = Number(nodeGraphMvp?.live?.speedMultiplier);
    const mul = Number.isFinite(speed) ? speed : 1;
    if (section && Number.isFinite(section._basicShapeClock)) {
      const dt = Math.max(0, Math.min(0.25, now - section._basicShapeClock));
      let next = (Number(section._basicShapePhase) || 0) + freq * dt * mul;
      next -= Math.floor(next);
      section._basicShapePhase = next;
      section._basicShapeClock = now;
      return next;
    }
    if (section) {
      section._basicShapeClock = now;
      section._basicShapePhase = offset - Math.floor(offset);
    }
    return offset - Math.floor(offset);
  }
  return Number.NaN;
}

function nodeGraphBasicShapeSample(phase01, waveform, pulseWidth, amplitude) {
  const waves = typeof nodeGraphBasicShapeNaiveWaves === "function"
    ? nodeGraphBasicShapeNaiveWaves(phase01, pulseWidth)
    : null;
  let y = 0;
  if (waves && typeof nodeGraphBasicShapeSelect === "function") {
    y = nodeGraphBasicShapeSelect(waves, waveform);
  } else {
    const cycle = (Number(phase01) || 0) - Math.floor(Number(phase01) || 0);
    const i = Math.max(0, Math.min(6, Math.round(Number(waveform) || 0)));
    const width = typeof nodeGraphBasicShapeMorphWidth === "function"
      ? nodeGraphBasicShapeMorphWidth(pulseWidth)
      : Math.max(1e-4, Math.min(1 - 1e-4, 0.5 + 0.5 * (Number.isFinite(Number(pulseWidth)) ? Math.max(-1, Math.min(1, Number(pulseWidth))) : 0)));
    if (i === 1) {
      y = 1 - 4 * Math.abs(cycle - 0.5);
    } else if (i === 2) {
      y = 1 - cycle * 2;
    } else if (i === 3) {
      y = cycle < width ? 1 : -1;
    } else if (i === 4) {
      y = cycle * 2 - 1;
    } else if (i === 5) {
      const w = Math.max(1e-4, Math.min(1 - 1e-4, width));
      y = cycle < w ? (2 * (cycle / w) - 1) : (2 * ((1 - cycle) / (1 - w)) - 1);
    } else if (i === 6 && typeof nodeGraphBasicShapeCenterSquare === "function") {
      y = nodeGraphBasicShapeCenterSquare(cycle, width);
    } else {
      y = Math.sin(cycle * Math.PI * 2);
    }
  }
  const amp = Number(amplitude);
  return y * (Number.isFinite(amp) ? amp : 1);
}

function nodeGraphBasicShapeFaceLook(node) {
  if (typeof normalizeNodeGraphRoundShapeFaceSettings === "function") {
    return normalizeNodeGraphRoundShapeFaceSettings(node?.traceDisplaySettings);
  }
  const face = node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  return {
    backgroundPaint: String(face.backgroundPaint || face.background || "#020609"),
    strokePaint: String(face.strokePaint || face.strokeColor || "rgba(120, 220, 200, 0.92)"),
    dotPaint: String(face.dotPaint || face.dotColor || "#ffffff"),
    lineThickness: Math.max(0.25, Number(face.lineThickness) || 2),
    dotThickness: Math.max(0.25, Number(face.dotThickness) || 5),
    lineBlur: Math.max(0, Number(face.lineBlur) || 0),
    pixelDensity: Number.isFinite(Number(face.pixelDensity)) ? Number(face.pixelDensity) : 1,
  };
}

function drawNodeGraphBasicShapeDisplay(section) {
  try {
    drawNodeGraphBasicShapeDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[basic-shape] draw failed", detail, error);
    if (section) {
      section._basicShapeForceDraw = true;
      section._basicShapeLaidOut = false;
    }
  }
}

function drawNodeGraphBasicShapeDisplayInner(section) {
  const nodeId = section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-basic-shape-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  const look = nodeGraphBasicShapeFaceLook(node);
  const waveform = nodeGraphBasicShapeLiveParam(node, "waveform", 0);
  const pulseWidth = nodeGraphBasicShapeLiveParam(node, "morph", 0);
  const amplitude = nodeGraphBasicShapeLiveParam(node, "amplitude", 1);
  const strokeW = look.lineThickness;
  const dotW = look.dotThickness;
  const lineBlur = look.lineBlur;
  const pixelDensity = look.pixelDensity;
  let rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  let rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
    if (stage?.id === "nodeScreenSoloStage") {
      rawW = Number(stage.clientWidth) || rawW;
      rawH = Number(stage.clientHeight) || rawH;
    }
  }
  const signature = [
    String(nodeId),
    String(Math.round(Number(waveform) || 0)),
    String(Number(pulseWidth).toFixed(4)),
    String(Number(amplitude).toFixed(4)),
    look.strokePaint,
    look.backgroundPaint,
    String(strokeW),
    String(lineBlur),
    String(pixelDensity),
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");
  const livePlaying = typeof nodeGraphRoundShapeLivePlaying === "function"
    ? nodeGraphRoundShapeLivePlaying()
    : true;
  if (
    !livePlaying
    && section._basicShapeSignature === signature
    && !section._basicShapeForceDraw
    && section._basicShapeLaidOut === true
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._basicShapeLaidOut = false;
    section._basicShapeForceDraw = true;
    if (!section._basicShapeRetryFrame) {
      section._basicShapeRetryFrame = requestAnimationFrame(() => {
        section._basicShapeRetryFrame = 0;
        drawNodeGraphBasicShapeDisplay(section);
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
    pixelRatio = dpr * Math.max(Number(pixelDensity) || 1, 1e-6);
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

  const waveDirty = section._basicShapeWaveSig !== signature
    || !section._basicShapeWaveCanvas
    || section._basicShapeForceDraw;
  section._basicShapeSignature = signature;
  section._basicShapeForceDraw = false;
  section._basicShapeLaidOut = true;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const drawW = Math.max(1, canvas.width / pixelRatio);
  const drawH = Math.max(1, canvas.height / pixelRatio);
  if (!waveDirty) {
    context.drawImage(section._basicShapeWaveCanvas, 0, 0, drawW, drawH);
  } else {
    context.clearRect(0, 0, drawW, drawH);
    context.fillStyle = look.backgroundPaint || look.background || "#020609";
    context.fillRect(0, 0, drawW, drawH);
  }

  const strokeInset = strokeW * 0.5 + 1 / Math.max(pixelRatio, 1);
  const padX = Math.max(6, drawW * 0.06) + strokeInset;
  const padY = Math.max(6, drawH * 0.12) + strokeInset;
  const innerW = Math.max(4, drawW - padX * 2);
  const innerH = Math.max(4, drawH - padY * 2);
  const midY = padY + innerH * 0.5;
  const halfH = innerH * 0.5;
  const mapX = (phase) => padX + phase * innerW;
  const mapY = (value) => midY - Math.max(-1, Math.min(1, value)) * halfH;
  const samples = Math.max(32, Math.min(256, Math.ceil(innerW)));

  if (waveDirty) {
    context.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const phase = i / samples;
      const x = mapX(phase);
      const y = mapY(nodeGraphBasicShapeSample(phase, waveform, pulseWidth, amplitude));
      if (i === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    if (typeof nodeGraphStrokePathWithLineBlur === "function") {
      nodeGraphStrokePathWithLineBlur(context, {
        strokeStyle: look.strokePaint || look.strokeColor,
        lineWidth: strokeW,
        lineBlur,
        lineJoin: "round",
        lineCap: "round",
      });
    } else {
      context.strokeStyle = look.strokePaint || look.strokeColor || "#78dcc8";
      context.lineWidth = strokeW;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
    }
    if (!section._basicShapeWaveCanvas) {
      section._basicShapeWaveCanvas = document.createElement("canvas");
    }
    const hold = section._basicShapeWaveCanvas;
    if (hold.width !== canvas.width || hold.height !== canvas.height) {
      hold.width = canvas.width;
      hold.height = canvas.height;
    }
    const holdCtx = hold.getContext("2d");
    if (holdCtx) {
      holdCtx.setTransform(1, 0, 0, 1, 0, 0);
      holdCtx.clearRect(0, 0, hold.width, hold.height);
      holdCtx.drawImage(canvas, 0, 0);
      section._basicShapeWaveSig = signature;
    }
  }

  let phase = nodeGraphBasicShapeReadPhase(nodeId, node, section);
  if (!Number.isFinite(phase)) {
    phase = 0;
  }
  phase -= Math.floor(phase);
  const px = mapX(phase);
  const py = mapY(nodeGraphBasicShapeSample(phase, waveform, pulseWidth, amplitude));
  if (Number.isFinite(px) && Number.isFinite(py)) {
    context.beginPath();
    context.fillStyle = look.dotPaint || look.dotColor || "#ffffff";
    context.arc(px, py, Math.max(0.5, dotW * 0.5), 0, Math.PI * 2);
    context.fill();
  }
  if (livePlaying) {
    scheduleNodeGraphBasicShapePlayhead(section);
  }
}

function scheduleNodeGraphBasicShapePlayhead(section) {
  if (!section || section._basicShapePlayheadRaf) {
    return;
  }
  if (typeof nodeGraphRoundShapeLivePlaying === "function" && !nodeGraphRoundShapeLivePlaying()) {
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
  section._basicShapePlayheadRaf = requestAnimationFrame(() => {
    section._basicShapePlayheadRaf = 0;
    drawNodeGraphBasicShapeDisplay(section);
  });
}

function applyNodeGraphBasicShapeDisplaySettingsToFace(node) {
  if (!node?.id) {
    return;
  }
  const el = document.querySelector?.(
    `.node-basic-shape-display[data-node="${CSS.escape(String(node.id))}"]`,
  );
  if (!el) {
    return;
  }
  el._basicShapeForceDraw = true;
  el._basicShapeLaidOut = false;
  drawNodeGraphBasicShapeDisplay(el);
}
