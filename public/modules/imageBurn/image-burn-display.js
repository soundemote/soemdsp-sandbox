// Image Ghost — dedicated residual (NOT phosphor Ghost/Trail).
//
// GL residual (image-burn-gl.js); Canvas2D fallback if GL unavailable.
//
// Module params: Size, Bright, Blacks, Feedback (−1…+1), Hang, Burn, Blur
// Display: image asset, background, Clear residual
//
// lit = peak(|In|) × Brightness (dry flash).
// Feedback 0 = max-blend lit into hang (no stack). >0 accumulate. <0 dimmer max-blend.

const nodeGraphImageBurnSettingsDefaults = Object.freeze({
  background: "#000000",
  backgroundBrightness: 0,
  backgroundColor: "#000000",
  dataUrl: "",
  fileName: "",
});

/** Soft UV/layout guard only — param metadata owns the dial range. */
const NODE_GRAPH_IMAGE_BURN_SIZE_SAFE_MAX = 64;
// Residual matches face pixels; only shrink uniformly on huge faces.
const NODE_GRAPH_IMAGE_BURN_RESIDUAL_MAX_SIDE = 4096;
const NODE_GRAPH_IMAGE_BURN_COMPRESS = 1.3;
/** Negative Feedback: stamp RGB scale at |feedback| = 1. */
const NODE_GRAPH_IMAGE_BURN_FEEDBACK_DIM_MIN = 0.35;

function normalizeNodeGraphImageBurnDataUrl(value) {
  if (typeof normalizeNodeGraphImageDataUrl === "function") {
    return normalizeNodeGraphImageDataUrl(value);
  }
  const raw = String(value || "").trim();
  return raw.startsWith("data:image/") ? raw : "";
}

function clampNodeGraphImageBurnSize(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Math.max(0, Number.isFinite(fb) ? fb : 1);
  }
  return Math.max(0, Math.min(NODE_GRAPH_IMAGE_BURN_SIZE_SAFE_MAX, n));
}

function clampNodeGraphImageBurnUnit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Math.max(0, Math.min(1, Number(fallback) || 0));
  }
  return Math.max(0, Math.min(1, n));
}

/** Image blacks 0…2 (0 = unchanged, 2 = max black crush). */
function clampNodeGraphImageBurnContrast(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Math.max(0, Math.min(2, Number(fallback) || 0));
  }
  return Math.max(0, Math.min(2, n));
}

function normalizeNodeGraphImageBurnSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphImageBurnSettingsDefaults;
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(
      source.background ?? source.backgroundColor,
      defaults.background,
    )
    : String(source.background || source.backgroundColor || defaults.background);
  // dataUrl only — do not treat legacy "image" gain as an asset URL.
  const dataUrl = normalizeNodeGraphImageBurnDataUrl(source.dataUrl || "");
  const fileName = String(source.fileName || source.name || "").trim().slice(0, 160);
  return {
    background,
    backgroundColor: background,
    backgroundBrightness: clampNodeGraphImageBurnUnit(
      source.backgroundBrightness,
      defaults.backgroundBrightness,
    ),
    dataUrl,
    fileName: dataUrl ? (fileName || "image") : "",
  };
}

function nodeGraphImageBurnSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphImageBurnSettings();
  }
  const raw = {
    ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
    ...(node.imageBurn && typeof node.imageBurn === "object" ? node.imageBurn : {}),
  };
  return normalizeNodeGraphImageBurnSettings(raw);
}

function nodeGraphImageBurnToPatch(settings) {
  const n = normalizeNodeGraphImageBurnSettings(settings);
  return {
    background: n.background,
    backgroundBrightness: n.backgroundBrightness,
    backgroundColor: n.backgroundColor,
    dataUrl: n.dataUrl || "",
    fileName: n.fileName || "",
  };
}

