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
 * Offscreen burn plate for residual digits (pixel burn, not tracked history).
 * Stamps only on value change; fades each frame with super-exponential Residual hang.
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
  if (layer.width !== w || layer.height !== h) {
    layer.width = w;
    layer.height = h;
    canvas._numberReadoutResidualEnergy = 0;
  }
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
 * Residual 0…1 high = long hang → erase falls super-exponentially.
 * Residual 0 = wipe deposits immediately (Ghost Bright 8-floor still shows).
 */
function nodeGraphNumberReadoutBurnEraseAlpha(residualHang) {
  const h = clampNodeSliderValue(Number(residualHang) || 0, 0, 1);
  if (h <= 0.001) {
    return 1;
  }
  // Super-exponential: hang near 1 → erase near floor; hang 0 → dies fast.
  const erase = Math.exp(-9 * h) * 0.52;
  return clampNodeSliderValue(erase, 0.0015, 0.55);
}

/** Solid live-digit light RGB from settings.color (not the residual gradient). */
function nodeGraphNumberReadoutLightRgb(settings) {
  const hex = settings?.color
    || nodeGraphNumberReadoutSettingsDefaults?.color
    || "#fcfdbf";
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    return nodeGraphSampleGradientStopsRgb(
      [{ t: 0, color: hex }, { t: 1, color: hex }],
      1,
      hex,
    );
  }
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [252, 253, 191];
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
  // Drop residual energy + force next live draw to repaint fully.
  invalidateNodeGraphNumberReadoutPaintCache(canvas);
  const pixelRatio = Number(nodeGraphModuleScopeState?.backingPixelRatio)
    || Math.max(1, window.devicePixelRatio || 1);
  if (!syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio)) {
    return false;
  }
  const context = canvas.getContext("2d");
  if (!context || !(canvas.width > 0) || !(canvas.height > 0)) {
    return false;
  }
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const bg = nodeGraphFacePlateBackground(settings);
  if (screenElement.dataset) {
    // Full hole when the LCD plate is present (0…1 dimmer is the only gain).
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
  for (const face of document.querySelectorAll(".node-number-readout-face, .dsp-node.number-readout-layout .node-module-scope-window")) {
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


function syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  // Fixed layout pixel grid (clientWidth × dpr). Do NOT use getBoundingClientRect
  // — that is screen-space and grows with workspace zoom (FPS death on energy
  // FBOs). CSS width/height:100% rides the zoom transform; pixelated-canvas-zoom
  // keeps the grid crisp. Never set style.width from a screen rect.
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return false;
  }
  const { width, height } = size;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    // Soft deposit mask is one-frame only. Energy residual survives real face
    // resizes via nodeGraphPhosphorEnergyGlEnsure resize+copy.
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


function nodeGraphNumberReadoutFormatValue(sample, decimals) {
  const value = Number(sample);
  if (!Number.isFinite(value)) {
    return "--";
  }
  const places = nodeGraphNumberReadoutSafeDecimals(decimals);
  let fixed;
  try {
    fixed = value.toFixed(places);
  } catch {
    fixed = value.toFixed(2);
  }
  // Reserve a sign column so width stays stable across zero (DSEG space =
  // colon advance — keshikan/DSEG usage notes).
  return fixed.startsWith("-") ? fixed : ` ${fixed}`;
}


function nodeGraphNumberReadoutDsegWidthChars(text) {
  return Math.max(1, String(text || "").replace(/\./g, "").length);
}


function nodeGraphNumberReadoutGhostPlateText(valueText) {
  return String(valueText || "").replace(/[0-9!]/g, "8");
}


function nodeGraphNumberReadoutUnitForSlot(slot) {
  const connection = nodeGraphModuleScopeConnectionsTo(slot?.nodeId, "In")
    .find((candidate) => candidate?.sourceNode && candidate?.sourcePort);
  if (!connection) {
    return "";
  }
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
    settings.background,
    settings.brightness,
    settings.ghostBrightness,
    settings.color,
    settings.residual,
    settings.decimals,
    settings.lightBlend,
    stopsSig,
  ].join("|");
}


