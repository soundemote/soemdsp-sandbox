// Face for Additive Linear / Analog Filter — draws slope→brickwall response.

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
  const cutoff = num(p.cutoff, 0.5);
  const slope = num(p.slope, 0.25);
  const skew = type === "additiveAnalogFilter"
    ? num(p.skew, 0)
    : 0;
  return {
    mode: filter,
    cutoff,
    slope,
    skew,
    curveKind: type === "additiveAnalogFilter" ? "analog" : "linear",
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
  const ys = typeof additiveGraphFilterResponseCurve === "function"
    ? additiveGraphFilterResponseCurve(
      params.mode,
      params.cutoff,
      params.slope,
      params.curveKind,
      params.skew,
      samples,
    )
    : null;

  const sig = [
    type,
    params.mode,
    params.cutoff.toFixed(4),
    params.slope.toFixed(4),
    params.skew.toFixed(4),
    w,
    h,
  ].join("|");
  if (section._curveSig === sig && !section._forceDraw) return;
  section._curveSig = sig;
  section._forceDraw = false;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);

  // Light grid
  ctx.strokeStyle = "rgba(255, 230, 0, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.lineTo(w, h * 0.5);
  ctx.moveTo(w * params.cutoff, 0);
  ctx.lineTo(w * params.cutoff, h);
  ctx.stroke();

  if (!ys || !ys.length) return;

  const padY = 3;
  ctx.strokeStyle = "#ffe600";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < ys.length; i += 1) {
    const x = (i / Math.max(1, ys.length - 1)) * w;
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
