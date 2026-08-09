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
  canvas._numberReadoutResidualText = "";
  canvas._numberReadoutResidualBornAt = 0;
  canvas._numberReadoutResidualBornEnergy = 0;
  canvas._numberReadoutResidualEnergy = 0;
  // Multi-entry residual history (fast ramps leave a trail of previous readings).
  canvas._numberReadoutResiduals = [];
  canvas._nodeGraphNumberReadoutText = null;
  canvas._nodeGraphNumberReadoutSettingsSig = null;
  canvas._nodeGraphNumberReadoutFontReady = null;
  canvas._nodeGraphNumberReadoutWidth = -1;
  canvas._nodeGraphNumberReadoutHeight = -1;
  canvas._nodeGraphNumberReadoutPaintAt = 0;
  // Tear down any legacy residual layer / energy path (no burn plate anymore).
  canvas._numberReadoutEnergyMask = null;
  if (canvas._numberReadoutResidualLayer) {
    const layer = canvas._numberReadoutResidualLayer;
    const rctx = layer.getContext?.("2d");
    rctx?.clearRect?.(0, 0, layer.width || 0, layer.height || 0);
    canvas._numberReadoutResidualLayer = null;
  }
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

/**
 * Max previous readings kept as gradient ghosts (AA-safe multi-draw, no burn plate).
 * Each living entry costs one layout + ~N fillText glyphs per frame while residual
 * is active — keep this modest (8 is enough trail; 28 was overkill).
 */
const nodeGraphNumberReadoutResidualHistoryMax = 8;

/**
 * Trail → residual deposit brightness when the live reading changes (0…1).
 * High Trail = stronger ghost energy deposit.
 * Bright scales the deposit so dim live digits leave a dimmer ghost (same energy scale).
 */
function nodeGraphNumberReadoutResidualDepositEnergy(trail, ghost, bright = 1) {
  const t = clampNodeSliderValue(Number(trail) || 0, 0, 1);
  const g = clampNodeSliderValue(Number(ghost) || 0, 0, 1);
  const b = clampNodeSliderValue(Number(bright) || 0, 0, 1);
  // Trail is the deposit shape; Ghost adds a little scorch; Bright is overall scale.
  // Keep a solid floor at high Trail so small digit steps still leave a readable mark.
  const base = 0.18 + t * 0.72 + g * 0.1;
  return clampNodeSliderValue(base * b, 0, 1);
}

/**
 * Residual energy after ageMs (no pixel burn — scalar only).
 * Ghost = hang of deposited energy; Trail also stretches hang a little.
 * energy drives gradient sample for the ghost digits.
 */
function nodeGraphNumberReadoutResidualEnergyNow(bornEnergy, ageMs, trail, ghost) {
  const e0 = clampNodeSliderValue(Number(bornEnergy) || 0, 0, 1);
  if (e0 <= 0.001) {
    return 0;
  }
  const t = clampNodeSliderValue(Number(trail) || 0, 0, 1);
  const g = clampNodeSliderValue(Number(ghost) || 0, 0, 1);
  // Hang: Ghost is the long scorch; Trail adds hang with the deposit path.
  const lifeMs = 120 + g * 4200 + t * 2200;
  const age = Math.max(0, Number(ageMs) || 0);
  const life = Math.max(0, Math.min(1, 1 - age / lifeMs));
  return e0 * life;
}

function nodeGraphNumberReadoutResidualsList(canvas) {
  if (!canvas) {
    return [];
  }
  if (!Array.isArray(canvas._numberReadoutResiduals)) {
    canvas._numberReadoutResiduals = [];
  }
  return canvas._numberReadoutResiduals;
}

/**
 * Push a residual entry for a previous reading (history, not replace).
 * Fast ramps deposit many values; a single previous-only model hides them under live digits.
 */
