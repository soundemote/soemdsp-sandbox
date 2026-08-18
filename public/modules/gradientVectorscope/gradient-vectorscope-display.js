// Gradient Vectorscope — 2D history plot with color along path length.
// Music Player motion: clear + redraw last N seconds. Not phosphor residual.

const nodeGraphGradientVectorscopeDefaultStops = Object.freeze([
  Object.freeze({ t: 0, color: "#143048" }),
  Object.freeze({ t: 1, color: "#d8f4ff" }),
]);

const nodeGraphGradientVectorscopeSettingsDefaults = Object.freeze({
  background: "#000004",
  backgroundHue: 210,
  backgroundBrightness: 0,
  dot1Size: 0.06,
  gradientStops: nodeGraphGradientVectorscopeDefaultStops,
  historySeconds: 1,
  fade: 0,
  lineThickness: 0.15,
  dotBudget: 2048,
  pixelDensity: 1,
  rotate90: false,
  scale: 1,
});

function normalizeNodeGraphGradientVectorscopeSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const d = nodeGraphGradientVectorscopeSettingsDefaults;
  const num = (key, fallback) => {
    const n = Number(source[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const plate = typeof nodeGraphDisplaySettingsNormalizePlateLook === "function"
    ? nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...d,
      backgroundBrightness: d.backgroundBrightness ?? 0,
      backgroundHue: d.backgroundHue ?? 0,
    })
    : {
      background: typeof normalizeNodeGraphTraceDisplayColor === "function"
        ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, d.background)
        : String(source.background || d.background),
      backgroundColor: source.backgroundColor || source.background || d.background,
      backgroundHue: Number(source.backgroundHue) || 0,
      backgroundBrightness: Number(source.backgroundBrightness) || 0,
    };
  let gradientStops;
  if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, d.gradientStops[1].color);
  } else if (Array.isArray(source.gradientStops) && source.gradientStops.length >= 2) {
    gradientStops = source.gradientStops;
  } else {
    gradientStops = d.gradientStops.map((stop) => ({ t: stop.t, color: stop.color }));
  }
  const rotateRaw = source.rotate90;
  const rotate90 = rotateRaw === true || rotateRaw === 1 || rotateRaw === "true" || rotateRaw === "1";
  const blurRaw = source.lineThickness ?? source.blur ?? source.dot1Blur;
  return {
    ...plate,
    dot1Size: Math.max(0, Math.min(1, num("dot1Size", d.dot1Size))),
    gradientStops,
    historySeconds: Math.max(0.02, Math.min(8, num("historySeconds", d.historySeconds))),
    fade: Math.max(0, Math.min(1, num("fade", d.fade))),
    lineThickness: Math.max(0, Math.min(1, Number.isFinite(Number(blurRaw)) ? Number(blurRaw) : d.lineThickness)),
    dotBudget: Math.max(64, Math.min(8192, Math.round(num("dotBudget", d.dotBudget)))),
    pixelDensity: Math.max(0, Math.min(1, num("pixelDensity", d.pixelDensity))),
    rotate90,
    scale: Math.max(0.05, Math.min(8, num("scale", d.scale))),
  };
}

function nodeGraphGradientVectorscopeSettingsForNode(node) {
  return normalizeNodeGraphGradientVectorscopeSettings(node?.traceDisplaySettings);
}

function nodeGraphGradientVectorscopeRotate(x, y, rotate90) {
  if (!rotate90) {
    return { x, y };
  }
  if (typeof nodeGraphVectorscopeTransform === "function") {
    return nodeGraphVectorscopeTransform(x, y);
  }
  const s = Math.SQRT1_2;
  return { x: (x - y) * s, y: (x + y) * s };
}

function drawNodeGraphGradientVectorscopeFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  const settings = nodeGraphGradientVectorscopeSettingsForNode(
    typeof nodeGraphModuleScopeNodeForSlot === "function" ? nodeGraphModuleScopeNodeForSlot(slot) : null,
  );
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, face, pixelRatio, density)) {
    return;
  }
  canvas.classList.add("node-module-scope-vector-trace");
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(settings)
    : settings.background;
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, bg);
  }
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen) {
    return;
  }
  const captured = typeof nodeGraphRgbAlignedCapture === "function"
    ? nodeGraphRgbAlignedCapture(slot, ["X", "Y"], settings.historySeconds)
    : null;
  if (!captured?.length) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const side = Math.min(w, h);
  const ox = (w - side) * 0.5;
  const oy = (h - side) * 0.5;
  const scale = settings.scale;
  const points = [];
  for (let i = 0; i < captured.length; i += 1) {
    const rotated = nodeGraphGradientVectorscopeRotate(captured.X[i], captured.Y[i], settings.rotate90);
    const px = ox + (0.5 + 0.5 * Math.max(-1, Math.min(1, rotated.x * scale))) * side;
    const py = oy + (0.5 + 0.5 * Math.max(-1, Math.min(1, -rotated.y * scale))) * side;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      points.push(null);
      continue;
    }
    points.push({ x: px, y: py });
  }
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(settings.gradientStops, t, "#d8f4ff")
    : (t) => {
      const v = Math.round(t * 255);
      return [v, v, v];
    };
  if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeGradient === "function") {
    TraceHistoryDraw.strokeGradient(ctx, points.filter(Boolean), {
      size: settings.dot1Size,
      blur: settings.lineThickness,
      fade: Number.isFinite(Number(settings.fade)) ? Number(settings.fade) : 0,
      dotBudget: settings.dotBudget,
      faceMinSide: side,
      sampleRgb: sample,
      colorA: settings.gradientStops?.[0]?.color,
      colorB: settings.gradientStops?.[settings.gradientStops.length - 1]?.color,
    });
    return;
  }
  const widthPx = typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function"
    ? TraceStroke.diameterPx(side, settings.dot1Size)
    : side * Number(settings.dot1Size || 0);
  if (!(widthPx > 0)) {
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = widthPx;
  let prev = null;
  const last = points.length - 1;
  for (let i = 0; i <= last; i += 1) {
    const p = points[i];
    if (!p) {
      prev = null;
      continue;
    }
    if (!prev) {
      prev = p;
      continue;
    }
    const t = last > 0 ? i / last : 1;
    const rgb = sample(t);
    ctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
  }
  ctx.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.gradientVectorscopeFace = drawNodeGraphGradientVectorscopeFaceItem;
}
