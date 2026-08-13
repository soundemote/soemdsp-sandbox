// Raster RGB — one analog sample is one pixel. No invented resolution,
// no bilinear. Rolling write into W×H, nearest-neighbor blit to the face.

const nodeGraphRasterRgbSettingsDefaults = Object.freeze({
  background: "#000000",
});

function normalizeNodeGraphRasterRgbSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, "#000000")
    : String(source.background || "#000000");
  return { background };
}

function nodeGraphRasterRgbSettingsForNode(node) {
  return normalizeNodeGraphRasterRgbSettings(node?.traceDisplaySettings);
}

function nodeGraphRasterRgbGridSize(node) {
  const width = Math.max(8, Math.min(320, Math.round(Number(node?.params?.width) || 96)));
  const height = Math.max(8, Math.min(240, Math.round(Number(node?.params?.height) || 54)));
  return { width, height };
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
  canvas.style.imageRendering = "pixelated";
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.imageSmoothingEnabled = false;
  const settings = nodeGraphRasterRgbSettingsForNode(node);
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, settings.background);
  }
  const grid = nodeGraphRasterRgbGridSize(node);
  const state = nodeGraphRasterRgbState(canvas, grid.width, grid.height);
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
  if (captured?.length) {
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
      state.write = (state.write + 1) % (state.width * state.height);
    }
    canvas._rasterRgbAbs = abs;
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  if (frozen && canvas._rasterRgbBlit) {
    return;
  }
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const image = new ImageData(state.pixels, state.width, state.height);
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
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.max(1, Math.floor(Math.min(cw / state.width, ch / state.height)));
  const dw = state.width * scale;
  const dh = state.height * scale;
  const dx = Math.floor((cw - dw) * 0.5);
  const dy = Math.floor((ch - dh) * 0.5);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, state.width, state.height, dx, dy, dw, dh);
  canvas._rasterRgbBlit = true;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.rasterRgbFace = drawNodeGraphRasterRgbFaceItem;
}
