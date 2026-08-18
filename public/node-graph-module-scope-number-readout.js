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
  canvas._numberReadoutLastDigitLayout = null;
  canvas._numberReadoutResidualEnergy = 0;
  canvas._numberReadoutResiduals = null;
  canvas._nodeGraphNumberReadoutText = null;
  canvas._nodeGraphNumberReadoutSettingsSig = null;
  canvas._nodeGraphNumberReadoutFontReady = null;
  canvas._nodeGraphNumberReadoutWidth = -1;
  canvas._nodeGraphNumberReadoutHeight = -1;
  canvas._nodeGraphNumberReadoutZoom = null;
  canvas._nodeGraphNumberReadoutPaintAt = 0;
  canvas._numberReadoutEnergyMask = null;
  canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
  // Pause absorb stamps these; if they survive Stop wipe, Instant Trace /
  // burn cursors can believe the new session is already fully drawn.
  canvas._nodeGraphScope2dLastDrawnFrame = undefined;
  canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = undefined;
  canvas._phosphorScope2dLastFrame = undefined;
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
 * After a cold engine start (esp. pause→stop→play), drop freeze-hold state so
 * Value LCD/LED paint live samples again instead of early-outing as "still paused".
 */
function nodeGraphNumberReadoutRearmAllFacesAfterLiveStart() {
  if (typeof document === "undefined") {
    return;
  }
  for (const canvas of document.querySelectorAll("canvas.node-number-readout-canvas")) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      continue;
    }
    canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
    canvas._nodeGraphScope2dLastDrawnFrame = undefined;
    canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = undefined;
    canvas._phosphorScope2dLastFrame = undefined;
    // Force next draw to treat text as dirty (null cache).
    canvas._nodeGraphNumberReadoutText = null;
    canvas._nodeGraphNumberReadoutSettingsSig = null;
    canvas._numberReadoutLastValueText = "";
    canvas._numberReadoutLastGoodValueText = "";
  }
  for (const face of document.querySelectorAll(".node-led-face")) {
    if (face?.dataset) {
      delete face.dataset.ledAppearance;
      // Stop wipe zeros these; allow live paint to re-light.
      if (face.dataset.ledLevel != null) {
        face.dataset.ledLevel = "0";
      }
    }
    const lamp = face.querySelector?.(".node-led-lamp");
    if (lamp?.dataset) {
      delete lamp.dataset.ledAppearance;
    }
  }
}

/**
 * Paint Value LCD / Value LED / Pitch readout / lamp LED faces NOW without the
 * shared scope canvas gate. After pause→stop the main draw loop often early-outs
 * on empty buffers ("stale-buffers") and never reaches these face painters —
 * so digits stay wiped / lamps stay black until something else forces a pass.
 *
 * @returns {number} how many faces were painted
 */
