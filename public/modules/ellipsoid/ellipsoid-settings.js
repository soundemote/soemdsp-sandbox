// RoundShape / KickEnvelope face look — Display Settings schema `roundShapeFace`.
// Line / dot / background use hue + physically-plausible brightness
// (nodeGraphHueBrightnessCss: black → full hue @ 0.5 → white).

const nodeGraphRoundShapeFaceDisplaySettingsDefaults = Object.freeze({
  lineHue: 165,
  lineBrightness: 0.5,
  lineThickness: 2,
  lineBlur: 0,
  dotHue: 165,
  dotBrightness: 1,
  dotThickness: 5,
  backgroundHue: 200,
  backgroundBrightness: 0.03,
  pixelDensity: 1,
});

function nodeGraphRoundShapeWrapHue(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return ((n % 360) + 360) % 360;
}

function nodeGraphRoundShapeClamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphRoundShapeHueFromColor(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    return fallback;
  }
  if (typeof nodeGraphTraceDisplayHexToHsl === "function") {
    let hex = text;
    const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) {
      const toHex = (c) => Math.max(0, Math.min(255, Math.round(Number(c)))).toString(16).padStart(2, "0");
      hex = `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
    }
    const hsl = nodeGraphTraceDisplayHexToHsl(hex);
    if (Number.isFinite(Number(hsl?.h))) {
      return ((Number(hsl.h) % 360) + 360) % 360;
    }
  }
  return fallback;
}

function nodeGraphRoundShapePureHueHex(hueDeg, fallbackHue) {
  const hue = nodeGraphRoundShapeWrapHue(hueDeg, fallbackHue);
  if (typeof nodeGraphTraceDisplayPureHueHex === "function") {
    return nodeGraphTraceDisplayPureHueHex({ h: hue }, "#78dcc8");
  }
  return `hsl(${hue} 100% 50%)`;
}

function nodeGraphRoundShapePaintCss(hueDeg, brightness01, fallbackHue, fallbackBright) {
  const hue = nodeGraphRoundShapeWrapHue(hueDeg, fallbackHue);
  const bright = nodeGraphRoundShapeClamp01(brightness01, fallbackBright);
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(hue, bright);
  }
  return `hsl(${hue} 90% ${Math.round(bright * 100)}%)`;
}

function normalizeNodeGraphRoundShapeFaceSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const d = nodeGraphRoundShapeFaceDisplaySettingsDefaults;
  const lineHue = Number.isFinite(Number(source.lineHue))
    ? nodeGraphRoundShapeWrapHue(source.lineHue, d.lineHue)
    : nodeGraphRoundShapeHueFromColor(
      source.strokeColor ?? source.dot1Color ?? source.color ?? source.foreground,
      d.lineHue,
    );
  const dotHue = Number.isFinite(Number(source.dotHue))
    ? nodeGraphRoundShapeWrapHue(source.dotHue, d.dotHue)
    : nodeGraphRoundShapeHueFromColor(source.dotColor ?? source.playheadColor, d.dotHue);
  const backgroundHue = Number.isFinite(Number(source.backgroundHue))
    ? nodeGraphRoundShapeWrapHue(source.backgroundHue, d.backgroundHue)
    : nodeGraphRoundShapeHueFromColor(source.backgroundColor ?? source.background, d.backgroundHue);
  const lineBrightness = nodeGraphRoundShapeClamp01(source.lineBrightness, d.lineBrightness);
  const dotBrightness = nodeGraphRoundShapeClamp01(source.dotBrightness, d.dotBrightness);
  const backgroundBrightness = nodeGraphRoundShapeClamp01(
    source.backgroundBrightness,
    d.backgroundBrightness,
  );
  const thicknessRaw = Number(source.lineThickness);
  const dotThickRaw = Number(source.dotThickness);
  const blurRaw = Number(source.lineBlur ?? source.blur);
  const densityRaw = Number(source.pixelDensity);
  const strokeColor = nodeGraphRoundShapePureHueHex(lineHue, d.lineHue);
  const dotColor = nodeGraphRoundShapePureHueHex(dotHue, d.dotHue);
  const backgroundColor = nodeGraphRoundShapePureHueHex(backgroundHue, d.backgroundHue);
  const strokePaint = nodeGraphRoundShapePaintCss(lineHue, lineBrightness, d.lineHue, d.lineBrightness);
  const dotPaint = nodeGraphRoundShapePaintCss(dotHue, dotBrightness, d.dotHue, d.dotBrightness);
  const backgroundPaint = nodeGraphRoundShapePaintCss(
    backgroundHue,
    backgroundBrightness,
    d.backgroundHue,
    d.backgroundBrightness,
  );
  return {
    lineHue,
    lineBrightness,
    lineThickness: Number.isFinite(thicknessRaw)
      ? Math.max(0.25, Math.min(16, thicknessRaw))
      : d.lineThickness,
    lineBlur: Number.isFinite(blurRaw) ? Math.max(0, Math.min(8, blurRaw)) : d.lineBlur,
    dotHue,
    dotBrightness,
    dotThickness: Number.isFinite(dotThickRaw)
      ? Math.max(0.25, Math.min(32, dotThickRaw))
      : d.dotThickness,
    backgroundHue,
    backgroundBrightness,
    pixelDensity: Number.isFinite(densityRaw)
      ? Math.max(0, Math.min(1, densityRaw))
      : d.pixelDensity,
    strokeColor,
    color: strokeColor,
    dot1Color: strokeColor,
    dotColor,
    backgroundColor,
    background: backgroundColor,
    strokePaint,
    dotPaint,
    backgroundPaint,
  };
}

function nodeGraphRoundShapeFaceSettingsForNode(node) {
  return normalizeNodeGraphRoundShapeFaceSettings(node?.traceDisplaySettings);
}

function applyNodeGraphRoundShapeDisplaySettingsToFace(node) {
  if (!node?.id || typeof drawNodeGraphRoundShapeDisplay !== "function") {
    return;
  }
  const el = document.querySelector?.(
    `.node-round-shape-display[data-node="${CSS.escape(String(node.id))}"]`,
  );
  if (!el) {
    return;
  }
  el._roundShapeForceDraw = true;
  el._roundShapeLaidOut = false;
  drawNodeGraphRoundShapeDisplay(el);
}
