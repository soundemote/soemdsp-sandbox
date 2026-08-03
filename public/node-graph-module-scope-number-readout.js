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
  canvas._nodeGraphNumberReadoutText = null;
  canvas._nodeGraphNumberReadoutSettingsSig = null;
  canvas._nodeGraphNumberReadoutFontReady = null;
  canvas._nodeGraphNumberReadoutWidth = -1;
  canvas._nodeGraphNumberReadoutHeight = -1;
  canvas._nodeGraphNumberReadoutPaintAt = 0;
  canvas._numberReadoutEnergyMask = null;
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
  if (canvas._numberReadoutResidualPresent) {
    const rctx = canvas._numberReadoutResidualPresent.getContext?.("2d");
    rctx?.clearRect(
      0,
      0,
      canvas._numberReadoutResidualPresent.width || 0,
      canvas._numberReadoutResidualPresent.height || 0,
    );
  }
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
  const decimals = nodeGraphNumberReadoutSafeDecimals(settings.decimals);
  const valueText = decimals > 0 ? ` !.${"!".repeat(decimals)}` : " !";
  const plateRgb = nodeGraphNumberReadoutGhostPlateRgb(settings);
  const bg = nodeGraphFacePlateBackground(settings);
  if (screenElement.dataset) {
    // Full hole when the LCD plate is present (0…1 dimmer is the only gain).
    screenElement.dataset.lightStrength = "1";
  }
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const width = canvas.width;
  const height = canvas.height;
  const digitFontFamily = nodeGraphNumberReadoutDsegReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  context.setTransform(1, 0, 0, 1, 0, 0);
  const layout = nodeGraphNumberReadoutComputeLayout(
    context,
    valueText,
    digitFontFamily,
    width,
    height,
    false,
  );
  context.clearRect(0, 0, width, height);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);
  // Unlit plate = ghostColor as chosen (no separate ghost-amount dim).
  nodeGraphNumberReadoutDrawDigits(context, {
    text: valueText,
    centerX: width * 0.5,
    centerY: layout.digitAreaH * 0.5,
    fontFamily: digitFontFamily,
    fontSize: layout.fontSize,
    cellW: layout.cellW,
    rgb: plateRgb,
    alpha: 1,
    softBlurPx: 0,
    plate: true,
  });
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
    settings.color,
    settings.trail,
    settings.decimals,
    settings.ghostColor,
    stopsSig,
  ].join("|");
}