function paintNodeGraphValueFacesNow(pixelRatio = window.devicePixelRatio || 1) {
  if (typeof nodeGraphVisibleModuleScopeSlots !== "function") {
    return 0;
  }
  const pr = Math.max(1, Number(pixelRatio) || 1);
  let painted = 0;
  for (const slot of nodeGraphVisibleModuleScopeSlots()) {
    const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
      ? nodeGraphModuleDisplayRendererForSlot(slot)
      : "";
    const type = String(slot?.type || "");
    const isNumberFace =
      renderer === "numberReadout"
      || type === "numberReadout"
      || type === "valueLcd"
      || type === "helmholtzPitch";
    const isLedLamp = renderer === "ledLamp" || renderer === "vectorDot" || renderer === "pulseDot";
    if (!isNumberFace && !isLedLamp) {
      continue;
    }
    const captured = typeof nodeGraphModuleScopeCapturedBufferForSlot === "function"
      ? nodeGraphModuleScopeCapturedBufferForSlot(slot)
      : null;
    const buffer = typeof nodeGraphModuleScopeDisplayBuffer === "function"
      ? nodeGraphModuleScopeDisplayBuffer(slot, captured)
      : captured;
    const face = slot.scopeElement;
    if (!face) {
      continue;
    }
    // Synthetic scope rect from layout box (draw path only needs positive size).
    const w = Math.max(1, face.clientWidth || face.offsetWidth || 1);
    const h = Math.max(1, face.clientHeight || face.offsetHeight || 1);
    const item = {
      buffer,
      nodeId: slot.nodeId,
      screenElement: face,
      scopeRect: { height: h, left: 0, top: 0, width: w },
      slot,
    };
    try {
      if (isLedLamp && typeof drawNodeGraphLedLampItem === "function") {
        // Ensure light target from samples when metadata is missing.
        if (buffer && !Number.isFinite(Number(buffer.nodeGraphScopeLightTarget))) {
          let peak = 0;
          const n = Math.min(buffer.length || 0, 64);
          for (let i = Math.max(0, (buffer.length || 0) - n); i < (buffer.length || 0); i += 1) {
            const s = Math.abs(Number(buffer[i]) || 0);
            if (s > peak) peak = s;
          }
          buffer.nodeGraphScopeLightTarget = Math.max(0, Math.min(1, peak));
        }
        drawNodeGraphLedLampItem(null, item, pr);
        painted += 1;
        continue;
      }
      if (isNumberFace && typeof drawNodeGraphNumberReadoutItem === "function") {
        // Clear freeze-hold so draw cannot early-out as "still paused".
        const canvas = typeof nodeGraphNumberReadoutCanvasForSlot === "function"
          ? nodeGraphNumberReadoutCanvasForSlot(slot)
          : null;
        if (canvas) {
          canvas._nodeGraphNumberReadoutFrozenHoldSig = null;
          canvas._nodeGraphNumberReadoutText = null;
        }
        drawNodeGraphNumberReadoutItem(null, item, pr);
        const isLcd = typeof nodeGraphNumberReadoutFaceStyleForSlot === "function"
          && nodeGraphNumberReadoutFaceStyleForSlot(
            slot,
            typeof nodeGraphModuleScopeNodeForSlot === "function"
              ? nodeGraphModuleScopeNodeForSlot(slot)
              : null,
          ) === "lcd";
        const s = isLcd && typeof nodeGraphLcdDisplayLightStrength === "number"
          ? nodeGraphLcdDisplayLightStrength
          : 1;
        // Always re-open room-dimmer punches (face + canvas).
        if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
          nodeGraphModuleScopeMarkScreenLit(face, s);
        }
        if (canvas?.dataset) {
          canvas.dataset.lightSource = "screen";
          canvas.dataset.lightStrength = String(s);
        }
        if (face?.dataset) {
          face.dataset.lightSource = "screen";
          face.dataset.lightStrength = String(s);
        }
        painted += 1;
      }
    } catch (_error) {
      // Never let one face kill rearm for the rest.
    }
  }
  return painted;
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
  if (type === "helmholtzPitch") {
    return "lcd";
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
  if (el.classList?.contains("node-pitch-detector-lcd")
    || el.closest?.(".node-pitch-detector-face")) {
    return true;
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
function nodeGraphNumberReadoutLcdHueDeg(settings, fallbackHex, fallbackHue) {
  const hex = settings?.color || settings?.dot1Color || settings?.background || fallbackHex;
  if (typeof nodeGraphHueDegFromHex === "function") {
    const h = nodeGraphHueDegFromHex(hex);
    if (Number.isFinite(h)) {
      return h;
    }
  }
  return fallbackHue;
}

function nodeGraphNumberReadoutLcdInkRgb(settings) {
  const hue = nodeGraphNumberReadoutLcdHueDeg(
    { color: settings?.color ?? settings?.dot1Color },
    settings?.color,
    typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82,
  );
  const amount = clampNodeSliderValue(
    Number(settings?.brightness ?? settings?.dot1Brightness),
    0,
    1,
  );
  if (typeof nodeGraphHueBrightnessRgb01 === "function") {
    const [r, g, b] = nodeGraphHueBrightnessRgb01(hue, amount);
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  return [26, 34, 22];
}

/**
 * LCD ghost 8s — same ink hue, parked between plate and ink (not a grey policy).
 */
function nodeGraphNumberReadoutLcdGhostRgb(inkRgb, settings = null) {
  if (settings && typeof nodeGraphHueBrightnessRgb01 === "function") {
    const hue = nodeGraphNumberReadoutLcdHueDeg(
      { color: settings.color ?? settings.dot1Color },
      settings.color,
      typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82,
    );
    const inkAmt = clampNodeSliderValue(Number(settings.brightness ?? settings.dot1Brightness), 0, 1);
    const plateAmt = clampNodeSliderValue(Number(settings.backgroundBrightness), 0, 1);
    const ghostAmt = plateAmt + (inkAmt - plateAmt) * 0.42;
    const [r, g, b] = nodeGraphHueBrightnessRgb01(hue, ghostAmt);
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  const r = Number(inkRgb?.[0]) || 0;
  const g = Number(inkRgb?.[1]) || 0;
  const b = Number(inkRgb?.[2]) || 0;
  const y = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
  return [y, y, y];
}

/**
 * LCD background plate RGB from hue + physically-plausible brightness.
 */
function nodeGraphNumberReadoutLcdBgRgb(settings) {
  const hue = nodeGraphNumberReadoutLcdHueDeg(
    { color: settings?.background ?? settings?.backgroundColor },
    settings?.background,
    typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82,
  );
  const amount = clampNodeSliderValue(Number(settings?.backgroundBrightness), 0, 1);
  if (typeof nodeGraphHueBrightnessRgb01 === "function") {
    const [r, g, b] = nodeGraphHueBrightnessRgb01(hue, amount);
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  return [176, 181, 166];
}

function nodeGraphNumberReadoutLcdBgCss(settings) {
  const [r, g, b] = nodeGraphNumberReadoutLcdBgRgb(settings);
  return `rgb(${r} ${g} ${b})`;
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


/**
 * Idle plate for Value LCD / Value LED / Pitch Detector.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} screenElement
 * @param {object|null} node
 * @param {boolean|{force?: boolean}} [options] force=true: intentional Stop wipe
 *   always paints (ignores residual-hold freeze).
 */
function paintNodeGraphNumberReadoutColdBoot(canvas, screenElement, node = null, options = null) {
  if (!canvas || !screenElement) {
    return false;
  }
  const force = options === true
    || (options && typeof options === "object" && options.force === true);
  // Never cold-boot while simulation is transport-paused (engine still up) —
  // that wiped Pitch Detector / Value LED residual on deselect + no-buffer.
  // Full Stop (no live node) is not freeze — Stop wipe must repaint idle plates.
  if (!force
    && typeof nodeGraphModuleScopePhosphorFrozen === "function"
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
    screenSharp: false,
  })) {
    return false;
  }
  const context = canvas.getContext("2d");
  if (!context || !(canvas.width > 0) || !(canvas.height > 0)) {
    return false;
  }
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const bg = isLcd && typeof nodeGraphNumberReadoutLcdBgCss === "function"
    ? nodeGraphNumberReadoutLcdBgCss(settings)
    : nodeGraphFacePlateBackground(settings);
  if (isLcd) {
    nodeGraphNumberReadoutApplyLcdLightCutout(screenElement, canvas);
  } else {
    // Value LED: full hole on face AND canvas (canvas is the dimmer punch target).
    for (const el of [screenElement, canvas].filter(Boolean)) {
      el.classList?.add?.("node-light-source");
      if (el.dataset) {
        el.dataset.lightSource = "screen";
        el.dataset.lightStrength = "1";
      }
      if (typeof setNodeGraphLightStrength === "function") {
        setNodeGraphLightStrength(el, 1);
      }
    }
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
    ".node-number-readout-face, .dsp-node.number-readout-layout .node-module-scope-window, .dsp-node.value-lcd-layout .node-module-scope-window, .node-value-lcd-face, .node-pitch-detector-lcd",
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
    // Intentional Stop / full wipe — always repaint idle plate.
    paintNodeGraphNumberReadoutColdBoot(canvas, face, node, { force: true });
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
    // Same 1px hysteresis as Value LED — drag/subpixel hops must not
    // assign canvas.width (browser wipe) while the LCD is paused.
    if (canvas.width >= 2 && canvas.height >= 2) {
      const dw = Math.abs(width - canvas.width);
      const dh = Math.abs(height - canvas.height);
      if (dw <= 1 && dh <= 1) {
        width = canvas.width;
        height = canvas.height;
      }
    }
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
    // Resizing the host canvas clears its pixels (browser). Copy the last
    // plate first so pause+move/resize does not blank the LCD.
    const prevW = canvas.width | 0;
    const prevH = canvas.height | 0;
    let previous = null;
    if (prevW > 1 && prevH > 1 && width > 0 && height > 0) {
      previous = document.createElement("canvas");
      previous.width = prevW;
      previous.height = prevH;
      const prevCtx = previous.getContext("2d");
      if (prevCtx) {
        prevCtx.drawImage(canvas, 0, 0);
      }
    }
    canvas.width = width;
    canvas.height = height;
    canvas._numberReadoutEnergyMask = null;
    if (previous) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(previous, 0, 0, prevW, prevH, 0, 0, width, height);
      }
    }
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
 * Total digit budget (whole + fractional) for limit_decimals / fixed bins.
 * Matches normalize / form clamp: 1…12.
 */
function nodeGraphNumberReadoutSafeDigits(digits) {
  const n = Math.round(Number(digits));
  if (!Number.isFinite(n)) {
    return 8;
  }
  return Math.max(1, Math.min(12, n));
}


/**
 * Plain decimal string for limit_decimals (never scientific notation).
 * limit_decimals only parses whole.fraction — "1e-7" would become "1".
 */
function nodeGraphNumberReadoutPlainDecimalSource(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "0";
  }
  if (n === 0) {
    return "0";
  }
  const raw = String(n);
  if (!/[eE]/.test(raw)) {
    return raw;
  }
  try {
    return n.toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  } catch {
    // Last resort: enough fractional places for a 12-digit budget.
    try {
      return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "") || "0";
    } catch {
      return "0";
    }
  }
}

/**
 * Format a sample for Value LED / Value LCD digits.
 * Uses limit_decimals for digit/decimal economy (max digits, min/max places).
 *
 * @param {number} sample
 * @param {number} decimals max (and min when fixed) fractional places
 * @param {{
 *   guardExtraPlace?: boolean,
 *   digits?: number,
 *   maxDigits?: number,
 *   minDecimals?: number,
 *   maxDecimals?: number,
 *   removeTrailingZeros?: boolean,
 *   reserveSignSpace?: boolean,
 * }} [options]
 *   guardExtraPlace (LCD): round with one offscreen place (decimals+1) first so
 *   the displayed value (and sign) is not wildly flipped by sub-display noise.
 *   Also collapses signed zero ("-0.00") to unsigned zero after that round.
 *   digits / maxDigits: total digit budget for limit_decimals (default 8).
 */
function nodeGraphNumberReadoutFormatValue(sample, decimals, options = null) {
  const value = Number(sample);
  if (!Number.isFinite(value)) {
    return "--";
  }
  const places = nodeGraphNumberReadoutSafeDecimals(decimals);
  const maxDigits = nodeGraphNumberReadoutSafeDigits(
    options?.digits ?? options?.maxDigits ?? 8,
  );
  const minDecimals = options?.minDecimals != null
    ? nodeGraphNumberReadoutSafeDecimals(options.minDecimals)
    : places;
  const maxDecimals = options?.maxDecimals != null
    ? nodeGraphNumberReadoutSafeDecimals(options.maxDecimals)
    : places;
  const removeTrailingZeros = Boolean(options?.removeTrailingZeros);
  // LCD: one extra place of rounding before the visible budget (offscreen).
  const guardExtra = Boolean(options && options.guardExtraPlace);
  const guardPlaces = guardExtra
    ? Math.min(8, Math.max(places, maxDecimals) + 1)
    : places;
  let valueForFormat = value;
  if (guardPlaces > places) {
    const scale = 10 ** guardPlaces;
    // Math.round keeps sign of half-away-from-zero; fine for display settle.
    valueForFormat = Math.round(value * scale) / scale;
  }
  let fixed;
  if (typeof limit_decimals === "function") {
    // Specialized economy: maxDigits total, min/max decimal places in one pass.
    const source = nodeGraphNumberReadoutPlainDecimalSource(valueForFormat);
    try {
      fixed = limit_decimals(
        source,
        maxDigits,
        minDecimals,
        maxDecimals,
        removeTrailingZeros,
        false,
      );
    } catch {
      fixed = null;
    }
  }
  if (fixed == null || fixed === "") {
    try {
      fixed = valueForFormat.toFixed(places);
    } catch {
      fixed = valueForFormat.toFixed(2);
    }
  }
  // After guard + format, tiny negatives can still print as "-0.00".
  // Treat exact display-zero as unsigned so the sign column stays calm.
  if (fixed.startsWith("-") && Number(fixed) === 0) {
    if (typeof limit_decimals === "function") {
      fixed = limit_decimals("0", maxDigits, minDecimals, maxDecimals, removeTrailingZeros, false)
        || (0).toFixed(places);
    } else {
      fixed = (0).toFixed(places);
    }
  }
  // Reserve a sign column so width stays stable across zero (DSEG space =
  // colon advance — keshikan/DSEG usage notes). Opt out with reserveSignSpace:false.
  if (options && options.reserveSignSpace === false) {
    return fixed;
  }
  return fixed.startsWith("-") ? fixed : ` ${fixed}`;
}


function nodeGraphNumberReadoutDsegWidthChars(text) {
  return Math.max(1, String(text || "").replace(/\./g, "").length);
}

/**
 * Fixed DSEG fit template when GROW is off (decimalBudget true).
 * Font size locks to Digits+Decimals bins — live value still drawn centered
 * at that cell size. (DSEG period is zero-width; "8"/"!" measure full cells.)
 *
 * @param {number} decimals fractional places
 * @param {number} digits total digit budget (whole + fractional)
 */
function nodeGraphNumberReadoutBudgetFitText(decimals, digits = 8) {
  const total = nodeGraphNumberReadoutSafeDigits(digits);
  const d = Math.min(nodeGraphNumberReadoutSafeDecimals(decimals), Math.max(0, total - 1));
  const ints = Math.max(1, total - d);
  const frac = d > 0 ? `.${"!".repeat(d)}` : "";
  return ` ${"8".repeat(ints)}${frac}`;
}

/**
 * Face padding −0.5…1 from settings (finite-safe; 0 is valid).
 * 0 = no inset (content box = plate). Positive = inset toward pin.
 * Negative = enlarge digit fit box (numbers grow toward / past walls; plate clips).
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
  return clampNodeSliderValue(raw, -0.5, 1);
}

/**
 * Width-fit string for layout.
 * UI GROW maps to !decimalBudget (see form I/O):
 * - GROW on  (decimalBudget false) → live valueText (resize as digits change)
 * - GROW off (decimalBudget true)  → fixed Digits+Decimals bin template
 *
 * Never bypass budget when GROW is off — even at facePadding 0 (old pad≈0
 * shortcut always returned live text and ignored GROW off).
 */
function nodeGraphNumberReadoutUsesDigitBins(settings = null) {
  if (!settings) {
    return true;
  }
  if (Object.hasOwn(settings, "digitBins")) {
    return Boolean(settings.digitBins);
  }
  return settings.digitBins !== false;
}

function nodeGraphNumberReadoutUsesFixedBudget(settings = null) {
  if (!settings) {
    return true;
  }
  return Boolean(settings.decimalBudget) || nodeGraphNumberReadoutUsesDigitBins(settings);
}

/**
 * Right-align a formatted reading into fixed Digits+Decimals bins.
 * Unused integer bins are spaces (ghost 8s), not zeros — like a real meter.
 */
function nodeGraphNumberReadoutPadValueToBins(valueText, digits, decimals, options = null) {
  const total = nodeGraphNumberReadoutSafeDigits(digits);
  const d = Math.min(nodeGraphNumberReadoutSafeDecimals(decimals), Math.max(0, total - 1));
  const ints = Math.max(1, total - d);
  const reserveSign = options?.reserveSignSpace !== false;
  let raw = String(valueText ?? "");
  if (/^[!.\s—–-]+$/.test(raw.trim())) {
    const frac = d > 0 ? `.${"!".repeat(d)}` : "";
    return `${reserveSign ? " " : ""}${"!".repeat(ints)}${frac}`;
  }
  const neg = raw.startsWith("-");
  if (neg || raw.startsWith(" ")) {
    raw = raw.slice(1);
  }
  const dot = raw.indexOf(".");
  let intPart = dot >= 0 ? raw.slice(0, dot) : raw;
  let fracPart = dot >= 0 ? raw.slice(dot + 1) : "";
  intPart = String(intPart || "0").replace(/\D/g, "") || "0";
  if (intPart.length > ints) {
    intPart = intPart.slice(-ints);
  } else {
    intPart = intPart.padStart(ints, " ");
  }
  if (d > 0) {
    const padZeros = options?.removeTrailingZeros !== true;
    fracPart = String(fracPart || "").replace(/\D/g, "");
    fracPart = padZeros ? fracPart.padEnd(d, "0").slice(0, d) : fracPart.slice(0, d).padEnd(d, " ");
  } else {
    fracPart = "";
  }
  const body = d > 0 ? `${intPart}.${fracPart}` : intPart;
  if (!reserveSign) {
    return neg ? `-${body.replace(/^ /, "")}` : body;
  }
  return `${neg ? "-" : " "}${body}`;
}

function nodeGraphNumberReadoutLayoutFitText(slot, valueText, decimals, settings = null) {
  const budgetOn = nodeGraphNumberReadoutUsesFixedBudget(settings);
  // GROW on and Digit bins off: fill plate to the live reading.
  if (!budgetOn) {
    return valueText;
  }
  // GROW off: lock font size to Digits + Decimals bins (limit_decimals economy).
  const digits = nodeGraphNumberReadoutSafeDigits(
    settings?.digits
    ?? settings?.maxDigits
    ?? (slot?.type === "helmholtzPitch" ? 6 : 8),
  );
  return nodeGraphNumberReadoutBudgetFitText(decimals, digits);
}


function nodeGraphNumberReadoutGhostPlateText(valueText) {
  // Digits and unused bins ghost as a full 8. Sign cell is only the minus bar.
  let s = String(valueText || "");
  const sign = (s.startsWith("-") || s.startsWith(" ")) ? s[0] : "";
  const rest = sign ? s.slice(1) : s;
  const ghostRest = rest.replace(/[0-9! ]/g, "8");
  if (sign === " ") {
    return `-${ghostRest}`;
  }
  return `${sign}${ghostRest}`;
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
    settings.digits,
    settings.decimals,
    settings.decimalBudget ? 1 : 0,
    settings.digitBins === false ? 0 : 1,
    settings.lightBlend,
    settings.facePadding,
    settings.backgroundBrightness,
    settings.unlitSegments,
    settings.innerShadowDistance,
    settings.innerShadowSharpness,
    settings.innerShadowOffsetX,
    settings.innerShadowOffsetY,
    settings.centsBand,
    stopsSig,
  ].join("|");
}

/** 8ve-page cents stripes: red…blue…red. Index 4 = in tune (0–10¢). */
const NODE_GRAPH_PITCH_CENTS_BAND_RGB = Object.freeze([
  Object.freeze([220, 48, 40]),
  Object.freeze([240, 140, 20]),
  Object.freeze([236, 210, 36]),
  Object.freeze([56, 176, 72]),
  Object.freeze([36, 120, 230]),
  Object.freeze([56, 176, 72]),
  Object.freeze([236, 210, 36]),
  Object.freeze([240, 140, 20]),
  Object.freeze([220, 48, 40]),
]);

function nodeGraphPitchCentsBandIndex(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) {
    return -1;
  }
  const abs = Math.abs(n);
  if (abs <= 10) return 4;
  if (abs <= 20) return n < 0 ? 3 : 5;
  if (abs <= 30) return n < 0 ? 2 : 6;
  if (abs <= 40) return n < 0 ? 1 : 7;
  return n < 0 ? 0 : 8;
}

