// Raster RGB — one analog sample is one pixel. Rolling W×H buffer.
// paint-rev syntax-3: file must parse (no ?? mixed with ||).
// Display Settings → Square ratio screen: on = uniform contain (square
// pixels); off (default) = stretch to the face. 0×N / N×0 draws nothing.
// Contrast / brightness / invert are a 256-entry LUT on the
// raster (S-curve, not CSS contrast() which clips). Blur is a
// separable neighbor mix on the W×H grid (spectrogram-style mush),
// then bilinear present. Glow is a wider mix, additive.

const NODE_GRAPH_RASTER_RGB_PAINT_REV = "syntax-3";

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
  const shapeRaw = String(source.screenShape ?? source.cornerShape ?? "").toLowerCase();
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
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
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

function nodeGraphRasterRgbHueParam(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (typeof nodeGraphRasterRgbWrapHue === "function") {
    return nodeGraphRasterRgbWrapHue(n);
  }
  return ((n % 1) + 1) % 1;
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
    hue: nodeGraphRasterRgbHueParam(params.hue),
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

function nodeGraphRasterRgbParseHexRgb(value, fallback = "#000000") {
  const raw = String(value || fallback || "#000000").trim();
  const hex = raw[0] === "#" ? raw.slice(1) : raw;
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return [r, g, b];
    }
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return [r, g, b];
    }
  }
  return [0, 0, 0];
}