function nodeGraphImageBurnReadParam(nodeId, key, fallback) {
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

/** One-shot: seed module params from legacy display bag keys. */
function nodeGraphImageBurnMigrateParamsFromDisplay(node) {
  if (!node || node.type !== "imageBurn") {
    return;
  }
  if (!node.params || typeof node.params !== "object") {
    node.params = {};
  }
  // Patch normalize fills new param defaults before draw — stamp versions:
  // 1 = Size/Bright/Feedback/Burn/Blur from display; 2 = +Blacks/Hang.
  const mig = Number(node.params._imageBurnParamMig) || 0;
  if (mig >= 2) {
    return;
  }
  const bag = {
    ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
    ...(node.imageBurn && typeof node.imageBurn === "object" ? node.imageBurn : {}),
  };
  if (mig < 1) {
    const sizeRaw = Number(bag.imageSize);
    if (Number.isFinite(sizeRaw)) {
      node.params.size = sizeRaw;
    }
    const brightRaw = Number(bag.image ?? bag.dry ?? bag.imageBright);
    if (Number.isFinite(brightRaw)) {
      node.params.brightness = brightRaw;
    }
    const sendRaw = Number(bag.send ?? bag.ink ?? bag.dot1Brightness);
    if (Number.isFinite(sendRaw)) {
      // Legacy send was 0…1 unipolar → positive Feedback.
      node.params.feedback = Math.max(0, Math.min(1, sendRaw));
    }
    const burnRaw = Number(bag.burn ?? bag.ghost);
    if (Number.isFinite(burnRaw)) {
      node.params.burn = burnRaw;
    }
    const blurRaw = Number(bag.blur ?? bag.bleed);
    if (Number.isFinite(blurRaw)) {
      node.params.blur = blurRaw;
    }
  }
  // Blacks / Hang: from display bag, or prior defaults already on the bag.
  const blacksRaw = Number(bag.contrast ?? bag.split ?? bag.threshold ?? node.params.blacks);
  if (Number.isFinite(blacksRaw) && (bag.contrast != null || bag.split != null || bag.threshold != null)) {
    node.params.blacks = blacksRaw;
  }
  const hangRaw = Number(bag.hang ?? bag.trail ?? bag.persist);
  if (Number.isFinite(hangRaw)) {
    node.params.hang = hangRaw;
  }
  node.params._imageBurnParamMig = 2;
}

/**
 * Feedback → deposit gain + blend mode.
 * Hang always receives the lit image; Feedback only chooses how.
 *   0  = max-blend at full lit (grab pixels, no stack / no brighten)
 *  >0  = additive accumulate (brighter over time)
 *  <0  = max-blend a dimmer stamp (dimmer hang fill, still no stack)
 */
function nodeGraphImageBurnFeedbackDeposit(lit, feedback) {
  const fb = Number.isFinite(Number(feedback)) ? Number(feedback) : 0;
  const light = Math.max(0, Number(lit) || 0);
  if (light <= 0) {
    return { deposit: 0, dim: 1, accumulate: false };
  }
  if (fb > 0) {
    return { deposit: light * Math.min(1, fb), dim: 1, accumulate: true };
  }
  if (fb < 0) {
    const mag = Math.min(1, Math.abs(fb));
    const dim = 1 - mag * (1 - NODE_GRAPH_IMAGE_BURN_FEEDBACK_DIM_MIN);
    return { deposit: light * dim, dim, accumulate: false };
  }
  // fb === 0: hang grabs full lit via max-blend — Feedback is not a gate.
  return { deposit: light, dim: 1, accumulate: false };
}

function nodeGraphImageBurnCanvasForSlot(slot) {
  const face = slot?.scopeElement;
  if (!face) {
    return null;
  }
  let canvas = face.querySelector?.(":scope > .node-image-burn-canvas")
    || face.querySelector?.(".node-image-burn-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-image-burn-canvas";
    canvas.setAttribute("aria-hidden", "true");
    face.append(canvas);
  }
  canvas.hidden = false;
  canvas.style.display = "";
  for (const overlay of face.querySelectorAll?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  ) || []) {
    overlay.remove();
  }
  return canvas;
}

function syncNodeGraphImageBurnCanvas(canvas, face, pixelRatio) {
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
  if (face.style && (!face.style.position || face.style.position === "static")) {
    face.style.position = "relative";
  }
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  return w > 0 && h > 0;
}

function nodeGraphImageBurnEnsureImage(face, dataUrl, onReady) {
  const url = String(dataUrl || "").trim();
  if (!url) {
    if (face) face._imageBurnSeenReady = false;
    return null;
  }
  if (typeof nodeGraphImageElementForDataUrl === "function") {
    const shared = nodeGraphImageElementForDataUrl(url);
    if (shared) {
      if (!shared.complete || !(shared.naturalWidth > 0)) {
        const prevLoad = shared.onload;
        const prevErr = shared.onerror;
        shared.onload = (ev) => {
          try { prevLoad?.(ev); } catch (_e) { /* ignore */ }
          if (typeof onReady === "function") onReady();
        };
        shared.onerror = (ev) => {
          shared._imageBurnFailed = true;
          try { prevErr?.(ev); } catch (_e) { /* ignore */ }
          if (typeof onReady === "function") onReady();
        };
      } else if (typeof onReady === "function" && face && !face._imageBurnSeenReady) {
        queueMicrotask(() => onReady());
      }
      return shared;
    }
  }
  if (!face) return null;
  let img = face._imageBurnImage;
  if (!img) {
    img = new Image();
    face._imageBurnImage = img;
  }
  if (img._imageBurnUrl !== url) {
    img._imageBurnUrl = url;
    img._imageBurnFailed = false;
    img.onload = () => {
      img._imageBurnFailed = false;
      if (typeof onReady === "function") onReady();
    };
    img.onerror = () => {
      img._imageBurnFailed = true;
      if (typeof onReady === "function") onReady();
    };
    try { img.src = url; } catch (_e) { img._imageBurnFailed = true; }
  }
  return img;
}