function nodeGraphNumberReadoutPushResidual(canvas, valueText, deposit, now) {
  const list = nodeGraphNumberReadoutResidualsList(canvas);
  const text = String(valueText || "");
  if (!text || text.includes("!")) {
    return;
  }
  const energy = clampNodeSliderValue(Number(deposit) || 0, 0, 1);
  if (energy <= 0.01) {
    return;
  }
  // Same text already at the tip: boost energy (don't reset age so it still dies).
  const tip = list[list.length - 1];
  if (tip && tip.text === text) {
    tip.bornEnergy = Math.min(1, Math.max(Number(tip.bornEnergy) || 0, energy));
    return;
  }
  list.push({
    text,
    bornEnergy: energy,
    bornAt: Number(now) || (performance.now?.() || Date.now()),
  });
  while (list.length > nodeGraphNumberReadoutResidualHistoryMax) {
    list.shift();
  }
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
 * Ghost color from residual energy via gradient LUT (phosphor-style present).
 * energy 1 → tip stop; energy 0 → floor stop.
 */
function nodeGraphNumberReadoutGhostRgbFromEnergy(energy, gradientStops, peakHex) {
  const e = clampNodeSliderValue(Number(energy) || 0, 0, 1);
  if (typeof nodeGraphSampleGradientStopsRgb === "function") {
    return nodeGraphSampleGradientStopsRgb(gradientStops, e, peakHex || "#fcfdbf");
  }
  return [252, 253, 191];
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
    settings.color,
    settings.ghost,
    settings.trail,
    settings.decimals,
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
  // Explicit model:
  //  1) Value change → deposit residual energy (Trail × Bright) for the previous reading
  //     into a HISTORY list (not a single slot — fast ramps need many ghosts).
  //  2) Each entry’s energy (Ghost hang) samples the gradient for that ghost.
  //  3) Live digits = solid Light color × Bright (no gradient).
  //  4) One redraw per frame of each living ghost — no burn plate (preserves AA).
  const trail = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
    ? PhosphorResidual.migrateTrail(settings, 0.88, { invertLegacyDecay: false })
    : clampNodeSliderValue(Number(settings.trail ?? settings.decay) || 0, 0, 1);
  const ghost = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
    ? PhosphorResidual.migrateGhost(settings, 0.45)
    : clampNodeSliderValue(Number(settings.ghost ?? settings.burn) || 0, 0, 1);
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
  const residualWanted = trail > 0.001 || ghost > 0.001;
  const now = performance.now?.() || Date.now();
  const previousValueText = String(canvas._numberReadoutLastValueText || "");

  // Live light strength (solid color opacity / intensity) — also scales residual deposit.
  const bright = Number.isFinite(Number(settings.brightness))
    ? clampNodeSliderValue(Number(settings.brightness), 0, 1)
    : 1;

  // 1) On change: deposit into residual HISTORY (keep trail of previous readings).
  if (
    residualWanted
    && textChanged
    && previousValueText
    && previousValueText !== valueText
    && !previousValueText.includes("!")
  ) {
    nodeGraphNumberReadoutPushResidual(
      canvas,
      previousValueText,
      nodeGraphNumberReadoutResidualDepositEnergy(trail, ghost, bright),
      now,
    );
    canvas._numberReadoutLastTextChangeAt = now;
  } else if (!residualWanted) {
    canvas._numberReadoutResiduals = [];
  }

  // 2) Age residuals; drop dead entries. (No pixel burn — energy is scalar only.)
  const residualList = nodeGraphNumberReadoutResidualsList(canvas);
  const livingResiduals = [];
  if (residualWanted) {
    for (const entry of residualList) {
      if (!entry?.text) {
        continue;
      }
      const age = now - (Number(entry.bornAt) || now);
      const energy = frozen
        ? clampNodeSliderValue(Number(entry.bornEnergy) || 0, 0, 1)
        : nodeGraphNumberReadoutResidualEnergyNow(
          entry.bornEnergy,
          age,
          trail,
          ghost,
        );
      if (energy > 0.012) {
        livingResiduals.push({ text: entry.text, energy, bornAt: entry.bornAt, bornEnergy: entry.bornEnergy });
      }
    }
  }
  // Keep only living entries on the canvas list (preserve bornAt/bornEnergy).
  canvas._numberReadoutResiduals = livingResiduals.map((r) => ({
    text: r.text,
    bornEnergy: r.bornEnergy,
    bornAt: r.bornAt,
  }));

  const residualActive = livingResiduals.length > 0;
  const needsContinuous = !frozen && residualActive;
  if (!textChanged && !styleChanged && !needsContinuous) {
    return;
  }

  // Draw in full canvas buffer pixels (layout face × dpr — fixed under zoom).
  const left = 0;
  const top = 0;
  const width = canvas.width;
  const height = canvas.height;
  const gradientStops = settings.gradientStops;
  const peakHex = Array.isArray(gradientStops) && gradientStops.length
    ? (gradientStops[gradientStops.length - 1]?.color || settings.color || "#fcfdbf")
    : (settings.color || "#fcfdbf");
  // Live = solid light color (not gradient).
  const rgb = nodeGraphNumberReadoutLightRgb(settings);
  const bg = nodeGraphFacePlateBackground(settings);
  // Bright = live digit alpha (0…1). Dim Bright → dim light and dimmer deposits.
  const alpha = bright;
  if (canvas?.parentElement?.dataset) {
    canvas.parentElement.dataset.lightStrength = bright.toFixed(3);
  }
  const digitFontFamily = nodeGraphNumberReadoutDsegReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const hasUnit = Boolean(unit);

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

  // ── Present (clear every frame — no residual pixel compounding) ──
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = bg;
  context.fillRect(left, top, width, height);

  // Ghosts under live digits: oldest first, each gradient-colored by its energy.
  // Live digits cover overlapping segments; differing segments stay visible as trail.
  if (residualActive) {
    for (const entry of livingResiduals) {
      const residualRgb = nodeGraphNumberReadoutGhostRgbFromEnergy(
        entry.energy,
        gradientStops,
        peakHex,
      );
      const residualAlpha = clampNodeSliderValue(0.28 + entry.energy * 0.72, 0, 1);
      const residualLayout = nodeGraphNumberReadoutComputeLayout(
        context,
        entry.text,
        digitFontFamily,
        width,
        height,
        hasUnit,
      );
      nodeGraphNumberReadoutDrawDigits(context, {
        text: entry.text,
        centerX: left + width * 0.5,
        centerY: top + residualLayout.digitAreaH * 0.5,
        fontFamily: digitFontFamily,
        fontSize: residualLayout.fontSize,
        cellW: residualLayout.cellW,
        rgb: residualRgb,
        alpha: residualAlpha,
        softBlurPx: 0,
        glow: 0,
        plate: false,
      });
    }
  }

  // Live value — solid light color on top (covers ghost where digits overlap).
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

  canvas._numberReadoutLastValueText = valueText;
  canvas._nodeGraphNumberReadoutText = text;
  canvas._nodeGraphNumberReadoutSettingsSig = settingsSig;
  canvas._nodeGraphNumberReadoutFontReady = nodeGraphNumberReadoutDsegReady;
  canvas._nodeGraphNumberReadoutWidth = canvas.width;
  canvas._nodeGraphNumberReadoutHeight = canvas.height;
  canvas._nodeGraphNumberReadoutPaintAt = now;
}

