// Face for Additive Linear / Analog Filter —
// response on the same log-Hz X axis as Additive Out harmonicLines.

function createNodeGraphAdditiveFilterCurveDisplay(nodeId, type = "additiveLinearFilter") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-additive-filter-curve-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveLinearFilter");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.5";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.syncFromParameters = () => {
    section._forceDraw = true;
    drawNodeGraphAdditiveFilterCurveDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-additive-filter-curve-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      section._forceDraw = true;
      drawNodeGraphAdditiveFilterCurveDisplay(section);
    });
    ro.observe(section);
    section._ro = ro;
  }
  const tick = () => {
    drawNodeGraphAdditiveFilterCurveDisplay(section);
    section._raf = requestAnimationFrame(tick);
  };
  section._raf = requestAnimationFrame(tick);
  return section;
}

function nodeGraphAdditiveFilterCurveReadParams(nodeId, type) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const p = node?.params || node?.parameters || {};
  const num = typeof nodeGraphFiniteNumber === "function"
    ? nodeGraphFiniteNumber
    : (v, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
  const filter = num(p.filter, 0);
  const cutoffHz = num(p.cutoff, 2000);
  const isLinear = type === "additiveLinearFilter";
  const slope = num(p.slope, isLinear ? 0.25 : 12);
  const skew = num(p.skew, 0);
  const resonance = type === "additiveLadderFilter" ? num(p.resonance, 0) : 0;
  const sr = Math.max(
    1,
    Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.sampleRate : 0)
      || Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.sampleRate : 0)
      || 44100,
  );
  let curveKind = "butterworth";
  if (isLinear) curveKind = "rational";
  else if (type === "additiveLadderFilter") curveKind = "ladder";
  return {
    mode: filter,
    cutoffHz,
    slope,
    skew,
    resonance,
    sampleRate: sr,
    curveKind,
  };
}

function drawNodeGraphAdditiveFilterCurveDisplay(section) {
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

  const nodeId = section.dataset.node;
  const type = section.dataset.nodeType;
  const params = nodeGraphAdditiveFilterCurveReadParams(nodeId, type);
  const samples = Math.max(32, Math.min(256, Math.round(w)));
  const curve = params.curveKind === "ladder"
    && typeof additiveGraphLadderResponseCurveLogHz === "function"
    ? additiveGraphLadderResponseCurveLogHz(
      params.mode,
      params.cutoffHz,
      params.slope,
      params.resonance,
      params.sampleRate,
      samples,
    )
    : (typeof additiveGraphFilterResponseCurveLogHz === "function"
      ? additiveGraphFilterResponseCurveLogHz(
        params.mode,
        params.cutoffHz,
        params.slope,
        params.curveKind,
        params.skew,
        params.sampleRate,
        samples,
      )
      : null);
  const ys = curve?.ys || null;
  const cutoffT = Number.isFinite(curve?.cutoffT) ? curve.cutoffT : 0;

  const sig = [
    type,
    params.mode,
    params.cutoffHz.toFixed(2),
    params.slope.toFixed(4),
    params.skew.toFixed(4),
    Number(params.resonance || 0).toFixed(4),
    params.sampleRate,
    w,
    h,
  ].join("|");
  if (section._curveSig === sig && !section._forceDraw) return;
  section._curveSig = sig;
  section._forceDraw = false;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);

  // Same framing as Additive Out: pad + log-X cutoff marker.
  const pad = Math.max(2, w * 0.02);
  const span = Math.max(1, w - pad * 2);

  ctx.strokeStyle = "rgba(255, 230, 0, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, h * 0.5);
  ctx.lineTo(pad + span, h * 0.5);
  const cutX = pad + Math.max(0, Math.min(1, cutoffT)) * span;
  ctx.moveTo(cutX, 0);
  ctx.lineTo(cutX, h);
  ctx.stroke();

  if (!ys || !ys.length) return;

  const padY = 3;
  ctx.strokeStyle = "#ffe600";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < ys.length; i += 1) {
    const u = i / Math.max(1, ys.length - 1);
    const x = pad + u * span;
    const g = Number(ys[i]) || 0;
    const y = padY + (1 - g) * (h - padY * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.additiveFilterCurve = () => {};
}
