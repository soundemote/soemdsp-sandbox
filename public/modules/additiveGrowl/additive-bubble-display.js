// Bubble face — one-cycle bake of the waveform Bubble produces.
// Clone incoming Graph → ApplyGrowl with current knobs → BakeWaveform.

function createNodeGraphAdditiveBubbleDisplay(nodeId, type = "additiveBubble") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-additive-bubble-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveBubble");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.55";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  const canvas = document.createElement("canvas");
  canvas.className = "node-additive-bubble-canvas";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `additiveBubble:${el.dataset?.node || ""}`,
    paint: drawNodeGraphAdditiveBubbleDisplay,
    onSync: (el) => { el._bakeKey = ""; },
  });
  return section;
}

function nodeGraphAdditiveBubbleReadIncomingGraph(nodeId) {
  // Prefer published output (already processed) when the bus has it.
  if (typeof nodeGraphDataBus !== "undefined") {
    const pub = nodeGraphDataBus.get?.(`${nodeId}.Graph`);
    if (pub?.ratio) return { graph: pub, processed: true };
  }
  if (typeof readNodeGraphDataInput === "function") {
    const g = readNodeGraphDataInput(nodeId, "Graph");
    if (g?.ratio) return { graph: g, processed: false };
  }
  return { graph: null, processed: false };
}

function nodeGraphAdditiveBubbleReadParams(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const p = node?.params || node?.parameters || {};
  const num = typeof nodeGraphFiniteNumber === "function"
    ? nodeGraphFiniteNumber
    : (v, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
  const bubble = Math.max(0, Math.min(1, num(p.bubble, 0)));
  const invert = num(p.invertBubble, 0) >= 0.5;
  return {
    phaseSkew: num(p.phaseSkew, 0),
    bubble,
    invertBubble: invert ? 1 : 0,
    skewAmount: invert ? -bubble : bubble,
    cutoff: num(p.cutoff, 1),
    unskew: num(p.unskew, 481.53),
  };
}

function nodeGraphAdditiveBubbleFingerprint(graph, params) {
  if (!graph || !graph.ratio) return "";
  const H = Math.min(graph.ratio.length | 0, 64);
  let h = `${H}|`;
  const step = Math.max(1, (H / 8) | 0);
  for (let i = 0; i < H; i += step) {
    h += `${(Number(graph.ratio[i]) || 0).toFixed(4)},`;
    h += `${(Number(graph.amplitude?.[i]) || 0).toFixed(3)},`;
    h += `${(Number(graph.phase?.[i]) || 0).toFixed(3)};`;
  }
  h += `|${params.phaseSkew.toFixed(3)}|${(Number(params.bubble) || 0).toFixed(4)}`;
  h += `|${params.invertBubble ? 1 : 0}|${params.cutoff.toFixed(4)}|${params.unskew.toFixed(3)}`;
  return h;
}

function nodeGraphAdditiveBubbleBuildPreviewGraph(incoming, params) {
  if (!incoming?.ratio || typeof additiveGraphClonePayload !== "function") return null;
  if (typeof additiveGraphApplyGrowl !== "function") return additiveGraphClonePayload(incoming);
  const out = additiveGraphClonePayload(incoming);
  if (!out) return null;
  let cutoff = Number(params.cutoff);
  if (!(cutoff === cutoff)) cutoff = 1;
  const phaseSkew = typeof additiveGraphBubbleEffectivePhaseSkew === "function"
    ? additiveGraphBubbleEffectivePhaseSkew(params.phaseSkew, params.unskew, cutoff)
    : params.phaseSkew;
  additiveGraphApplyGrowl(
    out,
    0,
    phaseSkew,
    params.skewAmount,
    2, // Logarithmic
    cutoff,
    0,
    null,
  );
  return out;
}

function drawNodeGraphAdditiveBubbleDisplay(section) {
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
  const params = nodeGraphAdditiveBubbleReadParams(nodeId);
  const { graph: incoming, processed } = nodeGraphAdditiveBubbleReadIncomingGraph(nodeId);
  if (!incoming || !incoming.ratio || !incoming.ratio.length) {
    ctx.fillStyle = "#666";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", w * 0.5, h * 0.5);
    section._forceDraw = false;
    return;
  }

  // If bus already has Bubble's output, bake that; else apply knobs locally.
  const preview = processed
    ? incoming
    : nodeGraphAdditiveBubbleBuildPreviewGraph(incoming, params);
  if (!preview?.ratio) {
    section._forceDraw = false;
    return;
  }

  const N = Math.max(64, Math.min(256, Math.round(w)));
  const key = `${N}|${nodeGraphAdditiveBubbleFingerprint(preview, params)}|${processed ? 1 : 0}`;
  if (!section._wave || section._wave.length !== N || section._bakeKey !== key) {
    if (!section._wave || section._wave.length !== N) {
      section._wave = new Float32Array(N);
    }
    if (typeof additiveGraphBakeWaveform === "function") {
      additiveGraphBakeWaveform(preview, section._wave, 64);
    }
    section._bakeKey = key;
  }

  const wave = section._wave;
  const midY = h * 0.5;
  const ampY = h * 0.42;
  const pad = Math.max(2, w * 0.03);
  const span = Math.max(1, w - pad * 2);

  // CMYK Y ink — same plane as Generator face.
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
  nodeGraphModuleScopeCustomRenderers.additiveBubbleCascade = () => {};
}
