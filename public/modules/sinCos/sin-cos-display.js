// SinCos face — cheap 1D one-cycle sine (red) and cosine (blue).
// WebGL line + white phase dots (cycle-line-gl). Frame-rate paint, no engine-rate ring.
// A line is drawn only when a patch wire leaves that output jack.
// Each drawn line gets its own phase dot. Both dots are white.

const NODE_GRAPH_SINCOS_SINE_STROKE = "#ff2d2d";
const NODE_GRAPH_SINCOS_COS_STROKE = "#3d7eff";
const NODE_GRAPH_SINCOS_DOT = "#ffffff";

function createNodeGraphSinCosDisplay(nodeId, type = "sinCos") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-sincos-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "sinCos");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.66";
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-sincos-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.66";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `sinCos:${el.dataset?.node || ""}`,
    forceKey: "_sinCosForceDraw",
    rafKey: "_sinCosPlayheadRaf",
    paint: drawNodeGraphSinCosDisplay,
    onResize: (el) => {
      if (typeof syncFaceMetrics === "function") syncFaceMetrics(el);
      el._sinCosLaidOut = false;
    },
    paintOnCreate: false,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphSinCosDisplay(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function nodeGraphSinCosLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphSinCosReadPhase(nodeId, node, section) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__Phase", Number.NaN));
    if (Number.isFinite(live)) {
      return live - Math.floor(live);
    }
  }
  if (typeof nodeGraphMvp !== "undefined") {
    const stored = Number(nodeGraphMvp?.live?.runtime?.phases?.get?.(nodeId));
    if (Number.isFinite(stored)) {
      const offset = nodeGraphFiniteNumber(nodeGraphSinCosLiveParam(node, "phase", 0));
      const phase = stored + offset;
      return phase - Math.floor(phase);
    }
  }
  if (typeof nodeGraphRoundShapeLivePlaying === "function" && nodeGraphRoundShapeLivePlaying()) {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const freq = nodeGraphFiniteNumber(nodeGraphSinCosLiveParam(node, "freq", 1));
    const offset = nodeGraphFiniteNumber(nodeGraphSinCosLiveParam(node, "phase", 0));
    const speed = Number(nodeGraphMvp?.live?.speedMultiplier);
    const mul = Number.isFinite(speed) ? speed : 1;
    if (section && Number.isFinite(section._sinCosClock)) {
      const dt = Math.max(0, Math.min(0.25, now - section._sinCosClock));
      let next = (nodeGraphFiniteNumber(section._sinCosPhase)) + freq * dt * mul;
      next -= Math.floor(next);
      section._sinCosPhase = next;
      section._sinCosClock = now;
      return next;
    }
    if (section) {
      section._sinCosClock = now;
      section._sinCosPhase = offset - Math.floor(offset);
    }
    return offset - Math.floor(offset);
  }
  return Number.NaN;
}

function nodeGraphSinCosSample(phase01, kind, amplitude) {
  const cycle = nodeGraphFiniteNumber(phase01);
  const wrapped = cycle - Math.floor(cycle);
  const amp = Number(amplitude);
  const scale = Number.isFinite(amp) ? amp : 1;
  const angle = wrapped * Math.PI * 2;
  const y = kind === "cos" ? Math.cos(angle) : Math.sin(angle);
  return y * scale;
}

// Patch-graph wire leaving the jack. Not "did the audio thread compute this out".
function nodeGraphSinCosOutputHasWire(nodeId, port) {
  const id = String(nodeId || "").trim();
  const want = String(port || "").trim();
  if (!id || !want) {
    return false;
  }
  const names = want === "sin"
    ? ["sin", "Sin"]
    : (want === "cos" ? ["cos", "Cos"] : [want]);
  if (typeof nodeGraphModuleConnectedSignalPortSets === "function") {
    const outputs = nodeGraphModuleConnectedSignalPortSets(id)?.outputs;
    if (outputs && names.some((name) => outputs.has(name))) {
      return true;
    }
  }
  const patch = (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.patch) || null;
  if (!patch) {
    return false;
  }
  const hit = (sourceNode, sourcePort) => sourceNode === id && names.includes(String(sourcePort || ""));
  for (const connection of patch.connections || []) {
    if (hit(connection?.sourceNode, connection?.sourcePort)) return true;
  }
  for (const modulation of patch.modulations || []) {
    if (hit(modulation?.sourceNode, modulation?.sourcePort)) return true;
  }
  for (const graph of patch.graphConnections || []) {
    if (hit(graph?.sourceNode, graph?.sourcePort)) return true;
  }
  return false;
}

