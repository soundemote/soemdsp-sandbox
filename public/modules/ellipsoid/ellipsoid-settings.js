// RoundShape / KickEnvelope face look — Display Settings schema `roundShapeFace`.
// Fields: line thickness (CSS px), line blur (CSS px), pixel density.
// Colors: background, foreground (stroke), cursor dot.

const nodeGraphRoundShapeFaceDisplaySettingsDefaults = Object.freeze({
  background: "#020609",
  backgroundColor: "#020609",
  strokeColor: "rgba(120, 220, 200, 0.92)",
  dotColor: "#ffffff",
  lineThickness: 2,
  lineBlur: 0,
  pixelDensity: 1,
});

function nodeGraphRoundShapeParseColor(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    return fallback;
  }
  if (
    /^#[0-9a-fA-F]{3}$/.test(text)
    || /^#[0-9a-fA-F]{6}$/.test(text)
    || /^#[0-9a-fA-F]{8}$/.test(text)
    || /^rgba?\(/i.test(text)
    || /^hsla?\(/i.test(text)
  ) {
    return text;
  }
  return fallback;
}

function normalizeNodeGraphRoundShapeFaceSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphRoundShapeFaceDisplaySettingsDefaults;
  const background = nodeGraphRoundShapeParseColor(
    source.backgroundColor ?? source.background,
    defaults.background,
  );
  const strokeColor = nodeGraphRoundShapeParseColor(
    source.strokeColor ?? source.dot1Color ?? source.color ?? source.foreground,
    defaults.strokeColor,
  );
  const dotColor = nodeGraphRoundShapeParseColor(
    source.dotColor ?? source.playheadColor,
    defaults.dotColor,
  );
  const thicknessRaw = Number(source.lineThickness);
  const blurRaw = Number(source.lineBlur ?? source.blur);
  const densityRaw = Number(source.pixelDensity);
  return {
    background,
    backgroundColor: background,
    strokeColor,
    color: strokeColor,
    dot1Color: strokeColor,
    dotColor,
    lineThickness: Number.isFinite(thicknessRaw)
      ? Math.max(0.25, Math.min(16, thicknessRaw))
      : defaults.lineThickness,
    lineBlur: Number.isFinite(blurRaw)
      ? Math.max(0, Math.min(8, blurRaw))
      : defaults.lineBlur,
    pixelDensity: Number.isFinite(densityRaw)
      ? Math.max(0, Math.min(4, densityRaw))
      : defaults.pixelDensity,
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
