// Number Readout paint helpers extracted from node-graph-module-scopes.js (Phase D).
// Load after phosphor, before scopes.js.

function nodeGraphNumberReadoutCanvasForSlot(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-number-readout-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-number-readout-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}


function invalidateNodeGraphNumberReadoutPaintCache(canvas) {
  if (!canvas) {
    return;
  }
  canvas._numberReadoutLastValueText = "";
  canvas._numberReadoutLastGoodValueText = "";
  canvas._numberReadoutLastTextChangeAt = 0;
  canvas._numberReadoutResidualEnergy = 0;
  canvas._numberReadoutResiduals = null;
  canvas._nodeGraphNumberReadoutText = null;
  canvas._nodeGraphNumberReadoutSettingsSig = null;
  canvas._nodeGraphNumberReadoutFontReady = null;
  canvas._nodeGraphNumberReadoutWidth = -1;
  canvas._nodeGraphNumberReadoutHeight = -1;
  canvas._nodeGraphNumberReadoutPaintAt = 0;
  canvas._numberReadoutEnergyMask = null;
  canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
  nodeGraphNumberReadoutClearBurnPlate(canvas);
  for (const key of ["_phosphorEnergyGl"]) {
    const face = canvas[key];
    if (face && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
      try {
        nodeGraphPhosphorEnergyGlDestroy(face);
      } catch (_error) {
        // Best-effort.
      }
    }
    canvas[key] = null;
  }
}

/**
 * True when valueText is a "no signal" placeholder, not a held reading.
 * Placeholders must never replace a frozen/held phosphor face.
 */
function nodeGraphNumberReadoutIsEmptyPlaceholder(text) {
  const s = String(text || "").trim();
  if (!s) {
    return true;
  }
  // DSEG all-off, dashes, em-dash, or pure ! / . skeletons.
  if (/^[!.\s—–-]+$/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Prefer live sample; if missing (pause / bypass / wire re-arm glitch), hold the
 * last good reading so Ghost/Trail never get wiped to empty "!" plates.
 */
function nodeGraphNumberReadoutResolveHeldValueText(canvas, liveText, { frozen = false } = {}) {
  const live = String(liveText || "");
  if (!nodeGraphNumberReadoutIsEmptyPlaceholder(live)) {
    return live;
  }
  const held = String(canvas?._numberReadoutLastGoodValueText || "");
  if (held && !nodeGraphNumberReadoutIsEmptyPlaceholder(held)) {
    return held;
  }
  // Never invent empty "!" while frozen — caller should leave the face alone.
  if (frozen) {
    return "";
  }
  return live;
}

function nodeGraphNumberReadoutRememberGoodValue(canvas, valueText) {
  if (!canvas || nodeGraphNumberReadoutIsEmptyPlaceholder(valueText)) {
    return;
  }
  canvas._numberReadoutLastGoodValueText = String(valueText);
}

/**
 * Offscreen burn plate for residual digits (pixel burn, not tracked history).
 * Stamps only on value change; fades each frame with super-exponential Residual hang.
 * On resize: scale-preserve previous ink — never blank the residual (zoom/layout
 * flicker used to wipe Ghost/Trail every time the host canvas dim hopped 1px).
 */
function nodeGraphNumberReadoutEnsureBurnPlate(canvas) {
  if (!canvas) {
    return null;
  }
  let layer = canvas._numberReadoutBurnPlate;
  if (!layer) {
    layer = document.createElement("canvas");
    canvas._numberReadoutBurnPlate = layer;
  }
  const w = Math.max(0, canvas.width | 0);
  const h = Math.max(0, canvas.height | 0);
  if (w < 1 || h < 1) {
    return layer;
  }
  if (layer.width === w && layer.height === h) {
    return layer;
  }
  const prevW = layer.width | 0;
  const prevH = layer.height | 0;
  if (prevW > 0 && prevH > 0) {
    let scratch = canvas._numberReadoutBurnResizeScratch;
    if (!scratch) {
      scratch = document.createElement("canvas");
      canvas._numberReadoutBurnResizeScratch = scratch;
    }
    if (scratch.width !== prevW || scratch.height !== prevH) {
      scratch.width = prevW;
      scratch.height = prevH;
    }
    const sctx = scratch.getContext("2d");
    const lctx = layer.getContext("2d");
    if (sctx && lctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, prevW, prevH);
      sctx.drawImage(layer, 0, 0);
      layer.width = w;
      layer.height = h;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, w, h);
      lctx.imageSmoothingEnabled = true;
      lctx.drawImage(scratch, 0, 0, prevW, prevH, 0, 0, w, h);
      // Keep residual energy — geometry changed, deposits still live.
      return layer;
    }
  }
  layer.width = w;
  layer.height = h;
  return layer;
}

function nodeGraphNumberReadoutClearBurnPlate(canvas) {
  if (!canvas) {
    return;
  }
  const layer = canvas._numberReadoutBurnPlate;
  if (layer?.width && layer?.height) {
    const rctx = layer.getContext?.("2d");
    rctx?.setTransform?.(1, 0, 0, 1, 0, 0);
    rctx?.clearRect?.(0, 0, layer.width, layer.height);
  }
  canvas._numberReadoutResidualEnergy = 0;
}

/**
 * Per-frame destination-out erase for the burn plate (previous-digit deposits).
 * App-wide Trail + Ghost residual policy (PhosphorResidual): pure hang/decay.
 * Ghost does NOT set brightness — only how long deposited energy sticks.
 * Trail 0 + Ghost 0 = wipe deposits immediately.
 * Burn sticky floor is applied separately (per-pixel) when Burn > 0.
 */
function nodeGraphNumberReadoutBurnEraseAlpha(trailHang, ghostHang = 0) {
  const trail = clampNodeSliderValue(Number(trailHang) || 0, 0, 1);
  const ghost = clampNodeSliderValue(Number(ghostHang) || 0, 0, 1);
  if (trail <= 0.001 && ghost <= 0.001) {
    return 1;
  }
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  if (Residual && typeof Residual.residualKeep === "function") {
    const keep = Number(Residual.residualKeep(trail, ghost));
    if (Number.isFinite(keep)) {
      // Near-freeze (keep≈1) → near-zero erase; low keep → strong erase.
      // Floor erase slightly when Trail is on so the last 8-bit ink dies.
      const erase = clampNodeSliderValue(1 - keep, 0, 1);
      if (trail > 0.001 && erase > 0 && erase < 0.02) {
        return Math.max(erase, 0.02);
      }
      return erase;
    }
  }
  if (Residual && typeof Residual.trailFadeAmount === "function") {
    const fade = Number(Residual.trailFadeAmount(trail, ghost));
    if (Number.isFinite(fade)) {
      return clampNodeSliderValue(fade, 0, 1);
    }
  }
  // Fallback if residual helper not loaded yet.
  const erase = Math.exp(-9 * Math.max(trail, ghost)) * 0.52;
  return clampNodeSliderValue(erase, 0.0015, 0.55);
}

/**
 * Per-pixel residual step on the LED burn plate (Trail/Ghost/Burn).
 * Used when Burn > 0 so sticky floors are not wiped by uniform destination-out.
 */
function nodeGraphNumberReadoutApplyResidualPlate(burnCtx, width, height, trailHang, ghostHang, burnHang) {
  if (!burnCtx || width <= 0 || height <= 0) {
    return;
  }
  const trail = clampNodeSliderValue(Number(trailHang) || 0, 0, 1);
  const ghost = clampNodeSliderValue(Number(ghostHang) || 0, 0, 1);
  // Sticky Burn floor 0…1 only.
  const burn = typeof PhosphorResidual !== "undefined" && PhosphorResidual.clampBurn
    ? PhosphorResidual.clampBurn(burnHang, 0)
    : clampNodeSliderValue(Number(burnHang) || 0, 0, 1);
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  if (!Residual || typeof Residual.applyResidual !== "function") {
    return;
  }
  const img = burnCtx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a <= 0.0005) continue;
    // White energy stamps: energy lives in alpha (rgb stays 255).
    const next = Residual.applyResidual(a, trail, ghost, burn);
    const na = Math.max(0, Math.min(1, next));
    if (na <= 0.0005) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    } else {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.max(0, Math.min(255, Math.round(na * 255)));
    }
  }
  burnCtx.putImageData(img, 0, 0);
}

/** LED (phosphor light) vs LCD (reflective ink) face style for a slot/node. */
function nodeGraphNumberReadoutFaceStyleForSlot(slot, node = null) {
  const type = String(slot?.type || node?.type || "");
  // Pitch Detector = phosphor LED Value readout (not LCD vector plate).
  if (type === "helmholtzPitch") {
    return "led";
  }
  if (type === "valueLcd") {
    return "lcd";
  }
  if (typeof nodeGraphNumberReadoutFaceStyleForNode === "function") {
    return nodeGraphNumberReadoutFaceStyleForNode(node || { type, traceDisplaySettings: null });
  }
  return "led";
}

/**
 * Room-dimmer cutout for reflective LCD plates: partial hole (same 2/3
 * “less dim” as crossover curve faces), not full-bright phosphor (1) and not
 * fully under the veil (0).
 */
const nodeGraphLcdDisplayLightStrength =
  typeof nodeGraphCrossoverDisplayLightStrength === "number"
    ? nodeGraphCrossoverDisplayLightStrength
    : 2 / 3;

function nodeGraphNumberReadoutIsLcdFaceElement(el) {
  if (!el) {
    return false;
  }
  // Pitch plate class is layout-only; paint style is LED phosphor.
  if (el.classList?.contains("node-pitch-detector-lcd")
    || el.closest?.(".node-pitch-detector-face")) {
    return false;
  }
  if (el.classList?.contains("node-value-lcd-face")) {
    return true;
  }
  if (String(el.dataset?.valueFaceStyle || "").toLowerCase() === "lcd") {
    return true;
  }
  return false;
}

