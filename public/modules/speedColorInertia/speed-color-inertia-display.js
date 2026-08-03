// Speed Color Inertia face: solid color plate (not a waveform trace).
// Buffer source is Inertia (0…1 sat). Hue / Lightness from module params.

function drawNodeGraphSpeedColorInertiaFaceItem(_renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(item?.slot)
    : null;
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (
    !canvas
    || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function"
    || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)
  ) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const buffer = item?.buffer;
  let inertia = 1;
  if (buffer?.length) {
    if (Number.isFinite(buffer.nodeGraphScopeLightTarget)) {
      inertia = Number(buffer.nodeGraphScopeLightTarget);
    } else if (typeof nodeGraphOscilloscopeLatestSample === "function") {
      inertia = nodeGraphOscilloscopeLatestSample(buffer, 1);
    } else {
      inertia = Number(buffer[buffer.length - 1]);
    }
  }
  if (!Number.isFinite(inertia)) inertia = 1;
  inertia = Math.max(0, Math.min(1, inertia));

  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  let hue = 240 / 360;
  let lightness = 0.5;
  if (typeof nodeGraphReadNodeNumber === "function") {
    const h = nodeGraphReadNodeNumber(nodeId, "hue");
    const l = nodeGraphReadNodeNumber(nodeId, "lightness");
    if (Number.isFinite(h)) hue = h;
    if (Number.isFinite(l)) lightness = l;
  } else {
    const hp = Number(node?.params?.hue);
    const lp = Number(node?.params?.lightness);
    if (Number.isFinite(hp)) hue = hp;
    if (Number.isFinite(lp)) lightness = lp;
  }

  const css = typeof nodeGraphSpeedColorInertiaHslCss === "function"
    ? nodeGraphSpeedColorInertiaHslCss(inertia, hue, lightness)
    : `hsl(${(((hue % 1) + 1) % 1) * 360}, ${inertia * 100}%, ${Math.max(0, Math.min(1, lightness)) * 100}%)`;

  const sig = `${css}|${canvas.width}x${canvas.height}`;
  if (canvas._speedColorInertiaSig === sig) {
    if (screenElement?.dataset) {
      screenElement.dataset.lightStrength = String(Math.max(0.15, inertia * 0.85 + 0.15));
    }
    return;
  }
  canvas._speedColorInertiaSig = sig;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (screenElement?.dataset) {
    // Dimmer punch: brighter when more saturated / lively.
    screenElement.dataset.lightStrength = String(Math.max(0.15, inertia * 0.85 + 0.15));
  }
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(screenElement, Math.max(0.15, inertia * 0.85 + 0.15));
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.speedColorInertiaFace = drawNodeGraphSpeedColorInertiaFaceItem;
}