function nodeGraphImageBurnDestRect(faceW, faceH, imageSize, imgW, imgH) {
  const size = clampNodeGraphImageBurnSize(imageSize, 0);
  if (!(size > 0) || !(faceW > 0) || !(faceH > 0)) return null;
  const natW = Math.max(1, Number(imgW) || 1);
  const natH = Math.max(1, Number(imgH) || 1);
  const availW = Math.max(1, faceW * size);
  const availH = Math.max(1, faceH * size);
  const imgAspect = natW / natH;
  const boxAspect = availW / availH;
  let destW;
  let destH;
  if (imgAspect > boxAspect) {
    destW = availW;
    destH = availW / imgAspect;
  } else {
    destH = availH;
    destW = availH * imgAspect;
  }
  return {
    x: (faceW - destW) * 0.5,
    y: (faceH - destH) * 0.5,
    w: destW,
    h: destH,
  };
}

function nodeGraphImageBurnMakeBuf(face, key, w, h) {
  let c = face[key];
  if (!c) {
    c = document.createElement("canvas");
    face[key] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (cx) {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, w, h);
    }
  }
  return c;
}

function nodeGraphImageBurnBuffers(face, faceW, faceH) {
  const { w, h } = nodeGraphImageBurnResidualSide(faceW, faceH);
  return {
    w,
    h,
    color: nodeGraphImageBurnMakeBuf(face, "_imageBurnColor", w, h),
    ember: nodeGraphImageBurnMakeBuf(face, "_imageBurnEmber", w, h),
    scratch: nodeGraphImageBurnMakeBuf(face, "_imageBurnScratch", w, h),
  };
}

function nodeGraphImageBurnClearResidual(face) {
  if (!face) return;
  if (typeof nodeGraphImageBurnGlClear === "function") {
    nodeGraphImageBurnGlClear(face);
  }
  for (const key of ["_imageBurnColor", "_imageBurnEmber", "_imageBurnScratch"]) {
    const c = face[key];
    const cx = c?.getContext?.("2d");
    if (cx && c) {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, c.width, c.height);
    }
  }
}

/** Fit residual to face size; uniform scale only if a side exceeds max (keeps aspect). */
function nodeGraphImageBurnResidualSide(faceW, faceH) {
  let w = Math.max(1, Math.round(faceW) || 1);
  let h = Math.max(1, Math.round(faceH) || 1);
  const longest = Math.max(w, h);
  const maxSide = NODE_GRAPH_IMAGE_BURN_RESIDUAL_MAX_SIDE;
  if (longest > maxSide) {
    const s = maxSide / longest;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { w, h };
}

/**
 * Buffered In for this display frame. Prefer the newest sample so the ghost
 * tracks the wire (and Output) without a lagging history-window peak.
 * Cap the lookback so a mis-tagged sampleRate cannot light from seconds ago.
 */
function nodeGraphImageBurnBufferedEnergy(face, buffer) {
  const empty = { peak: 0, dry: 0, deposit: 0 };
  if (!face || !buffer || !buffer.length) {
    return empty;
  }

  const abs = Math.max(
    0,
    Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount || buffer.nodeGraphScopeAbsoluteFrame) || 0),
  );
  const prevAbs = Math.max(0, Number(face._imageBurnEnergyAbs) || 0);
  const writeRate = typeof nodeGraphScopeSampleRate === "function"
    ? nodeGraphScopeSampleRate(buffer)
    : (Number(buffer.nodeGraphScopeSampleRate) || 60);
  // At most ~two display frames of hopped samples — never a multi-second peak hold.
  const maxWindow = Math.max(1, Math.ceil(Math.max(1, writeRate) / 30));

  let n = 0;
  if (prevAbs > 0 && abs > prevAbs) {
    n = Math.min(buffer.length, abs - prevAbs);
  } else if (typeof nodeGraphScopeBufferRecentSampleCount === "function") {
    const recent = nodeGraphScopeBufferRecentSampleCount(buffer);
    if (recent != null && recent > 0) {
      n = Math.min(buffer.length, recent);
    }
  }
  if (!(n > 0)) {
    n = Math.min(buffer.length, Math.max(1, Math.ceil(Math.max(1, writeRate) / 60)));
  }
  n = Math.min(n, maxWindow, buffer.length);
  face._imageBurnEnergyAbs = abs || prevAbs;

  // Newest sample is authoritative for "now"; short-window peak catches a
  // hop that landed between paints without dragging older modulation.
  let peak = Math.abs(Number(buffer[buffer.length - 1]) || 0);
  const start = Math.max(0, buffer.length - n);
  for (let i = start; i < buffer.length; i += 1) {
    const sample = Number(buffer[i]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    const a = Math.abs(sample);
    if (a > peak) {
      peak = a;
    }
  }
  peak = Math.max(0, Math.min(1, peak));

  return { peak, dry: peak, deposit: peak };
}