/** Apply LCD less-dim punch to face (+ optional canvas). */
function nodeGraphNumberReadoutApplyLcdLightCutout(face, canvas = null) {
  const s = nodeGraphLcdDisplayLightStrength;
  const strength = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 2 / 3;
  const text = strength.toFixed(6);
  const targets = [face, canvas].filter(Boolean);
  for (const el of targets) {
    el.classList?.add?.("node-light-source");
    if (el.dataset) {
      el.dataset.lightSource = "screen";
      el.dataset.lightStrength = text;
    }
    if (typeof setNodeGraphLightStrength === "function") {
      setNodeGraphLightStrength(el, strength);
    }
  }
  return strength;
}

/**
 * LCD foreground (digit ink) RGB — solid color widget only (no Bright ramp).
 */
function nodeGraphNumberReadoutLcdInkRgb(settings) {
  const hex = settings?.color
    || (typeof nodeGraphValueLcdSettingsDefaults !== "undefined"
      ? nodeGraphValueLcdSettingsDefaults.color
      : "#1a2216");
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [26, 34, 22];
}

/**
 * LCD “ghost” / unlit-segment RGB — hard policy: greyscale only (no hue).
 * Uses Rec.709 luma of the FG ink so ghost weight tracks ink darkness.
 */
function nodeGraphNumberReadoutLcdGhostRgb(inkRgb) {
  const r = Number(inkRgb?.[0]) || 0;
  const g = Number(inkRgb?.[1]) || 0;
  const b = Number(inkRgb?.[2]) || 0;
  const y = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
  return [y, y, y];
}

/**
 * LCD background plate RGB from the Background color widget.
 */
function nodeGraphNumberReadoutLcdBgRgb(settings) {
  const hex = settings?.background
    || (typeof nodeGraphValueLcdSettingsDefaults !== "undefined"
      ? nodeGraphValueLcdSettingsDefaults.background
      : "#b0b5a6");
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [176, 181, 166];
}

/**
 * Hermite smoothstep 0…1 → 0…1 (S-curve). Used to map hardness → blur
 * so soft mid-range stays usable and hardness 1 collapses to a hard rim.
 */
function nodeGraphNumberReadoutSmoothstep01(t) {
  const x = clampNodeSliderValue(Number(t) || 0, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Value LCD inset glass shadow — true Gaussian falloff (canvas filter blur),
 * not box/linear edge ramps. Drawn last so digits read as “behind the screen.”
 *
 * @param {number} distance01  0…1 reach / depth of the inset band
 * @param {number} sharpness01 0 = soft translucent Gaussian, 1 = hard full-black rim
 * @param {number} offsetX01   −1…1 CSS-like inset offset X (positive → darker left)
 * @param {number} offsetY01   −1…1 CSS-like inset offset Y (positive → darker top)
 */
function nodeGraphNumberReadoutDrawLcdInnerShadow(
  context,
  left,
  top,
  width,
  height,
  distance01,
  sharpness01,
  offsetX01 = 0,
  offsetY01 = 0,
) {
  if (!context || !(width > 2) || !(height > 2)) {
    return;
  }
  const dist = clampNodeSliderValue(Number(distance01) || 0, 0, 1);
  if (dist <= 0.001) {
    return;
  }
  const sharp = clampNodeSliderValue(Number(sharpness01) || 0, 0, 1);
  const ox01 = clampNodeSliderValue(Number(offsetX01) || 0, -1, 1);
  const oy01 = clampNodeSliderValue(Number(offsetY01) || 0, -1, 1);
  const minSide = Math.min(width, height);
  // Reach of the shadow band from the rim (px) — also scales max offset.
  const reach = Math.max(1, dist * minSide * 0.42);
  // Hardness 0 → softFrac 1 (widest blur); hardness 1 → softFrac 0 (hard edge).
  // smoothstep then square so the soft end stays smooth and the hard end
  // actually reaches zero blur (old code floored soft≥0.06 / blur≥0.75px).
  const hardEase = nodeGraphNumberReadoutSmoothstep01(sharp);
  const softFrac = (1 - hardEase) * (1 - hardEase);
  const maxBlurPx = reach * 1.35;
  const blurPx = maxBlurPx * softFrac;
  // Shadow-like opacity: soft = translucent veil; hard → solid black (α=1).
  // softBase grows a little with distance so deep soft shadows still read.
  const softBase = Math.min(0.55, 0.18 + dist * 0.28);
  const alpha = softBase + (1 - softBase) * hardEase;
  // Offset: move the punched “light” hole so shadow piles on the opposite side.
  const maxOff = reach * 0.9;
  const offX = ox01 * maxOff;
  const offY = oy01 * maxOff;

  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  // Padding so the blurred mask does not clip its soft edge.
  const pad = Math.ceil(Math.max(blurPx * 2, 2) + Math.max(Math.abs(offX), Math.abs(offY)) + 2);
  const ow = w + pad * 2;
  const oh = h + pad * 2;

  // Pool offscreen mask on the host canvas (face size changes under zoom).
  const host = context.canvas;
  let off = host && host._nodeGraphLcdShadowCanvas;
  if (!off || off.width < ow || off.height < oh) {
    off = document.createElement("canvas");
    off.width = ow;
    off.height = oh;
    if (host) {
      host._nodeGraphLcdShadowCanvas = off;
    }
  }
  const octx = off.getContext("2d");
  if (!octx) {
    return;
  }
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = "source-over";
  octx.globalAlpha = 1;
  octx.filter = "none";
  octx.clearRect(0, 0, off.width, off.height);

  // Hard mask: solid black frame with an offset hole = unshadowed interior.
  // Blurring this mask yields a Gaussian soft inset (not linear box ramps).
  octx.fillStyle = "#000000";
  octx.fillRect(0, 0, ow, oh);
  octx.globalCompositeOperation = "destination-out";
  octx.fillRect(pad + offX, pad + offY, w, h);
  octx.globalCompositeOperation = "source-over";

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  // Keep blur bleed inside the plate.
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  // Hardness 1: draw the hard mask with no blur (true sharp rim).
  if (blurPx > 0.35) {
    context.filter = `blur(${blurPx.toFixed(2)}px)`;
  } else {
    context.filter = "none";
  }
  context.drawImage(off, 0, 0, ow, oh, left - pad, top - pad, ow, oh);
  context.filter = "none";
  context.globalAlpha = 1;
  context.restore();
}

/**
 * Live digit light color: Hue (from settings.color) × Bright ramp.
 *   Bright 0   → mid grey (never black)
 *   Bright 0.5 → full pure hue (s=100, l=50)
 *   Bright 1   → white
 * Residual gradient is separate; blend mode composites light over ghost.
 */
function nodeGraphNumberReadoutLightRgb(settings) {
  const hex = settings?.color
    || nodeGraphNumberReadoutSettingsDefaults?.color
    || "#fcfdbf";
  const bright = Number.isFinite(Number(settings?.brightness))
    ? clampNodeSliderValue(Number(settings.brightness), 0, 1)
    : 1;
  // Extract hue from stored pure-hue (or legacy) hex.
  let h = 50;
  if (typeof nodeGraphTraceDisplayHexToHsl === "function") {
    h = Number(nodeGraphTraceDisplayHexToHsl(hex).h) || 0;
  } else {
    const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (m) {
      const n = Number.parseInt(m[1], 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max !== min) {
        const d = max - min;
        let hh = 0;
        if (max === r) hh = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) hh = (b - r) / d + 2;
        else hh = (r - g) / d + 4;
        h = Math.round((hh / 6) * 360) % 360;
      }
    }
  }
  // Pure hue RGB at s=100%, l=50%.
  const pure = (() => {
    const s = 1;
    const l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  })();
  const grey = [128, 128, 128];
  const white = [255, 255, 255];
  const mix = (a, b, t) => {
    const u = clampNodeSliderValue(t, 0, 1);
    return [
      Math.round(a[0] + (b[0] - a[0]) * u),
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
    ];
  };
  if (bright <= 0.5) {
    return mix(grey, pure, bright * 2);
  }
  return mix(pure, white, (bright - 0.5) * 2);
}

/**
 * Energy → gradient color (present-time sample).
 * energy is the brightness amount itself (0…1 stop): 0.2 energy → color at t=0.2.
 * Never bake color into the burn plate.
 */
function nodeGraphNumberReadoutGhostRgbFromEnergy(energy, gradientStops, peakHex) {
  const e = clampNodeSliderValue(Number(energy) || 0, 0, 1);
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    const rgb = nodeGraphSampleGradientStopsRgb(gradientStops, e, peakHex || "#fcfdbf");
    if (Array.isArray(rgb) && rgb.length >= 3) {
      return rgb;
    }
  }
  return [252, 253, 191];
}

/**
 * Colorize a white energy burn plate with gradient RGB (alpha from plate).
 * Plate is the alpha mask; solid gradient color is applied at present time.
 * Pattern: draw mask → source-in solid color.
 */
