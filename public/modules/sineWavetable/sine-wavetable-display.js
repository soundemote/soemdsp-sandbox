// SinCos4 face — unit circle + mode phase rays (1…4).
// Geometry is authored in 0…1 face space (centered square), then scaled to the
// canvas so F-fullscreen / resize keep proportions. Position markers are round
// dots (never square caps / stretched buffer pixels).

function createNodeGraphSinCos4Display(nodeId, type = "sineWavetable") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-sincos4-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "sineWavetable");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.85";
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-sincos4-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.85";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  section.append(canvas);
  section._sinCos4Canvas = canvas;
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `sinCos4:${el.dataset?.node || ""}`,
    forceKey: "_sinCos4ForceDraw",
    rafKey: "_sinCos4PlayheadRaf",
    paint: drawNodeGraphSinCos4Display,
    onResize: (el) => {
      el._sinCos4LaidOut = false;
      el._sinCos4ForceDraw = true;
    },
    paintOnCreate: false,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphSinCos4Display(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function nodeGraphSinCos4LiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

/** Mode → relative phase offsets in cycles (A at 0). */
function nodeGraphSinCos4PhaseOffsets(mode) {
  const m = Math.max(0, Math.min(5, Math.round(Number(mode) || 0)));
  if (m === 0) return [0];
  if (m === 1) return [0.25];
  if (m === 2) return [0, 0.25];
  if (m === 3) return [0, 0.5];
  if (m === 4) return [0, 1 / 3, 2 / 3];
  return [0, 0.25, 0.5, 0.75];
}

const NODE_GRAPH_SINCOS4_COLORS = Object.freeze([
  "rgb(255, 90, 90)",
  "rgb(90, 220, 120)",
  "rgb(90, 160, 255)",
  "rgb(240, 210, 120)",
]);

/** Face look in 0…1 of the centered square (F-safe). */
function nodeGraphSinCos4FaceNorm(node) {
  const td = node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  const clamp01 = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fb;
  };
  // dot1Size 0…1 → tip radius in unit square (default ~2.2% of side).
  const tip = 0.01 + clamp01(td.dot1Size, 0.08) * 0.04;
  return {
    radius: 0.38,
    stroke: 0.012,
    tip,
    hub: tip * 0.7,
    pixelDensity: clamp01(td.pixelDensity, 1) || 1,
  };
}

function nodeGraphSinCos4Wrap01(v) {
  const n = Number(v) || 0;
  return n - Math.floor(n);
}

function nodeGraphSinCos4ReadPhase(nodeId, node, section) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__Phase", Number.NaN));
    if (Number.isFinite(live)) {
      return nodeGraphSinCos4Wrap01(live);
    }
  }
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const freq = Number(nodeGraphSinCos4LiveParam(node, "freq", 100)) || 0;
  const offset = Number(nodeGraphSinCos4LiveParam(node, "phase", 0)) || 0;
  const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
  const mul = Number.isFinite(speed) ? speed : 1;
  if (section && Number.isFinite(section._sinCos4Clock)) {
    const dt = Math.max(0, Math.min(0.25, now - section._sinCos4Clock));
    let next = (Number(section._sinCos4Phase) || 0) + freq * dt * mul;
    next = nodeGraphSinCos4Wrap01(next);
    section._sinCos4Phase = next;
    section._sinCos4Clock = now;
    return nodeGraphSinCos4Wrap01(next + offset);
  }
  if (section) {
    section._sinCos4Clock = now;
    section._sinCos4Phase = 0;
  }
  return nodeGraphSinCos4Wrap01(offset);
}

function drawNodeGraphSinCos4Display(section) {
  try {
    drawNodeGraphSinCos4DisplayInner(section);
  } catch (error) {
    console.warn("[sincos4] draw failed", error?.message || error);
    if (section) {
      section._sinCos4ForceDraw = true;
      section._sinCos4LaidOut = false;
    }
  }
}

function drawNodeGraphSinCos4FillDot(ctx, x, y, r, fillStyle) {
  if (!(r > 0)) {
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function drawNodeGraphSinCos4DisplayInner(section) {
  if (!section || section.isConnected === false) {
    return;
  }
  const nodeId = section.dataset?.node
    || section.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section._sinCos4Canvas
    || section.querySelector?.(".node-sincos4-canvas")
    || section.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }
  section._sinCos4Canvas = canvas;

  const look = nodeGraphSinCos4FaceNorm(node);
  let ctx;
  let pixelRatio = 1;
  let cssW = 0;
  let cssH = 0;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas, { pixelDensity: look.pixelDensity });
    if (!metrics?.context) {
      return;
    }
    ctx = metrics.context;
    pixelRatio = Math.max(1e-6, Number(metrics.pixelRatio) || 1);
    cssW = Math.max(1, (metrics.width || canvas.width) / pixelRatio);
    cssH = Math.max(1, (metrics.height || canvas.height) / pixelRatio);
  } else {
    let rawW = Number(section.clientWidth || section.offsetWidth) || 0;
    let rawH = Number(section.clientHeight || section.offsetHeight) || 0;
    if (rawW < 8 || rawH < 8) {
      return;
    }
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    pixelRatio = dpr * Math.max(look.pixelDensity, 1e-6);
    cssW = rawW;
    cssH = rawH;
    canvas.width = Math.max(1, Math.round(cssW * pixelRatio));
    canvas.height = Math.max(1, Math.round(cssH * pixelRatio));
    ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
  }

  const mode = Math.max(0, Math.min(5, Math.round(nodeGraphSinCos4LiveParam(node, "mode", 2))));
  const offsets = nodeGraphSinCos4PhaseOffsets(mode);
  const phase = nodeGraphSinCos4ReadPhase(nodeId, node, section);

  // CSS-pixel plate, then a centered unit square (0…1) so F scales cleanly.
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, cssW, cssH);

  const side = Math.min(cssW, cssH);
  const ox = (cssW - side) * 0.5;
  const oy = (cssH - side) * 0.5;
  ctx.translate(ox, oy);
  ctx.scale(side, side);

  const cx = 0.5;
  const cy = 0.5;
  const radius = look.radius;
  const stroke = look.stroke;
  const tipR = look.tip;
  const hubR = look.hub;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(160, 190, 210, 0.35)";
  ctx.lineWidth = stroke;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Rays: butt caps (no square tips) — position shown by round dots only.
  for (let i = 0; i < offsets.length; i += 1) {
    const ang = (phase + offsets[i]) * Math.PI * 2;
    const x = cx + Math.cos(ang) * radius;
    const y = cy - Math.sin(ang) * radius;
    const color = NODE_GRAPH_SINCOS4_COLORS[i] || NODE_GRAPH_SINCOS4_COLORS[3];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke * (i === 0 ? 1.35 : 1);
    ctx.lineCap = "butt";
    ctx.stroke();
    drawNodeGraphSinCos4FillDot(ctx, x, y, tipR * (i === 0 ? 1.15 : 1), color);
  }

  drawNodeGraphSinCos4FillDot(ctx, cx, cy, hubR, "rgba(220, 230, 240, 0.9)");

  section._sinCos4LaidOut = true;
  section._sinCos4ForceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.sinCos4Face = () => {};
}
