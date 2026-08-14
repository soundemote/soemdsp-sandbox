// Raster RGB — one analog sample is one pixel. Rolling W×H buffer.
// Display Settings → Square ratio screen: on = uniform contain (square
// pixels); off (default) = stretch to the face. 0×N / N×0 draws nothing.
// Contrast / brightness / invert are a 256-entry LUT on the
// raster (S-curve, not CSS contrast() which clips). Blur is a
// separable neighbor mix on the W×H grid (spectrogram-style mush),
// then bilinear present. Glow is a wider mix, additive.

const nodeGraphRasterRgbSettingsDefaults = Object.freeze({
  background: "#000000",
  squareRatio: false,
  screenPadding: 0,
  rounding: 0,
  screenShape: "pill",
});

function normalizeNodeGraphRasterRgbSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, "#000000")
    : String(source.background || "#000000");
  const squareRaw = source.squareRatio;
  const squareRatio = squareRaw === true || squareRaw === 1 || squareRaw === "true" || squareRaw === "1";
  const pad = Number(source.screenPadding ?? source.padding ?? source.edgeSpacing);
  const rounding = Number(source.rounding ?? source.cornerRadius);
  const shapeRaw = String(source.screenShape ?? source.cornerShape || "").toLowerCase();
  const screenShape = shapeRaw === "squircle" ? "squircle" : "pill";
  return {
    background,
    squareRatio,
    screenPadding: Number.isFinite(pad) ? Math.max(0, Math.min(1, pad)) : 0,
    rounding: Number.isFinite(rounding) ? Math.max(0, Math.min(100, rounding)) : 0,
    screenShape,
  };
}

function nodeGraphRasterRgbApplyScreenChrome(face, canvas, settings) {
  if (!face?.style) {
    return;
  }
  const cellW = face.offsetWidth || 0;
  const cellH = face.offsetHeight || 0;
  const maxInset = Math.max(0, Math.min(cellW, cellH) / 2);
  const inset = Math.round((Number(settings.screenPadding) || 0) * maxInset);
  const panelW = Math.max(0, cellW - inset * 2);
  const panelH = Math.max(0, cellH - inset * 2);
  const maxRadius = Math.max(0, Math.min(panelW, panelH) / 2);
  const radius = Math.round((Number(settings.rounding) || 0) / 100 * maxRadius);
  const shape = settings.screenShape === "squircle" ? "squircle" : "round";
  face.dataset.rasterRgbScreen = "true";
  face.style.setProperty("--raster-rgb-inset", `${inset}px`);
  face.style.setProperty("--raster-rgb-radius", `${radius}px`);
  face.style.setProperty("--raster-rgb-corner-shape", shape);
  if (canvas?.style) {
    canvas.style.inset = `${inset}px`;
    canvas.style.borderRadius = `${radius}px`;
    canvas.style.cornerShape = shape;
  }
}

function nodeGraphRasterRgbSettingsForNode(node) {
  return normalizeNodeGraphRasterRgbSettings(node?.traceDisplaySettings);
}

function nodeGraphRasterRgbDim(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return Math.max(0, Math.round(Number(fallback) || 0));
  }
  return n > 0 ? n : 0;
}

function nodeGraphRasterRgbGridSize(node) {
  return {
    width: nodeGraphRasterRgbDim(node?.params?.width, 96),
    height: nodeGraphRasterRgbDim(node?.params?.height, 54),
  };
}

function nodeGraphRasterRgbUnit01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphRasterRgbGrade(node) {
  const params = node?.params && typeof node.params === "object" ? node.params : {};
  const invert = nodeGraphRasterRgbUnit01(params.invert, 0);
  const contrast = Math.max(0, Math.min(4, Number(params.contrast)));
  const brightness = Math.max(0, Math.min(4, Number(params.brightness)));
  const blur = nodeGraphRasterRgbUnit01(params.blur, 0);
  const glow = nodeGraphRasterRgbUnit01(params.glow, 0);
  return {
    invert,
    contrast: Number.isFinite(contrast) ? contrast : 1,
    brightness: Number.isFinite(brightness) ? brightness : 1,
    blur,
    glow,
  };
}

/** Power S-curve. 1 = identity, 0 = mid grey, >1 = steeper mids + compressive ends. */
function nodeGraphRasterRgbContrastCurve(x, contrast) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  const c = Number(contrast);
  if (!(c > 0) || !Number.isFinite(c)) {
    return 0.5;
  }
  if (Math.abs(c - 1) < 1e-4) {
    return t;
  }
  if (t < 0.5) {
    return 0.5 * (2 * t) ** c;
  }
  return 1 - 0.5 * (2 * (1 - t)) ** c;
}

function nodeGraphRasterRgbGradeLut(grade) {
  const invert = nodeGraphRasterRgbUnit01(grade?.invert, 0);
  const contrast = Number.isFinite(Number(grade?.contrast)) ? Number(grade.contrast) : 1;
  const brightness = Number.isFinite(Number(grade?.brightness)) ? Math.max(0, Number(grade.brightness)) : 1;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    let x = i / 255;
    x = nodeGraphRasterRgbContrastCurve(x, contrast);
    x *= brightness;
    if (invert > 0) {
      x += invert * (1 - 2 * x);
    }
    lut[i] = x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255);
  }
  return lut;
}

