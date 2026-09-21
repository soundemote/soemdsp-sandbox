// Softwave Oscillator face — one cycle of the actual shape at Frequency + Morph.
// Phase is a moving dot on that cycle (live phasor, else the Phase param).

function createNodeGraphSoftwaveOscDisplay(nodeId, type = "softwaveOsc") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  // Keep module-face plate classes only — never fall through to generic filter-curve paint.
  section.className = "node-filter-curve-display node-softwave-osc-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "softwaveOsc");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.66";
  const canvas = document.createElement("canvas");
  canvas.className = "node-softwave-osc-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.66";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `softwaveOsc:${el.dataset?.node || ""}`,
    forceKey: "_softwaveOscForceDraw",
    rafKey: "_softwaveOscPlayheadRaf",
    paint: drawNodeGraphSoftwaveOscDisplay,
    onResize: (el) => { el._softwaveOscLaidOut = false; },
    paintOnCreate: false,
    shouldAnimate: (el) => {
      if (typeof scopePaintFaceShouldAnimate === "function" && !scopePaintFaceShouldAnimate(el)) {
        return false;
      }
      return Boolean(nodeGraphMvp?.live?.node);
    },
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphSoftwaveOscDisplay(section);
      if (nodeGraphMvp?.live?.node) {
        section._startFaceLoop?.();
      }
    });
  });
  return section;
}

function nodeGraphSoftwaveOscLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphSoftwaveOscReadPhase(nodeId, node, section) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__Phase", Number.NaN));
    if (Number.isFinite(live)) {
      return live - Math.floor(live);
    }
  }
  if (typeof nodeGraphMvp !== "undefined") {
    const stored = Number(nodeGraphMvp?.live?.runtime?.phases?.get?.(nodeId));
    if (Number.isFinite(stored)) {
      const offset = nodeGraphFiniteNumber(nodeGraphSoftwaveOscLiveParam(node, "phase", 0));
      const phase = stored + offset;
      return phase - Math.floor(phase);
    }
  }
  return Number.NaN;
}

function nodeGraphSoftwaveOscFaceLook(node) {
  if (typeof normalizeNodeGraphSoftwaveOscFaceSettings === "function") {
    return normalizeNodeGraphSoftwaveOscFaceSettings(node?.traceDisplaySettings);
  }
  if (typeof normalizeNodeGraphRoundShapeFaceSettings === "function") {
    const look = normalizeNodeGraphRoundShapeFaceSettings(node?.traceDisplaySettings);
    return { ...look, showDot: false, lineThickness: look.lineThickness || 3 };
  }
  const face = node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  return {
    backgroundPaint: String(face.backgroundPaint || face.background || "#020609"),
    strokePaint: String(face.strokePaint || face.strokeColor || "rgba(120, 220, 200, 0.92)"),
    dotPaint: String(face.dotPaint || face.dotColor || "#ffffff"),
    lineThickness: Math.max(0.25, nodeGraphFiniteNumber(face.lineThickness, 3)),
    dotThickness: Math.max(0.25, nodeGraphFiniteNumber(face.dotThickness, 5)),
    lineBlur: Math.max(0, nodeGraphFiniteNumber(face.lineBlur)),
    pixelDensity: Number.isFinite(Number(face.pixelDensity)) ? Number(face.pixelDensity) : 1,
    showDot: face.showDot === true || face.showDot === 1 || face.showDot === "1",
  };
}

function drawNodeGraphSoftwaveOscDisplay(section) {
  try {
    drawNodeGraphSoftwaveOscDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[softwave-osc] draw failed", detail, error);
    if (section) {
      section._softwaveOscForceDraw = true;
      section._softwaveOscLaidOut = false;
    }
  }
}