function nodeGraphNumberReadoutComputeLayout(context, valueText, fontFamily, faceW, faceH, hasUnit) {
  const labelH = hasUnit ? Math.max(0, faceH * 0.18) : 0;
  const digitAreaH = Math.max(1, faceH - labelH);
  // Designed em height — original DSEG proportions, not stretched to width.
  let fontSize = Math.max(1, digitAreaH * 0.78);
  context.font = `700 ${fontSize}px ${fontFamily}`;
  let cellW = Math.max(1, context.measureText("8").width);
  const cells = nodeGraphNumberReadoutDsegWidthChars(valueText);
  let totalW = cells * cellW;
  const maxW = Math.max(1, faceW * 0.94);
  if (totalW > maxW) {
    const scale = maxW / totalW;
    fontSize = Math.max(1, fontSize * scale);
    context.font = `700 ${fontSize}px ${fontFamily}`;
    cellW = Math.max(1, context.measureText("8").width);
    totalW = cells * cellW;
  }
  return {
    cellW,
    cells,
    digitAreaH,
    fontSize,
    labelH,
    totalW,
  };
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


function drawNodeGraphNumberReadoutItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  const slot = item?.slot;
  if (!rect || !slot) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, item.buffer);
  const screenElement = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphNumberReadoutCanvasForSlot(slot);
  if (!canvas || !syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const settings = nodeGraphNumberReadoutSettingsForNode(node);
  const hasSample = item?.buffer?.length > 0 && !item.buffer?.nodeGraphScopeXy;
  const unit = nodeGraphNumberReadoutUnitForSlot(slot);
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings.decimals);
  // No input: DSEG all-off ("!") placeholders.
  // https://github.com/keshikan/DSEG#usage
  const valueText = hasSample
    ? nodeGraphNumberReadoutFormatValue(nodeGraphOscilloscopeLatestSample(item.buffer, 0), decimals)
    : (decimals > 0 ? ` !.${"!".repeat(decimals)}` : " !");
  const text = unit ? `${valueText} ${unit}` : valueText;
  // Explicit energy model (brightness = gradient position):
  //  • Ghost Bright G → constant "8" skeleton at energy G → color gradient(G).
  //  • Bright B → live light strength; on change, deposit previous digits at energy B.
  //  • Residual R → hang of deposits only (super-exp fade toward 0 on top of the 8 floor).
  //  • Example: R=0, G=0.2 → only 8-ghost at gradient(0.2). R high, 4→3 → stamp "4"
  //    at energy B decaying over the 8 floor.
  //  • Live digits = solid Light color × Bright (no gradient).
  const residualHang = clampNodeSliderValue(
    Number(settings.residual) || 0,
    0,
    1,
  );
  const settingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
  const styleChanged =
    canvas._nodeGraphNumberReadoutSettingsSig !== settingsSig ||
    canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady ||
    canvas._nodeGraphNumberReadoutWidth !== canvas.width ||
    canvas._nodeGraphNumberReadoutHeight !== canvas.height;
  // null cache (engine-stop wipe) always forces a full present.
  const textChanged = canvas._nodeGraphNumberReadoutText == null
    || canvas._nodeGraphNumberReadoutText !== text;
  const frozen = nodeGraphModuleScopePhosphorFrozen();
  const now = performance.now?.() || Date.now();
  const previousValueText = String(canvas._numberReadoutLastValueText || "");

  // Bright B = deposit energy + live intensity (gradient position for deposits).
  const bright = Number.isFinite(Number(settings.brightness))
    ? clampNodeSliderValue(Number(settings.brightness), 0, 1)
    : 1;
  // Ghost Bright G = constant 8-skeleton energy (gradient position for the floor).
  const ghostBright = Number.isFinite(Number(settings.ghostBrightness))
    ? clampNodeSliderValue(Number(settings.ghostBrightness), 0, 1)
    : 0.2;
  const ghostFloorOn = ghostBright > 0.001;
  // Residual hang only governs deposit persistence (not the 8 floor).
  const hangOn = residualHang > 0.001;

  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
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
  const digitFontFamily = nodeGraphNumberReadoutDsegReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const hasUnit = Boolean(unit);

  // Size change: burn plate geometry is stale.
  if (
    styleChanged
    && (
      canvas._nodeGraphNumberReadoutWidth !== canvas.width
      || canvas._nodeGraphNumberReadoutHeight !== canvas.height
      || canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady
    )
  ) {
    nodeGraphNumberReadoutClearBurnPlate(canvas);
  }
  if (!hangOn) {
    nodeGraphNumberReadoutClearBurnPlate(canvas);
  }

  const burnPlate = hangOn ? nodeGraphNumberReadoutEnsureBurnPlate(canvas) : null;
  const burnCtx = burnPlate?.getContext?.("2d") || null;

  // 1) Fade deposit plate (Residual hang). Energy scalar tracks Bright → 0.
  if (burnCtx && hangOn && !frozen && burnPlate.width > 0) {
    const erase = nodeGraphNumberReadoutBurnEraseAlpha(residualHang);
    burnCtx.setTransform(1, 0, 0, 1, 0, 0);
    burnCtx.save();
    burnCtx.globalCompositeOperation = "destination-out";
    burnCtx.fillStyle = `rgba(0, 0, 0, ${erase.toFixed(4)})`;
    burnCtx.fillRect(0, 0, burnPlate.width, burnPlate.height);
    burnCtx.restore();
    const prevE = Number(canvas._numberReadoutResidualEnergy) || 0;
    canvas._numberReadoutResidualEnergy = prevE * Math.max(0, 1 - erase);
  }

  // 2) On change: stamp ONLY digits that changed (per-cell deposit).
  //    GhostDepositText: unchanged cells → "!" (skip draw); changed → previous glyph.
  //    Layout uses previous full reading so columns stay aligned with the face.
  if (
    burnCtx
    && hangOn
    && textChanged
    && previousValueText
    && previousValueText !== valueText
    && !previousValueText.includes("!")
    && burnPlate.width > 0
    && bright > 0.01
  ) {
    const depositText = nodeGraphNumberReadoutGhostDepositText(
      previousValueText,
      valueText,
    );
    if (depositText) {
      // Layout from full previous string (same cell count/geometry as the face).
      const residualLayout = nodeGraphNumberReadoutComputeLayout(
        burnCtx,
        previousValueText,
        digitFontFamily,
        width,
        height,
        hasUnit,
      );
      burnCtx.setTransform(1, 0, 0, 1, 0, 0);
      burnCtx.save();
      burnCtx.globalCompositeOperation = "source-over";
      // White energy at alpha = Bright — only changed cells (drawDigits skips "!").
      nodeGraphNumberReadoutDrawDigits(burnCtx, {
        text: depositText,
        centerX: left + width * 0.5,
        centerY: top + residualLayout.digitAreaH * 0.5,
        fontFamily: digitFontFamily,
        fontSize: residualLayout.fontSize,
        cellW: residualLayout.cellW,
        rgb: [255, 255, 255],
        alpha: bright,
        softBlurPx: 0,
        glow: 0,
        plate: false,
        energy: true,
      });
      burnCtx.restore();
      // Deposit energy starts at Bright (not normalized life 1).
      canvas._numberReadoutResidualEnergy = Math.max(
        Number(canvas._numberReadoutResidualEnergy) || 0,
        bright,
      );
      canvas._numberReadoutLastTextChangeAt = now;
    }
  }

  const depositEnergy = Number(canvas._numberReadoutResidualEnergy) || 0;
  if (depositEnergy <= 0.008) {
    canvas._numberReadoutResidualEnergy = 0;
  }
  const depositActive = hangOn && depositEnergy > 0.008;
  // Ghost floor and/or hanging deposits need continuous present.
  const needsContinuous = !frozen && (ghostFloorOn || depositActive);
  if (!textChanged && !styleChanged && !needsContinuous) {
    return;
  }

  // Live = solid light color (not gradient).
  const rgb = nodeGraphNumberReadoutLightRgb(settings);
  const bg = nodeGraphFacePlateBackground(settings);
  const alpha = bright;
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.lightStrength = bright.toFixed(3);
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const layout = nodeGraphNumberReadoutComputeLayout(
    context,
    valueText,
    digitFontFamily,
    width,
    height,
    hasUnit,
  );
  const digitFontSize = layout.fontSize;
  const cellW = layout.cellW;
  const labelHeight = layout.labelH;
  const digitAreaHeight = layout.digitAreaH;
  const digitX = left + width * 0.5;
  const digitY = top + digitAreaHeight * 0.5;

  // Energy → gradient color: G for 8-floor, depositEnergy for burned previous digits.
  const floorRgb = ghostFloorOn
    ? nodeGraphNumberReadoutGhostRgbFromEnergy(ghostBright, gradientStops, peakHex)
    : null;
  const depositRgb = depositActive
    ? nodeGraphNumberReadoutGhostRgbFromEnergy(depositEnergy, gradientStops, peakHex)
    : null;

  // ── Present ──
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // 1) Ghost Bright floor: all-on "8" skeleton at energy G → gradient(G).
  //    Constant minimum brightness under decaying digit deposits.
  if (ghostFloorOn && floorRgb && !valueText.includes("!")) {
    nodeGraphNumberReadoutDrawDigits(context, {
      text: valueText,
      centerX: digitX,
      centerY: digitY,
      fontFamily: digitFontFamily,
      fontSize: digitFontSize,
      cellW,
      rgb: floorRgb,
      alpha: 1,
      softBlurPx: 0,
      glow: 0,
      plate: true,
    });
  }

  // 2) Deposit plate: previous readings at energy Bright, decaying via Residual.
  //    Color = gradient(depositEnergy). Sits on top of the 8 floor.
  if (depositActive && burnPlate?.width > 0 && depositRgb) {
    nodeGraphNumberReadoutPresentBurnPlate(context, burnPlate, depositRgb, 1);
  }

  // 3) Live light over residual — blend mode from Display Settings (Light blend).
  //    occlude = plate underpaint then Over (no mix with ghost).
  //    others = canvas globalCompositeOperation of light over residual.
  if (alpha > 0.001 && !valueText.includes("!")) {
    const lightBlend = String(settings.lightBlend || "occlude").trim().toLowerCase() || "occlude";
    if (lightBlend === "occlude") {
      const plateRgb = (() => {
        const m = String(bg || "").match(/^#?([0-9a-f]{6})$/i);
        if (m) {
          const n = Number.parseInt(m[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return [0, 0, 4];
      })();
      // Occlusion layer: full-opacity plate ink under live segments.
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
      // Light over plate only (not residual).
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
      // Blend live Light×Bright directly with residual gradient below.
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

  if (hasUnit) {
    const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, width * 0.14, digitFontSize * 0.35));
    context.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(alpha * 0.55).toFixed(4)})`;
    context.fillText(unit, left + width * 0.5, top + digitAreaHeight + labelHeight * 0.5);
  }

  context.restore();

  canvas._numberReadoutLastValueText = valueText;
  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = settingsSig;
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = canvas.width;
  canvas._nodeGraphNumberReadoutHeight = canvas.height;
  canvas._nodeGraphNumberReadoutPaintAt = now;
}

