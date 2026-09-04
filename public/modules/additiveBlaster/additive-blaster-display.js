// Blaster face — blocks for phase bins.
// Index layout: equal-width columns (Q=2 → half/half, Q=4 → quarters).
// Log Freq layout: equal segments of the shared log-Hz axis.

function createNodeGraphAdditiveBlasterDisplay(nodeId, type = "additiveBlaster") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-additive-blaster-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveBlaster");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.6";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  const canvas = document.createElement("canvas");
  canvas.className = "node-additive-blaster-canvas";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `additiveBlaster:${el.dataset?.node || ""}`,
    paint: drawNodeGraphAdditiveBlasterDisplay,
  });
  return section;
}

function nodeGraphAdditiveBlasterReadGraph(nodeId) {
  if (typeof nodeGraphDataBus !== "undefined") {
    const pub = nodeGraphDataBus.get?.(`${nodeId}.Graph`);
    if (pub?.ratio) return pub;
  }
  if (typeof readNodeGraphDataInput === "function") {
    const g = readNodeGraphDataInput(nodeId, "Graph");
    if (g?.ratio) return g;
  }
  return null;
}

function nodeGraphAdditiveBlasterPhaseColor(phase01, binIndex = 0) {
  const p = ((Number(phase01) || 0) % 1 + 1) % 1;
  // Prefer true phase hue; fall back to bin index so empty/identical still read.
  const hue = Math.floor((((p > 1e-6 ? p : (binIndex * 0.17)) % 1) + 1) % 1 * 360);
  return `hsl(${hue} 80% 55%)`;
}

function drawNodeGraphAdditiveBlasterDisplay(section) {
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
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);

  const nodeId = section.dataset.node;
  const graph = nodeGraphAdditiveBlasterReadGraph(nodeId);
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const p = node?.params || node?.parameters || {};
  const Q = Number(p.quantization);
  const quantization = Number.isFinite(Q) ? Q : 0;
  // Face always uses equal-width index columns (Layout control removed).
  const layout = 0;

  if (!graph || !graph.ratio || !graph.ratio.length) {
    ctx.fillStyle = "#666";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("no Graph", w * 0.5, h * 0.5);
    section._forceDraw = false;
    return;
  }

  const H = Math.max(1, graph.ratio.length | 0);
  let freqHz = Number(graph.frequencyHz ?? node?.params?.frequency ?? 100);
  if (!Number.isFinite(freqHz) || !(freqHz > 0)) freqHz = 100;
  const sr = Number(nodeGraphMvp?.sampleRate) || Number(nodeGraphMvp?.live?.sampleRate) || 44100;

  const bins = typeof additiveGraphBlasterBins === "function"
    ? additiveGraphBlasterBins(H, quantization, layout, graph, freqHz, sr)
    : [{ start: 0, end: H, phase: 0, t0: 0, t1: 1 }];

  const padY = 4;
  const barH = Math.max(8, h - padY * 2);
  const gap = 1;

  // Both layouts use t0/t1 in 0…1 across the face so Q=2/4 read as halves/quarters.
  // Index: t from equal slot bins. Log: t from equal log-Hz segments.
  for (let b = 0; b < bins.length; b += 1) {
    const bin = bins[b];
    const t0 = Number.isFinite(bin.t0) ? bin.t0 : b / Math.max(1, bins.length);
    const t1 = Number.isFinite(bin.t1) ? bin.t1 : (b + 1) / Math.max(1, bins.length);
    const left = t0 * w;
    const right = t1 * w;
    const bw = Math.max(2, right - left - gap);
    const phase = Number.isFinite(bin.phase)
      ? bin.phase
      : (bin.start >= 0 ? Number(graph.phase?.[bin.start]) || 0 : 0);
    ctx.fillStyle = nodeGraphAdditiveBlasterPhaseColor(phase, b);
    ctx.globalAlpha = bin.start >= 0 ? 0.9 : 0.25;
    ctx.fillRect(left, padY, bw, barH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, padY + 0.5, bw - 1, barH - 1);
  }

  section._forceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.additiveBlasterBlocks = () => {};
}