function nodeGraphNumberReadoutPresentBurnPlate(
  destCtx,
  burnPlate,
  rgb,
  alpha = 1,
) {
  if (!destCtx || !burnPlate?.width || !burnPlate?.height) {
    return;
  }
  const a = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  if (a <= 0.001) {
    return;
  }
  const r = Math.max(0, Math.min(255, Math.round(Number(rgb?.[0]) || 0)));
  const g = Math.max(0, Math.min(255, Math.round(Number(rgb?.[1]) || 0)));
  const b = Math.max(0, Math.min(255, Math.round(Number(rgb?.[2]) || 0)));
  let tint = destCtx.canvas?._numberReadoutBurnTint;
  if (!tint) {
    tint = document.createElement("canvas");
    if (destCtx.canvas) {
      destCtx.canvas._numberReadoutBurnTint = tint;
    }
  }
  if (tint.width !== burnPlate.width || tint.height !== burnPlate.height) {
    tint.width = burnPlate.width;
    tint.height = burnPlate.height;
  }
  const tctx = tint.getContext("2d");
  if (!tctx) {
    return;
  }
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, tint.width, tint.height);
  tctx.globalCompositeOperation = "source-over";
  tctx.globalAlpha = 1;
  tctx.drawImage(burnPlate, 0, 0);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  tctx.fillRect(0, 0, tint.width, tint.height);
  tctx.globalCompositeOperation = "source-over";
  destCtx.save();
  destCtx.globalAlpha = a;
  destCtx.drawImage(tint, 0, 0);
  destCtx.restore();
}


function paintNodeGraphNumberReadoutColdBoot(canvas, screenElement, node = null) {
  if (!canvas || !screenElement) {
    return false;
  }
  // Never cold-boot while simulation is frozen (speed 0 / visual pause) —
  // that wiped Pitch Detector / Value LED residual on deselect + no-buffer.
  if (typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen()) {
    return false;
  }
  // Drop residual energy + force next live draw to repaint fully.
  invalidateNodeGraphNumberReadoutPaintCache(canvas);
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  const isLcd = typeof nodeGraphNumberReadoutFaceStyleForNode === "function"
    && nodeGraphNumberReadoutFaceStyleForNode(node) === "lcd";
  if (!syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio, {
    screenSharp: isLcd,
  })) {
    return false;
  }
  const context = canvas.getContext("2d");
  if (!context || !(canvas.width > 0) || !(canvas.height > 0)) {
    return false;
  }
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const bg = nodeGraphFacePlateBackground(settings);
  if (isLcd) {
    nodeGraphNumberReadoutApplyLcdLightCutout(screenElement, canvas);
  } else if (screenElement.dataset) {
    // LED: full hole when the plate is present (0…1 dimmer is the only gain).
    screenElement.dataset.lightStrength = "1";
  }
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const width = canvas.width;
  const height = canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);
  // No unlit 88.88 grid — idle face is empty plate only.
  // Keep cache dirty (invalidate already did) so live samples always redraw.
  canvas._nodeGraphNumberReadoutText = null;
  return true;
}


function wipeNodeGraphNumberReadoutScreensToColdBoot() {
  if (typeof document === "undefined") {
    return;
  }
  for (const face of document.querySelectorAll(
    ".node-number-readout-face, .dsp-node.number-readout-layout .node-module-scope-window, .dsp-node.value-lcd-layout .node-module-scope-window",
  )) {
    let canvas = face.querySelector?.(":scope > .node-number-readout-canvas")
      || face.querySelector?.(".node-number-readout-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "node-number-readout-canvas";
      canvas.setAttribute("aria-hidden", "true");
      face.appendChild(canvas);
    }
    const nodeId = face.dataset?.node || face.closest?.(".dsp-node")?.dataset?.node || "";
    const node = nodeId && typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(nodeId)
      : null;
    paintNodeGraphNumberReadoutColdBoot(canvas, face, node);
  }
}


/**
 * Sync number-readout face canvas size.
 * @param {{ screenSharp?: boolean }} [options]
 *   screenSharp (Value LCD): buffer matches on-screen pixels so workspace
 *   zoom stays sharp (cheap vector text — not a phosphor energy FBO).
 *   Default false keeps layout×dpr fixed grid (Value LED residual path).
 */
function syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio, options = {}) {
  if (!canvas || !screenElement) {
    return false;
  }
  const screenSharp = Boolean(options?.screenSharp);
  let width;
  let height;
  if (screenSharp) {
    // On-screen size × devicePixelRatio — grows with workspace zoom so
    // DSEG stays sharp (same idea as 0D redraw, face-local text).
    const rect = typeof screenElement.getBoundingClientRect === "function"
      ? screenElement.getBoundingClientRect()
      : { width: 0, height: 0 };
    const dpr = Math.max(
      1,
      Number(window.devicePixelRatio)
        || Number(pixelRatio)
        || 1,
    );
    let w = Math.max(1, Math.round((Number(rect.width) || 1) * dpr));
    let h = Math.max(1, Math.round((Number(rect.height) || 1) * dpr));
    const maxDim = 4096;
    if (w > maxDim || h > maxDim) {
      const s = maxDim / Math.max(w, h);
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    width = w;
    height = h;
    canvas.classList.add("node-number-readout-canvas-vector");
    canvas.style.imageRendering = "auto";
  } else {
    // Fixed layout×dpr grid for Value LED residual (no zoom balloon on energy).
    const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
    if (!size) {
      return false;
    }
    width = size.width;
    height = size.height;
    // Transient 0×0 / 1×1 layout (reflow, zoom frame) must not shrink the
    // residual buffer — keep the last good size so Ghost/Trail ink survives.
    if (
      (width < 2 || height < 2)
      && canvas.width >= 2
      && canvas.height >= 2
    ) {
      width = canvas.width;
      height = canvas.height;
    } else if (canvas.width >= 2 && canvas.height >= 2) {
      // 1px hysteresis: subpixel clientWidth round-trips were wiping residual.
      const dw = Math.abs(width - canvas.width);
      const dh = Math.abs(height - canvas.height);
      if (dw <= 1 && dh <= 1) {
        width = canvas.width;
        height = canvas.height;
      }
    }
    canvas.classList.remove("node-number-readout-canvas-vector");
    canvas.style.imageRendering = "";
  }
  if (canvas.width !== width || canvas.height !== height) {
    // Resizing the host canvas clears its pixels (browser). Burn plate is
    // preserved separately in EnsureBurnPlate — do not clear residual here.
    canvas.width = width;
    canvas.height = height;
    canvas._numberReadoutEnergyMask = null;
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}


function nodeGraphNumberReadoutEnergyMaskCanvas(canvas) {
  return nodeGraphPhosphorEnergyEnsureCanvas(
    canvas,
    "_numberReadoutEnergyMask",
    canvas?.width || 0,
    canvas?.height || 0,
  );
}


function nodeGraphNumberReadoutEnergyGl(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return null;
  }
  if (typeof nodeGraphPhosphorEnergyGlEnsure !== "function") {
    return null;
  }
  return nodeGraphPhosphorEnergyGlEnsure(canvas, canvas.width, canvas.height, "_phosphorEnergyGl");
}


function nodeGraphNumberReadoutSafeDecimals(decimals) {
  // toFixed(NaN) throws RangeError and can take down the rAF draw loop.
  const n = Math.round(Number(decimals));
  if (!Number.isFinite(n)) {
    return 2;
  }
  return Math.max(0, Math.min(8, n));
}


/**
 * Format a sample for Value LED / Value LCD digits.
 * @param {number} sample
 * @param {number} decimals display places (Decimal budget)
 * @param {{ guardExtraPlace?: boolean }} [options]
 *   guardExtraPlace (LCD): round with one offscreen place (decimals+1) first so
 *   the displayed value (and sign) is not wildly flipped by sub-display noise.
 *   Also collapses signed zero ("-0.00") to unsigned zero after that round.
 */
function nodeGraphNumberReadoutFormatValue(sample, decimals, options = null) {
  const value = Number(sample);
  if (!Number.isFinite(value)) {
    return "--";
  }
  const places = nodeGraphNumberReadoutSafeDecimals(decimals);
  // LCD: one extra place of rounding before the visible budget (offscreen).
  const guardExtra = Boolean(options && options.guardExtraPlace);
  const guardPlaces = guardExtra
    ? Math.min(8, places + 1)
    : places;
  let valueForFormat = value;
  if (guardPlaces > places) {
    const scale = 10 ** guardPlaces;
    // Math.round keeps sign of half-away-from-zero; fine for display settle.
    valueForFormat = Math.round(value * scale) / scale;
  }
  let fixed;
  try {
    fixed = valueForFormat.toFixed(places);
  } catch {
    fixed = valueForFormat.toFixed(2);
  }
  // After guard + toFixed, tiny negatives can still print as "-0.00".
  // Treat exact display-zero as unsigned so the sign column stays calm.
  if (fixed.startsWith("-") && Number(fixed) === 0) {
    fixed = (0).toFixed(places);
  }
  // Reserve a sign column so width stays stable across zero (DSEG space =
  // colon advance — keshikan/DSEG usage notes).
  return fixed.startsWith("-") ? fixed : ` ${fixed}`;
}


function nodeGraphNumberReadoutDsegWidthChars(text) {
  return Math.max(1, String(text || "").replace(/\./g, "").length);
}

/**
 * Fixed DSEG fit template when Decimal budget is on.
 * Font size stays locked to this slot count (face/padding/decimals only) —
 * live value is still drawn and centered with that cell size.
 * (DSEG period is zero-width; "8"/"!" measure full cells.)
 *
 * @param {number} decimals
 * @param {number} integerSlots integer digit columns (pitch Hz uses 5)
 */
function nodeGraphNumberReadoutBudgetFitText(decimals, integerSlots = 6) {
  const d = nodeGraphNumberReadoutSafeDecimals(decimals);
  const ints = Math.max(1, Math.min(12, Math.round(Number(integerSlots) || 6)));
  const frac = d > 0 ? `.${"!".repeat(d)}` : "";
  return ` ${"8".repeat(ints)}${frac}`;
}

/**
 * Face padding 0…1 from settings (finite-safe; 0 is valid).
 * Prefer facePadding; accept legacy readout/digit padding aliases.
 */
function nodeGraphNumberReadoutFacePadding01(settings = null) {
  const raw = settings == null
    ? NaN
    : Number(
      settings.facePadding
      ?? settings.readoutPadding
      ?? settings.digitPadding
      ?? settings.padding,
    );
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return clampNodeSliderValue(raw, 0, 1);
}

/**
 * Width-fit string for layout.
 * UI GROW maps to !decimalBudget (see form I/O):
 * - GROW on  (decimalBudget false) → live valueText (resize as digits change)
 * - GROW off (decimalBudget true)  → fixed Decimals-width template (stable size)
 *
 * Never bypass budget when GROW is off — even at facePadding 0 (old pad≈0
 * shortcut always returned live text and ignored GROW off).
 */
function nodeGraphNumberReadoutLayoutFitText(slot, valueText, decimals, settings = null) {
  const budgetOn = settings
    ? Boolean(settings.decimalBudget)
    : false;
  // GROW on / no lock: fill plate to the live reading.
  if (!budgetOn) {
    return valueText;
  }
  // GROW off: lock font size to a fixed digit budget (sign + integer + decimals).
  // Pitch: 4 integer slots (up to 9999 Hz). Other readouts: 6.
  const integerSlots = slot?.type === "helmholtzPitch" ? 4 : 6;
  return nodeGraphNumberReadoutBudgetFitText(decimals, integerSlots);
}


function nodeGraphNumberReadoutGhostPlateText(valueText) {
  return String(valueText || "").replace(/[0-9!]/g, "8");
}


function nodeGraphNumberReadoutUnitForSlot(slot) {
  // Pitch Detector: "Hz" is a fixed DOM decoration on the Fid row (not LCD unit band).
  if (slot?.type === "helmholtzPitch") {
    return "";
  }
  const connection = nodeGraphModuleScopeConnectionsTo(slot?.nodeId, "In")
    .find((candidate) => candidate?.sourceNode && candidate?.sourcePort);
  if (!connection) {
    return "";
  }
  // Standalone Value LED/LCD reading Pitch Frequency may still show Hz under digits.
  const sourceNode = nodeGraphPatchNode(connection.sourceNode);
  return sourceNode?.type === "helmholtzPitch" && connection.sourcePort === "Frequency"
    ? "Hz"
    : "";
}


function nodeGraphNumberReadoutSettingsSignature(settings) {
  const stopsSig = Array.isArray(settings.gradientStops)
    ? settings.gradientStops.map((s) => `${s.t}:${s.color}`).join(",")
    : "";
  return [
    settings.faceStyle || "led",
    settings.background,
    settings.brightness,
    settings.ghost ?? settings.ghostBrightness,
    settings.color,
    settings.trail ?? settings.residual,
    settings.burn,
    settings.burnAmount,
    settings.decimals,
    settings.decimalBudget ? 1 : 0,
    settings.lightBlend,
    settings.facePadding,
    settings.unlitSegments,
    settings.innerShadowDistance,
    settings.innerShadowSharpness,
    settings.innerShadowOffsetX,
    settings.innerShadowOffsetY,
    stopsSig,
  ].join("|");
}


/** Workspace zoom used by Value LED/LCD pin sizing (1.00 = identity). */
function nodeGraphNumberReadoutWorkspaceZoom() {
  return Math.max(
    0.01,
    Number(
      typeof nodeGraphZoom === "function"
        ? nodeGraphZoom()
        : (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp && nodeGraphMvp.zoom),
    ) || 1,
  );
}

/**
 * Single “display pixel” size in face/canvas units when padding = 1.
 * LCD (screen-sharp buffer, 1 canvas px ≈ 1 device px):
 *   size = round(zoom) → 1 monitor pixel at zoom 1.00; scales with zoom.
 * LED (layout×dpr buffer, CSS-scaled under zoom):
 *   ~1 CSS px of phosphor at zoom 1 (round dpr canvas px).
 */
function nodeGraphNumberReadoutPinSizePx(faceStyle, pixelRatio, zoom = 1) {
  const style = String(faceStyle || "led").toLowerCase();
  const z = Math.max(0.01, Number(zoom) || 1);
  if (style === "lcd") {
    // Hard square on the device pixel grid; grows with workspace zoom.
    return Math.max(1, Math.round(z));
  }
  const dpr = Math.max(1, Number(pixelRatio) || 1);
  return Math.max(1, Math.round(dpr));
}

/**
 * @param {boolean|object} [hasUnitOrOpts] true, or
 *   { hasUnit, largeUnit, padding01, faceStyle, pixelRatio, zoom, fitText }
 *   largeUnit: taller unit band (legacy unit strip).
 *   fitText: optional fixed template for width fit (e.g. pitch: sign+5+decimals).
 *     When set, font size does not change with the live value digit count —
 *     actual valueText is still centered with that fixed cell size.
 *   monoProbe: when true, cell width is measured from "M" (true monospace pitch names).
 *   padding01: linear 0…1 vs face square min side.
 *     0 = flush (digits fill the plate content box);
 *     1 = one pin pixel of display remains (zoom-scaled; LED vs LCD pin size).
 */
function nodeGraphNumberReadoutComputeLayout(context, valueText, fontFamily, faceW, faceH, hasUnitOrOpts) {
  const opts = hasUnitOrOpts && typeof hasUnitOrOpts === "object"
    ? hasUnitOrOpts
    : { hasUnit: Boolean(hasUnitOrOpts) };
  const hasUnit = Boolean(opts.hasUnit);
  const largeUnit = Boolean(opts.largeUnit);
  const monoProbe = Boolean(opts.monoProbe);
  const padRaw = Number(opts.padding01);
  const pad01 = Number.isFinite(padRaw)
    ? clampNodeSliderValue(padRaw, 0, 1)
    : 0;
  const fitText = opts.fitText != null ? String(opts.fitText) : String(valueText || "");
  // Pitch note names: always measure cells from a full mono advance (not DSEG "8").
  const cellProbeGlyph = monoProbe ? "M" : "8";
  const minSide = Math.max(0, Math.min(faceW, faceH));
  const pin = Math.min(
    minSide,
    nodeGraphNumberReadoutPinSizePx(opts.faceStyle, opts.pixelRatio, opts.zoom),
  );
  // Linear pad 0…1: inset each axis by pad01 × half of that axis (minus pin floor).
  // (Previously both axes used min-side only — wide LCD faces barely moved horizontally.)
  const maxPadX = Math.max(0, (faceW - pin) * 0.5);
  const maxPadY = Math.max(0, (faceH - pin) * 0.5);
  const padPx = pad01 * maxPadX;
  const padPxY = pad01 * maxPadY;
  const contentW = Math.max(pin, faceW - padPx * 2);
  const contentH = Math.max(pin, faceH - padPxY * 2);
  // Near-max padding: single pin pixel mode (no DSEG fit).
  const pixelPin = pad01 >= 0.999
    || (contentW <= pin * 1.01 && contentH <= pin * 1.01);
  if (pixelPin) {
    const side = Math.max(1, pin);
    return {
      cellW: side,
      cells: 1,
      contentH: side,
      contentW: side,
      digitAreaH: side,
      fontSize: 0,
      labelH: 0,
      largeUnit,
      padPx: Math.max(0, (faceW - side) * 0.5),
      padPxY: Math.max(0, (faceH - side) * 0.5),
      pinPx: side,
      pixelPin: true,
      totalW: side,
    };
  }
  // Default unit strip ~18% of content; Pitch Hz needs more room to read.
  const labelH = hasUnit ? Math.max(0, contentH * (largeUnit ? 0.30 : 0.18)) : 0;
  const digitAreaH = Math.max(0, contentH - labelH);
  // facePadding owns the air — digits must fill the content box at pad 0.
  // DSEG Classic Bold ink is ~80–86% of the em square; browsers often report
  // actualBoundingBox ≈ full em (including empty), which would leave a ring of
  // plate around the segments. Oversize the em so ink reaches the content edge,
  // then shrink only if measured ink still overflows.
  // At pad 0 push harder so Pitch/LED plates don't look letterboxed.
  const DSEG_INK_OF_EM = pad01 <= 0.001 ? 0.72 : 0.82;
  const fitCells = nodeGraphNumberReadoutDsegWidthChars(fitText);
  const cells = nodeGraphNumberReadoutDsegWidthChars(valueText);
  if (!(contentW > 0.25) || !(digitAreaH > 0.25) || fitCells < 1) {
    // Fall through to pin rather than blank.
    const side = Math.max(1, pin);
    return {
      cellW: side,
      cells: 1,
      contentH: side,
      contentW: side,
      digitAreaH: side,
      fontSize: 0,
      labelH: 0,
      largeUnit,
      padPx: Math.max(0, (faceW - side) * 0.5),
      padPxY: Math.max(0, (faceH - side) * 0.5),
      pinPx: side,
      pixelPin: true,
      totalW: side,
    };
  }

  // Contain-fit: max font that fits BOTH height and width of the fit string.
  // (Height-first then width-shrink left tall empty air when width capped hard —
  // e.g. Pitch decimal-budget 5-slot lock on a tall face.)
  const REF = 100;
  context.font = `700 ${REF}px ${fontFamily}`;
  const probe0 = context.measureText(cellProbeGlyph);
  const ascent0 = Number(probe0.actualBoundingBoxAscent);
  const descent0 = Number(probe0.actualBoundingBoxDescent);
  const glyphH0 = Number.isFinite(ascent0) && Number.isFinite(descent0) && (ascent0 + descent0) > 0.25
    ? (ascent0 + descent0)
    : REF * DSEG_INK_OF_EM;
  const cellW0 = Math.max(0.01, Number(probe0.width) || REF * 0.55);
  // Prefer ink-of-em when browser reports a loose em box (common for DSEG).
  const inkH0 = Math.min(glyphH0, REF * DSEG_INK_OF_EM);
  const fontFromH = digitAreaH / Math.max(1e-6, inkH0 / REF);
  const fontFromW = contentW / Math.max(1e-6, (fitCells * cellW0) / REF);
  let fontSize = Math.max(0, Math.min(fontFromH, fontFromW));
  if (!(fontSize > 0.25)) {
    const side = Math.max(1, pin);
    return {
      cellW: side,
      cells: 1,
      contentH: side,
      contentW: side,
      digitAreaH: side,
      fontSize: 0,
      labelH: 0,
      largeUnit,
      padPx: Math.max(0, (faceW - side) * 0.5),
      padPxY: Math.max(0, (faceH - side) * 0.5),
      pinPx: side,
      pixelPin: true,
      totalW: side,
    };
  }
  context.font = `700 ${fontSize}px ${fontFamily}`;
  const probe = context.measureText(cellProbeGlyph);
  const ascent = Number(probe.actualBoundingBoxAscent);
  const descent = Number(probe.actualBoundingBoxDescent);
  const glyphH = Number.isFinite(ascent) && Number.isFinite(descent) && (ascent + descent) > 0.25
    ? (ascent + descent)
    : 0;
  // Only shrink when ink truly overflows the content box (never re-introduce pad).
  if (glyphH > digitAreaH + 0.5) {
    fontSize = Math.max(0, fontSize * (digitAreaH / glyphH));
    context.font = `700 ${fontSize}px ${fontFamily}`;
  }
  let cellW = Math.max(0, context.measureText(cellProbeGlyph).width);
  let fitW = fitCells * cellW;
  const maxW = contentW;
  if (fitW > maxW + 0.5 && fitW > 0) {
    const scale = maxW / fitW;
    fontSize = Math.max(0, fontSize * scale);
    if (fontSize > 0.25) {
      context.font = `700 ${fontSize}px ${fontFamily}`;
      cellW = Math.max(0, context.measureText(cellProbeGlyph).width);
      fitW = fitCells * cellW;
    } else {
      const side = Math.max(1, pin);
      return {
        cellW: side,
        cells: 1,
        contentH: side,
        contentW: side,
        digitAreaH: side,
        fontSize: 0,
        labelH: 0,
        largeUnit,
        padPx: Math.max(0, (faceW - side) * 0.5),
        padPxY: Math.max(0, (faceH - side) * 0.5),
        pinPx: side,
        pixelPin: true,
        totalW: side,
      };
    }
  }
  const totalW = cells * cellW;
  return {
    cellW,
    cells,
    contentH,
    contentW,
    digitAreaH,
    fontSize,
    labelH,
    largeUnit,
    padPx,
    padPxY,
    pinPx: pin,
    pixelPin: false,
    totalW,
  };
}

/**
 * Draw the max-padding “one pixel of display” pin (LED light or LCD ink).
 * Integer canvas rect → hard edge on the monitor pixel grid (scales with pinPx).
 */
function nodeGraphNumberReadoutDrawPixelPin(context, layout, faceLeft, faceTop, faceW, faceH, rgb, alpha = 1) {
  if (!context || !layout?.pixelPin) {
    return;
  }
  const side = Math.max(1, Number(layout.pinPx) || 1);
  const x = faceLeft + Math.max(0, (faceW - side) * 0.5);
  const y = faceTop + Math.max(0, (faceH - side) * 0.5);
  const a = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  const r = Number(rgb?.[0]) || 0;
  const g = Number(rgb?.[1]) || 0;
  const b = Number(rgb?.[2]) || 0;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = a;
  context.imageSmoothingEnabled = false;
  // Snap to integer canvas pixels so the pin is a crisp device-pixel square.
  const ix = Math.round(x);
  const iy = Math.round(y);
  const is = Math.max(1, Math.round(side));
  context.fillStyle = `rgb(${r}, ${g}, ${b})`;
  context.fillRect(ix, iy, is, is);
  context.restore();
}

/** Unit label font size for the number plate (boosted for Pitch Detector Hz). */
function nodeGraphNumberReadoutUnitFontSize(labelHeight, width, digitFontSize, largeUnit = false) {
  if (largeUnit) {
    return Math.max(
      1,
      Math.min(labelHeight * 0.88, width * 0.32, digitFontSize * 0.72),
    );
  }
  return Math.max(1, Math.min(labelHeight * 0.7, width * 0.14, digitFontSize * 0.35));
}


function nodeGraphNumberReadoutGhostDepositText(previousText, currentText) {
  const prev = String(previousText || "");
  const curr = String(currentText || "");
  if (!prev) {
    return "";
  }
  if (!curr) {
    return prev;
  }
  const prevCells = nodeGraphNumberReadoutDsegWidthChars(prev);
  const currCells = nodeGraphNumberReadoutDsegWidthChars(curr);
  if (prevCells !== currCells) {
    // Width/layout changed — whole previous reading is the ghost.
    return prev;
  }
  // Walk both strings; periods are zero-width and stay only when they left.
  let i = 0;
  let j = 0;
  let out = "";
  let deposited = false;
  while (i < prev.length || j < curr.length) {
    const pc = i < prev.length ? prev[i] : "";
    const cc = j < curr.length ? curr[j] : "";
    if (pc === "." && cc === ".") {
      // Period still present — no deposit, no alignment token needed (zero advance).
      i += 1;
      j += 1;
      continue;
    }
    if (pc === ".") {
      // Period left this frame.
      out += ".";
      deposited = true;
      i += 1;
      continue;
    }
    if (cc === ".") {
      // Period appeared — skip on ghost string (no previous ink there).
      j += 1;
      continue;
    }
    if (!pc) {
      break;
    }
    if (!cc) {
      out += pc;
      deposited = true;
      i += 1;
      continue;
    }
    if (pc === cc) {
      // Unchanged cell: keep spacing, draw nothing.
      out += pc === " " ? " " : "!";
    } else {
      out += pc;
      deposited = true;
    }
    i += 1;
    j += 1;
  }
  return deposited ? out : "";
}


function nodeGraphNumberReadoutDrawDigits(context, {
  text,
  centerX,
  centerY,
  fontFamily,
  fontSize,
  cellW: cellWIn,
  rgb,
  alpha,
  glow = 0,
  softBlurPx = 0,
  plate = false,
  // energy: force white ink (luma) for the 0–1 energy buffer
  energy = false,
  // Canvas composite for this draw (source-over default).
  composite = "source-over",
}) {
  const raw = String(text || "");
  const ink = energy ? [255, 255, 255] : rgb;
  context.save();
  // Identity geometry in canvas pixels — never scaleX ≠ scaleY for glyphs.
  context.setTransform(1, 0, 0, 1, 0, 0);
  const op = String(composite || "source-over").trim() || "source-over";
  if (op !== "source-over") {
    context.globalCompositeOperation = op;
  }
  context.font = `700 ${fontSize}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const cellW = Math.max(1, Number(cellWIn) || context.measureText("8").width);
  let cellCount = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== ".") {
      cellCount += 1;
    }
  }
  cellCount = Math.max(1, cellCount);
  let penX = centerX - (cellCount * cellW) * 0.5 + cellW * 0.5;
  const blurPx = Math.max(
    0,
    Number(softBlurPx) || (glow > 0.001 ? fontSize * (0.08 + glow * 0.55) : 0),
  );

  const drawGlyph = (glyph, x) => {
    if (blurPx > 0.001) {
      context.shadowColor = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${(alpha * 0.95).toFixed(4)})`;
      context.shadowBlur = blurPx;
    } else {
      context.shadowBlur = 0;
    }
    context.fillStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${alpha.toFixed(4)})`;
    context.fillText(glyph, x, centerY);
    // Crisp core under soft deposit (still white when energy=true).
    if (blurPx > 0.001 && !energy) {
      context.shadowBlur = 0;
      context.fillStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${Math.min(1, alpha * 1.05).toFixed(4)})`;
      context.fillText(glyph, x, centerY);
    } else if (blurPx > 0.001 && energy) {
      // Soft energy: second lighter core without killing the soft edge.
      context.shadowBlur = blurPx * 0.35;
      context.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha).toFixed(4)})`;
      context.fillText(glyph, x, centerY);
    }
  };

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === ".") {
      // Zero advance — sit at the boundary between the previous and next cell.
      drawGlyph(".", penX - cellW * 0.5);
      continue;
    }
    let glyph = ch;
    if (plate) {
      // Unlit LCD grid: every full cell is all-on "8".
      glyph = "8";
    } else if (ch === " ") {
      // Lit path: leave sign column empty (still advance a full cell).
      penX += cellW;
      continue;
    } else if (ch === "!") {
      // All-off placeholder cell — skip draw, keep spacing.
      penX += cellW;
      continue;
    }
    drawGlyph(glyph, penX);
    penX += cellW;
  }
  context.restore();
}


function nodeGraphNumberReadoutDrawInnerShadow(context, left, top, width, height, amount) {
  if (!(amount > 0.001) || width < 2 || height < 2) {
    return;
  }
  const depth = Math.max(2, Math.min(width, height) * (0.06 + amount * 0.18));
  const edge = Math.max(0.12, Math.min(0.85, amount * 0.72));
  context.save();
  // Top + left (darker lip), bottom + right (softer).
  let grad = context.createLinearGradient(left, top, left, top + depth);
  grad.addColorStop(0, `rgba(0, 0, 0, ${edge.toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top, width, depth);

  grad = context.createLinearGradient(left, top, left + depth, top);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.9).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top, depth, height);

  grad = context.createLinearGradient(left, top + height, left, top + height - depth);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.55).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left, top + height - depth, width, depth);

  grad = context.createLinearGradient(left + width, top, left + width - depth, top);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(edge * 0.5).toFixed(4)})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = grad;
  context.fillRect(left + width - depth, top, depth, height);
  context.restore();
}