function nodeGraphNumberReadoutGhostPlateRgb(settings) {
  const hex = settings?.ghostColor
    || nodeGraphNumberReadoutSettingsDefaults.ghostColor
    || "#1a4a55";
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    // Reuse hex→rgb via a degenerate one-stop sample.
    return nodeGraphSampleGradientStopsRgb(
      [{ t: 0, color: hex }, { t: 1, color: hex }],
      0,
      hex,
    );
  }
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [26, 74, 85];
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
}) {
  const raw = String(text || "");
  const ink = energy ? [255, 255, 255] : rgb;
  context.save();
  // Identity geometry in canvas pixels — never scaleX ≠ scaleY for glyphs.
  context.setTransform(1, 0, 0, 1, 0, 0);
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
  // Decay UI = residual hold of previous number (0 = none, 1 = longest).
  const trail = clampNodeSliderValue(Number(settings.trail ?? settings.decay) || 0, 0, 1);
  const settingsSig = nodeGraphNumberReadoutSettingsSignature(settings);
  const styleChanged =
    canvas._nodeGraphNumberReadoutSettingsSig !== settingsSig ||
    canvas._nodeGraphNumberReadoutFontReady !== nodeGraphNumberReadoutDsegReady ||
    canvas._nodeGraphNumberReadoutWidth !== canvas.width ||
    canvas._nodeGraphNumberReadoutHeight !== canvas.height;
  // null cache (engine-stop wipe) always forces a full present.
  const textChanged = canvas._nodeGraphNumberReadoutText == null
    || canvas._nodeGraphNumberReadoutText !== text;
  // Ghost residual only when decay > 0; static live digit is never energy-charged.
  const frozen = nodeGraphModuleScopePhosphorFrozen();
  const energyActive = trail > 0.001;
  const needsContinuous = !frozen && energyActive;
  if (!textChanged && !styleChanged && !needsContinuous) {
    return;
  }
  const now = performance.now?.() || Date.now();

  // Draw in full canvas buffer pixels (layout face × dpr — fixed under zoom).
  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  // Live digits = gradient sample at Bright energy (0…1). Unlit = ghostColor.
  const gradientStops = settings.gradientStops;
  const peakHex = settings.color || "#75ebff";
  const bright = Number.isFinite(Number(settings.brightness))
    ? clampNodeSliderValue(Number(settings.brightness), 0, 1)
    : 1;
  // Energy→color LUT: Bright 1 = tip stop (full white if gradient ends white).
  const rgb = nodeGraphSampleGradientStopsRgb(gradientStops, bright, peakHex);
  const plateRgb = nodeGraphNumberReadoutGhostPlateRgb(settings);
  const bg = nodeGraphFacePlateBackground(settings);
  // Opaque glyph ink; brightness is encoded in the gradient sample, not alpha/2.
  const alpha = bright > 0.001 ? 1 : 0;
  // Room-light: full hole while the readout face is painted (dimmer = only gain).
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.lightStrength = "1";
  }
  const digitFontFamily = nodeGraphNumberReadoutDsegReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const hasUnit = Boolean(unit);
  // Natural DSEG metrics — face only letterboxes; never skews glyphs to fill it.
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

  // ── Ghost of previous number only (decay = hold length) ──
  // Live reading is hard DSEG only. On change, stamp only *changed* previous
  // cells into residual (static digits never charged). Decay = ghost hold.
  const energyGl = energyActive ? nodeGraphNumberReadoutEnergyGl(canvas) : null;
  let maskCanvas = null;
  let depositGain = 0;
  const previousValueText = String(canvas._numberReadoutLastValueText || "");
  const shouldDeposit = energyActive
    && !frozen
    && textChanged
    && Boolean(previousValueText)
    && previousValueText !== valueText;
  if (shouldDeposit) {
    const ghostText = nodeGraphNumberReadoutGhostDepositText(previousValueText, valueText);
    if (ghostText) {
      maskCanvas = nodeGraphNumberReadoutEnergyMaskCanvas(canvas);
      if (maskCanvas) {
        const mctx = maskCanvas.getContext("2d");
        if (mctx) {
          mctx.setTransform(1, 0, 0, 1, 0, 0);
          mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
          // Use previous layout metrics so outgoing glyphs sit where they were.
          const prevLayout = nodeGraphNumberReadoutComputeLayout(
            mctx,
            previousValueText,
            digitFontFamily,
            width,
            height,
            hasUnit,
          );
          mctx.save();
          mctx.globalCompositeOperation = "source-over";
          // Only changed cells (others are "!" / space) — no full-string XOR,
          // which left anti-aliased energy under static "0"s.
          nodeGraphNumberReadoutDrawDigits(mctx, {
            text: ghostText,
            centerX: left + width * 0.5,
            centerY: top + prevLayout.digitAreaH * 0.5,
            fontFamily: digitFontFamily,
            fontSize: prevLayout.fontSize,
            cellW: prevLayout.cellW,
            rgb: [255, 255, 255],
            alpha: 1,
            softBlurPx: 0,
            energy: true,
            plate: false,
          });
          mctx.restore();
          // Deposit energy = Bright (0…1). Lifetime is trail hold only.
          depositGain = bright > 0.001 ? bright : 0;
        }
      }
    }
    canvas._numberReadoutLastTextChangeAt = now;
  }
  if (energyGl && typeof nodeGraphPhosphorEnergyGlStep === "function") {
    // Full multi-stop energy→color LUT (not peak-only greyscale ramp).
    nodeGraphPhosphorApplyGradientLut(energyGl, settings, peakHex);
    if (!frozen) {
      // Trail high = long digit residual (same polarity as phosphor Trail).
      nodeGraphPhosphorEnergyGlStep(energyGl, {
        trail,
        ghost: 0,
        depositGain: maskCanvas && depositGain > 0.001 ? depositGain : 0,
        maskCanvas: maskCanvas && depositGain > 0.001 ? maskCanvas : null,
        bleed: 0,
      });
    }
  } else if (!energyActive) {
    canvas._numberReadoutLastTextChangeAt = 0;
  }
  canvas._numberReadoutLastValueText = valueText;

  // ── Present ──
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // Unlit LCD segments: ghostColor as chosen (dim/bright is the color itself).
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
    plate: true,
  });

  // Ghost residual, punched free of live glyph pixels every frame so static
  // digits stay clean even if older energy still sits under them.
  if (energyGl && energyActive && typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    const presented = nodeGraphPhosphorEnergyGlPresent(energyGl, 0.95);
    if (presented !== false) {
      const residualLayer = nodeGraphPhosphorEnergyEnsureCanvas(
        canvas,
        "_numberReadoutResidualPresent",
        width,
        height,
      );
      if (residualLayer) {
        const rctx = residualLayer.getContext("2d");
        if (rctx) {
          rctx.setTransform(1, 0, 0, 1, 0, 0);
          rctx.clearRect(0, 0, width, height);
          rctx.globalCompositeOperation = "source-over";
          rctx.imageSmoothingEnabled = false;
          rctx.drawImage(energyGl.canvas, 0, 0, width, height);
          // Carve live digits out of residual (slight soft expand eats AA skirts).
          rctx.globalCompositeOperation = "destination-out";
          const punchExpandPx = Math.max(1.25, digitFontSize * 0.045);
          nodeGraphNumberReadoutDrawDigits(rctx, {
            text: valueText,
            centerX: digitX,
            centerY: digitY,
            fontFamily: digitFontFamily,
            fontSize: digitFontSize,
            cellW,
            rgb: [255, 255, 255],
            alpha: 1,
            softBlurPx: punchExpandPx,
            energy: true,
            plate: false,
          });
          rctx.globalCompositeOperation = "source-over";
          context.save();
          context.globalCompositeOperation = "lighter";
          context.imageSmoothingEnabled = false;
          context.globalAlpha = Math.min(1, 0.4 + trail * 0.45);
          context.drawImage(residualLayer, 0, 0, width, height);
          context.globalAlpha = 1;
          context.restore();
        }
      } else {
        context.save();
        context.globalCompositeOperation = "lighter";
        context.imageSmoothingEnabled = false;
        context.globalAlpha = Math.min(1, 0.4 + trail * 0.45);
        context.drawImage(energyGl.canvas, 0, 0, width, height);
        context.globalAlpha = 1;
        context.restore();
      }
    }
  }

  // Live value — hard/crisp on plate (never energy-charged). Opaque enough that
  // any residual fringe left outside the punch cannot tint the digit core.
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
  });

  if (hasUnit) {
    const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, width * 0.14, digitFontSize * 0.35));
    context.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(alpha * 0.55).toFixed(4)})`;
    context.fillText(unit, left + width * 0.5, top + digitAreaHeight + labelHeight * 0.5);
  }

  context.restore();

  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = settingsSig;
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = canvas.width;
  canvas._nodeGraphNumberReadoutHeight = canvas.height;
  canvas._nodeGraphNumberReadoutPaintAt = now;
}