function nodeGraphSinCosStrokeCycle(context, mapX, mapY, samples, sampleAt, strokeStyle, lineWidth) {
  context.beginPath();
  for (let i = 0; i <= samples; i += 1) {
    const xNorm = i / samples;
    const x = mapX(xNorm);
    const y = mapY(sampleAt(xNorm));
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  if (typeof nodeGraphStrokePathWithLineBlur === "function") {
    nodeGraphStrokePathWithLineBlur(context, {
      strokeStyle,
      lineWidth,
      lineBlur: 0,
      lineJoin: "round",
      lineCap: "round",
    });
  } else {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }
}

function drawNodeGraphSinCosDisplay(section) {
  try {
    drawNodeGraphSinCosDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[sincos] draw failed", detail, error);
    if (section) {
      section._sinCosForceDraw = true;
      section._sinCosLaidOut = false;
    }
  }
}

function drawNodeGraphSinCosDisplayInner(section) {
  const nodeId = section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-sincos-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  const amplitude = nodeGraphSinCosLiveParam(node, "amp", 1);
  const phaseParam = nodeGraphFiniteNumber(nodeGraphSinCosLiveParam(node, "phase", 0));
  const drawSin = nodeGraphSinCosOutputHasWire(nodeId, "sin");
  const drawCos = nodeGraphSinCosOutputHasWire(nodeId, "cos");
  const strokeW = 2;
  const dotW = 5;
  const pixelDensity = 1;
  const faceMetrics = typeof ensureFaceMetrics === "function"
    ? ensureFaceMetrics(section, { observe: true })
    : null;
  const rawW = faceMetrics
    ? faceMetrics.cssW
    : nodeGraphFiniteNumber(section.clientWidth || section.offsetWidth);
  const rawH = faceMetrics
    ? faceMetrics.cssH
    : nodeGraphFiniteNumber(section.clientHeight || section.offsetHeight);
  const signature = [
    String(nodeId),
    drawSin ? "sin" : "",
    drawCos ? "cos" : "",
    String(Number(amplitude).toFixed(4)),
    String((phaseParam - Math.floor(phaseParam)).toFixed(4)),
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");
  const livePlaying = typeof nodeGraphRoundShapeLivePlaying === "function"
    ? nodeGraphRoundShapeLivePlaying()
    : true;
  if (
    !livePlaying
    && section._sinCosSignature === signature
    && !section._sinCosForceDraw
    && section._sinCosLaidOut === true
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._sinCosLaidOut = false;
    section._sinCosForceDraw = true;
    if (!section._sinCosRetryFrame) {
      section._sinCosRetryFrame = requestAnimationFrame(() => {
        section._sinCosRetryFrame = 0;
        drawNodeGraphSinCosDisplay(section);
      });
    }
    return;
  }

  const metrics = typeof nodeGraphCycleLineGlMetrics === "function"
    ? nodeGraphCycleLineGlMetrics(section, canvas, pixelDensity)
    : null;
  if (!metrics) {
    return;
  }
  const pixelRatio = metrics.pixelRatio || 1;
  const drawW = metrics.cssWidth;
  const drawH = metrics.cssHeight;
  section._sinCosSignature = signature;
  section._sinCosForceDraw = false;
  section._sinCosLaidOut = true;

  const strokeInset = strokeW * 0.5 + 1 / Math.max(pixelRatio, 1);
  const padX = Math.max(6, drawW * 0.06) + strokeInset;
  const padY = Math.max(6, drawH * 0.12) + strokeInset;
  const innerW = Math.max(4, drawW - padX * 2);
  const innerH = Math.max(4, drawH - padY * 2);
  const midY = padY + innerH * 0.5;
  const halfH = innerH * 0.5;
  const mapX = (phase) => padX + phase * innerW;
  const mapY = (value) => midY - value * halfH;
  const samples = Math.max(32, Math.min(256, Math.ceil(innerW)));
  const wrap01 = (p) => {
    const n = nodeGraphFiniteNumber(p);
    return n - Math.floor(n);
  };
  const phaseOff = wrap01(phaseParam);
  const sampleKind = (cycle01, kind) => nodeGraphSinCosSample(wrap01(cycle01 + phaseOff), kind, amplitude);
  const lines = [];
  const pushLine = (kind, color) => {
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
      const xNorm = i / samples;
      points.push({ x: mapX(xNorm), y: mapY(sampleKind(xNorm, kind)) });
    }
    lines.push({ points, color, width: strokeW, blur: 0 });
  };
  // Red sine only if a wire leaves the sin jack. Blue cosine only for cos.
  if (drawSin) pushLine("sin", NODE_GRAPH_SINCOS_SINE_STROKE);
  if (drawCos) pushLine("cos", NODE_GRAPH_SINCOS_COS_STROKE);

  let play = nodeGraphSinCosReadPhase(nodeId, node, section);
  if (!Number.isFinite(play)) {
    play = phaseOff;
  }
  play = wrap01(play);
  const playX = wrap01(play - phaseOff);
  const px = mapX(playX);
  const dotR = Math.max(0.5, dotW * 0.5);
  const dots = [];
  // One white phase marker per drawn line. Lines stay red/blue; dots do not.
  const pushDot = (kind) => {
    const py = mapY(nodeGraphSinCosSample(play, kind, amplitude));
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    dots.push({ x: px, y: py, color: NODE_GRAPH_SINCOS_DOT, radius: dotR });
  };
  if (drawSin) pushDot("sin");
  if (drawCos) pushDot("cos");
  nodeGraphCycleLineGlPresent(canvas, {
    cssWidth: drawW,
    cssHeight: drawH,
    background: "#020609",
    waveKey: signature,
    lines,
    dots,
  });
}


if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.sinCosFace = () => {};
}
if (typeof registerNodeGraphModuleFaceCreator === "function") {
  registerNodeGraphModuleFaceCreator("sinCosFace", createNodeGraphSinCosDisplay);
}