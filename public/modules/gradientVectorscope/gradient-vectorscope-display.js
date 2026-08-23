// Gradient Vectorscope — woscope XY beam + dest pixel buffer.
// Ghost/Trail fade the face; new samples stamp on top. Gradient walks the
// beam along History (oldest stop → newest stop). Not a vector polyline.

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
  ghost: typeof PhosphorResidual !== "undefined" ? PhosphorResidual.DEFAULT_GHOST : 0.45,
  trail: typeof PhosphorResidual !== "undefined" ? PhosphorResidual.DEFAULT_TRAIL : 0.88,
  historySeconds: 1,
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
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trail = Residual?.migrateTrail
    ? Residual.migrateTrail(source, d.trail)
    : Math.max(0, Math.min(1, num("trail", d.trail)));
  const ghost = Residual?.migrateGhost
    ? Residual.migrateGhost(source, d.ghost)
    : Math.max(0, Math.min(1, num("ghost", d.ghost)));
  return {
    ...plate,
    dot1Size: Math.max(0, Math.min(1, num("dot1Size", d.dot1Size))),
    gradientStops,
    ghost,
    trail,
    historySeconds: Math.max(0.02, Math.min(8, num("historySeconds", d.historySeconds))),
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
  const sizeKey = `${canvas.width}x${canvas.height}`;
  if (canvas._gvsSizeKey !== sizeKey) {
    canvas._gvsSizeKey = sizeKey;
    canvas._gvsPrimed = false;
    canvas._gvsAbs = 0;
    canvas._gvsLastPoint = null;
  }
  if (!canvas._gvsPrimed) {
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    canvas._gvsPrimed = true;
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen) {
    return;
  }

  if (typeof nodeGraphScopeDestFadeTowardPlate === "function") {
    nodeGraphScopeDestFadeTowardPlate(ctx, canvas, bg, settings.trail, settings.ghost);
  } else {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.max(0.02, 1 - Number(settings.trail || 0) * 0.97);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const source = typeof nodeGraphRgbPickPortBuffer === "function"
    ? nodeGraphRgbPickPortBuffer(slot, "X")
    : null;
  const sampleRate = Math.max(
    1,
    Number(source?.nodeGraphScopeSampleRate)
      || Number(nodeGraphModuleScopeState?.sampleRate)
      || Number(nodeGraphMvp?.sampleRate)
      || 44100,
  );
  const abs = Math.max(0, Math.floor(Number(source?.nodeGraphScopeTotalSampleCount) || 0));
  const prev = Number(canvas._gvsAbs || 0);
  const deltaSec = prev > 0 && abs > prev
    ? (abs - prev) / sampleRate
    : 0;
  const catchUp = prev > 0
    ? Math.min(settings.historySeconds, Math.max(0.004, deltaSec))
    : Math.min(settings.historySeconds, 0.05);
  const captured = typeof nodeGraphRgbAlignedCapture === "function"
    ? nodeGraphRgbAlignedCapture(slot, ["X", "Y"], catchUp)
    : null;
  if (abs) {
    canvas._gvsAbs = abs;
  }
  if (!captured?.length) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const side = Math.min(w, h);
  const ox = (w - side) * 0.5;
  const oy = (h - side) * 0.5;
  const scale = settings.scale;
  const period = Math.max(1, Math.round(settings.historySeconds * sampleRate));
  const absStart = Math.max(0, abs - captured.length);
  const points = [];
  if (canvas._gvsLastPoint) {
    points.push(canvas._gvsLastPoint);
  }
  let lastPoint = canvas._gvsLastPoint || null;
  for (let i = 0; i < captured.length; i += 1) {
    const rotated = nodeGraphGradientVectorscopeRotate(captured.X[i], captured.Y[i], settings.rotate90);
    const px = ox + (0.5 + 0.5 * Math.max(-1, Math.min(1, rotated.x * scale))) * side;
    const py = oy + (0.5 + 0.5 * Math.max(-1, Math.min(1, -rotated.y * scale))) * side;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      points.push(null);
      lastPoint = null;
      continue;
    }
    const t = ((absStart + i) % period) / period;
    const point = { x: px, y: py, t };
    points.push(point);
    lastPoint = point;
  }
  canvas._gvsLastPoint = lastPoint;
  if (typeof TraceWoscope === "undefined" || typeof TraceWoscope.draw !== "function") {
    return;
  }
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(settings.gradientStops, t, "#d8f4ff")
    : null;
  TraceWoscope.draw(ctx, points, {
    size: settings.dot1Size,
    faceMinSide: side,
    gradientStops: settings.gradientStops,
    sampleRgb: sample,
  });
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.gradientVectorscopeFace = drawNodeGraphGradientVectorscopeFaceItem;
}
