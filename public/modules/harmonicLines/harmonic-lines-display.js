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
  if (typeof readNodeGraphDataInput === "function") {
    const g = readNodeGraphDataInput(nodeId, "Graph");
    if (g?.ratio) return g;
  }
  if (typeof nodeGraphDataBus !== "undefined") {
    const view = nodeGraphDataBus.get?.(`${nodeId}.GraphView`);
    if (view?.ratio) return view;
    // Sidecar publishes the held view under GraphView; also accept Graph.
    const out = nodeGraphDataBus.get?.(`${nodeId}.Graph`);
    if (out?.ratio) return out;
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

  // Log-frequency X (20 Hz … speed limit) + log-amplitude heights (dB floor).
  // Heights ignore Out Amplitude (masterAmp) — only per-partial amp + Nyquist curve.
  // Color rotates with phase[i] + master Phase.
  const H = Math.max(1, graph.ratio.length | 0);
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  let freqHz = Number(graph.frequencyHz ?? node?.params?.frequency ?? node?.parameters?.frequency);
  if (!Number.isFinite(freqHz)) freqHz = 100;
  const masterPhase = Number(graph.masterPhase ?? node?.params?.phase ?? node?.parameters?.phase) || 0;
  const sr = Number(nodeGraphMvp?.sampleRate) || Number(nodeGraphMvp?.live?.sampleRate) || 44100;
  const xMaxHz = typeof nodeGraphProjectSpeedLimitHz === "function"
    ? Math.max(1, nodeGraphProjectSpeedLimitHz())
    : Math.max(1, Number(nodeGraphMvp?.live?.speedLimit) || 20000);
  const xMinHz = Math.min(20, xMaxHz * 0.5);
  const logXMin = Math.log(Math.max(1e-6, xMinHz));
  const logXSpan = Math.max(1e-9, Math.log(Math.max(xMinHz * 1.0001, xMaxHz)) - logXMin);
  const ampFloorDb = -60; // 0 height at −60 dB relative to loudest partial
  let maxAmp = 1e-6;
  const effectiveAmp = new Float32Array(H);
  const hzAt = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const hz = (graph.ratio[i] || 0) * freqHz;
    hzAt[i] = hz;
    const nyqGain = typeof additiveGraphNyquistAmpGain === "function"
      ? additiveGraphNyquistAmpGain(hz, sr)
      : 1;
    // Intentionally omit masterAmp — volume must not squash the face.
    const a = Math.abs(graph.amplitude[i] || 0) * nyqGain;
    effectiveAmp[i] = a;
    if (a > maxAmp) maxAmp = a;
  }
  const baseY = h * 0.92;
  const maxH = h * 0.82;
  const pad = Math.max(2, w * 0.02);
  const span = Math.max(1, w - pad * 2);
  // Log X spreads lows; a few px wide is enough so dense highs stay readable.
  const lineW = Math.max(1, Math.min(4, span / Math.max(48, H * 1.1)));

  for (let i = 0; i < H; i += 1) {
    const hz = hzAt[i];
    if (!(hz > 0) || !(effectiveAmp[i] > 0)) continue;
    const clampedHz = Math.max(xMinHz, Math.min(xMaxHz, hz));
    const t = (Math.log(clampedHz) - logXMin) / logXSpan;
    const x = pad + Math.max(0, Math.min(1, t)) * span;
    // Relative dB: loudest partial = full height; −60 dB = zero.
    const db = 20 * Math.log10(Math.max(1e-12, effectiveAmp[i] / maxAmp));
    const ampT = Math.max(0, Math.min(1, (db - ampFloorDb) / -ampFloorDb));
    const lineH = ampT * maxH;
    if (!(lineH > 0.5)) continue;
    const phase01 = (graph.phase[i] || 0) + masterPhase;
    const col = typeof additiveGraphPhaseColor === "function"
      ? additiveGraphPhaseColor(phase01)
      : { r: 224, g: 64, b: 251 };
    ctx.strokeStyle = `rgb(${col.r},${col.g},${col.b})`;
    ctx.lineWidth = lineW;
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
