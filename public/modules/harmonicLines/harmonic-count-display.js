// Harmonic count face — shows H for Additive Generator / Effect.

function createNodeGraphHarmonicCountDisplay(nodeId, type = "additiveGenerator") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-harmonic-count-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveGenerator");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.5";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  const canvas = document.createElement("canvas");
  canvas.className = "node-harmonic-count-canvas";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `harmonicCount:${el.dataset?.node || ""}`,
    paint: drawNodeGraphHarmonicCountDisplay,
  });
  return section;
}

const ADDITIVE_NAMED_FACE = Object.freeze({
  additiveFrequencySkew: "FreqSkew",
  additiveQuantizeFreq: "QFreq",
  additiveQuantizePhase: "QPhase",
  additiveHarmonicMath: "QFreq",
  additiveFrequencyMath: "QFreq",
  additiveFrequencySlope: "FreqSkew",
  additiveNoisyFreq: "NoisyFreq",
  additiveNoisyPhase: "NoisyPhase",
  additivePan: "AutoPan",
  additiveNoisyPan: "NoisyPan",
  additiveNoisyAmp: "NoisyAmp",
  additiveDiffusor: "Diffusor",
  additivePhaseEntry: "PhaseEntry",
});

function nodeGraphHarmonicCountReadH(nodeId, type) {
  if (type === "additiveGenerator") {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    const n = Number(node?.params?.harmonics ?? node?.parameters?.harmonics);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const graph = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(nodeId, "Graph")
    : null;
  const published = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get?.(`${nodeId}.Graph`)
    : null;
  const g = published || graph;
  if (g && Number.isFinite(g.harmonicsExact)) return g.harmonicsExact;
  if (g && Number.isFinite(g.harmonics)) return g.harmonics;
  if (g?.ratio?.length) return g.ratio.length;
  return 0;
}

function nodeGraphHarmonicCountFaceText(nodeId, type) {
  if (ADDITIVE_NAMED_FACE[type]) {
    return ADDITIVE_NAMED_FACE[type];
  }
  const H = nodeGraphHarmonicCountReadH(nodeId, type);
  if (!(H > 0)) return "—";
  // Show one decimal when fractional (30.5); integers stay clean ("32").
  const rounded = Math.round(H);
  if (Math.abs(H - rounded) < 1e-6) return String(rounded);
  return H.toFixed(1);
}

function drawNodeGraphHarmonicCountDisplay(section) {
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
  const type = section.dataset.nodeType;
  const text = nodeGraphHarmonicCountFaceText(nodeId, type);
  // CMYK Y face ink (Yellow Graph plane).
  ctx.fillStyle = "#ffe600";
  // Named faces (Bubble / Noisy) need a smaller font than a single H digit.
  const isName = Boolean(ADDITIVE_NAMED_FACE[type]);
  const fontPx = isName
    ? Math.max(11, Math.min(18, Math.floor(Math.min(h * 0.42, w / Math.max(8, text.length) * 1.6))))
    : Math.max(14, Math.floor(h * 0.45));
  ctx.font = `600 ${fontPx}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w * 0.5, h * 0.5);
  section._forceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.harmonicCount = () => {};
}