function drawNodeGraphSoftwaveOscDisplayInner(section) {
  const nodeId = section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-softwave-osc-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas || typeof nodeGraphSoftwaveShapeAt !== "function") {
    return;
  }
  const look = nodeGraphSoftwaveOscFaceLook(node);
  const waveform = nodeGraphSoftwaveOscLiveParam(node, "waveform", 0);
  const morph = nodeGraphSoftwaveOscLiveParam(node, "morph", 1);
  const phaseParam = nodeGraphFiniteNumber(nodeGraphSoftwaveOscLiveParam(node, "phase", 0));
  const frequencyHz = Math.abs(nodeGraphFiniteNumber(nodeGraphSoftwaveOscLiveParam(node, "frequency", 100), 100));
  const sampleRate = typeof nodeGraphLiveHostSampleRate === "function"
    ? nodeGraphLiveHostSampleRate()
    : nodeGraphFiniteNumber(nodeGraphMvp?.live?.context?.sampleRate, 44100);
  const strokeW = look.lineThickness;
  const dotW = look.dotThickness;
  const lineBlur = look.lineBlur;
  const pixelDensity = look.pixelDensity;
  let rawW = nodeGraphFiniteNumber(section.clientWidth || section.offsetWidth);
  let rawH = nodeGraphFiniteNumber(section.clientHeight || section.offsetHeight);
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
    if (stage?.id === "nodeScreenSoloStage") {
      rawW = nodeGraphFiniteNumber(stage.clientWidth, rawW);
      rawH = nodeGraphFiniteNumber(stage.clientHeight, rawH);
    }
  }
  const signature = [
    String(nodeId),
    String(Math.round(nodeGraphFiniteNumber(waveform))),
    String(Number(morph).toFixed(4)),
    String(Number(frequencyHz).toFixed(3)),
    String(Math.round(sampleRate)),
    look.strokePaint,
    look.backgroundPaint,
    String(strokeW),
    String(lineBlur),
    String(pixelDensity),
    String(dotW),
    look.dotPaint || "",
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");
  const liveDot = Boolean(nodeGraphMvp?.live?.node);
  if (
    !liveDot
    && section._softwaveOscSignature === signature
    && !section._softwaveOscForceDraw
    && section._softwaveOscLaidOut === true
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._softwaveOscLaidOut = false;
    section._softwaveOscForceDraw = true;
    if (!section._softwaveOscRetryFrame) {
      section._softwaveOscRetryFrame = requestAnimationFrame(() => {
        section._softwaveOscRetryFrame = 0;
        drawNodeGraphSoftwaveOscDisplay(section);
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
    pixelRatio = dpr * Math.max(nodeGraphFiniteNumber(pixelDensity, 1), 1e-6);
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

  const waveDirty = section._softwaveOscWaveSig !== signature
    || !section._softwaveOscWaveCanvas;
  section._softwaveOscSignature = signature;
  section._softwaveOscForceDraw = false;
  section._softwaveOscLaidOut = true;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const drawW = Math.max(1, canvas.width / pixelRatio);
  const drawH = Math.max(1, canvas.height / pixelRatio);
  if (!waveDirty) {
    context.drawImage(section._softwaveOscWaveCanvas, 0, 0, drawW, drawH);
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
  const mapY = (value) => midY - value * halfH;
  const samples = Math.max(64, Math.min(512, Math.ceil(innerW)));

  const wrap01 = (p) => {
    const n = nodeGraphFiniteNumber(p);
    return n - Math.floor(n);
  };
  const waveIndex = Math.max(0, Math.min(9, Math.round(nodeGraphFiniteNumber(waveform))));
  const sampleAt = (cycle01) => {
    const y = nodeGraphSoftwaveShapeAt(
      cycle01,
      waveIndex,
      morph,
      frequencyHz,
      sampleRate,
    );
    return Number.isFinite(y) ? y : 0;
  };

  if (waveDirty) {
    context.beginPath();
    const discThreshold = typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
      ? nodeGraphModuleScopeDiscontinuityThreshold
      : 0.85;
    let prevY = null;
    for (let i = 0; i <= samples; i += 1) {
      const xNorm = i / samples;
      const x = mapX(xNorm);
      const sample = sampleAt(wrap01(xNorm));
      const y = mapY(sample);
      if (i === 0 || prevY == null) {
        context.moveTo(x, y);
      } else if (Math.abs(sample - prevY) > discThreshold) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      prevY = sample;
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
    if (!section._softwaveOscWaveCanvas) {
      section._softwaveOscWaveCanvas = document.createElement("canvas");
    }
    const hold = section._softwaveOscWaveCanvas;
    if (hold.width !== canvas.width || hold.height !== canvas.height) {
      hold.width = canvas.width;
      hold.height = canvas.height;
    }
    const holdCtx = hold.getContext("2d");
    if (holdCtx) {
      holdCtx.setTransform(1, 0, 0, 1, 0, 0);
      holdCtx.clearRect(0, 0, hold.width, hold.height);
      holdCtx.drawImage(canvas, 0, 0);
      section._softwaveOscWaveSig = signature;
    }
  }

  let play = nodeGraphSoftwaveOscReadPhase(nodeId, node, section);
  if (!Number.isFinite(play)) {
    play = wrap01(phaseParam);
  }
  play = wrap01(play);
  const px = mapX(play);
  const py = mapY(sampleAt(play));
  if (Number.isFinite(px) && Number.isFinite(py)) {
    context.beginPath();
    context.fillStyle = look.dotPaint || look.dotColor || "#ffffff";
    context.arc(px, py, Math.max(0.5, dotW * 0.5), 0, Math.PI * 2);
    context.fill();
  }
}

function applyNodeGraphSoftwaveOscDisplaySettingsToFace(node) {
  if (!node?.id) {
    return;
  }
  const el = document.querySelector?.(
    `.node-softwave-osc-display[data-node="${CSS.escape(String(node.id))}"]`,
  );
  if (!el) {
    return;
  }
  el._softwaveOscForceDraw = true;
  el._softwaveOscLaidOut = false;
  el._softwaveOscWaveSig = "";
  drawNodeGraphSoftwaveOscDisplay(el);
  if (nodeGraphMvp?.live?.node) {
    el._startFaceLoop?.();
  }
}