function nodeGraphRasterRgbApplyGrade(state, grade) {
  const src = state.pixels;
  let dst = state.graded;
  if (!dst || dst.length !== src.length) {
    dst = new Uint8ClampedArray(src.length);
    state.graded = dst;
  }
  const key = `${grade.invert}|${grade.contrast}|${grade.brightness}`;
  if (state.gradeLutKey !== key || !state.gradeLut) {
    state.gradeLut = nodeGraphRasterRgbGradeLut(grade);
    state.gradeLutKey = key;
  }
  const lut = state.gradeLut;
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = lut[src[i]];
    dst[i + 1] = lut[src[i + 1]];
    dst[i + 2] = lut[src[i + 2]];
    dst[i + 3] = 255;
  }
  return dst;
}

function nodeGraphRasterRgbClampIndex(i, lo, hi) {
  return i < lo ? lo : i > hi ? hi : i;
}

function nodeGraphRasterRgbBlurAxis(src, dst, w, h, radius, vertical) {
  const r = Math.max(1, radius | 0);
  const n = r * 2 + 1;
  const inv = 1 / n;
  const lastX = w - 1;
  const lastY = h - 1;
  if (!vertical) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let rs = 0;
      let gs = 0;
      let bs = 0;
      for (let k = -r; k <= r; k += 1) {
        const o = (row + nodeGraphRasterRgbClampIndex(k, 0, lastX)) * 4;
        rs += src[o];
        gs += src[o + 1];
        bs += src[o + 2];
      }
      for (let x = 0; x < w; x += 1) {
        const o = (row + x) * 4;
        dst[o] = rs * inv;
        dst[o + 1] = gs * inv;
        dst[o + 2] = bs * inv;
        dst[o + 3] = 255;
        const drop = (row + nodeGraphRasterRgbClampIndex(x - r, 0, lastX)) * 4;
        const add = (row + nodeGraphRasterRgbClampIndex(x + r + 1, 0, lastX)) * 4;
        rs += src[add] - src[drop];
        gs += src[add + 1] - src[drop + 1];
        bs += src[add + 2] - src[drop + 2];
      }
    }
    return;
  }
  for (let x = 0; x < w; x += 1) {
    let rs = 0;
    let gs = 0;
    let bs = 0;
    for (let k = -r; k <= r; k += 1) {
      const o = (nodeGraphRasterRgbClampIndex(k, 0, lastY) * w + x) * 4;
      rs += src[o];
      gs += src[o + 1];
      bs += src[o + 2];
    }
    for (let y = 0; y < h; y += 1) {
      const o = (y * w + x) * 4;
      dst[o] = rs * inv;
      dst[o + 1] = gs * inv;
      dst[o + 2] = bs * inv;
      dst[o + 3] = 255;
      const drop = (nodeGraphRasterRgbClampIndex(y - r, 0, lastY) * w + x) * 4;
      const add = (nodeGraphRasterRgbClampIndex(y + r + 1, 0, lastY) * w + x) * 4;
      rs += src[add] - src[drop];
      gs += src[add + 1] - src[drop + 1];
      bs += src[add + 2] - src[drop + 2];
    }
  }
}

function nodeGraphRasterRgbEnsurePlane(state, key, length) {
  let plane = state[key];
  if (!plane || plane.length !== length) {
    plane = new Uint8ClampedArray(length);
    state[key] = plane;
  }
  return plane;
}

/** Neighbor mix on the raster grid. 0 = hard pixels. */
function nodeGraphRasterRgbMushPixels(state, src, amount, destKey = "mush") {
  const w = state.width;
  const h = state.height;
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  if (!(a > 0.0005) || w < 1 || h < 1) {
    return src;
  }
  const maxR = Math.max(1, Math.floor(Math.min(w, h) * 0.35));
  const radius = Math.max(1, Math.round(a * maxR));
  const len = w * h * 4;
  const tmp = nodeGraphRasterRgbEnsurePlane(state, `${destKey}Tmp`, len);
  const dst = nodeGraphRasterRgbEnsurePlane(state, destKey, len);
  if (dst === src || tmp === src) {
    return src;
  }
  nodeGraphRasterRgbBlurAxis(src, tmp, w, h, radius, false);
  nodeGraphRasterRgbBlurAxis(tmp, dst, w, h, radius, true);
  if (a > 0.45) {
    nodeGraphRasterRgbBlurAxis(dst, tmp, w, h, Math.max(1, Math.round(radius * 0.6)), false);
    nodeGraphRasterRgbBlurAxis(tmp, dst, w, h, Math.max(1, Math.round(radius * 0.6)), true);
  }
  return dst;
}

