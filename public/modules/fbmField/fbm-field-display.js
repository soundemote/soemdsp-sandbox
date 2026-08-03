// FBM Field face: paints the *actual* X/Y audio samples (scope phosphor).
// No independent GPU/JS field evaluation — visual == audio sample stream.

const nodeGraphFbmFieldSettingsDefaults = Object.freeze({
  background: "#000000",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.25, color: "#1a2744" }),
    Object.freeze({ t: 0.5, color: "#3d7ea6" }),
    Object.freeze({ t: 0.75, color: "#c4e0a8" }),
    Object.freeze({ t: 1, color: "#ffffff" }),
  ]),
});

function normalizeNodeGraphFbmFieldSettings(settings = {}) {
  // Prefer full scope2d phosphor model so trail/blur/gradient match other X/Y faces.
  if (typeof normalizeNodeGraphScope2dSettings === "function") {
    const source = settings && typeof settings === "object" ? settings : {};
    const defaults = nodeGraphFbmFieldSettingsDefaults;
    const merged = {
      ...source,
      background: source.background ?? defaults.background,
      gradientStops: source.gradientStops ?? source.gradient ?? defaults.gradientStops,
    };
    return normalizeNodeGraphScope2dSettings(merged);
  }
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphFbmFieldSettingsDefaults;
  let gradientStops = defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
  if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    if (source.gradientStops || source.gradient) {
      gradientStops = nodeGraphPhosphorGradientStopsFromSettings(
        source,
        defaults.gradientStops[defaults.gradientStops.length - 1].color,
      );
    }
  }
  return {
    background: source.background || defaults.background,
    gradientStops,
  };
}

function nodeGraphFbmFieldSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphFbmFieldSettings();
  }
  return normalizeNodeGraphFbmFieldSettings(node.traceDisplaySettings);
}

function nodeGraphFbmFieldCircuitRunning() {
  try {
    if (typeof nodeGraphModuleScopeCircuitRunning === "function") {
      return nodeGraphModuleScopeCircuitRunning();
    }
  } catch (_) { /* fall through */ }
  try {
    const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
    return Boolean(live?.outputEnabled && live?.node);
  } catch (_) {
    return false;
  }
}

function nodeGraphFbmFieldFillBlack(canvas, face) {
  if (face?.dataset) face.dataset.lightStrength = "0";
  if (face) {
    face._fbmFieldHasFrame = false;
    face._fbmFieldBlack = true;
    face.style.background = "#000000";
  }
  // Prefer shared phosphor clear if present on the scope burn canvas.
  if (canvas && typeof nodeGraphPhosphorEnergyGlClear === "function" && canvas._phosphorEnergyGl) {
    try {
      nodeGraphPhosphorEnergyGlClear(canvas._phosphorEnergyGl);
    } catch (_) { /* ignore */ }
  }
  if (canvas) {
    const gl = canvas.getContext?.("webgl") || canvas.getContext?.("experimental-webgl");
    if (gl) {
      gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return true;
    }
    const ctx = canvas.getContext?.("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width || 1, canvas.height || 1);
      return true;
    }
  }
  return true;
}

/**
 * Draw face from live X/Y scope buffers — same samples that leave the module jacks.
 */
function drawNodeGraphFbmFieldFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }

  if (!nodeGraphFbmFieldCircuitRunning()) {
    const canvas = typeof nodeGraphScope2dBurnCanvasForSlot === "function"
      ? nodeGraphScope2dBurnCanvasForSlot(slot)
      : face.querySelector?.("canvas");
    if (face._fbmFieldBlack) {
      return;
    }
    nodeGraphFbmFieldFillBlack(canvas, face);
    return;
  }
  face._fbmFieldBlack = false;

  // Delegate to the real X/Y phosphor path: deposits buffer.x / buffer.y only.
  if (typeof drawNodeGraphScope2dItem === "function") {
    drawNodeGraphScope2dItem(renderer, item, pixelRatio);
    if (face.dataset) face.dataset.lightStrength = "1";
    face._fbmFieldHasFrame = true;
    return;
  }

  // Fallback: retained burn with explicit path from buffer samples.
  const buffer = item?.buffer;
  if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  const rect = item?.scopeRect;
  if (!rect || typeof drawNodeGraphScope2dRetainedBurn !== "function") {
    return;
  }
  const square = typeof nodeGraphModuleScopeCenteredSquareRect === "function"
    ? nodeGraphModuleScopeCenteredSquareRect(rect)
    : rect;
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  const settings = typeof nodeGraphScope2dSettingsForNode === "function"
    ? nodeGraphScope2dSettingsForNode(node)
    : nodeGraphFbmFieldSettingsForNode(node);
  drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings);
  if (face.dataset) face.dataset.lightStrength = "1";
  face._fbmFieldHasFrame = true;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.fbmFieldFace = drawNodeGraphFbmFieldFaceItem;
}
