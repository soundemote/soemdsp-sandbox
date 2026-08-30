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
  section.syncFromParameters = () => {
    section._forceDraw = true;
    drawNodeGraphHarmonicCountDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-harmonic-count-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._forceDraw = true;
      drawNodeGraphHarmonicCountDisplay(section);
    });
    ro.observe(section);
    section._ro = ro;
  }
  const tick = () => {
    drawNodeGraphHarmonicCountDisplay(section);
    section._raf = requestAnimationFrame(tick);
  };
  section._raf = requestAnimationFrame(tick);
  return section;
}

function nodeGraphHarmonicCountReadH(nodeId, type) {
  if (type === "additiveGenerator") {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    const n = Number(node?.params?.harmonics ?? node?.parameters?.harmonics);
    if (Number.isFinite(n) && n >= 1) return Math.round(n);
  }
  const graph = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(nodeId, "Graph")
    : (typeof nodeGraphDataBus !== "undefined"
      ? nodeGraphDataBus.get?.(`${nodeId}.Graph`)
      : null);
  // Generator publishes OUT; Effect may show incoming or outgoing.
  const published = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get?.(`${nodeId}.Graph`)
    : null;
  const g = published || graph;
  if (g && Number.isFinite(g.harmonics)) return Math.round(g.harmonics);
  if (g?.ratio?.length) return g.ratio.length;
  return 0;
}

function drawNodeGraphHarmonicCountDisplay(section) {
  if (!section) return;
  const canvas = section.querySelector("canvas");
  if (!canvas) return;
  const rect = section.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);
  const nodeId = section.dataset.node;
  const type = section.dataset.nodeType;
  const H = nodeGraphHarmonicCountReadH(nodeId, type);
  ctx.fillStyle = "#e040fb";
  ctx.font = `600 ${Math.max(14, Math.floor(h * 0.45))}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(H > 0 ? String(H) : "—", w * 0.5, h * 0.5);
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.harmonicCount = () => {};
}