function nodeGraphRasterRgbState(canvas, width, height) {
  if (
    !canvas._rasterRgb
    || canvas._rasterRgb.width !== width
    || canvas._rasterRgb.height !== height
  ) {
    canvas._rasterRgb = {
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
      width,
      write: 0,
    };
    const pix = canvas._rasterRgb.pixels;
    for (let i = 0; i < pix.length; i += 4) {
      pix[i + 3] = 255;
    }
  }
  return canvas._rasterRgb;
}

function nodeGraphRasterRgbByte(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(n * 255)));
}

function drawNodeGraphRasterRgbFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  if (!slot || !face) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, face, pixelRatio, 1)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const settings = nodeGraphRasterRgbSettingsForNode(node);
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, settings.background);
  }
  const grid = nodeGraphRasterRgbGridSize(node);
  const cw = canvas.width;
  const ch = canvas.height;
  nodeGraphRasterRgbApplyScreenChrome(face, canvas, settings);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, cw, ch);
  if (!(grid.width > 0) || !(grid.height > 0)) {
    canvas._rasterRgbBlit = true;
    return;
  }
  let state;
  try {
    state = nodeGraphRasterRgbState(canvas, grid.width, grid.height);
  } catch (_err) {
    canvas._rasterRgbBlit = true;
    return;
  }
  const captured = typeof nodeGraphRgbAlignedCapture === "function"
    ? nodeGraphRgbAlignedCapture(slot, ["R", "G", "B"], 0.25)
    : null;
  const source = typeof nodeGraphRgbPickPortBuffer === "function"
    ? nodeGraphRgbPickPortBuffer(slot, "R")
    : null;
  const abs = Math.max(
    0,
    Math.floor(Number(source?.nodeGraphScopeTotalSampleCount) || captured?.length || 0),
  );
  const cellCount = state.width * state.height;
  if (captured?.length && cellCount > 0) {
    const prev = Number(canvas._rasterRgbAbs || 0);
    const delta = prev > 0 ? Math.max(0, abs - prev) : captured.length;
    const take = Math.min(captured.length, Math.max(0, delta));
    const start = captured.length - take;
    for (let i = start; i < captured.length; i += 1) {
      const o = state.write * 4;
      state.pixels[o] = nodeGraphRasterRgbByte(captured.R[i]);
      state.pixels[o + 1] = nodeGraphRasterRgbByte(captured.G[i]);
      state.pixels[o + 2] = nodeGraphRasterRgbByte(captured.B[i]);
      state.pixels[o + 3] = 255;
      state.write = (state.write + 1) % cellCount;
    }
    canvas._rasterRgbAbs = abs;
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen && canvas._rasterRgbBlit) {
    return;
  }
  const grade = nodeGraphRasterRgbGrade(node);
  const graded = nodeGraphRasterRgbApplyGrade(state, grade);
  const mushed = nodeGraphRasterRgbMushPixels(state, graded, grade.blur);
  let image;
  try {
    image = new ImageData(mushed, state.width, state.height);
  } catch (_err) {
    canvas._rasterRgbBlit = true;
    return;
  }
  const off = canvas._rasterRgbOff || document.createElement("canvas");
  canvas._rasterRgbOff = off;
  if (off.width !== state.width || off.height !== state.height) {
    off.width = state.width;
    off.height = state.height;
  }
  const offCtx = off.getContext("2d");
  if (!offCtx) {
    return;
  }
  offCtx.imageSmoothingEnabled = false;
  offCtx.putImageData(image, 0, 0);
  let dw = cw;
  let dh = ch;
  let dx = 0;
  let dy = 0;
  if (settings.squareRatio) {
    const scale = Math.min(cw / state.width, ch / state.height);
    dw = state.width * scale;
    dh = state.height * scale;
    dx = (cw - dw) * 0.5;
    dy = (ch - dh) * 0.5;
  }
  const glowAmt = grade.glow;
  const smoothPresent = grade.blur > 0.0005 || glowAmt > 0.0005;
  canvas.style.imageRendering = smoothPresent ? "auto" : "pixelated";
  ctx.imageSmoothingEnabled = smoothPresent;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "medium";
  }
  ctx.filter = "none";
  ctx.drawImage(off, 0, 0, state.width, state.height, dx, dy, dw, dh);
  if (glowAmt > 0.001) {
    const glowPix = nodeGraphRasterRgbMushPixels(
      state,
      mushed,
      Math.min(1, Math.max(grade.blur, 0.2) + glowAmt * 0.65),
      "mushGlow",
    );
    const glowOff = canvas._rasterRgbGlowOff || document.createElement("canvas");
    canvas._rasterRgbGlowOff = glowOff;
    if (glowOff.width !== state.width || glowOff.height !== state.height) {
      glowOff.width = state.width;
      glowOff.height = state.height;
    }
    const glowCtx = glowOff.getContext("2d");
    if (glowCtx) {
      glowCtx.imageSmoothingEnabled = false;
      glowCtx.putImageData(new ImageData(glowPix, state.width, state.height), 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glowAmt;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glowOff, 0, 0, state.width, state.height, dx, dy, dw, dh);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }
  canvas._rasterRgbBlit = true;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rasterRgbFace = drawNodeGraphRasterRgbFaceItem;
}