/** Try dedicated GL burn; returns true if presented. */
function nodeGraphImageBurnDrawGl(face, ctx, w, h, opts) {
  if (typeof nodeGraphImageBurnGlEnsure !== "function"
    || typeof nodeGraphImageBurnGlStep !== "function"
    || typeof nodeGraphImageBurnGlPresentTo !== "function") {
    return false;
  }
  const renderer = nodeGraphImageBurnGlEnsure(face, w, h);
  if (!renderer) {
    return false;
  }
  nodeGraphImageBurnGlStep(face, {
    hang: opts.hang,
    burn: opts.burn,
    contrast: opts.contrast,
    blur: opts.blur,
    deposit: opts.deposit,
    accumulate: opts.accumulate,
    image: opts.img,
    imageSize: opts.imageSize,
    dataUrl: opts.dataUrl,
    paused: opts.paused,
  });
  return nodeGraphImageBurnGlPresentTo(face, ctx, w, h);
}

/** Fade buffer toward black by (1 - keep). keep 0 = wipe, 1 = freeze. */
function nodeGraphImageBurnFadeBuf(ctx, w, h, keep) {
  const k = Math.max(0, Math.min(1, Number(keep) || 0));
  const fade = 1 - k;
  if (fade >= 0.999) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return;
  }
  if (fade < 1e-4) {
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${fade})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Smoothstep 0…1. */
/**
 * First-stage source contrast (dry + burn send the same toned image).
 * Full dial 0…2 is usable: 0 = unchanged, 2 = crush mid/lows to black (highs safe).
 */
function nodeGraphImageBurnApplyContrastRgb(r, g, b, contrast02) {
  const amt = clampNodeGraphImageBurnContrast(contrast02, 0) / 2; // 0…1
  if (amt < 1e-6) {
    return { r, g, b };
  }
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 1e-6) {
    return { r: 0, g: 0, b: 0 };
  }
  const protect = Math.max(0, Math.min(1, (luma - 0.28) / 0.55));
  const crushed = Math.pow(Math.max(0, luma), 1 + amt * 4.5);
  const newL = crushed + (luma - crushed) * protect * protect;
  const s = newL / luma;
  return {
    r: Math.max(0, Math.min(1, r * s)),
    g: Math.max(0, Math.min(1, g * s)),
    b: Math.max(0, Math.min(1, b * s)),
  };
}

/** Burn fade: Hang is the floor; Burn only extends highlight linger. */
function nodeGraphImageBurnFadeByLuma(canvas, hangKeep, burn01) {
  if (!canvas) {
    return;
  }
  const hang = Math.max(0, Math.min(1, Number(hangKeep) || 0));
  const burn = Math.max(0, Math.min(1, Number(burn01) || 0));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  let frame;
  try {
    frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (_e) {
    nodeGraphImageBurnFadeBuf(ctx, canvas.width, canvas.height, hang);
    return;
  }
  const darkKeep = hang;
  const brightKeep = hang + (0.9995 - hang) * burn;
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const keep = darkKeep + (brightKeep - darkKeep) * luma;
    px[i] = (r * keep + 0.5) | 0;
    px[i + 1] = (g * keep + 0.5) | 0;
    px[i + 2] = (b * keep + 0.5) | 0;
  }
  ctx.putImageData(frame, 0, 0);
}

/** Apply Contrast curve to a stamp canvas. */
function nodeGraphImageBurnContrastStamp(canvas, contrast02) {
  if (!canvas) {
    return canvas;
  }
  const contrast = clampNodeGraphImageBurnContrast(contrast02, 0);
  if (contrast < 1e-6) {
    return canvas;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return canvas;
  }
  let frame;
  try {
    frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (_e) {
    return canvas;
  }
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const out = nodeGraphImageBurnApplyContrastRgb(
      px[i] / 255,
      px[i + 1] / 255,
      px[i + 2] / 255,
      contrast,
    );
    px[i] = (out.r * 255 + 0.5) | 0;
    px[i + 1] = (out.g * 255 + 0.5) | 0;
    px[i + 2] = (out.b * 255 + 0.5) | 0;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/** Canvas 2D blur radius — 8px at 256 reference, scales with buffer size (F solo). */
function nodeGraphImageBurnBlurRadiusPx(blur01, width, height) {
  const a = Math.max(0, Math.min(1, Number(blur01) || 0));
  const refPx = Math.pow(a, 1.15) * 8.0;
  const minSide = Math.max(1, Math.min(Number(width) || 256, Number(height) || 256));
  return refPx * (minSide / 256);
}

/** Recirculate src through Gaussian blur; mix from curve (0 → leave src). */
function nodeGraphImageBurnBlurBuf(src, scratch, blur01) {
  const amt = Math.max(0, Math.min(1, Number(blur01) || 0));
  if (!src || !scratch) {
    return;
  }
  const mixAmt = Math.pow(amt, 0.9);
  const w = src.width;
  const h = src.height;
  const px = nodeGraphImageBurnBlurRadiusPx(amt, w, h);
  const sctx = scratch.getContext("2d");
  const rctx = src.getContext("2d");
  if (!sctx || !rctx) {
    return;
  }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, w, h);
  sctx.filter = `blur(${Math.max(0, px).toFixed(3)}px)`;
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = "source-over";
  sctx.drawImage(src, 0, 0);
  sctx.filter = "none";
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.globalCompositeOperation = "source-over";
  if (mixAmt >= 1) {
    rctx.clearRect(0, 0, w, h);
    rctx.globalAlpha = 1;
    rctx.drawImage(scratch, 0, 0);
  } else {
    rctx.globalAlpha = mixAmt;
    rctx.drawImage(scratch, 0, 0);
    rctx.globalAlpha = 1;
  }
}

/** Per-pixel max blend (Feedback ≤0): fill hang up to stamp, never stack past it. */
function nodeGraphImageBurnMaxBlendStamp(destCtx, stampCanvas) {
  if (!destCtx || !stampCanvas) {
    return;
  }
  const w = destCtx.canvas.width;
  const h = destCtx.canvas.height;
  let dest;
  let stamp;
  try {
    dest = destCtx.getImageData(0, 0, w, h);
    stamp = stampCanvas.getContext("2d")?.getImageData(0, 0, w, h);
  } catch (_e) {
    return;
  }
  if (!stamp) {
    return;
  }
  const d = dest.data;
  const s = stamp.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(d[i], s[i]);
    d[i + 1] = Math.max(d[i + 1], s[i + 1]);
    d[i + 2] = Math.max(d[i + 2], s[i + 2]);
  }
  destCtx.putImageData(dest, 0, 0);
}