function nodeGraphPitchDetectorDrawCentsBands(context, left, top, width, height, cents, brightness) {
  const b = clampNodeSliderValue(Number(brightness) || 0, 0, 1);
  if (!context || !(width > 0) || !(height > 0) || b <= 0.0005) {
    return;
  }
  const n = NODE_GRAPH_PITCH_CENTS_BAND_RGB.length;
  const bandW = width / n;
  const hi = nodeGraphPitchCentsBandIndex(cents);
  context.save();
  for (let i = 0; i < n; i += 1) {
    const rgb = NODE_GRAPH_PITCH_CENTS_BAND_RGB[i];
    const alpha = i === hi ? b : b * 0.2;
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    const x = left + i * bandW;
    context.fillRect(x, top, bandW + 0.75, height);
  }
  context.restore();
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
 *   padding01: linear −0.5…1 vs half of each axis.
 *     0 = no inset (content box = full plate);
 *     +1 = one pin pixel remains;
 *     negative = enlarge fit box (digits grow toward walls; plate clips).
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
    ? clampNodeSliderValue(padRaw, -0.5, 1)
    : 0;
  const fitText = opts.fitText != null ? String(opts.fitText) : String(valueText || "");
  // Pitch note names: always measure cells from a full mono advance (not DSEG "8").
  const cellProbeGlyph = monoProbe ? "M" : "8";
  const minSide = Math.max(0, Math.min(faceW, faceH));
  const pin = Math.min(
    minSide,
    nodeGraphNumberReadoutPinSizePx(opts.faceStyle, opts.pixelRatio, opts.zoom),
  );
  // Linear pad only: inset = pad01 × half-axis. Negative enlarges content for fit.
  const maxPadX = Math.max(0, (faceW - pin) * 0.5);
  const maxPadY = Math.max(0, (faceH - pin) * 0.5);
  const padPx = pad01 * maxPadX;
  const padPxY = pad01 * maxPadY;
  const contentW = Math.max(pin, faceW - padPx * 2);
  const contentH = Math.max(pin, faceH - padPxY * 2);
  // Near-max *positive* padding only: single pin pixel mode (no DSEG fit).
  const pixelPin = pad01 >= 0.999
    || (pad01 > 0 && contentW <= pin * 1.01 && contentH <= pin * 1.01);
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
  // Contain-fit only (no cover/explode). Padding is a pure linear inset/outset
  // of the content box; digits/decimals/GROW only choose fitText width.
  // Mild DSEG ink-of-em oversize (~80%) — not a special pad=0 path.
  const DSEG_INK_OF_EM = 0.80;
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
  // Only shrink when ink truly overflows the content box.
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
      // Unlit LCD grid: digits are all-on "8". Sign column is only the minus bar.
      glyph = (ch === "-" || ch === " ") ? "-" : "8";
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


function nodeGraphNumberReadoutLcdCompositeHang(canvas, context, spec = {}) {
  const hangOn = Boolean(spec.hangOn);
  if (!canvas || !context || !hangOn) {
    return;
  }
  if (!canvas._lcdGhostPlate) {
    canvas._lcdGhostPlate = document.createElement("canvas");
  }
  const plate = canvas._lcdGhostPlate;
  const width = Math.max(1, Math.round(Number(spec.width) || canvas.width || 1));
  const height = Math.max(1, Math.round(Number(spec.height) || canvas.height || 1));
  if (plate.width !== width || plate.height !== height) {
    plate.width = width;
    plate.height = height;
  }
  const gctx = plate.getContext("2d");
  if (!gctx) {
    return;
  }
  if (!spec.frozen) {
    const erase = nodeGraphNumberReadoutBurnEraseAlpha(spec.trailHang, spec.ghostHang);
    if (erase > 0.00005) {
      gctx.save();
      gctx.globalCompositeOperation = "destination-out";
      gctx.fillStyle = `rgba(0, 0, 0, ${erase.toFixed(4)})`;
      gctx.fillRect(0, 0, width, height);
      gctx.restore();
    }
    const previousValueText = String(spec.previousValueText || "");
    const valueText = String(spec.valueText || "");
    if (
      spec.textChanged
      && previousValueText
      && previousValueText !== valueText
      && spec.digitFontSize > 0.25
    ) {
      const depositText = nodeGraphNumberReadoutGhostDepositText(previousValueText, valueText);
      if (depositText) {
        const rgb = Array.isArray(spec.ghostRgb) ? spec.ghostRgb : [80, 80, 80];
        nodeGraphNumberReadoutDrawDigits(gctx, {
          text: depositText,
          centerX: spec.digitX,
          centerY: spec.digitY,
          fontFamily: spec.digitFontFamily,
          fontSize: spec.digitFontSize,
          cellW: spec.cellW,
          rgb,
          alpha: 0.62,
          softBlurPx: 0,
          glow: 0,
          plate: false,
          composite: "source-over",
        });
      }
    }
  }
  context.drawImage(plate, 0, 0);
}

/**
 * Value LCD — vector DSEG redraw every frame.
 * Background + unlit “8” ghost + solid FG digits + glass. No phosphor hang.
 */
function drawNodeGraphValueLcdFace(canvas, context, screenElement, settings, valueText, unit, slot = null, options = null) {
  if (!canvas || !context) {
    return;
  }
  const now = performance.now?.() || Date.now();
  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  const bg = typeof nodeGraphNumberReadoutLcdBgCss === "function"
    ? nodeGraphNumberReadoutLcdBgCss(settings)
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
  const ghostRgb = nodeGraphNumberReadoutLcdGhostRgb(inkRgb, settings);
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

  // 8ve page: cents-accuracy stripes behind the note-name text.
  const pitchMode = options && options.pitchMode;
  const centsOff = options && options.cents;
  const centsBand = clampNodeSliderValue(Number(settings?.centsBand) || 0, 0, 1);
  if (slot?.type === "helmholtzPitch" && pitchMode === "name" && centsBand > 0.0005) {
    nodeGraphPitchDetectorDrawCentsBands(context, left, top, width, height, centsOff, centsBand);
  }

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
        composite: "source-over",
      });
    }

    // Live value — solid foreground ink. No phosphor hang plate.
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
  if (canvas._lcdGhostPlate) {
    const g = canvas._lcdGhostPlate.getContext("2d");
    g?.clearRect(0, 0, canvas._lcdGhostPlate.width, canvas._lcdGhostPlate.height);
  }
}


function drawNodeGraphNumberReadoutItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const slot = item?.slot;
  if (!rect || !slot) {
    return;
  }
  // Display-hide SSOT: skip paint when face is hidden (local or global Displays off).
  if (typeof nodeGraphModuleDisplayVisibleForUi === "function"
    && typeof nodeGraphPatchNode === "function"
    && slot.nodeId) {
    const hostNode = nodeGraphPatchNode(slot.nodeId);
    if (hostNode && !nodeGraphModuleDisplayVisibleForUi(hostNode.type, hostNode.ui)) {
      return;
    }
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
    screenSharp: false,
  })) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const hasSample = item?.buffer?.length > 0 && !item.buffer?.nodeGraphScopeXy;
  const unit = nodeGraphNumberReadoutUnitForSlot(slot);
  // Honor Display Settings → Digits + Decimals (Pitch Detector Frequency LED too).
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings.decimals);
  const digits = nodeGraphNumberReadoutSafeDigits(settings.digits);
  const formatOptions = {
    digits,
    removeTrailingZeros: Boolean(settings.removeTrailingZeros),
    reserveSignSpace: String(settings.polarity || "bipolar") !== "unipolar",
    // Value LCD: settle on decimals+1 before visible budget (sign stability).
    ...(isLcd ? { guardExtraPlace: true } : null),
  };
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
        { digits },
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
        (() => {
          const raw = nodeGraphOscilloscopeLatestSample(item.buffer, 0);
          return String(settings.polarity || "bipolar") === "unipolar" ? Math.abs(Number(raw) || 0) : raw;
        })(),
        decimals,
        formatOptions,
      )
      : (decimals > 0 ? ` !.${"!".repeat(decimals)}` : " !");
    if (nodeGraphNumberReadoutUsesDigitBins(settings)) {
      liveValueText = nodeGraphNumberReadoutPadValueToBins(
        liveValueText,
        digits,
        decimals,
        formatOptions,
      );
    }
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
  const pitchHz = slot?.type === "helmholtzPitch" && hasSample
    ? nodeGraphOscilloscopeLatestSample(item.buffer, 0)
    : Number.NaN;
  const pitchCents = pitchNameMode && typeof nodeGraphFrequencyToCentsOff === "function"
    ? nodeGraphFrequencyToCentsOff(pitchHz)
    : Number.NaN;
  const text = `${valueText}${unit ? ` ${unit}` : ""}${pitchMode !== "hz" ? `|${pitchMode}` : ""}|¢${
    Number.isFinite(pitchCents) ? pitchCents.toFixed(1) : ""
  }`;
  // Value LCD: vector DSEG. Ghost/Trail still need a hang tick every frame
  // (previous digits fade). Skipping when text is unchanged froze ghosts.
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
    drawNodeGraphValueLcdFace(canvas, context, screenElement, settings, valueText, unit, slot, {
      pitchMode,
      cents: pitchCents,
      frozen,
    });
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
  //    Ghost/Trail only set hang.
  //    MUST deposit when the reading is fully removed (empty / no-lock dash /
  //    threshold drop) — not only digit-to-digit edits. Without that, Pitch
  //    in/out of lock blinks live ink with no residual stamp.
  //    Geometry: prefer the last live layout snapshot so ghost matches the
  //    LED pixels 1:1 (recomputing pad/fit can be 1px larger).
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
    && burnPlate.width > 0
    && depositBright > 0.005
  ) {
    // Empty / dash / skeleton current → deposit the whole previous reading.
    // GhostDepositText already returns prev when curr is empty or width shifts.
    const depositText = nodeGraphNumberReadoutGhostDepositText(
      previousValueText,
      // Treat no-lock / empty targets as full removal for deposit purposes.
      nodeGraphNumberReadoutIsEmptyPlaceholder(valueText) ? "" : valueText,
    );
    if (depositText) {
      const snap = canvas._numberReadoutLastDigitLayout;
      const snapOk = snap
        && snap.width === width
        && snap.height === height
        && Number(snap.fontSize) > 0.25
        && Number(snap.cellW) > 0;
      burnCtx.setTransform(1, 0, 0, 1, 0, 0);
      burnCtx.save();
      burnCtx.globalCompositeOperation = "source-over";
      // White energy at alpha = depositBright (Bright × Burn Amount, capped at 1).
      if (snapOk && snap.pixelPin) {
        nodeGraphNumberReadoutDrawPixelPin(
          burnCtx,
          {
            pixelPin: true,
            pinPx: snap.pinPx || snap.cellW,
          },
          left,
          top,
          width,
          height,
          [255, 255, 255],
          depositBright,
        );
      } else if (snapOk) {
        // Pixel-match the previous live LED draw (same font/cell/center).
        nodeGraphNumberReadoutDrawDigits(burnCtx, {
          text: depositText,
          centerX: snap.digitX,
          centerY: snap.digitY,
          fontFamily: snap.fontFamily || digitFontFamily,
          fontSize: snap.fontSize,
          cellW: snap.cellW,
          rgb: [255, 255, 255],
          alpha: depositBright,
          softBlurPx: 0,
          glow: 0,
          plate: false,
          energy: true,
        });
      } else {
        // Cold first change: recompute with the same pad policy as live (no forced inset).
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
            monoProbe: pitchNameMode,
          },
        );
        const residualPad = residualLayout.padPx || 0;
        const residualPadY = residualLayout.padPxY != null ? residualLayout.padPxY : residualPad;
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
    // Hard-clear plate crumbs when residual energy is gone (Trail 0 wipes).
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
  // Room dimmer punches the canvas (not only the face). Always set both —
  // stop wipe used to leave canvas at strength 0 and veil painted digits.
  const punch = Math.max(0.001, Number(bright) || 0).toFixed(3);
  if (canvas?.dataset) {
    canvas.dataset.lightSource = "screen";
    canvas.dataset.lightStrength = punch;
  }
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.lightSource = "screen";
    canvas.parentElement.dataset.lightStrength = punch;
    canvas.parentElement.dataset.valueFaceStyle = "led";
  }
  if (screenElement?.dataset) {
    screenElement.dataset.lightSource = "screen";
    screenElement.dataset.lightStrength = punch;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const largeUnit = hasUnit && String(unit || "").trim().toLowerCase() === "hz";
  // User Padding 0 = flush to plate walls (no forced pitch/LCD inset).
  const pad01 = nodeGraphNumberReadoutFacePadding01(settings);
  // GROW off → LayoutFitText returns fixed Digits+Decimals bins; GROW on → live width.
  // Pitch name (M): always fit live compact name (no DSEG digit budget for letters).
  let liveFitText = nodeGraphNumberReadoutLayoutFitText(slot, valueText, decimals, settings);
  if (pitchNameMode) {
    liveFitText = String(valueText || "C#3");
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
      padding01: pad01,
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
  // Snapshot for next-frame residual deposit (must match these live pixels).
  canvas._numberReadoutLastDigitLayout = {
    width,
    height,
    digitX,
    digitY,
    fontSize: digitFontSize,
    cellW,
    fontFamily: digitFontFamily,
    padPx,
    padPxY,
    contentW: layout.contentW,
    digitAreaH: digitAreaHeight,
    pixelPin: Boolean(layout.pixelPin),
    pinPx: layout.pinPx || cellW,
  };

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
      top + padPxY + digitAreaHeight + labelHeight * 0.5,
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

