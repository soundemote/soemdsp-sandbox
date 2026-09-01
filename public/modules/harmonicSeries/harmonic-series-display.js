// Harmonic Series face — harmonic index (zero-based + offset) and output Hz.

const NODE_GRAPH_HARMONIC_SERIES_FACE_FONT =
  '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace';

function nodeGraphHarmonicSeriesFaceFormatEffective(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n - Math.round(n)) < 0.0005) {
    return String(Math.round(n));
  }
  const fixed = n.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

function nodeGraphHarmonicSeriesFaceFormatHz(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(1);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 10) return n.toFixed(2);
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(2);
}

function nodeGraphHarmonicSeriesFaceHasInput(nodeId, port) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  return nodeGraphModuleScopeConnectionsTo(nodeId, port).some(
    (candidate) => candidate?.sourceNode && candidate?.sourcePort,
  );
}

function nodeGraphHarmonicSeriesFaceInputValue(nodeId, port) {
  if (typeof nodeGraphModuleScopeConnectedSourceBuffer !== "function") {
    return 0;
  }
  const buffer = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port);
  if (!buffer?.length) {
    return 0;
  }
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const value = Number(buffer[index]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function nodeGraphHarmonicSeriesFaceReadout(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const harmonic = Number(node?.params?.harmonic);
  const offset = Number(node?.params?.offset);
  const h = Number.isFinite(harmonic) ? harmonic : 0;
  const o = Number.isFinite(offset) ? offset : 0;
  const effective = typeof nodeGraphHarmonicSeriesEffective === "function"
    ? nodeGraphHarmonicSeriesEffective(h, o)
    : h + o;

  let hz = Number.NaN;
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    hz = nodeGraphModuleScopeLatestOutputValue(nodeId, "f", Number.NaN);
  }
  if (!Number.isFinite(hz)) {
    const knobHz = Number(node?.params?.frequency);
    const base = nodeGraphHarmonicSeriesFaceHasInput(nodeId, "f")
      ? nodeGraphHarmonicSeriesFaceInputValue(nodeId, "f")
      : (Number.isFinite(knobHz) ? knobHz : 100);
    if (typeof nodeGraphHarmonicSeriesSample === "function") {
      hz = nodeGraphHarmonicSeriesSample(base, h, o).f;
    } else {
      const mult = effective >= 0 ? 1 + effective : 1 / (1 - effective);
      hz = base * mult;
    }
  }
  return { effective, hz };
}

function createNodeGraphHarmonicSeriesDisplay(nodeId, type = "harmonicSeries") {
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-harmonic-series-display node-module-face";
  section.dataset.node = String(nodeId || "");
  section.dataset.nodeType = String(type || "harmonicSeries");
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.4";
  const startLoop = () => {
    if (section._raf) return;
    const tick = () => {
      section._raf = 0;
      if (!section.isConnected) return;
      const animate = typeof scopePaintFaceShouldAnimate === "function"
        ? scopePaintFaceShouldAnimate(section)
        : (typeof scopePaintIsLive === "function" ? scopePaintIsLive() : true);
      if (!animate) {
        if (section._forceDraw) {
          drawNodeGraphHarmonicSeriesFaceItem(section);
        }
        return;
      }
      drawNodeGraphHarmonicSeriesFaceItem(section);
      section._raf = requestAnimationFrame(tick);
    };
    section._raf = requestAnimationFrame(tick);
  };
  section._startFaceLoop = startLoop;
  section.syncFromParameters = () => {
    section._forceDraw = true;
    drawNodeGraphHarmonicSeriesFaceItem(section);
    startLoop();
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-harmonic-series-canvas node-module-scope-vector-trace";
  canvas.setAttribute("aria-hidden", "true");
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      section._forceDraw = true;
      section._harmonicSeriesLaidOut = false;
      drawNodeGraphHarmonicSeriesFaceItem(section);
      startLoop();
    });
    observer.observe(section);
    section._harmonicSeriesResizeObserver = observer;
  }
  document.addEventListener("nodegraphfaceloops", startLoop);
  section.addEventListener("nodegraphviewport", (event) => {
    if (!event?.detail?.asleep) startLoop();
  });
  drawNodeGraphHarmonicSeriesFaceItem(section);
  startLoop();
  return section;
}

function drawNodeGraphHarmonicSeriesFaceItem(sectionOrRenderer, item) {
  const section = sectionOrRenderer?.classList?.contains?.("node-harmonic-series-display")
    ? sectionOrRenderer
    : (item?.screenElement?.closest?.(".node-harmonic-series-display")
      || item?.slot?.scopeElement
      || null);
  if (!section) {
    return;
  }
  const nodeId = section.dataset?.node || item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = section.querySelector?.(".node-harmonic-series-canvas")
    || section.querySelector?.("canvas");
  if (!canvas) {
    return;
  }
  const readout = nodeGraphHarmonicSeriesFaceReadout(nodeId);
  const harmText = nodeGraphHarmonicSeriesFaceFormatEffective(readout.effective);
  const hzText = nodeGraphHarmonicSeriesFaceFormatHz(readout.hz);
  const rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  const rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  const signature = `${harmText}|${hzText}|${Math.round(rawW)}|${Math.round(rawH)}`;
  if (
    !section._forceDraw
    && section._harmonicSeriesSignature === signature
    && section._harmonicSeriesLaidOut
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._harmonicSeriesLaidOut = false;
    section._forceDraw = true;
    return;
  }

  let ctx;
  let width;
  let height;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
    if (!metrics) {
      return;
    }
    ctx = metrics.context;
    width = metrics.cssWidth;
    height = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    width = rawW;
    height = rawH;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
  }
  if (!ctx || !(width >= 8) || !(height >= 8)) {
    return;
  }

  section._harmonicSeriesSignature = signature;
  section._forceDraw = false;
  section._harmonicSeriesLaidOut = true;
  canvas.style.imageRendering = "auto";
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000004";
  ctx.fillRect(0, 0, width, height);

  const harmSize = Math.max(14, Math.min(height * 0.42, width * 0.28));
  const hzSize = Math.max(11, Math.min(height * 0.28, width * 0.18));
  const unitSize = Math.max(8, Math.min(height * 0.16, width * 0.08));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${harmSize}px ${NODE_GRAPH_HARMONIC_SERIES_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 214, 228, 0.98)";
  ctx.fillText(harmText, width * 0.5, height * 0.38, width - 8);
  ctx.font = `700 ${hzSize}px ${NODE_GRAPH_HARMONIC_SERIES_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 214, 228, 0.92)";
  ctx.fillText(hzText, width * 0.5, height * 0.68, width - 8);
  ctx.font = `700 ${unitSize}px ${NODE_GRAPH_HARMONIC_SERIES_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 167, 176, 0.82)";
  ctx.fillText("Hz", width * 0.5, height * 0.88, width - 8);
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.harmonicSeriesFace = () => {};
}
if (typeof registerNodeGraphModuleFaceCreator === "function") {
  registerNodeGraphModuleFaceCreator("harmonicSeriesFace", createNodeGraphHarmonicSeriesDisplay);
}