/**
 * Stamp into a burn buffer via scratch.
 * Contrast luma-gates both paths (preserves hue). Soft-compress color peaks only.
 * accumulate=true → lighter/screen add; false → max-blend ceiling.
 */
function nodeGraphImageBurnStampCompressed(face, destCtx, scratch, img, imageSize, alpha, mode, burn01, contrast01, accumulate = true) {
  if (!destCtx || !scratch || !img) {
    return false;
  }
  const w = destCtx.canvas.width;
  const h = destCtx.canvas.height;
  const tctx = scratch.getContext("2d");
  if (!tctx) {
    return nodeGraphImageBurnStampInto(destCtx, img, imageSize, alpha);
  }
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, w, h);
  if (!nodeGraphImageBurnStampInto(tctx, img, imageSize, alpha)) {
    return false;
  }
  nodeGraphImageBurnContrastStamp(scratch, contrast01);
  if (mode === "color") {
    nodeGraphImageBurnSoftCompressStamp(scratch);
  }
  if (!accumulate) {
    nodeGraphImageBurnMaxBlendStamp(destCtx, scratch);
    return true;
  }
  destCtx.save();
  destCtx.globalCompositeOperation = mode === "ember" ? "screen" : "lighter";
  destCtx.globalAlpha = 1;
  destCtx.drawImage(scratch, 0, 0);
  destCtx.restore();
  return true;
}

