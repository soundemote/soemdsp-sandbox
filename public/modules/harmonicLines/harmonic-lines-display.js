// Harmonic lines face for Additive Out — X=freq, height=amp, color=phase.

function createNodeGraphHarmonicLinesDisplay(nodeId, type = "additiveOut") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-harmonic-lines-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveOut");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.7";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.syncFromParameters = () => {
    section._forceDraw = true;
    drawNodeGraphHarmonicLinesDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-harmonic-lines-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._forceDraw = true;
      drawNodeGraphHarmonicLinesDisplay(section);
    });
    ro.observe(section);
    section._ro = ro;
  }
  const tick = () => {
    drawNodeGraphHarmonicLinesDisplay(section);
    section._raf = requestAnimationFrame(tick);
  };
  section._raf = requestAnimationFrame(tick);
  return section;
}

function nodeGraphHarmonicLinesReadGraph(nodeId) {
  if (typeof nodeGraphDataBus !== "undefined") {
    const view = nodeGraphDataBus.get?.(`${nodeId}.GraphView`);
    if (view?.ratio) return view;
    const out = nodeGraphDataBus.get?.(`${nodeId}.Graph`);
    if (out?.ratio) return out;
  }
  if (typeof readNodeGraphDataInput === "function") {
    const g = readNodeGraphDataInput(nodeId, "Graph");
    if (g?.ratio) return g;
  }
  return null;
}

function drawNodeGraphHarmonicLinesDisplay(section) {
  if (!section) return;
  const canvas = section.querySelector("canvas");
  if (!canvas) return;

  let ctx;
  let w;
  let h;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas, { pixelDensity: 1 });
    if (!metrics) return;
    ctx = metrics.context;
    w = metrics.cssWidth;
    h = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    const rawW = Number(section.clientWidth || section.offsetWidth) || 0;
    const rawH = Number(section.clientHeight || section.offsetHeight) || 0;
    if (rawW < 8 || rawH < 8) return;
    const dpr = window.devicePixelRatio || 1;
    w = Math.max(1, Math.floor(rawW));
    h = Math.max(1, Math.floor(rawH));
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx = canvas.getContext("2d");
    pixelRatio = dpr;
  }
  if (!ctx || w < 8 || h < 8) return;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, w, h);

  const nodeId = section.dataset.node;
  const graph = nodeGraphHarmonicLinesReadGraph(nodeId);
  if (!graph || !graph.ratio || !graph.ratio.length) {
    ctx.fillStyle = "#666";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("no Graph", w * 0.5, h * 0.5);
    section._forceDraw = false;
    return;
  }

  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const freqHz = Number(graph.frequencyHz ?? node?.params?.frequency ?? node?.parameters?.frequency) || 100;
  const nyquist = 22050;
  const H = graph.ratio.length;
  let maxAmp = 1e-6;
  for (let i = 0; i < H; i += 1) {
    const a = Math.abs(graph.amplitude[i] || 0);
    if (a > maxAmp) maxAmp = a;
  }
  const baseY = h * 0.92;
  const maxH = h * 0.82;

  for (let i = 0; i < H; i += 1) {
    const hz = (graph.ratio[i] || 0) * freqHz;
    if (!(hz > 0) || hz > nyquist) continue;
    const x = (hz / nyquist) * w;
    const amp = Math.abs(graph.amplitude[i] || 0) / maxAmp;
    const lineH = amp * maxH;
    const col = typeof additiveGraphPhaseColor === "function"
      ? additiveGraphPhaseColor(graph.phase[i] || 0)
      : { r: 224, g: 64, b: 251 };
    ctx.strokeStyle = `rgb(${col.r},${col.g},${col.b})`;
    ctx.lineWidth = Math.max(1, Math.min(3, w / Math.max(64, H * 2)));
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - lineH);
    ctx.stroke();
  }
  section._forceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.harmonicLines = () => {};
}