/** Photographic invert of a plate color. invert=1 turns black into white. */
function nodeGraphRasterRgbInvertCssColor(value, invert) {
  const a = nodeGraphRasterRgbUnit01(invert, 0);
  const [r, g, b] = nodeGraphRasterRgbParseHexRgb(value, "#000000");
  if (!(a > 0)) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgb(${Math.round(r + a * (255 - 2 * r))}, ${Math.round(g + a * (255 - 2 * g))}, ${Math.round(b + a * (255 - 2 * b))})`;
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
    if (x > 1) {
      x = 1;
    }
    if (invert > 0) {
      x += invert * (1 - 2 * x);
    }
    lut[i] = x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255);
  }
  return lut;
}

function nodeGraphRasterRgbPresentImage(state, src, key = "presentImage") {
  const w = state.width;
  const h = state.height;
  let image = state[key];
  if (!image || image.width !== w || image.height !== h) {
    image = new ImageData(w, h);
    state[key] = image;
  }
  image.data.set(src);
  return image;
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
  const hue = Number(grade?.hue) || 0;
  const rotate = Math.abs(hue) > 1e-9 && typeof nodeGraphRasterRgbHueRotate === "function";
  for (let i = 0; i < src.length; i += 4) {
    let r = lut[src[i]];
    let g = lut[src[i + 1]];
    let b = lut[src[i + 2]];
    if (rotate) {
      const rot = nodeGraphRasterRgbHueRotate(r / 255, g / 255, b / 255, hue);
      r = rot.r * 255;
      g = rot.g * 255;
      b = rot.b * 255;
    }
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
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

function nodeGraphRasterRgbAnalog01(value, bipolar) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (bipolar) {
    const c = n < -1 ? -1 : n > 1 ? 1 : n;
    return 0.5 + 0.5 * c;
  }
  if (n <= 0) {
    return 0;
  }
  if (n >= 1) {
    return 1;
  }
  return n;
}

function nodeGraphRasterRgbRingLooksBipolar(ring, start, count) {
  if (!ring?.length) {
    return false;
  }
  const begin = Math.max(0, start | 0);
  const n = Math.max(0, count | 0);
  const end = Math.min(ring.length, begin + n);
  for (let i = begin; i < end; i += 8) {
    if (Number(ring[i]) < -1e-6) {
      return true;
    }
  }
  return false;
}

function nodeGraphRasterRgbByte(value, bipolar = false) {
  const u = nodeGraphRasterRgbAnalog01(value, bipolar);
  return u <= 0 ? 0 : u >= 1 ? 255 : Math.round(u * 255);
}

function nodeGraphRasterRgbBufferFromKey(nodeId, port) {
  const state = typeof nodeGraphModuleScopeState === "object" ? nodeGraphModuleScopeState : null;
  if (!state?.buffers || !nodeId) {
    return null;
  }
  const names = [port, String(port).toLowerCase(), String(port).toUpperCase()];
  for (const name of names) {
    const ring = state.buffers.get(`${nodeId}:${name}`);
    if (ring?.length) {
      return ring;
    }
  }
  return null;
}

function nodeGraphRasterRgbPickChannel(slot, port) {
  const nodeId = slot?.nodeId;
  // Follow the inlet wire. Never prefer this node's own R/G/B output capture —
  // those rings are post-FX analog outs (often zeros) and they starved invert
  // plus hid the SinCos picture behind a richer empty local buffer.
  const conns = typeof nodeGraphModuleScopeConnectionsTo === "function"
    ? nodeGraphModuleScopeConnectionsTo(nodeId, port)
    : [];
  for (const connection of conns || []) {
    const ring = nodeGraphRasterRgbBufferFromKey(connection.sourceNode, connection.sourcePort);
    if (ring?.length) {
      return ring;
    }
  }
  if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
    const connected = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port);
    if (connected?.length) {
      return connected;
    }
  }
  return null;
}

function nodeGraphRasterRgbTakeChannels(slot) {
  const rings = {
    R: nodeGraphRasterRgbPickChannel(slot, "R"),
    G: nodeGraphRasterRgbPickChannel(slot, "G"),
    B: nodeGraphRasterRgbPickChannel(slot, "B"),
  };
  const lengths = ["R", "G", "B"].map((port) => {
    const ring = rings[port];
    if (!ring?.length) {
      return 0;
    }
    if (typeof nodeGraphScopeAvailableSampleCount === "function") {
      return nodeGraphScopeAvailableSampleCount(ring) || ring.length;
    }
    return ring.length;
  });
  const frames = Math.max(0, ...lengths);
  return { length: frames, R: rings.R, G: rings.G, B: rings.B };
}

function nodeGraphRasterRgbEnsureCanvas(face, slot, pixelRatio) {
  // Own canvas. The shared fallback plate is cleared/wiped by Trace/stop
  // and sat on top of this face — Raster never survived that.
  if (face) {
    for (const leftover of face.querySelectorAll(":scope > .node-module-scope-local-fallback-canvas")) {
      leftover.remove();
    }
  }
  let canvas = face.querySelector(":scope > .node-raster-rgb-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-raster-rgb-canvas";
    canvas.setAttribute("aria-hidden", "true");
    face.appendChild(canvas);
  }
  const cssW = Math.max(1, face.clientWidth || face.offsetWidth || 1);
  const cssH = Math.max(1, face.clientHeight || face.offsetHeight || 1);
  const dpr = Math.max(1, Number(pixelRatio) || Number(window.devicePixelRatio) || 1);
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "5";
  canvas.style.mixBlendMode = "normal";
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";
  return canvas;
}

function nodeGraphRasterRgbApplyPlate(face, plate) {
  if (!face) {
    return;
  }
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, plate);
  }
  if (face.style) {
    face.style.background = plate;
    face.style.setProperty("--node-scope-background", plate);
  }
  const surface = face.querySelector(":scope > .node-module-scope-window-surface");
  if (surface?.style) {
    surface.style.background = plate;
    surface.style.zIndex = "0";
  }
  if (face.dataset) {
    face.dataset.lightSource = "screen";
    face.dataset.lightStrength = "1";
  }
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(face, 1);
  }
}

function drawNodeGraphRasterRgbFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot || null;
  const face = item?.screenElement || slot?.scopeElement;
  if (!face) {
    return;
  }
  const nodeId = slot?.nodeId || face.dataset?.node || item?.nodeId;
  const node = (typeof nodeGraphModuleScopeNodeForSlot === "function" && slot
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null)
    || (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null);
  const settings = nodeGraphRasterRgbSettingsForNode(node);
  const grade = nodeGraphRasterRgbGrade(node);
  const plate = nodeGraphRasterRgbInvertCssColor(settings.background, grade.invert);
  nodeGraphRasterRgbApplyPlate(face, plate);
  const paintSlot = slot || { nodeId, scopeElement: face, type: "rasterRgb" };
  const canvas = nodeGraphRasterRgbEnsureCanvas(face, paintSlot, pixelRatio);
  canvas.style.background = plate;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const grid = nodeGraphRasterRgbGridSize(node);
  const cw = canvas.width;
  const ch = canvas.height;
  nodeGraphRasterRgbApplyScreenChrome(face, canvas, settings);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = plate;
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
  const captured = nodeGraphRasterRgbTakeChannels(paintSlot);
  const cellCount = state.width * state.height;
  const wired = Boolean(captured.length);
  if (wired && cellCount > 0) {
    const red = captured.R;
    const green = captured.G;
    const blue = captured.B;
    const redLen = red?.length || 0;
    const greenLen = green?.length || 0;
    const blueLen = blue?.length || 0;
    const take = Math.min(captured.length, cellCount);
    const redStart = Math.max(0, redLen - take);
    const greenStart = Math.max(0, greenLen - take);
    const blueStart = Math.max(0, blueLen - take);
    const redBi = nodeGraphRasterRgbRingLooksBipolar(red, redStart, take);
    const greenBi = nodeGraphRasterRgbRingLooksBipolar(green, greenStart, take);
    const blueBi = nodeGraphRasterRgbRingLooksBipolar(blue, blueStart, take);
    for (let i = 0; i < take; i += 1) {
      const o = state.write * 4;
      state.pixels[o] = nodeGraphRasterRgbByte(redLen ? red[redStart + i] : 0, redBi);
      state.pixels[o + 1] = nodeGraphRasterRgbByte(greenLen ? green[greenStart + i] : 0, greenBi);
      state.pixels[o + 2] = nodeGraphRasterRgbByte(blueLen ? blue[blueStart + i] : 0, blueBi);
      state.pixels[o + 3] = 255;
      state.write = (state.write + 1) % cellCount;
    }
  }
  const gradeKey = `${grade.invert}|${grade.contrast}|${grade.brightness}|${grade.hue}|${grade.blur}|${grade.glow}|${grid.width}x${grid.height}|${wired ? captured.length : 0}`;
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen && canvas._rasterRgbBlit && canvas._rasterRgbGradeKey === gradeKey && !wired) {
    return;
  }
  const graded = nodeGraphRasterRgbApplyGrade(state, grade);
  const mushed = nodeGraphRasterRgbMushPixels(state, graded, grade.blur);
  let present = mushed;
  if (grade.glow > 0.0005) {
    const bloom = nodeGraphRasterRgbMushPixels(state, mushed, Math.min(1, 0.35 + grade.glow * 0.65), "glow");
    const glowAmt = grade.glow;
    let glowMix = state.glowMix;
    if (!glowMix || glowMix.length !== mushed.length) {
      glowMix = new Uint8ClampedArray(mushed.length);
      state.glowMix = glowMix;
    }
    for (let i = 0; i < mushed.length; i += 4) {
      glowMix[i] = Math.min(255, mushed[i] + bloom[i] * glowAmt);
      glowMix[i + 1] = Math.min(255, mushed[i + 1] + bloom[i + 1] * glowAmt);
      glowMix[i + 2] = Math.min(255, mushed[i + 2] + bloom[i + 2] * glowAmt);
      glowMix[i + 3] = 255;
    }
    present = glowMix;
  }
  canvas.style.imageRendering = "pixelated";
  ctx.imageSmoothingEnabled = false;
  try {
    const image = nodeGraphRasterRgbPresentImage(state, present);
    let tile = state.tileCanvas;
    if (!tile || tile.width !== state.width || tile.height !== state.height) {
      tile = document.createElement("canvas");
      tile.width = state.width;
      tile.height = state.height;
      state.tileCanvas = tile;
    }
    const tileCtx = tile.getContext("2d");
    tileCtx.putImageData(image, 0, 0);
    let dw = cw;
    let dh = ch;
    let dx = 0;
    let dy = 0;
    if (settings.squareRatio) {
      const scale = Math.min(cw / state.width, ch / state.height);
      dw = Math.max(1, Math.floor(state.width * scale));
      dh = Math.max(1, Math.floor(state.height * scale));
      dx = Math.floor((cw - dw) * 0.5);
      dy = Math.floor((ch - dh) * 0.5);
    }
    ctx.drawImage(tile, 0, 0, state.width, state.height, dx, dy, dw, dh);
  } catch (_err) {
    ctx.fillStyle = plate;
    ctx.fillRect(0, 0, cw, ch);
  }
  canvas._rasterRgbBlit = true;
  canvas._rasterRgbGradeKey = gradeKey;
  canvas._rasterRgbDebug = {
    nodeId,
    renderer: typeof nodeGraphModuleDisplayRendererForSlot === "function"
      ? nodeGraphModuleDisplayRendererForSlot(paintSlot)
      : "",
    type: paintSlot.type || "",
    faceCss: `${face.clientWidth || 0}x${face.clientHeight || 0}`,
    canvasPx: `${cw}x${ch}`,
    grid: `${grid.width}x${grid.height}`,
    invert: grade.invert,
    wired,
    take: wired ? Math.min(captured.length, cellCount) : 0,
    rings: {
      R: captured.R?.length || 0,
      G: captured.G?.length || 0,
      B: captured.B?.length || 0,
    },
    wires: {
      R: typeof nodeGraphModuleScopeConnectionsTo === "function"
        ? (nodeGraphModuleScopeConnectionsTo(nodeId, "R") || []).map((c) => `${c.sourceNode}.${c.sourcePort}`)
        : [],
      G: typeof nodeGraphModuleScopeConnectionsTo === "function"
        ? (nodeGraphModuleScopeConnectionsTo(nodeId, "G") || []).map((c) => `${c.sourceNode}.${c.sourcePort}`)
        : [],
      B: typeof nodeGraphModuleScopeConnectionsTo === "function"
        ? (nodeGraphModuleScopeConnectionsTo(nodeId, "B") || []).map((c) => `${c.sourceNode}.${c.sourcePort}`)
        : [],
    },
    paintRev: NODE_GRAPH_RASTER_RGB_PAINT_REV,
    at: Date.now(),
  };
}

let nodeGraphRasterRgbPumpQueued = false;
let nodeGraphRasterRgbLastError = "";
let nodeGraphRasterRgbLastLogAt = 0;
let nodeGraphRasterRgbLoadLogged = false;

function nodeGraphRasterRgbSe(level, msg) {
  const text = `[raster-rgb ${NODE_GRAPH_RASTER_RGB_PAINT_REV}] ${msg}`;
  try {
    if (typeof console !== "undefined") {
      if (level === "FAIL" && console.error) console.error(text);
      else if (console.info) console.info(text);
    }
  } catch (_err) {
    // ignore
  }
  try {
    const se = typeof window !== "undefined" ? window.SE : null;
    if (!se) {
      return;
    }
    // SE.WARN is (cond, msg) — never call it with a string as the condition.
    if (level === "FAIL" && typeof se.FAIL === "function") {
      se.FAIL(text);
    } else if (typeof se.INFO === "function") {
      se.INFO(text);
    } else if (typeof se.LOG === "function") {
      se.LOG(text);
    }
  } catch (_err) {
    // ignore
  }
}

function nodeGraphRasterRgbNoteError(nodeId, err) {
  const msg = `${nodeId || "?"}: ${err && err.message ? err.message : err}`;
  nodeGraphRasterRgbLastError = msg;
  nodeGraphRasterRgbSe("FAIL", msg);
}

function nodeGraphRasterRgbBuildStamp() {
  const token = document.querySelector?.("[data-build-token-value]")?.textContent?.trim() || "";
  const version = document.querySelector?.("[data-sandbox-version]")?.textContent?.trim() || "";
  const build = document.querySelector?.("[data-build-number-value]")?.textContent?.trim() || "";
  return { version, build, token, paintRev: NODE_GRAPH_RASTER_RGB_PAINT_REV };
}

function nodeGraphRasterRgbDebugDump() {
  const stamp = nodeGraphRasterRgbBuildStamp();
  const faces = typeof nodeGraphRasterRgbCollectFaces === "function"
    ? nodeGraphRasterRgbCollectFaces()
    : [];
  const dump = {
    ...stamp,
    parsed: true,
    lastError: nodeGraphRasterRgbLastError || "",
    faceCount: faces.length,
    faces: faces.map(({ slot, face }) => {
      const canvas = face?.querySelector?.(":scope > .node-raster-rgb-canvas");
      return {
        nodeId: slot?.nodeId || face?.dataset?.node || "",
        type: slot?.type || "",
        renderer: typeof nodeGraphModuleDisplayRendererForSlot === "function"
          ? nodeGraphModuleDisplayRendererForSlot(slot)
          : "",
        faceCss: `${face?.clientWidth || 0}x${face?.clientHeight || 0}`,
        canvasPx: canvas ? `${canvas.width}x${canvas.height}` : "none",
        last: canvas?._rasterRgbDebug || null,
      };
    }),
  };
  try {
    console.info("[raster-rgb dump]", dump);
  } catch (_err) {
    // ignore
  }
  nodeGraphRasterRgbSe("INFO", JSON.stringify(dump));
  return dump;
}

function nodeGraphRasterRgbMaybeLogStatus(painted) {
  const now = Date.now();
  if (!nodeGraphRasterRgbLoadLogged) {
    nodeGraphRasterRgbLoadLogged = true;
    const stamp = nodeGraphRasterRgbBuildStamp();
    nodeGraphRasterRgbSe(
      "INFO",
      `loaded paintRev=${stamp.paintRev} ${stamp.version} ${stamp.build} token=${stamp.token || "?"}`,
    );
  }
  if (now - nodeGraphRasterRgbLastLogAt < 2000) {
    return;
  }
  nodeGraphRasterRgbLastLogAt = now;
  const dump = nodeGraphRasterRgbDebugDump();
  if (!(painted > 0) && dump.faceCount === 0) {
    nodeGraphRasterRgbSe("WARN", "no Raster RGB faces found this frame");
  }
}

function nodeGraphRasterRgbCollectFaces() {
  const faces = [];
  const seen = new Set();
  if (typeof nodeGraphVisibleModuleScopeSlots === "function") {
    for (const slot of nodeGraphVisibleModuleScopeSlots()) {
      const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
        ? nodeGraphModuleDisplayRendererForSlot(slot)
        : "";
      if (renderer !== "rasterRgbFace" && slot?.type !== "rasterRgb") {
        continue;
      }
      if (!slot?.scopeElement || seen.has(slot.scopeElement)) {
        continue;
      }
      seen.add(slot.scopeElement);
      faces.push({ slot, face: slot.scopeElement });
    }
  }
  if (typeof document !== "undefined") {
    const windows = document.querySelectorAll(
      ".dsp-node[data-node-type=\"rasterRgb\"] .node-module-scope-window, .node-module-scope-window[data-node-type=\"rasterRgb\"]",
    );
    for (const face of windows) {
      if (seen.has(face)) {
        continue;
      }
      const host = face.closest?.(".dsp-node");
      if (host?.classList.contains("viewport-asleep")) {
        continue;
      }
      seen.add(face);
      const nodeId = face.dataset?.node || host?.dataset?.node;
      const slot = (typeof nodeGraphModuleScopeState === "object"
        && nodeGraphModuleScopeState?.slots?.get?.(nodeId))
        || { nodeId, scopeElement: face, type: "rasterRgb" };
      faces.push({ slot, face });
    }
  }
  return faces;
}

function scheduleNodeGraphRasterRgbPump() {
  if (nodeGraphRasterRgbPumpQueued) {
    return;
  }
  nodeGraphRasterRgbPumpQueued = true;
  const raf = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 16);
  raf(() => {
    nodeGraphRasterRgbPumpQueued = false;
    const faces = nodeGraphRasterRgbCollectFaces();
    if (!faces.length) {
      return;
    }
    paintNodeGraphRasterRgbFacesNow();
    scheduleNodeGraphRasterRgbPump();
  });
}

function paintNodeGraphRasterRgbFacesNow(pixelRatio = window.devicePixelRatio || 1) {
  const pr = Math.max(1, Number(pixelRatio) || Number(window.devicePixelRatio) || 1);
  let painted = 0;
  for (const { slot, face } of nodeGraphRasterRgbCollectFaces()) {
    try {
      drawNodeGraphRasterRgbFaceItem(null, {
        nodeId: slot?.nodeId,
        screenElement: face,
        slot,
      }, pr);
      painted += 1;
    } catch (err) {
      nodeGraphRasterRgbNoteError(slot?.nodeId || face?.dataset?.node, err);
    }
  }
  nodeGraphRasterRgbMaybeLogStatus(painted);
  return painted;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rasterRgbFace = drawNodeGraphRasterRgbFaceItem;
}

if (typeof window !== "undefined") {
  window.NODE_GRAPH_RASTER_RGB_PAINT_REV = NODE_GRAPH_RASTER_RGB_PAINT_REV;
  window.nodeGraphRasterRgbDebugDump = nodeGraphRasterRgbDebugDump;
}

scheduleNodeGraphRasterRgbPump();
nodeGraphRasterRgbSe(
  "INFO",
  `script parsed paintRev=${NODE_GRAPH_RASTER_RGB_PAINT_REV} — console: nodeGraphRasterRgbDebugDump()`,
);