function nodeGraphImageBurnStampInto(ctx, img, imageSize, alpha) {
  if (!ctx || !img?.complete || !(img.naturalWidth > 0)) {
    return false;
  }
  const a = Math.max(0, Math.min(1.5, Number(alpha) || 0));
  if (a < 1e-5) {
    return false;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const rect = nodeGraphImageBurnDestRect(w, h, imageSize, img.naturalWidth, img.naturalHeight);
  if (!rect) {
    return false;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, a);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return true;
}

/** Draw the dry source image at a given opacity / composite mode. */
function nodeGraphImageBurnDrawDry(ctx, img, imageSize, alpha, composite = "source-over", contrast02 = 0) {
  if (!ctx || !img?.complete || !(img.naturalWidth > 0)) {
    return false;
  }
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  if (a < 1e-4) {
    return false;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const rect = nodeGraphImageBurnDestRect(w, h, imageSize, img.naturalWidth, img.naturalHeight);
  if (!rect) {
    return false;
  }
  const contrast = clampNodeGraphImageBurnContrast(contrast02, 0);
  // Contrast is first: build the toned source, then display (burn uses same curve).
  let src = img;
  if (contrast > 1e-6) {
    let scratch = ctx.canvas._imageBurnDryScratch;
    if (!scratch || scratch.width !== w || scratch.height !== h) {
      scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      ctx.canvas._imageBurnDryScratch = scratch;
    }
    const sctx = scratch.getContext("2d");
    if (sctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, w, h);
      sctx.globalAlpha = 1;
      sctx.globalCompositeOperation = "source-over";
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      nodeGraphImageBurnContrastStamp(scratch, contrast);
      src = scratch;
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = composite || "source-over";
  ctx.globalAlpha = a;
  ctx.imageSmoothingEnabled = true;
  if (src === img) {
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.drawImage(src, 0, 0);
  }
  ctx.restore();
  return true;
}

/**
 * Soft compress a stamp only (never the whole residual each frame — that
 * recursively crushed linger to black).
 */
function nodeGraphImageBurnSoftCompressStamp(srcCanvas) {
  if (!srcCanvas) {
    return srcCanvas;
  }
  const ctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return srcCanvas;
  }
  let frame;
  try {
    frame = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  } catch (_e) {
    return srcCanvas;
  }
  const px = frame.data;
  const k = NODE_GRAPH_IMAGE_BURN_COMPRESS;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255;
    let g = px[i + 1] / 255;
    let b = px[i + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Only pull down hot peaks; leave mid/dark alone so residual can linger.
    if (luma > 0.35) {
      const c = luma / (1 + (luma - 0.35) * k);
      const s = c / luma;
      r *= s;
      g *= s;
      b *= s;
    }
    px[i] = Math.max(0, Math.min(255, r * 255));
    px[i + 1] = Math.max(0, Math.min(255, g * 255));
    px[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
  ctx.putImageData(frame, 0, 0);
  return srcCanvas;
}

function nodeGraphImageBurnScheduleRepaint(slotOrNodeId) {
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof requestNodeGraphModuleScopeRepaint === "function" && slotOrNodeId) {
    requestNodeGraphModuleScopeRepaint(slotOrNodeId);
  }
}

function drawNodeGraphImageBurnFaceItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const canvas = nodeGraphImageBurnCanvasForSlot(slot);
  if (!canvas || !syncNodeGraphImageBurnCanvas(canvas, face, pixelRatio)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(slot.nodeId) : null);
  if (node) {
    nodeGraphImageBurnMigrateParamsFromDisplay(node);
  }
  const settings = nodeGraphImageBurnSettingsForNode(node);
  const nodeId = slot.nodeId;
  const size = clampNodeGraphImageBurnSize(
    nodeGraphImageBurnReadParam(nodeId, "size", 1),
    1,
  );
  const brightness = Math.max(0, nodeGraphImageBurnReadParam(nodeId, "brightness", 1));
  const blacks = clampNodeGraphImageBurnContrast(
    nodeGraphImageBurnReadParam(nodeId, "blacks", 0),
    0,
  );
  const feedback = nodeGraphImageBurnReadParam(nodeId, "feedback", 0);
  const hang = Math.max(0, Math.min(1, nodeGraphImageBurnReadParam(nodeId, "hang", 0.55)));
  const burn = Math.max(0, nodeGraphImageBurnReadParam(nodeId, "burn", 0.75));
  const blur = Math.max(0, nodeGraphImageBurnReadParam(nodeId, "blur", 0.45));
  const contrast = blacks;
  const buffer = item?.buffer;
  const w = canvas.width;
  const h = canvas.height;

  const bgAmt = clampNodeGraphImageBurnUnit(settings.backgroundBrightness, 0);
  let bg = settings.background || "#000000";
  if (typeof nodeGraphHueBrightnessCss === "function") {
    const bgHue = typeof nodeGraphHueDegFromHex === "function"
      ? nodeGraphHueDegFromHex(settings.backgroundColor || settings.background)
      : 220;
    bg = nodeGraphHueBrightnessCss(bgHue, bgAmt);
  }
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, bg);
  }
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  const img = nodeGraphImageBurnEnsureImage(
    face,
    settings.dataUrl,
    () => nodeGraphImageBurnScheduleRepaint(slot),
  );

  // This frame's buffered In peak × Brightness → dry; Feedback gates deposit.
  const energy = nodeGraphImageBurnBufferedEnergy(face, buffer);
  const energy01 = energy.dry;

  const imageFailed = Boolean(img?._imageBurnFailed);
  const imageReady = Boolean(
    settings.dataUrl
    && size > 0
    && img
    && !imageFailed
    && img.complete
    && img.naturalWidth > 0,
  );
  const imagePending = Boolean(
    settings.dataUrl
    && size > 0
    && img
    && !imageFailed
    && !imageReady,
  );

  if (!settings.dataUrl) {
    face._imageBurnSeenReady = false;
    face._imageBurnEnergyAbs = 0;
    nodeGraphImageBurnClearResidual(face);
  }

  // One-shot after load so hang gets pixels before In is wired.
  if (imageReady && !face._imageBurnSeenReady) {
    face._imageBurnSeenReady = true;
    face._imageBurnSeedFrames = 12;
  }
  if (energy.peak > 0.04 || energy.deposit > 0.04) {
    face._imageBurnSeedFrames = 0;
  }
  const seedLeft = Math.max(0, Number(face._imageBurnSeedFrames) || 0);
  if (seedLeft > 0) {
    face._imageBurnSeedFrames = seedLeft - 1;
  }
  const lit = Math.max(energy01 * brightness, seedLeft > 0 ? brightness * 0.85 : 0);
  let fbInfo = nodeGraphImageBurnFeedbackDeposit(lit, feedback);
  if (seedLeft > 0) {
    const seeded = nodeGraphImageBurnFeedbackDeposit(brightness * 0.85, feedback);
    if (seeded.deposit > fbInfo.deposit) {
      fbInfo = seeded;
    }
  }
  const deposit = fbInfo.deposit;
  const accumulate = Boolean(fbInfo.accumulate);

  const paused = typeof nodeGraphModuleScopePaused === "function"
    && nodeGraphModuleScopePaused();

  // Residual via GL; dry flash screened in 2D after (Brightness never hides burn).
  const usedGl = nodeGraphImageBurnDrawGl(face, ctx, w, h, {
    hang,
    burn,
    contrast,
    blur,
    deposit: imageReady ? deposit : 0,
    accumulate,
    lit: imageReady ? lit : 0,
    img: imageReady ? img : null,
    imageSize: size,
    dataUrl: settings.dataUrl,
    paused,
  });

  // Always draw dry for current In energy so the face tracks the wire / Output
  // in time. Hang residual is the trailing ghost underneath (Feedback path).
  const drawDry = imageReady && lit > 1e-4;

  if (usedGl) {
    if (drawDry) {
      nodeGraphImageBurnDrawDry(
        ctx,
        img,
        size,
        lit,
        "screen",
        contrast,
      );
    }
  } else {
    const buf = nodeGraphImageBurnBuffers(face, w, h);
    const colorCtx = buf.color.getContext("2d");
    const emberCtx = buf.ember.getContext("2d");

    if (colorCtx && emberCtx && !paused) {
      const colorKeep = hang >= 1 ? 1 : (1 - Math.pow(1 - hang, 3));
      nodeGraphImageBurnFadeByLuma(buf.color, colorKeep, Math.min(1, burn));
      nodeGraphImageBurnFadeByLuma(buf.ember, colorKeep, Math.min(1, burn));

      nodeGraphImageBurnBlurBuf(buf.color, buf.scratch, Math.min(1, blur) * 0.85);
      nodeGraphImageBurnBlurBuf(buf.ember, buf.scratch, Math.min(1, blur));

      if (imageReady && deposit > 1e-5) {
        nodeGraphImageBurnStampCompressed(
          face,
          colorCtx,
          buf.scratch,
          img,
          size,
          deposit,
          "color",
          burn,
          contrast,
          accumulate,
        );
        nodeGraphImageBurnStampCompressed(
          face,
          emberCtx,
          buf.scratch,
          img,
          size,
          deposit * (0.55 + Math.min(1, burn) * 0.75),
          "ember",
          burn,
          contrast,
          accumulate,
        );
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(buf.color, 0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.35 + Math.min(1, burn) * 0.5;
    ctx.drawImage(buf.ember, 0, 0, w, h);

    if (drawDry) {
      nodeGraphImageBurnDrawDry(
        ctx,
        img,
        size,
        lit,
        "screen",
        contrast,
      );
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  if (!settings.dataUrl) {
    ctx.fillStyle = "rgba(127, 199, 217, 0.4)";
    ctx.font = `${Math.max(10, Math.round(Math.min(w, h) * 0.05))}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load image", w * 0.5, h * 0.5);
  } else if (imageFailed) {
    ctx.fillStyle = "rgba(220, 120, 120, 0.5)";
    ctx.font = `${Math.max(10, Math.round(Math.min(w, h) * 0.045))}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load failed", w * 0.5, h * 0.5);
  } else if (imagePending) {
    ctx.fillStyle = "rgba(127, 199, 217, 0.35)";
    ctx.font = `${Math.max(10, Math.round(Math.min(w, h) * 0.045))}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("…", w * 0.5, h * 0.5);
  }

  if (face.dataset) {
    face.dataset.lightStrength = (lit > 0.02 || imageReady) ? "1" : "0.15";
    face.classList.toggle("has-image", imageReady);
  }
}

function commitNodeGraphImageBurn(nodeId, nextSettings, options = {}) {
  const id = String(nodeId || "").trim();
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  const node = patch?.nodes?.find((n) => n.id === id);
  if (!node || node.type !== "imageBurn") {
    return false;
  }
  const normalized = normalizeNodeGraphImageBurnSettings(nextSettings);
  const bag = nodeGraphImageBurnToPatch(normalized);
  node.imageBurn = bag;
  node.traceDisplaySettings = {
    ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
    ...bag,
  };
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      record: options.record !== false,
      status: options.status || (normalized.dataUrl ? "image ghost loaded" : "image ghost cleared"),
    });
  }
  nodeGraphImageBurnScheduleRepaint(id);
  const slot = typeof nodeGraphModuleScopeState !== "undefined"
    ? nodeGraphModuleScopeState?.slots?.get?.(id)
    : null;
  const face = slot?.scopeElement
    || (typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(id)?.querySelector?.(".node-image-burn-face")
      : null);
  if (face && typeof drawNodeGraphImageBurnFaceItem === "function") {
    drawNodeGraphImageBurnFaceItem(null, {
      buffer: null,
      screenElement: face,
      slot: slot || { nodeId: id, scopeElement: face, type: "imageBurn" },
    }, Math.max(1, window.devicePixelRatio || 1));
  }
  return true;
}

function clearNodeGraphImageBurnImage(nodeId) {
  const id = String(nodeId || "").trim()
    || (typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphTraceDisplaySettingsTargetNodeId()
      : "");
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!patchNode || patchNode.type !== "imageBurn") {
    return;
  }
  const prev = nodeGraphImageBurnSettingsForNode(patchNode);
  commitNodeGraphImageBurn(id, {
    ...prev,
    dataUrl: "",
    fileName: "",
  }, { status: "image ghost cleared" });
  if (typeof syncNodeGraphImageBurnDisplaySettingsControls === "function") {
    syncNodeGraphImageBurnDisplaySettingsControls();
  }
}

function pickNodeGraphImageBurnImage() {
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  nodeGraphPickImageFile((asset) => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (!patchNode || patchNode.type !== "imageBurn") {
      return;
    }
    const prev = nodeGraphImageBurnSettingsForNode(patchNode);
    commitNodeGraphImageBurn(nodeId, {
      ...prev,
      dataUrl: asset.dataUrl,
      fileName: asset.fileName || "image",
    }, { status: `${asset.fileName || "image"} loaded` });
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`Image Ghost: loaded ${asset.fileName || "image"}.`);
    }
    if (typeof syncNodeGraphImageBurnDisplaySettingsControls === "function") {
      syncNodeGraphImageBurnDisplaySettingsControls();
    }
  });
}

function buildNodeGraphImageBurnDisplaySettingsBodyHtml() {
  const hueRow = typeof nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml
    : null;
  return `
    <div class="node-image-burn-display-settings-panel" data-image-burn-display-settings-panel>
      <div class="metadata-field-section">
        <div class="metadata-section-title">IMAGE</div>
        ${(typeof nodeGraphBuildImageAssetRowHtml === "function"
          ? nodeGraphBuildImageAssetRowHtml({ key: "burn", label: "Image" })
          : "")}
      </div>
      <div class="metadata-field-section">
        <div class="metadata-section-title">PLATE</div>
        ${hueRow
          ? hueRow({
            title: "Background",
            stepField: "backgroundBrightness",
            colorField: "backgroundColor",
            formType: "imageBurnFace",
            defaultHueHex: "#000000",
            titleAttr: "Plate brightness 0…1.",
          })
          : ""}
        <div class="metadata-field-section node-trace-display-xy-pad-actions" style="margin-top:0.5rem">
          <button type="button" data-image-burn-clear-residual class="node-xy-pad-reset-canvas-button">
            Clear
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindNodeGraphImageBurnDisplaySettingsEvents(root) {
  const panel = root?.querySelector?.("[data-image-burn-display-settings-panel]") || root;
  if (!panel || panel.dataset.imageBurnBound === "true") {
    return;
  }
  panel.dataset.imageBurnBound = "true";
  if (typeof nodeGraphBindImageAssetClicks === "function") {
    nodeGraphBindImageAssetClicks(panel, (_key, action) => {
      if (action === "load") {
        pickNodeGraphImageBurnImage();
      } else if (action === "clear") {
        clearNodeGraphImageBurnImage();
      } else if (action === "save") {
        const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
          ? nodeGraphTraceDisplaySettingsTargetNodeId()
          : "";
        const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
        const settings = nodeGraphImageBurnSettingsForNode(node);
        if (typeof nodeGraphSaveImageAsset === "function") {
          nodeGraphSaveImageAsset(settings, "image-burn");
        }
      }
    });
  }
  panel.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("[data-image-burn-clear-residual]");
    if (!btn || !panel.contains(btn)) {
      return;
    }
    event.preventDefault();
    const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphTraceDisplaySettingsTargetNodeId()
      : "";
    const slot = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.slots?.get?.(nodeId)
      : null;
    const face = slot?.scopeElement
      || document.querySelector?.(`.node-image-burn-face[data-node="${CSS.escape(String(nodeId))}"]`);
    nodeGraphImageBurnClearResidual(face);
    nodeGraphImageBurnScheduleRepaint(slot || nodeId);
  });
}

function syncNodeGraphImageBurnDisplaySettingsControls(root) {
  const panel = root?.querySelector?.("[data-image-burn-display-settings-panel]")
    || document.querySelector("#nodeTraceDisplaySettingsPopover [data-image-burn-display-settings-panel]");
  if (!panel) {
    return;
  }
  const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const settings = nodeGraphImageBurnSettingsForNode(node);
  if (typeof nodeGraphSyncImageAssetRow === "function") {
    nodeGraphSyncImageAssetRow(panel, "burn", settings, "no image");
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.imageBurnFace = drawNodeGraphImageBurnFaceItem;
}
