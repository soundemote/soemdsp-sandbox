// Additive Generator face — cheap one-cycle bake from Yellow Graph.
// O(min(H,64)·N); rebakes when Graph fingerprint changes.

function createNodeGraphAdditiveWaveformDisplay(nodeId, type = "additiveGenerator") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-additive-waveform-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveGenerator");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.55";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.syncFromParameters = () => {
    section._bakeKey = "";
    section._forceDraw = true;
    drawNodeGraphAdditiveWaveformDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-additive-waveform-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._forceDraw = true;
      drawNodeGraphAdditiveWaveformDisplay(section);
    });
    ro.observe(section);
    section._ro = ro;
  }
  const tick = () => {
    drawNodeGraphAdditiveWaveformDisplay(section);
    section._raf = requestAnimationFrame(tick);
  };
  section._raf = requestAnimationFrame(tick);
  return section;
}

function nodeGraphAdditiveWaveformReadGraph(nodeId) {
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

function nodeGraphAdditiveWaveformFingerprint(graph) {
  if (!graph || !graph.ratio) return "";
  const H = Math.min(graph.ratio.length | 0, 64);
  let h = `${H}|`;
  // Sparse sample of ratio/amp/phase — enough to detect waveform changes.
  const step = Math.max(1, (H / 8) | 0);
  for (let i = 0; i < H; i += step) {
    h += `${(Number(graph.ratio[i]) || 0).toFixed(4)},`;
    h += `${(Number(graph.amplitude?.[i]) || 0).toFixed(3)},`;
    h += `${(Number(graph.phase?.[i]) || 0).toFixed(3)};`;
  }
  return h;
}

function drawNodeGraphAdditiveWaveformDisplay(section) {
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
  const graph = nodeGraphAdditiveWaveformReadGraph(nodeId);
  if (!graph || !graph.ratio || !graph.ratio.length) {
    ctx.fillStyle = "#666";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", w * 0.5, h * 0.5);
    section._forceDraw = false;
    return;
  }

  const N = Math.max(64, Math.min(256, Math.round(w)));
  const key = `${N}|${nodeGraphAdditiveWaveformFingerprint(graph)}`;
  if (!section._wave || section._wave.length !== N || section._bakeKey !== key) {
    if (!section._wave || section._wave.length !== N) {
      section._wave = new Float32Array(N);
    }
    if (typeof additiveGraphBakeWaveform === "function") {
      additiveGraphBakeWaveform(graph, section._wave, 64);
    }
    section._bakeKey = key;
  }

  const wave = section._wave;
  const midY = h * 0.5;
  const ampY = h * 0.42;
  const pad = Math.max(2, w * 0.03);
  const span = Math.max(1, w - pad * 2);

  ctx.strokeStyle = "rgb(255, 210, 40)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let n = 0; n < wave.length; n += 1) {
    const x = pad + (n / Math.max(1, wave.length - 1)) * span;
    const y = midY - (Number(wave[n]) || 0) * ampY;
    if (n === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  section._forceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.additiveWaveform = () => {};
}
