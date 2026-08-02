// Shape face renderer (displayType rgbShapeFace): gradient fill + geometry.

const nodeGraphRgbShapeSettingsDefaults = Object.freeze({
  background: "#000000",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.35, color: "#1a4a88" }),
    Object.freeze({ t: 0.7, color: "#3ecf8e" }),
    Object.freeze({ t: 1, color: "#f0f4ff" }),
  ]),
});

function normalizeNodeGraphRgbShapeSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphRgbShapeSettingsDefaults;
  const gradientStops = typeof nodeGraphPhosphorGradientStopsFromSettings === "function"
    ? nodeGraphPhosphorGradientStopsFromSettings(source, defaults.gradientStops[defaults.gradientStops.length - 1].color)
    : (Array.isArray(source.gradientStops) && source.gradientStops.length >= 2
      ? source.gradientStops
      : defaults.gradientStops.map((s) => ({ t: s.t, color: s.color })));
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, defaults.background)
    : String(source.background || defaults.background);
  return {
    background,
    gradientStops,
  };
}

function nodeGraphRgbShapeSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphRgbShapeSettings();
  }
  return normalizeNodeGraphRgbShapeSettings(node.traceDisplaySettings);
}

function nodeGraphRgbShapeCanvasForSlot(slot) {
  const face = slot?.scopeElement;
  if (!face) {
    return null;
  }
  return face.querySelector?.(":scope > .node-rgb-shape-canvas")
    || face.querySelector?.(".node-rgb-shape-canvas")
    || null;
}

function syncNodeGraphRgbShapeCanvas(canvas, face, pixelRatio) {
  if (!canvas || !face) {
    return false;
  }
  const dpr = Math.max(1, Number(pixelRatio) || window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(face.clientWidth * dpr));
  const h = Math.max(1, Math.round(face.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  return w > 0 && h > 0;
}

function nodeGraphRgbShapeReadParam(nodeId, key, fallback) {
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = nodeGraphReadNodeNumber(nodeId, key);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const raw = Number(node?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function nodeGraphRgbShapePath(ctx, shapeIndex, cx, cy, halfW, halfH) {
  const kind = Math.max(0, Math.min(4, Math.round(Number(shapeIndex) || 0)));
  ctx.beginPath();
  if (kind === 1) {
    // Circle (ellipse from half extents)
    ctx.ellipse(cx, cy, Math.max(0.5, halfW), Math.max(0.5, halfH), 0, 0, Math.PI * 2);
    return;
  }
  if (kind === 0) {
    // Square / rect
    ctx.rect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
    return;
  }
  if (kind === 2) {
    // Triangle (point up)
    ctx.moveTo(cx, cy - halfH);
    ctx.lineTo(cx + halfW, cy + halfH);
    ctx.lineTo(cx - halfW, cy + halfH);
    ctx.closePath();
    return;
  }
  if (kind === 4) {
    // Diamond
    ctx.moveTo(cx, cy - halfH);
    ctx.lineTo(cx + halfW, cy);
    ctx.lineTo(cx, cy + halfH);
    ctx.lineTo(cx - halfW, cy);
    ctx.closePath();
    return;
  }
  // Star (5-point), ellipse-scaled
  const points = 5;
  const outer = 1;
  const inner = 0.42;
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * halfW * r;
    const py = cy + Math.sin(a) * halfH * r;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function paintNodeGraphRgbShapeFace(canvas, face, nodeId, buffer = null) {
  if (!canvas || !face || !nodeId) {
    return false;
  }
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  if (!syncNodeGraphRgbShapeCanvas(canvas, face, pixelRatio)) {
    return false;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphRgbShapeSettingsForNode(patchNode);
  const w = canvas.width;
  const h = canvas.height;
  const bg = settings.background || "#000000";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  let position = nodeGraphRgbShapeReadParam(nodeId, "position", 0.5);
  // Optional: live In can bias position slightly when a sample is present.
  if (buffer?.length && !buffer.nodeGraphScopeXy) {
    const sample = typeof nodeGraphOscilloscopeLatestSample === "function"
      ? nodeGraphOscilloscopeLatestSample(buffer, 0)
      : Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      // Soft drive: keep knob as base, add In as offset clamped.
      position = Math.max(0, Math.min(1, position + sample * 0.5));
    }
  }
  const width = Math.max(0, nodeGraphRgbShapeReadParam(nodeId, "width", 0.5));
  const height = Math.max(0, nodeGraphRgbShapeReadParam(nodeId, "height", 0.5));
  const x = nodeGraphRgbShapeReadParam(nodeId, "x", 0);
  const y = nodeGraphRgbShapeReadParam(nodeId, "y", 0);
  const shape = nodeGraphRgbShapeReadParam(nodeId, "shape", 0);

  const cx = w * 0.5 + (Math.max(-1, Math.min(1, x)) * w * 0.5);
  // +Y is up in modular space → invert for canvas
  const cy = h * 0.5 - (Math.max(-1, Math.min(1, y)) * h * 0.5);
  // Center-based: param 2 ≈ full face span
  const halfW = Math.max(0.5, (width * 0.5) * (w * 0.5));
  const halfH = Math.max(0.5, (height * 0.5) * (h * 0.5));

  const peak = settings.gradientStops?.[settings.gradientStops.length - 1]?.color || "#f0f4ff";
  let rgb = [240, 244, 255];
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    rgb = nodeGraphSampleGradientStopsRgb(settings.gradientStops, position, peak);
  }
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  nodeGraphRgbShapePath(ctx, shape, cx, cy, halfW, halfH);
  ctx.fill();

  if (face.dataset) {
    face.dataset.lightStrength = "1";
  }
  return true;
}

function paintNodeGraphRgbShapeFaceForNode(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return false;
  }
  const article = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(id) : null;
  const face = article?.querySelector?.(".node-rgb-shape-face");
  const canvas = face?.querySelector?.(".node-rgb-shape-canvas");
  if (!face || !canvas) {
    return false;
  }
  return paintNodeGraphRgbShapeFace(canvas, face, id, null);
}

function drawNodeGraphRgbShapeFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphRgbShapeCanvasForSlot(slot);
  if (!slot || !face || !canvas) {
    return;
  }
  paintNodeGraphRgbShapeFace(canvas, face, slot.nodeId, item?.buffer);
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rgbShapeFace = drawNodeGraphRgbShapeFaceItem;
}
