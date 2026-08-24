// Shape face renderer (displayType rgbShapeFace): gradient fill + silhouette.

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
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  // Same face-param path as RoundShape / BasicShape (patch + DOM). Do NOT call
  // readNodeGraphLiveEffectiveParam from paint — it needs a live runtime and
  // throws when smoothers is missing (black face + console spam).
  if (typeof nodeGraphFilterCurveLiveParam === "function" && node) {
    const live = Number(nodeGraphFilterCurveLiveParam(node, key, Number.NaN));
    if (Number.isFinite(live)) {
      return live;
    }
  }
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = Number(nodeGraphReadNodeNumber(nodeId, key));
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const raw = Number(node?.params?.[key]);
  if (Number.isFinite(raw)) {
    return raw;
  }
  // Migrate old "position" → brightness.
  if (key === "brightness") {
    const legacy = Number(node?.params?.position);
    if (Number.isFinite(legacy)) {
      return legacy;
    }
  }
  return fallback;
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

  let brightness = nodeGraphRgbShapeReadParam(nodeId, "brightness", 0.5);
  if (buffer?.length && !buffer.nodeGraphScopeXy) {
    const sample = typeof nodeGraphOscilloscopeLatestSample === "function"
      ? nodeGraphOscilloscopeLatestSample(buffer, 0)
      : Number(buffer[buffer.length - 1]);
    if (Number.isFinite(sample)) {
      brightness = Math.max(0, Math.min(1, brightness + sample * 0.5));
    }
  }
  const size = Math.max(0, nodeGraphRgbShapeReadParam(nodeId, "size", 1));
  const width = Math.max(0, nodeGraphRgbShapeReadParam(nodeId, "width", 1));
  const height = Math.max(0, nodeGraphRgbShapeReadParam(nodeId, "height", 1));
  const x = nodeGraphRgbShapeReadParam(nodeId, "x", 0);
  const y = nodeGraphRgbShapeReadParam(nodeId, "y", 0);
  const shape = nodeGraphRgbShapeReadParam(nodeId, "shape", 0);
  const shapeParam = nodeGraphRgbShapeReadParam(nodeId, "shapeParam", 0.5);
  const blur = Math.max(0, Math.min(1, nodeGraphRgbShapeReadParam(nodeId, "blur", 0.35)));

  const cx = w * 0.5 + (Math.max(-1, Math.min(1, x)) * w * 0.5);
  const cy = h * 0.5 - (Math.max(-1, Math.min(1, y)) * h * 0.5);
  const minSide = Math.min(w, h);
  // Size 1 ≈ half min-side radius; Width/Height multiply axes independently.
  const halfW = Math.max(0.5, size * width * 0.5 * minSide);
  const halfH = Math.max(0.5, size * height * 0.5 * minSide);
  const shapeId = typeof RgbShapeMath !== "undefined" && typeof RgbShapeMath.shapeIdFromIndex === "function"
    ? RgbShapeMath.shapeIdFromIndex(shape)
    : (typeof normalizeTraceStampShape === "function"
      ? normalizeTraceStampShape(shape)
      : "circle");

  const peak = settings.gradientStops?.[settings.gradientStops.length - 1]?.color || "#f0f4ff";
  let rgb = [240, 244, 255];
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    rgb = nodeGraphSampleGradientStopsRgb(settings.gradientStops, brightness, peak);
  }
  const fillCss = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  // Same soft-edge stamp path as LED Dot / LCD Dot (smoothstep blur 0…1).
  let stamped = false;
  if (typeof TraceDotSprite !== "undefined" && typeof TraceDotSprite.draw === "function") {
    stamped = TraceDotSprite.draw(
      ctx,
      cx,
      cy,
      Math.max(halfW, halfH),
      blur,
      {
        shape: shapeId,
        shapeParam,
        rx: halfW,
        ry: halfH,
        color: fillCss,
        amount: 1,
        flat: true,
      },
      1,
    );
  }
  if (!stamped) {
    ctx.fillStyle = fillCss;
    if (typeof RgbShapeMath !== "undefined" && typeof RgbShapeMath.fillPath === "function") {
      RgbShapeMath.fillPath(ctx, shape, shapeParam, cx, cy, halfW, halfH);
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
    }
    ctx.fill("evenodd");
  }

  // Phase cursor on the outline (when live X/Y available from buffer pair).
  if (buffer?.nodeGraphScopeXy && Number.isFinite(buffer.x) && Number.isFinite(buffer.y)) {
    const px = cx + buffer.x * halfW;
    const py = cy - buffer.y * halfH;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, minSide * 0.02), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

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

// Face paints on its own rAF (rgb-shape-ui.js), like RoundShape / BasicShape.
// Do not override orchestrator stub — avoids double-draw and crash loops.