/**
 * Value LCD — vector DSEG (no phosphor residual hang).
 * Background + multiply unlit “8”s + solid FG digits + glass inner shadow.
 */
function drawNodeGraphValueLcdFace(canvas, context, screenElement, settings, valueText, unit, slot = null) {
  if (!canvas || !context) {
    return;
  }
  const now = performance.now?.() || Date.now();
  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(settings)
    : (settings?.background || "#b0b5a6");
  if (typeof nodeGraphFacePlateApplyCss === "function" && screenElement) {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.valueFaceStyle = "lcd";
  }
  // Reflective LCD: less-dim room punch (2/3), not full phosphor hole / not 0.
  nodeGraphNumberReadoutApplyLcdLightCutout(
    screenElement || canvas?.parentElement,
    canvas,
  );
  const inkRgb = nodeGraphNumberReadoutLcdInkRgb(settings);
  // App-wide LCD policy: ghost/unlit segments are greyscale only (no hue).
  const ghostRgb = nodeGraphNumberReadoutLcdGhostRgb(inkRgb);
  const hasUnit = Boolean(unit);
  // Pitch Detector “Hz” (and any unit labeled Hz) gets a larger unit band.
  const largeUnit = hasUnit && String(unit).trim().toLowerCase() === "hz";
  const pad01 = nodeGraphNumberReadoutFacePadding01(settings);
  // Note names (C3 / C#3) need letter glyphs — DSEG digits only for Hz / MIDI #.
  const useNameFont = /[A-Ga-g#♭]/.test(String(valueText || ""));
  const digitFontFamily = useNameFont
    ? '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace'
    : (nodeGraphNumberReadoutDsegReady
      ? '"DSEG7 Classic", "Consolas", monospace'
      : '"Consolas", "Courier New", monospace');
  const lcdPixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  const lcdZoom = nodeGraphNumberReadoutWorkspaceZoom();
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings?.decimals);
  const lcdFitText = nodeGraphNumberReadoutLayoutFitText(slot, valueText, decimals, settings);
  const layout = nodeGraphNumberReadoutComputeLayout(
    context,
    valueText,
    digitFontFamily,
    width,
    height,
    {
      hasUnit,
      largeUnit,
      padding01: pad01,
      faceStyle: "lcd",
      pixelRatio: lcdPixelRatio,
      zoom: lcdZoom,
      fitText: lcdFitText,
    },
  );
  const digitFontSize = layout.fontSize;
  const cellW = layout.cellW;
  const labelHeight = layout.labelH;
  const digitAreaHeight = layout.digitAreaH;
  const padPx = layout.padPx || 0;
  const padPxY = layout.padPxY != null ? layout.padPxY : padPx;
  const digitX = left + padPx + layout.contentW * 0.5;
  const digitY = top + padPxY + digitAreaHeight * 0.5;
  const unlitAmount = clampNodeSliderValue(Number(settings?.unlitSegments) || 0, 0, 1);
  // Ghost plate alpha: continuous from 0 (no 0.12 pedestal — that made the
  // first slider tick a hard on/off pop). pow < 1 = more sensitivity near 0
  // so ~0.06 is a faint wash that eases in, not a binary flash.
  const ghostPlateAlpha = unlitAmount <= 0
    ? 0
    : Math.min(0.92, Math.pow(unlitAmount, 0.58));
  const shadowDist = clampNodeSliderValue(Number(settings?.innerShadowDistance) || 0, 0, 1);
  const shadowSharp = clampNodeSliderValue(Number(settings?.innerShadowSharpness) || 0, 0, 1);
  const shadowOffX = clampNodeSliderValue(Number(settings?.innerShadowOffsetX) || 0, -1, 1);
  const shadowOffY = clampNodeSliderValue(Number(settings?.innerShadowOffsetY) || 0, -1, 1);
  const text = unit ? `${valueText} ${unit}` : valueText;

  // Full clear each frame — no residual burn plate.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.save();
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // Max padding: one screen pixel of LCD “on” (no DSEG at pin size).
  if (layout.pixelPin) {
    if (!String(valueText || "").includes("!")) {
      nodeGraphNumberReadoutDrawPixelPin(
        context,
        layout,
        left,
        top,
        width,
        height,
        inkRgb,
        1,
      );
    }
  } else {
    // Permanent “8” skeleton (LCD Ghost): greyscale only — no hue.
    if (digitFontSize > 0.25 && ghostPlateAlpha > 0.0005 && !String(valueText || "").includes("!")) {
      const plateText = typeof nodeGraphNumberReadoutGhostPlateText === "function"
        ? nodeGraphNumberReadoutGhostPlateText(valueText)
        : String(valueText || "").replace(/[0-9!]/g, "8");
      nodeGraphNumberReadoutDrawDigits(context, {
        text: plateText,
        centerX: digitX,
        centerY: digitY,
        fontFamily: digitFontFamily,
        fontSize: digitFontSize,
        cellW,
        rgb: ghostRgb,
        alpha: ghostPlateAlpha,
        softBlurPx: 0,
        glow: 0,
        plate: true,
        // source-over + greyscale alpha fades smoothly; multiply was a hard lip near 0.
        composite: "source-over",
      });
    }

    // Live value — solid foreground ink.
    if (digitFontSize > 0.25 && !String(valueText || "").includes("!")) {
      nodeGraphNumberReadoutDrawDigits(context, {
        text: valueText,
        centerX: digitX,
        centerY: digitY,
        fontFamily: digitFontFamily,
        fontSize: digitFontSize,
        cellW,
        rgb: inkRgb,
        alpha: 1,
        softBlurPx: 0,
        glow: 0,
        plate: false,
        composite: "source-over",
      });
    }

    if (hasUnit && labelHeight > 0.25 && digitFontSize > 0.25) {
      const labelFontSize = nodeGraphNumberReadoutUnitFontSize(
        labelHeight,
        layout.contentW || width,
        digitFontSize,
        largeUnit,
      );
      context.globalCompositeOperation = "source-over";
      context.font = `700 ${labelFontSize}px "Consolas", "Courier New", monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, ${largeUnit ? 0.78 : 0.55})`;
      context.fillText(
        unit,
        left + padPx + layout.contentW * 0.5,
        top + padPxY + digitAreaHeight + labelHeight * 0.5,
      );
    }
  }

  if (shadowDist > 0.001) {
    nodeGraphNumberReadoutDrawLcdInnerShadow(
      context,
      left,
      top,
      width,
      height,
      shadowDist,
      shadowSharp,
      shadowOffX,
      shadowOffY,
    );
  }
  context.restore();

  canvas._numberReadoutLastValueText = valueText;
  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = width;
  canvas._nodeGraphNumberReadoutHeight = height;
  canvas._nodeGraphNumberReadoutZoom = lcdZoom;
  canvas._nodeGraphNumberReadoutPaintAt = now;
  canvas._numberReadoutResidualEnergy = 0;
  nodeGraphNumberReadoutClearBurnPlate(canvas);
}


function drawNodeGraphNumberReadoutItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const slot = item?.slot;
  if (!rect || !slot) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, item.buffer);
  const screenElement = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphNumberReadoutCanvasForSlot(slot);
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const faceStyle = nodeGraphNumberReadoutFaceStyleForSlot(slot, node);
  const isLcd = faceStyle === "lcd";
  // Value LCD: screen-sharp buffer (tracks zoom). Value LED: fixed layout grid.
  if (!canvas || !syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio, {
    screenSharp: isLcd,
  })) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const hasSample = item?.buffer?.length > 0 && !item.buffer?.nodeGraphScopeXy;
  const unit = nodeGraphNumberReadoutUnitForSlot(slot);
  // Honor Display Settings → Decimals (including Pitch Detector Frequency LCD).
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings.decimals);
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  // Pitch Detector: unit toggle Hz → 8ve (MIDI #) → M (note name).
  const pitchFace = slot?.type === "helmholtzPitch"
    ? (screenElement?.closest?.(".node-pitch-detector-face")
      || document.querySelector?.(
        `.node-pitch-detector-face[data-node="${CSS.escape(String(slot.nodeId || ""))}"]`,
      ))
    : null;
  const pitchMode = pitchFace && typeof nodeGraphPitchDetectorFaceMode === "function"
    ? nodeGraphPitchDetectorFaceMode(pitchFace)
    : "hz";
  // Live format (may be empty/placeholder when paused, bypassed, or capture re-armed).
  // https://github.com/keshikan/DSEG#usage
  let liveValueText;
  if (slot?.type === "helmholtzPitch" && typeof nodeGraphPitchDetectorFormatDisplay === "function") {
    // Live: single DSEG "-" when no pitch / below threshold (not zeros / not em dash).
    // Frozen (speed 0): hold last good — never invent a wipe over a locked reading.
    if (frozen && !hasSample) {
      liveValueText = " !"; // placeholder → ResolveHeld keeps last good / no paint
    } else if (hasSample) {
      liveValueText = nodeGraphPitchDetectorFormatDisplay(
        nodeGraphOscilloscopeLatestSample(item.buffer, 0),
        pitchMode,
        decimals,
      );
      // While frozen, dash = no detection this sample; do not paint over held Hz.
      if (frozen && typeof nodeGraphPitchDetectorZeroDisplay === "function") {
        const zeroText = nodeGraphPitchDetectorZeroDisplay(pitchMode, decimals);
        if (String(liveValueText) === String(zeroText)) {
          liveValueText = " !";
        }
      }
    } else {
      liveValueText = typeof nodeGraphPitchDetectorZeroDisplay === "function"
        ? nodeGraphPitchDetectorZeroDisplay(pitchMode, decimals)
        : "-";
    }
  } else {
    liveValueText = hasSample
      ? nodeGraphNumberReadoutFormatValue(
        nodeGraphOscilloscopeLatestSample(item.buffer, 0),
        decimals,
        // Value LCD: settle on decimals+1 before visible budget (sign stability).
        isLcd ? { guardExtraPlace: true } : null,
      )
      : (decimals > 0 ? ` !.${"!".repeat(decimals)}` : " !");
  }
  // Hold last good reading — never paint empty "!" over a held phosphor face
  // (pause + wire connect / deselect was clearing Pitch Detector ghosts).
  // Pitch Detector live DSEG "-" is a real "no lock" glyph: paint it, don't hold.
  let valueText;
  if (
    slot?.type === "helmholtzPitch"
    && !frozen
    && typeof nodeGraphPitchDetectorZeroDisplay === "function"
    && String(liveValueText) === String(nodeGraphPitchDetectorZeroDisplay(pitchMode, decimals))
  ) {
    valueText = liveValueText;
  } else {
    valueText = nodeGraphNumberReadoutResolveHeldValueText(canvas, liveValueText, { frozen });
  }
  if (!valueText) {
    // Frozen with no held reading: leave pixels as-is (no kill).
    return;
  }
  // Frozen: if we would only re-present the same held digits, skip clearRect
  // so residual ink is not destroyed by a full plate wipe.
  if (frozen) {
    const heldSig = `${valueText}|${unit}|${pitchMode}`;
    if (canvas._nodeGraphNumberReadoutFrozenHoldSig === heldSig
      && canvas._nodeGraphNumberReadoutWidth === canvas.width
      && canvas._nodeGraphNumberReadoutHeight === canvas.height) {
      return;
    }
    canvas._nodeGraphNumberReadoutFrozenHoldSig = heldSig;
  } else {
    canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
  }
  // Note names need letter glyphs (not DSEG-only).
  const pitchNameMode = slot?.type === "helmholtzPitch" && pitchMode === "name";
  const text = `${valueText}${unit ? ` ${unit}` : ""}${pitchMode !== "hz" ? `|${pitchMode}` : ""}`;
  // Value LCD: dedicated vector path (no residual hang / burn plate).
  if (isLcd) {
    const settingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
    const lcdZoomNow = nodeGraphNumberReadoutWorkspaceZoom();
    const styleChanged =
      canvas._nodeGraphNumberReadoutSettingsSig !== settingsSig ||
      canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady ||
      canvas._nodeGraphNumberReadoutWidth !== canvas.width ||
      canvas._nodeGraphNumberReadoutHeight !== canvas.height ||
      // Pin size is round(zoom); repaint when that step changes even if buffer size stalls.
      Math.round(Number(canvas._nodeGraphNumberReadoutZoom) || 1) !== Math.round(lcdZoomNow);
    const textChanged = canvas._nodeGraphNumberReadoutText == null
      || canvas._nodeGraphNumberReadoutText !== text;
    if (!textChanged && !styleChanged) {
      return;
    }
    // High-quality glyph AA at the on-screen pixel grid.
    context.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in context) {
      context.imageSmoothingQuality = "high";
    }
    drawNodeGraphValueLcdFace(canvas, context, screenElement, settings, valueText, unit, slot);
    nodeGraphNumberReadoutRememberGoodValue(canvas, valueText);
    return;
  }

  // ── Value LED / phosphor residual path ──
  // App-wide residual policy (PhosphorResidual):
  //  • Bright B → live light + deposit energy on digit change.
  //  • Ghost G → extreme analog (super-exp) hang (not brightness).
  //  • Trail T → linear residual blend (not brightness).
  //  • Burn K → sticky residual floor 0…1 (0 = off).
  //  • Burn Amount → multiplies Bright for residual deposits (default 1).
  //  • Freeze (pause / engine off): hold burn plate + last digits — no wipe.
  const trailHang = clampNodeSliderValue(
    Number(settings.trail ?? settings.residual) || 0,
    0,
    1,
  );
  const ghostHang = clampNodeSliderValue(
    Number(settings.ghost ?? settings.ghostBrightness) || 0,
    0,
    1,
  );
  const burnHang = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurn
    ? PhosphorResidual.migrateBurn(settings, 0)
    : (
      Number(settings.residualSchema) >= 2
        ? clampNodeSliderValue(Number(settings.burn) || 0, 0, 1)
        : 0
    );
  const burnAmountHang = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurnAmount
    ? PhosphorResidual.migrateBurnAmount(settings, 1)
    : Math.max(0, Math.min(4, Number(settings.burnAmount) || 1));
  const settingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
  const styleChanged =
    canvas._nodeGraphNumberReadoutSettingsSig !== settingsSig ||
    canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady ||
    canvas._nodeGraphNumberReadoutWidth !== canvas.width ||
    canvas._nodeGraphNumberReadoutHeight !== canvas.height;
  // null cache (engine-stop wipe) always forces a full present.
  const textChanged = canvas._nodeGraphNumberReadoutText == null
    || canvas._nodeGraphNumberReadoutText !== text;
  const now = performance.now?.() || Date.now();
  const previousValueText = String(canvas._numberReadoutLastValueText || "");

  // Bright B = live intensity; residual deposit = Bright × Burn Amount.
  const bright = Number.isFinite(Number(settings.brightness))
    ? clampNodeSliderValue(Number(settings.brightness), 0, 1)
    : 1;
  // Hang when Ghost/Trail on, or sticky Burn alone.
  const hangOn = trailHang > 0.001 || ghostHang > 0.001 || burnHang > 0.001;

  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  // LED residual uses Ghost Gradient for deposit color.
  let gradientStops = Array.isArray(settings.gradientStops) && settings.gradientStops.length >= 2
    ? settings.gradientStops
    : null;
  if (!gradientStops && typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    gradientStops = nodeGraphPhosphorGradientStopsFromSettings(
      settings,
      settings.color || nodeGraphNumberReadoutSettingsDefaults?.color || "#fcfdbf",
    );
  }
  if (!gradientStops && typeof nodeGraphPhosphorDefaultGradientStops === "function") {
    gradientStops = nodeGraphPhosphorDefaultGradientStops(
      settings.color || "#fcfdbf",
      settings.background || "#000004",
    );
  }
  const peakHex = Array.isArray(gradientStops) && gradientStops.length
    ? (gradientStops[gradientStops.length - 1]?.color || "#fcfdbf")
    : (settings.color || "#fcfdbf");
  // Note names: monospace (compact C3 / C#3). Hz / MIDI # / no-lock "-" use DSEG.
  const digitFontFamily = pitchNameMode
    ? '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace'
    : (nodeGraphNumberReadoutDsegReady
      ? '"DSEG7 Classic", "Consolas", monospace'
      : '"Consolas", "Courier New", monospace');
  const hasUnit = Boolean(unit);

  // Hang off → no residual. Size/font changes must NOT wipe the burn plate:
  // zoom/layout used to flip canvas dims by 1px and clear Ghost/Trail ink.
  // EnsureBurnPlate scale-preserves deposits across real resizes.
  if (!hangOn) {
    nodeGraphNumberReadoutClearBurnPlate(canvas);
  }

  const burnPlate = hangOn ? nodeGraphNumberReadoutEnsureBurnPlate(canvas) : null;
  const burnCtx = burnPlate?.getContext?.("2d") || null;

  // 1) Fade deposit plate (Trail + Ghost + Burn — pure decay, sticky floor when Burn > 0).
  if (burnCtx && hangOn && !frozen && burnPlate.width > 0) {
    burnCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (burnHang > 0.001) {
      // Per-pixel residual so sticky Burn floors survive.
      nodeGraphNumberReadoutApplyResidualPlate(
        burnCtx,
        burnPlate.width,
        burnPlate.height,
        trailHang,
        ghostHang,
        burnHang,
      );
    } else {
      const erase = nodeGraphNumberReadoutBurnEraseAlpha(trailHang, ghostHang);
      if (erase > 0.00005) {
        burnCtx.save();
        burnCtx.globalCompositeOperation = "destination-out";
        burnCtx.fillStyle = `rgba(0, 0, 0, ${erase.toFixed(4)})`;
        burnCtx.fillRect(0, 0, burnPlate.width, burnPlate.height);
        burnCtx.restore();
      }
    }
    const prevE = Number(canvas._numberReadoutResidualEnergy) || 0;
    const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
    if (Residual && typeof Residual.applyResidual === "function") {
      canvas._numberReadoutResidualEnergy = Residual.applyResidual(
        prevE,
        trailHang,
        ghostHang,
        burnHang,
      );
    } else {
      const erase = nodeGraphNumberReadoutBurnEraseAlpha(trailHang, ghostHang);
      canvas._numberReadoutResidualEnergy = prevE * Math.max(0, 1 - erase);
    }
  }

  // 2) On change: stamp ONLY digits that changed (per-cell deposit).
  //    Deposit energy = Bright × Burn Amount (live LED still uses full Bright).
  //    Ghost/Trail only set hang. Layout uses previous full reading for columns.
  //    Never stamp while frozen, and never treat held empty as a change.
  const ResidualApi = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const depositPeak = ResidualApi && typeof ResidualApi.depositBrightness === "function"
    ? ResidualApi.depositBrightness(bright, burnAmountHang)
    : bright * Math.max(0, Number(burnAmountHang) || 1);
  // Canvas alpha maxes at 1; peak energy can track >1 for gradient sampling.
  const depositBright = Math.min(1, depositPeak);
  if (
    burnCtx
    && hangOn
    && !frozen
    && textChanged
    && previousValueText
    && previousValueText !== valueText
    && !nodeGraphNumberReadoutIsEmptyPlaceholder(previousValueText)
    && !nodeGraphNumberReadoutIsEmptyPlaceholder(valueText)
    && burnPlate.width > 0
    && depositBright > 0.005
  ) {
    const depositText = nodeGraphNumberReadoutGhostDepositText(
      previousValueText,
      valueText,
    );
    if (depositText) {
      // Layout from full previous string (same cell count/geometry as the face).
      const residualLargeUnit = hasUnit && String(unit || "").trim().toLowerCase() === "hz";
      const residualPad01 = nodeGraphNumberReadoutFacePadding01(settings);
      const residualFitText = nodeGraphNumberReadoutLayoutFitText(
        slot,
        previousValueText,
        decimals,
        settings,
      );
      const residualLayout = nodeGraphNumberReadoutComputeLayout(
        burnCtx,
        previousValueText,
        digitFontFamily,
        width,
        height,
        {
          hasUnit,
          largeUnit: residualLargeUnit,
          padding01: residualPad01,
          faceStyle: "led",
          pixelRatio,
          zoom: nodeGraphNumberReadoutWorkspaceZoom(),
          fitText: residualFitText,
        },
      );
      const residualPad = residualLayout.padPx || 0;
      const residualPadY = residualLayout.padPxY != null ? residualLayout.padPxY : residualPad;
      burnCtx.setTransform(1, 0, 0, 1, 0, 0);
      burnCtx.save();
      burnCtx.globalCompositeOperation = "source-over";
      // White energy at alpha = depositBright (Bright × Burn Amount, capped at 1).
      // Pin mode: one phosphor pixel of deposit energy.
      if (residualLayout.pixelPin) {
        nodeGraphNumberReadoutDrawPixelPin(
          burnCtx,
          residualLayout,
          left,
          top,
          width,
          height,
          [255, 255, 255],
          depositBright,
        );
      } else {
        nodeGraphNumberReadoutDrawDigits(burnCtx, {
          text: depositText,
          centerX: left + residualPad + residualLayout.contentW * 0.5,
          centerY: top + residualPadY + residualLayout.digitAreaH * 0.5,
          fontFamily: digitFontFamily,
          fontSize: residualLayout.fontSize,
          cellW: residualLayout.cellW,
          rgb: [255, 255, 255],
          alpha: depositBright,
          softBlurPx: 0,
          glow: 0,
          plate: false,
          energy: true,
        });
      }
      burnCtx.restore();
      // Peak residual energy follows Bright × Burn Amount (may exceed 1 for LUT).
      canvas._numberReadoutResidualEnergy = Math.max(
        Number(canvas._numberReadoutResidualEnergy) || 0,
        Math.min(4, depositPeak),
      );
      canvas._numberReadoutLastTextChangeAt = now;
    }
  }

  const depositEnergy = Number(canvas._numberReadoutResidualEnergy) || 0;
  if (depositEnergy <= 0.008) {
    canvas._numberReadoutResidualEnergy = 0;
    // Only hard-clear plate crumbs when Trail is on. Pure Ghost (Trail 0)
    // keeps the long sticky analog tail — do not wipe the last ink early.
    if (
      depositEnergy > 0
      && hangOn
      && trailHang > 0.001
      && burnCtx
      && burnPlate?.width > 0
      && !frozen
    ) {
      burnCtx.setTransform(1, 0, 0, 1, 0, 0);
      burnCtx.clearRect(0, 0, burnPlate.width, burnPlate.height);
    }
  }
  const depositActive = hangOn && depositEnergy > 0.008;
  // Hanging deposits need continuous present (no static Ghost floor).
  const needsContinuous = !frozen && depositActive;
  if (!textChanged && !styleChanged && !needsContinuous) {
    return;
  }

  // Live LED light RGB (grey→hue→white from Bright).
  const rgb = nodeGraphNumberReadoutLightRgb(settings);
  const bg = nodeGraphFacePlateBackground(settings);
  const alpha = 1;
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.lightStrength = bright.toFixed(3);
    canvas.parentElement.dataset.valueFaceStyle = "led";
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const largeUnit = hasUnit && String(unit || "").trim().toLowerCase() === "hz";
  const pad01 = nodeGraphNumberReadoutFacePadding01(settings);
  // GROW off → LayoutFitText returns fixed Decimals budget; GROW on → live width.
  // Pitch name (M): always fit live compact name (no DSEG digit budget for letters).
  // Slight built-in pad so M glyphs don't slam the plate edge even at pad 0.
  let liveFitText = nodeGraphNumberReadoutLayoutFitText(slot, valueText, decimals, settings);
  let pitchLayoutPad01 = pad01;
  if (pitchNameMode) {
    liveFitText = String(valueText || "C#3");
    // Keep a little air around note names even when Display pad is 0.
    pitchLayoutPad01 = Math.max(pad01, 0.08);
  } else if (slot?.type === "helmholtzPitch") {
    // Mild inset so DSEG ink isn't edge-clipped at pad 0 (do not override fitText —
    // that used to force live-width grow and ignore GROW off).
    pitchLayoutPad01 = Math.max(pad01, 0.04);
  }
  const layout = nodeGraphNumberReadoutComputeLayout(
    context,
    valueText,
    digitFontFamily,
    width,
    height,
    {
      hasUnit,
      largeUnit,
      padding01: pitchLayoutPad01,
      faceStyle: "led",
      pixelRatio,
      zoom: nodeGraphNumberReadoutWorkspaceZoom(),
      fitText: liveFitText,
      monoProbe: pitchNameMode,
    },
  );
  const digitFontSize = layout.fontSize;
  const cellW = layout.cellW;
  const labelHeight = layout.labelH;
  const digitAreaHeight = layout.digitAreaH;
  const padPx = layout.padPx || 0;
  const padPxY = layout.padPxY != null ? layout.padPxY : padPx;
  // Center the live digit string in the content box (fixed cell size).
  const digitX = left + padPx + layout.contentW * 0.5;
  const digitY = top + padPxY + digitAreaHeight * 0.5;

  const depositRgb = depositActive
    ? nodeGraphNumberReadoutGhostRgbFromEnergy(depositEnergy, gradientStops, peakHex)
    : null;

  // ── Present (Value LED) ──
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // Deposit plate: previous readings; energy decays via Trail + Ghost hang.
  if (depositActive && burnPlate?.width > 0 && depositRgb) {
    nodeGraphNumberReadoutPresentBurnPlate(context, burnPlate, depositRgb, 1);
  }

  // Max padding: one phosphor pixel of live light.
  // Pitch DSEG "-" no-lock glyph is intentional ink (IsEmptyPlaceholder would skip it).
  const pitchNoLockGlyph = slot?.type === "helmholtzPitch"
    && typeof nodeGraphPitchDetectorZeroDisplay === "function"
    && String(valueText) === String(nodeGraphPitchDetectorZeroDisplay(pitchMode, decimals));
  const drawLiveDigits = alpha > 0.001
    && (pitchNoLockGlyph || !nodeGraphNumberReadoutIsEmptyPlaceholder(valueText));
  if (layout.pixelPin) {
    if (drawLiveDigits) {
      nodeGraphNumberReadoutDrawPixelPin(
        context,
        layout,
        left,
        top,
        width,
        height,
        rgb,
        alpha,
      );
    }
  } else if (digitFontSize > 0.25 && drawLiveDigits) {
    // Live digits over residual.
    const lightBlend = String(settings.lightBlend || "lighten").trim().toLowerCase() || "lighten";
    if (lightBlend === "occlude") {
      const plateRgb = (() => {
        const m = String(bg || "").match(/^#?([0-9a-f]{6})$/i);
        if (m) {
          const n = Number.parseInt(m[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return [0, 0, 4];
      })();
      nodeGraphNumberReadoutDrawDigits(context, {
        text: valueText,
        centerX: digitX,
        centerY: digitY,
        fontFamily: digitFontFamily,
        fontSize: digitFontSize,
        cellW,
        rgb: plateRgb,
        alpha: 1,
        softBlurPx: 0,
        glow: 0,
        plate: false,
      });
      nodeGraphNumberReadoutDrawDigits(context, {
        text: valueText,
        centerX: digitX,
        centerY: digitY,
        fontFamily: digitFontFamily,
        fontSize: digitFontSize,
        cellW,
        rgb,
        alpha,
        softBlurPx: 0,
        glow: 0,
        plate: false,
        composite: "source-over",
      });
    } else {
      nodeGraphNumberReadoutDrawDigits(context, {
        text: valueText,
        centerX: digitX,
        centerY: digitY,
        fontFamily: digitFontFamily,
        fontSize: digitFontSize,
        cellW,
        rgb,
        alpha,
        softBlurPx: 0,
        glow: 0,
        plate: false,
        composite: lightBlend,
      });
    }
  }

  if (hasUnit && labelHeight > 0.25 && digitFontSize > 0.25) {
    const labelFontSize = nodeGraphNumberReadoutUnitFontSize(
      labelHeight,
      layout.contentW || width,
      digitFontSize,
      largeUnit,
    );
    context.font = `700 ${labelFontSize}px "Consolas", "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(alpha * (largeUnit ? 0.85 : 0.55)).toFixed(4)})`;
    context.fillText(
      unit,
      left + padPx + layout.contentW * 0.5,
      top + padPx + digitAreaHeight + labelHeight * 0.5,
    );
  }

  context.restore();

  canvas._numberReadoutLastValueText = valueText;
  nodeGraphNumberReadoutRememberGoodValue(canvas, valueText);
  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = settingsSig;
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = canvas.width;
  canvas._nodeGraphNumberReadoutHeight = canvas.height;
  canvas._nodeGraphNumberReadoutPaintAt = now;
}

