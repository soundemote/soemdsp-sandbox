// Display/settings normalizers extracted from node-graph-module-scopes.js
// (Phase D). Load after scope-defaults.js, before scopes.js.

/** Shared packing/checkbox truthiness for phosphor display settings (scope2d SSOT). */
function nodeGraphDisplaySettingsToggleIsOn(value) {
  return value === true
    || value === 1
    || value === "1"
    || value === "true"
    || value === "on";
}

/**
 * Plate hue + physically-plausible brightness (black → full hue @ 0.5 → white).
 * `background` / `backgroundColor` store a pure hue hex; amount is backgroundBrightness.
 */
function nodeGraphDisplaySettingsNormalizePlateLook(source = {}, defaults = {}) {
  const src = source && typeof source === "object" ? source : {};
  const defs = defaults && typeof defaults === "object" ? defaults : {};
  const fallbackHue = Number.isFinite(Number(defs.backgroundHue))
    ? Number(defs.backgroundHue)
    : 0;
  const fallbackBright = Number.isFinite(Number(defs.backgroundBrightness))
    ? Number(defs.backgroundBrightness)
    : 0;
  const rawHex = src.background ?? src.backgroundColor ?? defs.background;
  const hex = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(rawHex, defs.background || "#ff0000")
    : String(rawHex || "#ff0000");
  const mapped = typeof nodeGraphHueBrightnessFromHex === "function"
    ? nodeGraphHueBrightnessFromHex(hex, fallbackHue, fallbackBright)
    : { hue: fallbackHue, brightness: fallbackBright };
  const hueRaw = Number(src.backgroundHue);
  let hue;
  if (Number.isFinite(hueRaw)) {
    hue = Math.max(0, Math.min(360, hueRaw));
  } else if (
    src.backgroundBrightness == null
    && typeof hex === "string"
    && /^#000000$/i.test(hex)
  ) {
    hue = fallbackHue;
  } else {
    hue = mapped.hue;
  }
  let brightness;
  if (src.backgroundBrightness != null) {
    brightness = normalizeNodeGraphTraceDisplayNumber(
      src.backgroundBrightness,
      fallbackBright,
      0,
      1,
    );
  } else if (src.background == null && src.backgroundColor == null) {
    // Hue hex is storage, not a painted plate. Missing amount → default 0 (black).
    brightness = fallbackBright;
  } else if (typeof hex === "string" && /^#00000[0-9a-f]$/i.test(hex)) {
    brightness = 0;
  } else {
    brightness = mapped.brightness;
  }
  const hueHex = typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(hue)
    : hex;
  return {
    backgroundHue: hue,
    backgroundBrightness: brightness,
    background: hueHex,
    backgroundColor: hueHex,
  };
}

/**
 * App-wide phosphor residual axes (Ghost / Trail / Burn / Burn Amount).
 * residualSchema ≥ 2: burn is sticky floor (default 0). Legacy burn≡ghost → Burn off.
 * residualSchema ≥ 3: burnAmount multiplies Bright for residual deposits (default 1).
 * decay remains a legacy mirror of 1 − trail only.
 *
 * @param {object} source
 * @param {object} defaults
 * @returns {{ ghost: number, trail: number, burn: number, burnAmount: number, decay: number, residualSchema: number }}
 */
function normalizeNodeGraphPhosphorResidualAxes(source = {}, defaults = {}) {
  const src = source && typeof source === "object" ? source : {};
  const defaultTrail = Number.isFinite(Number(defaults.trail))
    ? Number(defaults.trail)
    : (Number.isFinite(Number(defaults.decay)) ? 1 - Number(defaults.decay) : 0.88);
  const defaultGhost = Number.isFinite(Number(defaults.ghost))
    ? Number(defaults.ghost)
    : 0.45;
  const defaultBurn = Number.isFinite(Number(defaults.burn))
    && Number(defaults.residualSchema) >= 2
    ? Number(defaults.burn)
    : 0;
  const defaultBurnAmount = Number.isFinite(Number(defaults.burnAmount))
    ? Number(defaults.burnAmount)
    : 1;
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trail = Residual && typeof Residual.migrateTrail === "function"
    ? Residual.migrateTrail(src, defaultTrail)
    : normalizeNodeGraphTraceDisplayNumber(
      src.trail != null
        ? src.trail
        : (Number.isFinite(Number(src.decay)) ? 1 - Number(src.decay) : defaultTrail),
      defaultTrail,
      0,
      1,
    );
  const ghost = Residual && typeof Residual.migrateGhost === "function"
    ? Residual.migrateGhost(src, defaultGhost)
    : normalizeNodeGraphTraceDisplayNumber(
      src.ghost != null ? src.ghost : (
        // Pre-schema only: burn mirrored ghost.
        (Number(src.residualSchema) >= 2) ? defaultGhost : src.burn
      ),
      defaultGhost,
      0,
      1,
    );
  const burn = Residual && typeof Residual.migrateBurn === "function"
    ? Residual.migrateBurn(src, defaultBurn)
    : (
      Number(src.residualSchema) >= 2
        ? normalizeNodeGraphTraceDisplayNumber(src.burn, defaultBurn, 0, 1)
        : 0
    );
  const burnAmountMax = Residual?.BURN_AMOUNT_MAX || 4;
  const burnAmount = Residual && typeof Residual.migrateBurnAmount === "function"
    ? Residual.migrateBurnAmount(src, defaultBurnAmount)
    : normalizeNodeGraphTraceDisplayNumber(
      src.burnAmount ?? src.depositGain ?? src.burnGain,
      defaultBurnAmount,
      0,
      burnAmountMax,
    );
  const decay = normalizeNodeGraphTraceDisplayNumber(1 - trail, 0.12, 0, 1);
  const residualSchema = Residual?.RESIDUAL_SCHEMA || 3;
  return { ghost, trail, burn, burnAmount, decay, residualSchema };
}

function nodeGraphSpectrogramSnapFftSize(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return nodeGraphSpectrogramSettingsDefaults.fftSize;
  }
  // Legacy module choice index.
  if (raw >= 0 && raw <= 3 && Math.abs(raw - Math.round(raw)) < 1e-6) {
    return nodeGraphSpectrogramFftSizes[Math.round(raw)] || nodeGraphSpectrogramSettingsDefaults.fftSize;
  }
  let best = nodeGraphSpectrogramFftSizes[0];
  let bestDist = Math.abs(raw - best);
  for (const v of nodeGraphSpectrogramFftSizes) {
    const d = Math.abs(raw - v);
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}


function nodeGraphSpectrogramStepFftSize(value, direction) {
  const current = nodeGraphSpectrogramSnapFftSize(value);
  const idx = Math.max(0, nodeGraphSpectrogramFftSizes.indexOf(current));
  const next = idx + (direction < 0 ? -1 : 1);
  return nodeGraphSpectrogramFftSizes[Math.max(0, Math.min(nodeGraphSpectrogramFftSizes.length - 1, next))];
}


function nodeGraphSpectrogramFftSizeFromNode(node) {
  const fromSettings = node?.traceDisplaySettings?.fftSize;
  const fromParams = node?.params?.fftSize;
  return nodeGraphSpectrogramSnapFftSize(
    fromSettings ?? fromParams ?? nodeGraphSpectrogramSettingsDefaults.fftSize,
  );
}


function normalizeNodeGraphSharedGradientStops(raw, fallbackStops = null, options = {}) {
  if (typeof NodeGraphGradientSelector !== "undefined"
    && typeof NodeGraphGradientSelector.normalizeStops === "function") {
    return NodeGraphGradientSelector.normalizeStops(raw, {
      channels: options.channels || "color",
      fallbackStops,
      defaultStops: options.defaultStops,
    });
  }
  if (typeof normalizeSharedGradientStops === "function") {
    const normalized = normalizeSharedGradientStops(raw);
    if (Array.isArray(normalized) && normalized.length >= 2) {
      return normalized.map((s) => ({ t: s.t, color: s.color }));
    }
  }
  const list = Array.isArray(raw) ? raw : [];
  const fallback = Array.isArray(fallbackStops) && fallbackStops.length >= 2
    ? fallbackStops
    : (typeof PHOSPHOR_DEFAULT_GRADIENT_STOPS !== "undefined"
      ? PHOSPHOR_DEFAULT_GRADIENT_STOPS
      : nodeGraphSpectrogramSettingsDefaults.gradientStops);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const stop = list[i];
    if (!stop) continue;
    const fb = fallback[Math.min(i, fallback.length - 1)]?.color || "#ffffff";
    const hex = normalizeNodeGraphTraceDisplayColor(stop.color ?? stop.hex, fb);
    const t = Number.isFinite(Number(stop.t))
      ? clampNodeSliderValue(Number(stop.t), 0, 1)
      : (list.length <= 1 ? 0 : i / (list.length - 1));
    out.push({ t, color: hex });
  }
  if (out.length < 2) {
    return fallback.map((s) => ({ t: s.t, color: s.color }));
  }
  out.sort((a, b) => a.t - b.t);
  out[0].t = 0;
  out[out.length - 1].t = 1;
  return out;
}


function normalizeNodeGraphSpectrogramGradientStops(raw) {
  return normalizeNodeGraphSharedGradientStops(
    raw,
    nodeGraphSpectrogramSettingsDefaults.gradientStops,
  );
}


function nodeGraphPhosphorDefaultGradientStops(peakHex = "#75ebff", backgroundHex = "#000000") {
  if (typeof phosphorStopsFromPeak === "function") {
    return phosphorStopsFromPeak(peakHex, backgroundHex);
  }
  const peak = normalizeNodeGraphTraceDisplayColor(peakHex, "#75ebff");
  const bg = normalizeNodeGraphTraceDisplayColor(backgroundHex, "#000000");
  const mixHex = (a, b, t) => {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg_ = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const m = (x, y) => Math.round(x + (y - x) * t);
    return `#${m(ar, br).toString(16).padStart(2, "0")}${m(ag, bg_).toString(16).padStart(2, "0")}${m(ab, bb).toString(16).padStart(2, "0")}`;
  };
  return [
    { t: 0, color: bg },
    { t: 0.18, color: mixHex(bg, peak, 0.28) },
    { t: 0.55, color: mixHex(bg, peak, 0.7) },
    { t: 1, color: peak },
  ];
}


function nodeGraphPhosphorGradientStopsFromSettings(settings = {}, peakFallback = "#75ebff", options = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  // Existing stops are kept as-is. Default ramps may sample peak/bg.
  // ignoreLiveColor: do not pull peak from LED/dot1 (Number Readout Ghost Gradient
  // must stay independent of the LED hue title control).
  const peak = normalizeNodeGraphTraceDisplayColor(
    options.ignoreLiveColor
      ? peakFallback
      : (source.dot1Color ?? source.color ?? peakFallback),
    peakFallback,
  );
  const bg = normalizeNodeGraphTraceDisplayColor(
    source.background ?? source.backgroundColor ?? "#000000",
    "#000000",
  );
  if (source.gradientStops || source.gradient) {
    return normalizeNodeGraphSharedGradientStops(
      source.gradientStops ?? source.gradient,
      nodeGraphPhosphorDefaultGradientStops(peak, bg),
    );
  }
  return nodeGraphPhosphorDefaultGradientStops(peak, bg);
}


function nodeGraphPhosphorApplyGradientLut(faceOrEnergyGl, settings, peakFallback = "#75ebff") {
  if (!faceOrEnergyGl) {
    return false;
  }
  const stops = nodeGraphPhosphorGradientStopsFromSettings(settings, peakFallback);
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer?.setLutStops) {
    return PhosphorDrawer.setLutStops(faceOrEnergyGl, stops);
  }
  if (typeof nodeGraphPhosphorEnergyGlSetLutFromStops === "function") {
    return Boolean(nodeGraphPhosphorEnergyGlSetLutFromStops(faceOrEnergyGl, stops));
  }
  // Legacy peak LUT fallback.
  const peak = stops[stops.length - 1]?.color || peakFallback;
  const bg = stops[0]?.color || "#000000";
  const peakRgb = typeof nodeGraphScopeRgbFloatsToCanvasRgb === "function"
    && typeof nodeGraphScopeHexColorToRgb === "function"
    ? nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(peak))
    : [117, 235, 255];
  if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
    nodeGraphPhosphorEnergyGlSetLutFromPeak(faceOrEnergyGl, peakRgb, bg);
    return true;
  }
  return false;
}


function nodeGraphDisplaySettingsFormTypeUsesGradient(type) {
  if (typeof NodeGraphGradientSelector !== "undefined"
    && typeof NodeGraphGradientSelector.usesDisplayGradient === "function") {
    return NodeGraphGradientSelector.usesDisplayGradient(type);
  }
  // Until the selector script loads — keep a minimal local mirror.
  return Boolean(type && [
    "spectrogramBurn",
    "scope2d",
    "phosphorLight",
    "xyPad",
    "dot",
    "lineBurn",
    "numberReadout",
    "videoscopeBurn",
    "oscilloscopeBankBurn",
    "hypersawBurn",
    "rgbShapeFace",
    "rgbFractalFace",
    "evolveFieldFace",
    "fbmFieldFace",
    "gradientVectorscopeFace",
    "matrixFace",
    "matrixWaterfallFace",
    "matrixDisplayFace",
  ].includes(type));
}


function normalizeNodeGraphSpectrogramSettings(settings = {}, node = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphSpectrogramSettingsDefaults;
  // FFT: display setting, dual-write, or legacy module choice index.
  const fftRaw = source.fftSize ?? node?.params?.fftSize ?? defaults.fftSize;
  const fftSize = nodeGraphSpectrogramSnapFftSize(fftRaw);
  const snapChoice = (raw, max, fallback) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(max, n));
  };
  const window = snapChoice(
    source.window ?? node?.params?.window ?? defaults.window,
    4,
    defaults.window,
  );
  // Time overlap grew from 3 choices (2×/4×/8× @ 0–2) to 4 (none/2×/4×/8× @ 0–3).
  // Patches without freqOverlap still use the old index map — shift +1 so hop
  // settings keep their previous meaning.
  let overlapRaw = source.overlap ?? node?.params?.overlap ?? defaults.overlap;
  const legacyNoFreqOverlap = !Object.hasOwn(source, "freqOverlap")
    && !(node?.params && Object.hasOwn(node.params, "freqOverlap"));
  if (legacyNoFreqOverlap) {
    const n = Math.round(Number(overlapRaw));
    if (Number.isFinite(n) && n >= 0 && n <= 2) {
      overlapRaw = n + 1;
    }
  }
  const overlap = snapChoice(overlapRaw, 5, defaults.overlap);
  const freqOverlap = snapChoice(
    source.freqOverlap ?? node?.params?.freqOverlap ?? defaults.freqOverlap,
    2,
    defaults.freqOverlap,
  );
  const freqScale = snapChoice(
    source.freqScale ?? node?.params?.freqScale ?? defaults.freqScale,
    2,
    defaults.freqScale,
  );
  // View band (Hz). Hard range 1…24000; min always strictly below max.
  const clampHz = (raw, fallback) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clampNodeSliderValue(n, 1, 24000);
  };
  let minFreq = clampHz(source.minFreq ?? defaults.minFreq, defaults.minFreq);
  let maxFreq = clampHz(source.maxFreq ?? defaults.maxFreq, defaults.maxFreq);
  if (!(maxFreq > minFreq)) {
    // Keep a usable span; prefer expanding max, else pull min down.
    if (minFreq < 24000) {
      maxFreq = Math.min(24000, minFreq + Math.max(1, minFreq * 0.05));
    } else {
      minFreq = Math.max(1, maxFreq - 1);
    }
  }
  // Ensure at least 1 Hz span after float noise.
  if (maxFreq - minFreq < 1) {
    maxFreq = Math.min(24000, minFreq + 1);
    if (maxFreq - minFreq < 1) {
      minFreq = Math.max(1, maxFreq - 1);
    }
  }
  const gradientStops = normalizeNodeGraphSpectrogramGradientStops(
    source.gradientStops ?? source.gradient,
  );
  // Face fill follows gradient floor (t≈0) — no independent background control.
  const gradientFloor = gradientStops[0]?.color
    || defaults.gradientStops[0].color
    || "#000000";
  return {
    background: normalizeNodeGraphTraceDisplayColor(gradientFloor, "#000000"),
    fftSize,
    window,
    overlap,
    freqOverlap,
    freqScale,
    minFreq,
    maxFreq,
    // Face width = historySeconds of audio. Longer = slower scroll.
    // Min 0.1 s (0 was a fake “empty” that the display remapped to 0.05).
    historySeconds: (() => {
      const minH = 0.1;
      const maxH = 30;
      const raw = source.historySeconds ?? source.zoomSeconds;
      if (raw === undefined || raw === null || raw === "") {
        return defaults.historySeconds;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return defaults.historySeconds;
      }
      if (n === 0) {
        return minH;
      }
      return clampNodeSliderValue(n, minH, maxH);
    })(),
    gradientStops,
  };
}


function syncNodeGraphSpectrogramDisplaySettingsToParams(node, settings) {
  if (!node) return;
  const safe = normalizeNodeGraphSpectrogramSettings(settings, node);
  node.params = node.params && typeof node.params === "object" ? { ...node.params } : {};
  node.params.fftSize = safe.fftSize; // analysis window (128…16384)
  node.params.window = safe.window;
  node.params.overlap = safe.overlap; // time hop factor index
  node.params.freqOverlap = safe.freqOverlap; // zero-pad factor index
  node.params.freqScale = safe.freqScale;
  // History / Min·Max Freq are module face sliders — do not clobber from display.
  // Seed once if missing (legacy patches that only had display settings).
  if (!Number.isFinite(Number(node.params.historySeconds))) {
    node.params.historySeconds = safe.historySeconds;
  }
  if (!Number.isFinite(Number(node.params.minFreq))) {
    node.params.minFreq = safe.minFreq;
  }
  if (!Number.isFinite(Number(node.params.maxFreq))) {
    node.params.maxFreq = safe.maxFreq;
  }
  // Removed / migrated controls.
  delete node.params.outputBins;
  delete node.params.smoothing;
}


function normalizeNodeGraphXyPadDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphXyPadDisplaySettingsDefaults;
  const gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, defaults.dot1Color);
  const floor = gradientStops[0]?.color || defaults.background;
  const peak = gradientStops[gradientStops.length - 1]?.color || defaults.dot1Color;
  const residual = normalizeNodeGraphPhosphorResidualAxes(source, defaults);
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    ghost: residual.ghost,
    trail: residual.trail,
    burn: residual.burn,
    burnAmount: residual.burnAmount,
    residualSchema: residual.residualSchema,
    decay: residual.decay,
    dot1Brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(peak, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    dotBudget: typeof nodeGraphTraceDisplayClampDotBudget === "function"
      ? nodeGraphTraceDisplayClampDotBudget(source.dotBudget ?? defaults.dotBudget)
      : Math.max(1, Math.min(8192, Math.round(Number(source.dotBudget ?? defaults.dotBudget) || 1024))),
    // Default ON when missing (devilish solid trails). Explicit false stays off.
    fullDotEconomy: source.fullDotEconomy !== false
      && source.useFullDotEconomy !== false,
    dotsOnly: source.dotsOnly === true
      || source.verticesOnly === true,
    gradientStops,
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? source.dot1Blur ?? defaults.lineThickness,
    ),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    // Ignore legacy scale for layout; keep puckSize (migrate old scale→puck if missing).
    puckSize: normalizeNodeGraphTraceDisplayNumber(
      source.puckSize ?? (Number.isFinite(Number(source.scale)) && Number(source.scale) > 0
        ? defaults.puckSize * Math.min(2, Number(source.scale))
        : defaults.puckSize),
      defaults.puckSize,
      0.005,
      0.25,
    ),
  };
}


function nodeGraphXyPadDisplaySettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphXyPadDisplaySettings();
  }
  return normalizeNodeGraphXyPadDisplaySettings(node.traceDisplaySettings);
}


function normalizeNodeGraphTraceDisplayColor(value, fallback = nodeGraphTraceDisplaySettingsDefaults.color) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}


function normalizeNodeGraphTraceDisplayNumber(value, fallback, min, max, integer = false) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  const normalized = Number.isFinite(number)
    ? Math.max(safeMin, Math.min(safeMax, number))
    : Math.max(safeMin, Math.min(safeMax, safeFallback));
  return integer ? Math.round(normalized) : normalized;
}

/**
 * Oscilloscope / phosphor Bright: UI and engine both use 0…1 exactly (1 = full).
 * Legacy patches used a 0…2 control that draw code then clamped/min'd to 1 —
 * migrate once so 2 → 1, 1 → 0.5, etc. Values already ≤1 pass through.
 */
function normalizeNodeGraphTraceDisplayBrightness(value, fallback = 1) {
  let n = Number(value);
  if (!Number.isFinite(n)) {
    // Prefer 0 over 1 for bad input so drag/form glitches do not snap to full.
    const fb = Number(fallback);
    n = Number.isFinite(fb) ? fb : 0;
  }
  // Legacy 0…2 overdrive scale → 0…1 (patch load only; interactive clamps stay 0…1).
  if (n > 1 && n <= 2.0001) {
    n = n * 0.5;
  }
  return Math.max(0, Math.min(1, n));
}



function normalizeNodeGraphTraceDisplayZoomSeconds(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return clampNodeSliderValue(number, 0, nodeGraphTraceDisplayMaxZoomSeconds);
  }
  const safeFallback = Number(fallback);
  return Number.isFinite(safeFallback) ? clampNodeSliderValue(safeFallback, 0, nodeGraphTraceDisplayMaxZoomSeconds) : 0;
}


function nodeGraphTraceDisplayClampSweepSeconds(value) {
  const n = Number(value);
  // Non-finite → default. 0 = collapsed sweep (solid full-width horizontal
  // per sample at fuse density). Negative → 0. Do not snap 0 to default.
  if (!Number.isFinite(n)) {
    return nodeGraphLineBurnSettingsDefaults.sweepSeconds;
  }
  if (n <= 0) {
    return 0;
  }
  return clampNodeSliderValue(n, 0, 10);
}


function normalizeNodeGraphLineBurnSweepSeconds(source, defaults) {
  const explicit = Number(source?.sweepSeconds);
  if (Number.isFinite(explicit) && explicit >= 0) {
    return nodeGraphTraceDisplayClampSweepSeconds(explicit);
  }
  // Legacy: sweepHz = full left→right crossings per second.
  const legacyHz = Number(source?.sweepHz);
  if (Number.isFinite(legacyHz) && legacyHz > 0) {
    return nodeGraphTraceDisplayClampSweepSeconds(1 / legacyHz);
  }
  // Legacy window fields already meant "seconds per sweep".
  const legacyWindowMs = source?.windowMs === undefined ? undefined : Number(source.windowMs) / 1000;
  const zoomSeconds = Number(source?.zoomSeconds ?? source?.windowSeconds ?? legacyWindowMs);
  if (Number.isFinite(zoomSeconds) && zoomSeconds > 0) {
    return nodeGraphTraceDisplayClampSweepSeconds(zoomSeconds);
  }
  return defaults.sweepSeconds;
}


function normalizeNodeGraphLineBurnSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphLineBurnSettingsDefaults;
  const gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, defaults.dot1Color);
  const floor = gradientStops[0]?.color || defaults.background;
  const peak = gradientStops[gradientStops.length - 1]?.color || defaults.dot1Color;
  // Ghost / Trail / Burn are UI truth (same as scope2d). decay = 1 − trail only.
  const residual = normalizeNodeGraphPhosphorResidualAxes(source, defaults);
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    burn: residual.burn,
    burnAmount: residual.burnAmount,
    residualSchema: residual.residualSchema,
    decay: residual.decay,
    ghost: residual.ghost,
    trail: residual.trail,
    // Bright 0…1 exact (legacy 0…2 values halved once on load).
    dot1Brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(peak, defaults.dot1Color),
    // Always on — hide the display if you don't want the pen.
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    // Dot Budget + Full Dot Economy persist (toggle was dropped before).
    dotBudget: typeof nodeGraphTraceDisplayClampDotBudget === "function"
      ? nodeGraphTraceDisplayClampDotBudget(source.dotBudget ?? defaults.dotBudget)
      : Math.max(1, Math.min(8192, Math.round(Number(source.dotBudget ?? defaults.dotBudget) || 1024))),
    // Shared packing toggles (same SSOT as scope2d / 2D Phosphor).
    fullDotEconomy: nodeGraphDisplaySettingsToggleIsOn(
      source.fullDotEconomy ?? source.useFullDotEconomy,
    ),
    dotsOnly: nodeGraphDisplaySettingsToggleIsOn(
      source.dotsOnly ?? source.verticesOnly,
    ),
    // Auto-trigger: rising edge of In snaps pen left (Reset jack still works).
    sourceSync: nodeGraphDisplaySettingsToggleIsOn(
      source.sourceSync ?? source.sync ?? defaults.sourceSync,
    ),
    skipDiscontinuities: nodeGraphDisplaySettingsToggleIsOn(
      source.skipDiscontinuities ?? defaults.skipDiscontinuities,
    ),
    gradientStops,
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? defaults.lineThickness,
    ),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0.01, 100),
    sweepSeconds: normalizeNodeGraphLineBurnSweepSeconds(source, defaults),
  };
}


function normalizeNodeGraphZeroDBurnSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphZeroDBurnSettingsDefaults;
  const gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, defaults.dot1Color);
  const floor = gradientStops[0]?.color || defaults.background;
  const peak = gradientStops[gradientStops.length - 1]?.color || defaults.dot1Color;
  const residual = normalizeNodeGraphPhosphorResidualAxes(source, defaults);
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    bipolarBrightness: source.bipolarBrightness === true,
    ghost: residual.ghost,
    trail: residual.trail,
    burn: residual.burn,
    burnAmount: residual.burnAmount,
    residualSchema: residual.residualSchema,
    decay: residual.decay,
    dot1Brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(peak, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    gradientStops,
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? source.dot1Blur ?? defaults.lineThickness,
    ),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
  };
}


function normalizeNodeGraphTraceDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphTraceDisplaySettingsDefaults;
  const legacyWindowMs = source.windowMs === undefined ? undefined : Number(source.windowMs) / 1000;
  const zoomSeconds = source.zoomSeconds ?? source.windowSeconds ?? legacyWindowMs;
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, defaults),
    brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.brightness ?? source.dot1Brightness,
      defaults.brightness,
    ),
    color: normalizeNodeGraphTraceDisplayColor(source.color ?? source.dot1Color, defaults.color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Size,
      defaults.dot1Size,
      0,
      1,
    ),
    secondaryBrightness: normalizeNodeGraphTraceDisplayBrightness(
      source.secondaryBrightness,
      defaults.secondaryBrightness,
    ),
    secondaryColor: normalizeNodeGraphTraceDisplayColor(source.secondaryColor, defaults.secondaryColor),
    secondaryEnabled: source.secondaryEnabled !== false,
    secondarySize: normalizeNodeGraphTraceDisplayNumber(
      source.secondarySize,
      defaults.secondarySize,
      0,
      1,
    ),
    secondaryLineThickness: typeof nodeGraphTraceDisplayClampStampBlur === "function"
      ? nodeGraphTraceDisplayClampStampBlur(
        source.secondaryLineThickness ?? defaults.secondaryLineThickness,
      )
      : normalizeNodeGraphTraceDisplayNumber(
        source.secondaryLineThickness,
        defaults.secondaryLineThickness ?? 0,
        0,
        1,
      ),
    tertiaryColor: normalizeNodeGraphTraceDisplayColor(
      source.tertiaryColor,
      defaults.tertiaryColor ?? "#00ff00",
    ),
    cycles: normalizeNodeGraphTraceDisplayNumber(source.cycles, defaults.cycles, -Infinity, Infinity),
    lineThickness: typeof nodeGraphTraceDisplayClampStampBlur === "function"
      ? nodeGraphTraceDisplayClampStampBlur(source.lineThickness ?? source.blur ?? defaults.lineThickness)
      : normalizeNodeGraphTraceDisplayNumber(
        source.lineThickness ?? source.blur,
        defaults.lineThickness ?? 0.15,
        0,
        1,
      ),
    stampDensity: normalizeNodeGraphTraceDisplayNumber(
      source.stampDensity ?? source.dotDensity,
      defaults.stampDensity ?? 0.5,
      0,
      1,
    ),
    dotBudget: typeof nodeGraphTraceDisplayClampDotBudget === "function"
      ? nodeGraphTraceDisplayClampDotBudget(source.dotBudget ?? defaults.dotBudget)
      : Math.max(1, Math.min(8192, Math.round(Number(source.dotBudget ?? defaults.dotBudget) || 1024))),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    padding: normalizeNodeGraphTraceDisplayNumber(source.padding, defaults.padding, -Infinity, Infinity),
    // Amplitude zoom: multiplies samples before face mapping (1 = full-scale).
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale ?? 1, 0.01, 100),
    skipDiscontinuities: (() => {
      const raw = source.skipDiscontinuities;
      if (raw === true || raw === 1 || raw === "1" || raw === "true") {
        return true;
      }
      if (raw === false || raw === 0 || raw === "0" || raw === "false") {
        return false;
      }
      return defaults.skipDiscontinuities === true;
    })(),
    // RGB waterfall: CMY multiply darken mode (default off = RGB additive).
    cmyMode: (() => {
      const raw = source.cmyMode;
      if (raw === true || raw === 1 || raw === "1" || raw === "true") {
        return true;
      }
      if (raw === false || raw === 0 || raw === "0" || raw === "false") {
        return false;
      }
      return false;
    })(),
    // Default OFF (matches defaults.sourceSync). Never use `!== false` here —
    // that treated missing settings as Sync-on and let multi-scope locks thrash.
    sourceSync: (function normalizeSourceSync() {
      if (source.sourceSync === false || source.sourceSync === 0 || source.sourceSync === "false") {
        return false;
      }
      if (source.sourceSync === true || source.sourceSync === 1 || source.sourceSync === "true") {
        return true;
      }
      const ch = String(source.syncChannel || "").toLowerCase().trim();
      if (ch === "left" || ch === "right" || ch === "mono") {
        return true;
      }
      if (ch === "off") {
        return false;
      }
      return defaults.sourceSync === true;
    })(),
    stereoBlend: (function () {
      const raw = String(source.stereoBlend || defaults.stereoBlend || "combine").toLowerCase().trim();
      const ok = typeof TraceStroke !== "undefined" && Array.isArray(TraceStroke.STEREO_BLEND_MODES)
        ? TraceStroke.STEREO_BLEND_MODES
        : ["combine", "lighter", "screen", "source-over", "multiply", "difference", "exclusion", "xor"];
      return ok.includes(raw) ? raw : "combine";
    })(),
    // Always auto — derived from Left/Right via meetColorFromPair (no manual meet).
    meetColor: "auto",
    syncChannel: (function normalizeSyncChannel() {
      const raw = String(source.syncChannel || "").toLowerCase().trim();
      if (raw === "left" || raw === "right" || raw === "mono" || raw === "off") {
        return raw;
      }
      // Legacy boolean: true → mono (single-channel trigger), false → off.
      if (source.sourceSync === false || source.sourceSync === 0 || source.sourceSync === "false") {
        return "off";
      }
      if (source.sourceSync === true || source.sourceSync === 1 || source.sourceSync === "true") {
        return "mono";
      }
      return defaults.syncChannel || "off";
    })(),
    zoomSeconds: normalizeNodeGraphTraceDisplayZoomSeconds(
      source.historySeconds ?? zoomSeconds,
      defaults.historySeconds ?? defaults.zoomSeconds,
    ),
    historySeconds: normalizeNodeGraphTraceDisplayZoomSeconds(
      source.historySeconds ?? zoomSeconds,
      defaults.historySeconds ?? defaults.zoomSeconds,
    ),
    fade: normalizeNodeGraphTraceDisplayNumber(source.fade, defaults.fade ?? 0, 0, 1),
    xyzLayout: String(source.xyzLayout || defaults.xyzLayout || "stack").toLowerCase() === "separate"
      ? "separate"
      : "stack",
  };
}


function normalizeNodeGraphValueOscilloscopeSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphValueOscilloscopeSettingsDefaults;
  const residual = normalizeNodeGraphPhosphorResidualAxes(source, defaults);
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.brightness ?? source.dot1Brightness,
      defaults.brightness,
    ),
    burn: residual.burn,
    burnAmount: residual.burnAmount,
    residualSchema: residual.residualSchema,
    decay: residual.decay,
    capEnabled: source.capEnabled !== false,
    capLength: normalizeNodeGraphTraceDisplayNumber(source.capLength, defaults.capLength, 0, 1),
    capPadding: normalizeNodeGraphTraceDisplayNumber(source.capPadding, defaults.capPadding ?? 0, 0, 1),
    capSize: normalizeNodeGraphTraceDisplayNumber(source.capSize, defaults.capSize, 0, 1),
    ghost: residual.ghost,
    color: normalizeNodeGraphTraceDisplayColor(source.color ?? source.dot1Color, defaults.color),
    trail: residual.trail,
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    lineLength: normalizeNodeGraphTraceDisplayNumber(source.lineLength, defaults.lineLength, 0, 1),
    lineThickness: normalizeNodeGraphTraceDisplayNumber(source.lineThickness, defaults.lineThickness, 0, 1),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0.01, 100),
  };
}


function nodeGraphSampleGradientStopsRgb(stops, energyT, peakFallback = "#75ebff") {
  const list = Array.isArray(stops) && stops.length >= 2
    ? stops
    : nodeGraphPhosphorDefaultGradientStops(peakFallback);
  const t = Math.max(0, Math.min(1, Number(energyT) || 0));
  const hexToRgb = (hex, fb = "#808080") => {
    const color = normalizeNodeGraphTraceDisplayColor(hex, fb);
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) {
      return [128, 128, 128];
    }
    const n = Number.parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const first = list[0];
  const last = list[list.length - 1];
  if (t <= (Number(first.t) || 0)) {
    return hexToRgb(first.color, peakFallback);
  }
  if (t >= (Number(last.t) || 1)) {
    return hexToRgb(last.color, peakFallback);
  }
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    const at = Number(a.t) || 0;
    const bt = Number(b.t) || 1;
    if (t <= bt) {
      const u = (t - at) / Math.max(1e-6, bt - at);
      const ar = hexToRgb(a.color, peakFallback);
      const br = hexToRgb(b.color, peakFallback);
      return [
        Math.round(ar[0] + (br[0] - ar[0]) * u),
        Math.round(ar[1] + (br[1] - ar[1]) * u),
        Math.round(ar[2] + (br[2] - ar[2]) * u),
      ];
    }
  }
  return hexToRgb(last.color, peakFallback);
}


/**
 * Value LED / Value LCD display settings.
 * App-wide residual policy (phosphor-residual.js):
 *   Bright → live light / deposit energy only
 *   Trail → hot residual hang (not brightness)
 *   Ghost → slow super-exp residual hang (not brightness)
 * Legacy residual / ghostBrightness aliases stay in sync for older patches.
 *
 * @param {object} [settings]
 * @param {object} [defaultsOverride] LED vs LCD default packs
 */
function normalizeNodeGraphNumberReadoutSettings(settings = {}, defaultsOverride = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const faceHint = String(
    source.faceStyle
    || defaultsOverride?.faceStyle
    || "",
  ).toLowerCase();
  const defaults = defaultsOverride
    || (faceHint === "lcd" && typeof nodeGraphValueLcdSettingsDefaults !== "undefined"
      ? nodeGraphValueLcdSettingsDefaults
      : nodeGraphNumberReadoutSettingsDefaults);
  const faceStyle = faceHint === "lcd" || defaults.faceStyle === "lcd" ? "lcd" : "led";
  // LED: Ghost Gradient LUT (ignore LED hue so stops never track Light control).
  // LCD: no Ghost Gradient — unlit 8s share the ink hue at Ghost amount.
  const gradientStops = faceStyle === "lcd"
    ? []
    : nodeGraphPhosphorGradientStopsFromSettings(
      source,
      defaults.color,
      { ignoreLiveColor: true },
    );
  // Plate background. LCD stores a pure hue hex; amount is backgroundBrightness.
  let background = normalizeNodeGraphTraceDisplayColor(
    source.background ?? source.backgroundColor,
    defaults.background,
  );
  let backgroundBrightness = normalizeNodeGraphTraceDisplayNumber(
    source.backgroundBrightness,
    defaults.backgroundBrightness ?? 0.88,
    0,
    1,
  );
  let lcdInkColor = source.color ?? source.dot1Color;
  let lcdInkBrightness = source.brightness ?? source.dot1Brightness;
  if (faceStyle === "lcd") {
    const rawBg = String(source.background ?? source.backgroundColor ?? "").trim();
    const rawInk = String(source.color ?? source.dot1Color ?? "").trim();
    const legacyPlate = !rawBg || /^#b0b5a6$/i.test(rawBg);
    const legacyInk = !rawInk || /^#1a2216$/i.test(rawInk);
    if (legacyPlate && typeof nodeGraphHueUnitHex === "function") {
      background = nodeGraphHueUnitHex(
        typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82,
      );
      if (source.backgroundBrightness == null) {
        backgroundBrightness = defaults.backgroundBrightness ?? 0.88;
      }
    } else if (rawBg && typeof nodeGraphHueBrightnessFromHex === "function"
      && source.backgroundBrightness == null) {
      const mapped = nodeGraphHueBrightnessFromHex(rawBg, 82, defaults.backgroundBrightness ?? 0.88);
      if (typeof nodeGraphHueUnitHex === "function") {
        background = nodeGraphHueUnitHex(mapped.hue);
      }
      backgroundBrightness = mapped.brightness;
    }
    if (legacyInk && typeof nodeGraphHueUnitHex === "function") {
      lcdInkColor = nodeGraphHueUnitHex(
        typeof nodeGraphValueLcdDefaultHueDeg === "number" ? nodeGraphValueLcdDefaultHueDeg : 82,
      );
      if (source.brightness == null && source.dot1Brightness == null) {
        lcdInkBrightness = defaults.brightness ?? 0.18;
      }
    } else if (rawInk && typeof nodeGraphHueBrightnessFromHex === "function"
      && source.brightness == null && source.dot1Brightness == null) {
      const mapped = nodeGraphHueBrightnessFromHex(rawInk, 82, defaults.brightness ?? 0.18);
      if (typeof nodeGraphHueUnitHex === "function") {
        lcdInkColor = nodeGraphHueUnitHex(mapped.hue);
      }
      lcdInkBrightness = mapped.brightness;
    }
  }
  // Trail = deposit hang. Prefer trail; migrate residual (old Number Readout hang).
  // Do NOT merge ghost into trail (that broke independent Ghost control).
  const trailDefault = Number.isFinite(Number(defaults.trail))
    ? Number(defaults.trail)
    : (Number.isFinite(Number(defaults.residual)) ? Number(defaults.residual) : 0.88);
  let trailRaw = source.trail;
  if (trailRaw == null || !Number.isFinite(Number(trailRaw))) {
    trailRaw = source.residual;
  }
  if (trailRaw == null || !Number.isFinite(Number(trailRaw))) {
    trailRaw = trailDefault;
  }
  const trail = normalizeNodeGraphTraceDisplayNumber(trailRaw, trailDefault, 0, 1);

  // Ghost = extreme analog (super-exp) hang only (not brightness). Prefer ghost; migrate ghostBrightness.
  const ghostDefault = Number.isFinite(Number(defaults.ghost))
    ? Number(defaults.ghost)
    : (Number.isFinite(Number(defaults.ghostBrightness)) ? Number(defaults.ghostBrightness) : 0.45);
  let ghostRaw = source.ghost;
  if (ghostRaw == null || !Number.isFinite(Number(ghostRaw))) {
    ghostRaw = source.ghostBrightness ?? source.ghostBright;
  }
  if (ghostRaw == null || !Number.isFinite(Number(ghostRaw))) {
    ghostRaw = ghostDefault;
  }
  const ghost = normalizeNodeGraphTraceDisplayNumber(ghostRaw, ghostDefault, 0, 1);

  // Burn = sticky residual floor 0…1. residualSchema ≥ 2; legacy burn≡ghost → 0.
  const burnDefault = Number.isFinite(Number(defaults.burn))
    && Number(defaults.residualSchema) >= 2
    ? Number(defaults.burn)
    : 0;
  const burn = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurn
    ? PhosphorResidual.migrateBurn(source, burnDefault)
    : (
      Number(source.residualSchema) >= 2
        ? normalizeNodeGraphTraceDisplayNumber(source.burn, burnDefault, 0, 1)
        : 0
    );
  // Burn Amount = deposit gain vs Bright (default 1).
  const burnAmountDefault = Number.isFinite(Number(defaults.burnAmount))
    ? Number(defaults.burnAmount)
    : 1;
  const burnAmountMax = (typeof PhosphorResidual !== "undefined" && PhosphorResidual.BURN_AMOUNT_MAX) || 4;
  const burnAmount = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateBurnAmount
    ? PhosphorResidual.migrateBurnAmount(source, burnAmountDefault)
    : normalizeNodeGraphTraceDisplayNumber(
      source.burnAmount ?? source.depositGain ?? source.burnGain,
      burnAmountDefault,
      0,
      burnAmountMax,
    );
  const residualSchema = (typeof PhosphorResidual !== "undefined" && PhosphorResidual.RESIDUAL_SCHEMA)
    || 3;

  return {
    faceStyle,
    background,
    backgroundBrightness,
    // Live digit light / ink strength 0…1.
    brightness: normalizeNodeGraphTraceDisplayBrightness(
      faceStyle === "lcd"
        ? lcdInkBrightness
        : (source.brightness ?? source.dot1Brightness),
      defaults.brightness,
    ),
    // Live digit solid color (LED hue or LCD ink hue).
    color: normalizeNodeGraphTraceDisplayColor(
      faceStyle === "lcd" ? lcdInkColor : (source.color ?? source.dot1Color),
      defaults.color,
    ),
    // App-wide residual axes (+ legacy trail/ghost aliases kept equal).
    trail,
    ghost,
    burn,
    burnAmount,
    residualSchema,
    residual: trail,
    ghostBrightness: ghost,
    // Total digit budget (whole + fractional) for limit_decimals / fixed bins.
    // Accept legacy maxDigits / digitSlots aliases from older patches.
    digits: normalizeNodeGraphTraceDisplayNumber(
      source.digits ?? source.maxDigits ?? source.digitSlots ?? source.integerSlots,
      defaults.digits ?? 8,
      1,
      12,
      true,
    ),
    decimals: normalizeNodeGraphTraceDisplayNumber(source.decimals, defaults.decimals, 0, 8, true),
    polarity: (() => {
      const raw = String(source.polarity ?? source.signMode ?? defaults.polarity ?? "bipolar")
        .trim()
        .toLowerCase();
      return raw === "unipolar" || raw === "uni" || raw === "unsigned" ? "unipolar" : "bipolar";
    })(),
    removeTrailingZeros: (() => {
      const raw = source.removeTrailingZeros ?? source.stripTrailingZeros ?? defaults.removeTrailingZeros;
      if (raw === true || raw === "true" || raw === 1 || raw === "1") {
        return true;
      }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") {
        return false;
      }
      return Boolean(defaults.removeTrailingZeros);
    })(),
    // Fixed digit-slot budget vs live resize (see LayoutFitText).
    // GROW UI inverts this: GROW on ⇒ decimalBudget false.
    decimalBudget: (() => {
      const raw = source.decimalBudget ?? source.digitBudget ?? source.fixedDigitSlots;
      if (raw === true || raw === "true" || raw === 1 || raw === "1") {
        return true;
      }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") {
        return false;
      }
      return Boolean(defaults.decimalBudget);
    })(),
    // Digit bins: Digits slider is the number of slots. Unused slots stay put.
    digitBins: (() => {
      const raw = source.digitBins ?? source.fixedDigitBins ?? source.binDigits;
      if (raw === true || raw === "true" || raw === 1 || raw === "1") {
        return true;
      }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") {
        return false;
      }
      // Old GROW-on patches (decimalBudget stored false) keep live resize.
      if (source.decimalBudget === false || source.decimalBudget === "false" || source.decimalBudget === 0) {
        return false;
      }
      return defaults.digitBins !== false;
    })(),
    // Live light × residual gradient composite (dropdown). LCD defaults to source-over.
    lightBlend: (() => {
      const allowed = new Set([
        "occlude",
        "source-over",
        "lighter",
        "screen",
        "multiply",
        "overlay",
        "soft-light",
        "hard-light",
        "color-dodge",
        "color-burn",
        "lighten",
        "darken",
        "difference",
        "exclusion",
        "source-atop",
      ]);
      // Value LED default is lighten (live segments brighten residual).
      const fallback = faceStyle === "lcd" ? "source-over" : "lighten";
      const raw = String(source.lightBlend ?? source.lightBlendMode ?? defaults.lightBlend ?? fallback)
        .trim()
        .toLowerCase();
      return allowed.has(raw) ? raw : fallback;
    })(),
    // LCD only: permanent dim “8” plate amount (not residual hang).
    unlitSegments: normalizeNodeGraphTraceDisplayNumber(
      source.unlitSegments ?? source.segmentFloor ?? source.plateGhost,
      defaults.unlitSegments ?? 0.01,
      0,
      1,
    ),
    centsBand: normalizeNodeGraphTraceDisplayNumber(
      source.centsBand ?? source.tuneBand ?? source.octaveTune,
      defaults.centsBand ?? 0,
      0,
      1,
    ),
    // LED + LCD: linear inset/outset from plate edge (−0.5…1; not Amp / scope padding).
    // Negative = grow digits toward walls; 0 = no inset; 1 = pin pixel.
    facePadding: normalizeNodeGraphTraceDisplayNumber(
      source.facePadding ?? source.readoutPadding ?? source.digitPadding ?? source.padding,
      defaults.facePadding ?? 0,
      -0.5,
      1,
    ),
    // LCD glass: Gaussian inset shadow distance / sharpness / offset (ignored on LED).
    innerShadowDistance: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowDistance ?? source.insetDistance ?? source.shadowDistance,
      defaults.innerShadowDistance ?? 1,
      0,
      1,
    ),
    innerShadowSharpness: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowSharpness ?? source.insetSharpness ?? source.shadowSharpness,
      defaults.innerShadowSharpness ?? 0.732,
      0,
      1,
    ),
    innerShadowOffsetX: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowOffsetX ?? source.insetOffsetX ?? source.shadowOffsetX,
      defaults.innerShadowOffsetX ?? 0,
      -1,
      1,
    ),
    innerShadowOffsetY: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowOffsetY ?? source.insetOffsetY ?? source.shadowOffsetY,
      defaults.innerShadowOffsetY ?? 0.135,
      -1,
      1,
    ),
    gradientStops,
  };
}


function normalizeNodeGraphKnobFaceDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphKnobFaceDisplaySettingsDefaults;
  const parseColor = (value, fallback) => {
    const text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text) || /^#[0-9a-fA-F]{3}$/.test(text)) {
      return text.length === 4
        ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
        : text;
    }
    if (/^rgba?\(/i.test(text) || /^hsla?\(/i.test(text)) {
      return text;
    }
    return fallback;
  };
  return {
    decimals: normalizeNodeGraphTraceDisplayNumber(
      source.decimals ?? source.numDecimals,
      defaults.decimals,
      0,
      8,
      true,
    ),
    background: parseColor(
      source.background ?? source.backgroundColor,
      defaults.background,
    ),
    arcFill: parseColor(source.arcFill ?? source.dot1Color, defaults.arcFill),
    arcTrack: parseColor(source.arcTrack ?? source.secondaryColor, defaults.arcTrack),
    // Centered span only (offset removed — start is always −span/2).
    rotationDegrees: normalizeNodeGraphTraceDisplayNumber(
      source.rotationDegrees,
      defaults.rotationDegrees,
      0,
      1440,
      true,
    ),
    // Dial ring size 0…1 (1 = fill dial cell; only scales the arc widget).
    dialSize: normalizeNodeGraphTraceDisplayNumber(
      source.dialSize ?? source.knobSize ?? source.size,
      defaults.dialSize ?? 1,
      0,
      1,
    ),
    labelSize: normalizeNodeGraphTraceDisplayNumber(
      source.labelSize ?? source.titleSize,
      defaults.labelSize ?? 0.45,
      0,
      1,
    ),
    valueSize: normalizeNodeGraphTraceDisplayNumber(
      source.valueSize ?? source.readoutSize,
      defaults.valueSize ?? 0.45,
      0,
      1,
    ),
    labelPosition: normalizeNodeGraphKnobFaceTextPosition(
      source.showLabel === false || source.showLabel === "false"
        ? "off"
        : (source.labelPosition ?? source.titlePosition),
      defaults.labelPosition || "above",
    ),
    valuePosition: normalizeNodeGraphKnobFaceTextPosition(
      source.showReadout === false || source.showReadout === "false"
        ? "off"
        : (source.valuePosition ?? source.readoutPosition),
      defaults.valuePosition || "mid",
    ),
    // Arc ring hole 0…1 (maps to 1 − thickness of the conic mask).
    innerRadius: normalizeNodeGraphTraceDisplayNumber(
      source.innerRadius ?? source.arcInnerRadius,
      defaults.innerRadius ?? 0.7,
      0,
      0.95,
    ),
    labelText: typeof nodeGraphKnobFaceNormalizeLabelText === "function"
      ? nodeGraphKnobFaceNormalizeLabelText(source.labelText ?? source.knobText ?? source.text)
      : String(source.labelText ?? source.knobText ?? source.text ?? defaults.labelText ?? "Knob")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48),
  };
}

const nodeGraphKnobFaceTextPositions = Object.freeze(["off", "above", "mid", "below"]);

function normalizeNodeGraphKnobFaceTextPosition(value, fallback = "mid") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "top") {
    return "above";
  }
  if (raw === "middle" || raw === "center") {
    return "mid";
  }
  if (raw === "bottom") {
    return "below";
  }
  if (nodeGraphKnobFaceTextPositions.includes(raw)) {
    return raw;
  }
  const fb = String(fallback || "mid").trim().toLowerCase();
  return nodeGraphKnobFaceTextPositions.includes(fb) ? fb : "mid";
}


function nodeGraphKnobFaceDisplaySettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphKnobFaceDisplaySettings();
  }
  // Prefer display-settings bucket for colors/decimals; face blob supplies
  // image-layer rotation span when display has not written it yet.
  const fromDisplay = node.traceDisplaySettings;
  const fromFace = node.knobFace;
  const merged = {
    ...(fromFace && typeof fromFace === "object" ? fromFace : {}),
    ...(fromDisplay && typeof fromDisplay === "object" ? fromDisplay : {}),
  };
  return normalizeNodeGraphKnobFaceDisplaySettings(merged);
}


function normalizeNodeGraphScope2dSettings(settings = {}, defaultsOverride = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = defaultsOverride && typeof defaultsOverride === "object"
    ? defaultsOverride
    : nodeGraphScope2dSettingsDefaults;
  const gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, defaults.dot1Color);
  const floor = gradientStops[0]?.color || defaults.background;
  const peak = gradientStops[gradientStops.length - 1]?.color || defaults.dot1Color;
  // Display Settings truth is Ghost + Trail + Burn. decay = 1 − trail only.
  const residual = normalizeNodeGraphPhosphorResidualAxes(source, defaults);
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    burn: residual.burn,
    burnAmount: residual.burnAmount,
    residualSchema: residual.residualSchema,
    decay: residual.decay,
    ghost: residual.ghost,
    trail: residual.trail,
    // Bright 0…1 exact (legacy 0…2 halved once).
    dot1Brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
    ),
    dot1Color: normalizeNodeGraphTraceDisplayColor(peak, defaults.dot1Color),
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    dotBudget: typeof nodeGraphTraceDisplayClampDotBudget === "function"
      ? nodeGraphTraceDisplayClampDotBudget(source.dotBudget ?? defaults.dotBudget)
      : Math.max(1, Math.min(8192, Math.round(Number(source.dotBudget ?? defaults.dotBudget) || 1024))),
    // Full Dots / Dots only — shared phosphor packing (scope2d SSOT).
    // Accept bool true and common form/patch coercions (1 / "1" / "true" / "on").
    fullDotEconomy: nodeGraphDisplaySettingsToggleIsOn(
      source.fullDotEconomy ?? source.useFullDotEconomy,
    ),
    dotsOnly: nodeGraphDisplaySettingsToggleIsOn(
      source.dotsOnly ?? source.verticesOnly,
    ),
    // Latch present for packing-row UI consistency; 2D deposit path freeruns.
    sourceSync: nodeGraphDisplaySettingsToggleIsOn(
      source.sourceSync ?? source.sync,
    ),
    skipDiscontinuities: nodeGraphDisplaySettingsToggleIsOn(
      source.skipDiscontinuities ?? defaults.skipDiscontinuities,
    ),
    gradientStops,
    lineThickness: nodeGraphTraceDisplayClampStampBlur(
      source.lineThickness ?? source.dot1Blur ?? defaults.lineThickness,
    ),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0, Infinity),
  };
}


function normalizeNodeGraphScope2dTraceSettings(settings = {}, typeDefaults = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = typeDefaults && typeof typeDefaults === "object"
    ? { ...nodeGraphScope2dTraceSettingsDefaults, ...typeDefaults }
    : nodeGraphScope2dTraceSettingsDefaults;
  const rawInk = source.dot1Color ?? source.color ?? defaults.dot1Color;
  const inkHex = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(rawInk, defaults.dot1Color)
    : String(rawInk || "#fcfdbf");
  const mappedInk = typeof nodeGraphHueBrightnessFromHex === "function"
    ? nodeGraphHueBrightnessFromHex(inkHex, 60, defaults.dot1Brightness)
    : { hue: 60, brightness: defaults.dot1Brightness };
  const hueRaw = Number(source.dot1Hue);
  const inkHue = Number.isFinite(hueRaw)
    ? Math.max(0, Math.min(360, hueRaw))
    : mappedInk.hue;
  const inkHueHex = typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(inkHue)
    : inkHex;
  const inkBright = source.dot1Brightness != null || source.brightness != null
    ? normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness,
    )
    : mappedInk.brightness;
  return {
    ...nodeGraphDisplaySettingsNormalizePlateLook(source, {
      ...defaults,
      backgroundBrightness: defaults.backgroundBrightness ?? 0,
      backgroundHue: defaults.backgroundHue ?? 0,
    }),
    dot1Brightness: inkBright,
    dot1Color: inkHueHex,
    dot1Enabled: true,
    dot1Size: normalizeNodeGraphTraceDisplayNumber(source.dot1Size, defaults.dot1Size, 0, 1),
    ghost: typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
      ? PhosphorResidual.migrateGhost(source, defaults.ghost)
      : normalizeNodeGraphTraceDisplayNumber(source.ghost, defaults.ghost, 0, 1),
    trail: typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
      ? PhosphorResidual.migrateTrail(source, defaults.trail)
      : normalizeNodeGraphTraceDisplayNumber(source.trail, defaults.trail, 0, 1),
    pixelDensity: normalizeNodeGraphTraceDisplayNumber(
      source.pixelDensity,
      defaults.pixelDensity,
      0,
      1,
    ),
    scale: normalizeNodeGraphTraceDisplayNumber(source.scale, defaults.scale, 0, Infinity),
    skipDiscontinuities: nodeGraphDisplaySettingsToggleIsOn(
      source.skipDiscontinuities ?? defaults.skipDiscontinuities,
    ),
  };
}


function nodeGraphZeroDBurnSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphZeroDBurnSettings();
  }
  return normalizeNodeGraphZeroDBurnSettings(node.zeroDBurnSettings);
}

function normalizeNodeGraphVectorDotSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = typeof nodeGraphVectorDotSettingsDefaults !== "undefined"
    ? nodeGraphVectorDotSettingsDefaults
    : {};
  const hueRaw = Number(source.hue);
  const colorHex = normalizeNodeGraphTraceDisplayColor(
    source.dot1Color ?? source.color,
    defaults.dot1Color ?? "#ff6a00",
  );
  const hasColor = source.dot1Color != null || source.color != null;
  // Title-strip hue writes the hidden color field; spread `{...current}` still
  // has a finite stale `hue`. Prefer the hex the user just dragged.
  const hue = hasColor && typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(colorHex)
    : (Number.isFinite(hueRaw)
      ? ((hueRaw % 360) + 360) % 360
      : (typeof nodeGraphHueDegFromHex === "function"
        ? nodeGraphHueDegFromHex(colorHex)
        : 25));
  const hueHex = typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(hue)
    : colorHex;
  const bgHex = normalizeNodeGraphTraceDisplayColor(
    source.backgroundColor ?? source.background,
    defaults.background ?? "#0055ff",
  );
  const bgHue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(bgHex)
    : 220;
  return {
    hue,
    color: hueHex,
    dot1Color: hueHex,
    background: typeof nodeGraphHueUnitHex === "function"
      ? nodeGraphHueUnitHex(bgHue)
      : bgHex,
    backgroundColor: typeof nodeGraphHueUnitHex === "function"
      ? nodeGraphHueUnitHex(bgHue)
      : bgHex,
    backgroundBrightness: normalizeNodeGraphTraceDisplayNumber(
      source.backgroundBrightness,
      defaults.backgroundBrightness ?? 0,
      0,
      1,
    ),
    brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.brightness ?? source.dot1Brightness,
      defaults.dot1Brightness ?? 0.5,
    ),
    dot1Brightness: normalizeNodeGraphTraceDisplayBrightness(
      source.dot1Brightness ?? source.brightness,
      defaults.dot1Brightness ?? 0.5,
    ),
    dot1Size: normalizeNodeGraphTraceDisplayNumber(
      source.dot1Size ?? source.size ?? source.fillPercent,
      defaults.dot1Size ?? 0.85,
      0,
      1,
    ),
    lineThickness: normalizeNodeGraphTraceDisplayNumber(
      source.lineThickness ?? source.blur,
      defaults.lineThickness ?? 0.35,
      0,
      1,
    ),
    blur: normalizeNodeGraphTraceDisplayNumber(
      source.blur ?? source.lineThickness,
      defaults.blur ?? 0.35,
      0,
      1,
    ),
    stereoBlend: typeof nodeGraphScopeStereoBlendMode === "function"
      ? nodeGraphScopeStereoBlendMode(source.stereoBlend ?? defaults.stereoBlend)
      : (function () {
        const raw = String(source.stereoBlend || defaults.stereoBlend || "combine").toLowerCase().trim();
        const ok = typeof TraceStroke !== "undefined" && Array.isArray(TraceStroke.STEREO_BLEND_MODES)
          ? TraceStroke.STEREO_BLEND_MODES
          : ["combine", "lighter", "screen", "source-over", "multiply", "difference", "exclusion", "xor"];
        return ok.includes(raw) ? raw : "combine";
      })(),
    ...(function () {
      const pill = normalizeNodeGraphTraceDisplayNumber(source.pill, defaults.pill ?? 0, 0, 1);
      const squircle = normalizeNodeGraphTraceDisplayNumber(source.squircle, defaults.squircle ?? 0, 0, 1);
      const hasShape = source.shape != null && String(source.shape).trim() !== "";
      let shape;
      let shapeParam;
      if (hasShape && typeof normalizeTraceStampShape === "function") {
        shape = normalizeTraceStampShape(source.shape, defaults.shape || "circle");
        shapeParam = normalizeNodeGraphTraceDisplayNumber(
          source.shapeParam,
          defaults.shapeParam ?? 0.5,
          0,
          1,
        );
      } else if (typeof migratePillSquircleToShape === "function") {
        const migrated = migratePillSquircleToShape(pill, squircle);
        shape = migrated.shape;
        shapeParam = migrated.shapeParam;
      } else {
        shape = "circle";
        shapeParam = 0.5;
      }
      const legacy = typeof deriveLegacyPillSquircle === "function"
        ? deriveLegacyPillSquircle(shape, shapeParam)
        : { pill: shape === "pill" ? shapeParam : 0, squircle: shape === "squircle" ? shapeParam : 0 };
      return {
        shape,
        shapeParam,
        pill: legacy.pill,
        squircle: legacy.squircle,
      };
    })(),
  };
}

function normalizeNodeGraphLcdDotSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const lcdDefaults = typeof nodeGraphLcdDotSettingsDefaults !== "undefined"
    ? nodeGraphLcdDotSettingsDefaults
    : {};
  const merged = normalizeNodeGraphVectorDotSettings({
    ...lcdDefaults,
    ...source,
    stereoBlend: source.stereoBlend ?? lcdDefaults.stereoBlend ?? "source-over",
  });
  return {
    ...merged,
    faceStyle: "lcd",
    unlitSegments: normalizeNodeGraphTraceDisplayNumber(
      source.unlitSegments,
      lcdDefaults.unlitSegments ?? 0.22,
      0,
      1,
    ),
    innerShadowDistance: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowDistance,
      lcdDefaults.innerShadowDistance ?? 1,
      0,
      1,
    ),
    innerShadowSharpness: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowSharpness,
      lcdDefaults.innerShadowSharpness ?? 0.732,
      0,
      1,
    ),
    innerShadowOffsetX: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowOffsetX,
      lcdDefaults.innerShadowOffsetX ?? 0,
      -1,
      1,
    ),
    innerShadowOffsetY: normalizeNodeGraphTraceDisplayNumber(
      source.innerShadowOffsetY,
      lcdDefaults.innerShadowOffsetY ?? 0.135,
      -1,
      1,
    ),
  };
}

function nodeGraphMigrateLegacyLedToVectorDot(led) {
  if (!led || typeof led !== "object") {
    return null;
  }
  const fill = Number(led.fillPercent ?? led.fill);
  return {
    hue: led.hue,
    color: led.color,
    brightness: led.brightness ?? led.dot1Brightness,
    blur: led.blur ?? led.lineThickness,
    dot1Size: led.dot1Size ?? (Number.isFinite(fill) && fill > 0 ? fill / 100 : undefined),
    backgroundBrightness: led.backgroundBrightness,
    backgroundColor: led.backgroundColor ?? led.background,
  };
}

function nodeGraphVectorDotSettingsForNode(node) {
  const bag = node?.vectorDotSettings
    || (node?.type === "led" ? nodeGraphMigrateLegacyLedToVectorDot(node.led) : null)
    || node?.lcdDotSettings
    || node?.zeroDBurnSettings
    || node?.traceDisplaySettings;
  if (node?.type === "lcdDot" && typeof normalizeNodeGraphLcdDotSettings === "function") {
    return normalizeNodeGraphLcdDotSettings(bag);
  }
  return normalizeNodeGraphVectorDotSettings(bag);
}


function nodeGraphMigrateLimiterGainFaceToTraceSettings(source = {}) {
  const src = source && typeof source === "object" ? source : {};
  const legacyLimiter = (src.lineBrightness != null || src.hue != null)
    && src.dot1Size == null
    && src.dot1Brightness == null;
  if (!legacyLimiter) {
    return src;
  }
  const hue = Number(src.hue);
  const hueHex = typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(Number.isFinite(hue) ? hue : 42)
    : "#ffaa00";
  const bright = Number(src.lineBrightness);
  const ink = Number.isFinite(bright) ? Math.max(0, Math.min(1, bright)) : 0.5;
  return {
    ...src,
    color: hueHex,
    dot1Color: hueHex,
    brightness: ink,
    dot1Brightness: ink,
    background: src.backgroundColor || src.background,
    backgroundColor: src.backgroundColor || src.background,
    lineThickness: 0.15,
  };
}

function nodeGraphTraceDisplaySettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphTraceDisplaySettings();
  }
  const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
  if (settingsSchema === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(node.traceDisplaySettings);
  }
  // Instant Trace: seed from the global bucket until this module is edited.
  if (settingsSchema === "trace" || settingsSchema === "traceRgb") {
    const local = node.type === "lookaheadLimiter"
      ? nodeGraphMigrateLimiterGainFaceToTraceSettings(node.traceDisplaySettings)
      : node.traceDisplaySettings;
    const hasLocal = Boolean(local && typeof local === "object" && Object.keys(local).length);
    if (!hasLocal) {
      const seeded = nodeGraphGlobalTraceSettings();
      // RGB waterfall defaults: hard pixels, full bright, additive guns.
      if (settingsSchema === "traceRgb") {
        return normalizeNodeGraphTraceDisplaySettings({
          ...seeded,
          lineThickness: 0,
          brightness: 0.95,
          dot1Brightness: 0.95,
          stereoBlend: "lighter",
          cmyMode: false,
        });
      }
      return seeded;
    }
    return normalizeNodeGraphTraceDisplaySettings(local);
  }
  return normalizeNodeGraphTraceDisplaySettings(node.traceDisplaySettings);
}


function nodeGraphLineBurnSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphLineBurnSettings();
  }
  return normalizeNodeGraphLineBurnSettings(node.traceDisplaySettings);
}


function nodeGraphNumberReadoutFaceStyleForNode(node) {
  const type = String(node?.type || "");
  // Pitch Detector is a reflective LCD plate (DSEG + unlit ghost 8s).
  if (type === "valueLcd" || type === "helmholtzPitch") {
    return "lcd";
  }
  const fromSettings = String(node?.traceDisplaySettings?.faceStyle || "").toLowerCase();
  if (fromSettings === "lcd") {
    return "lcd";
  }
  return "led";
}

function nodeGraphNumberReadoutDefaultsForNode(node) {
  if (String(node?.type || "") === "helmholtzPitch") {
    const lcd = typeof nodeGraphValueLcdSettingsDefaults !== "undefined"
      ? nodeGraphValueLcdSettingsDefaults
      : {};
    return {
      ...lcd,
      faceStyle: "lcd",
      // Pitch Hz: ~4 integer + 2 decimal slots → total digit budget 6.
      digits: 6,
      decimalBudget: true,
      digitBins: true,
      // Unlit 8-plate must be visible (0.01 is below what the LCD ghost reads as).
      unlitSegments: 0.28,
      // 8ve page cents-accuracy stripes (0 = off, 1 = opaque).
      centsBand: 0.45,
    };
  }
  const base = nodeGraphNumberReadoutFaceStyleForNode(node) === "lcd"
    && typeof nodeGraphValueLcdSettingsDefaults !== "undefined"
    ? nodeGraphValueLcdSettingsDefaults
    : nodeGraphNumberReadoutSettingsDefaults;
  return base;
}

function nodeGraphNumberReadoutSettingsForNode(node) {
  const defaults = nodeGraphNumberReadoutDefaultsForNode(node);
  if (!node) {
    return normalizeNodeGraphNumberReadoutSettings({}, defaults);
  }
  const packed = {
    ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
    faceStyle: nodeGraphNumberReadoutFaceStyleForNode(node),
  };
  // Old Pitch Detector LED packs stored unlitSegments 0 (no LCD ghost).
  if (String(node.type || "") === "helmholtzPitch" && !(Number(packed.unlitSegments) > 0)) {
    packed.unlitSegments = defaults.unlitSegments ?? 0.28;
  }
  return normalizeNodeGraphNumberReadoutSettings(packed, defaults);
}


function nodeGraphScope2dSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphScope2dSettings();
  }
  const typeDefaults = typeof nodeGraphScope2dSettingsDefaultsForModuleType === "function"
    ? nodeGraphScope2dSettingsDefaultsForModuleType(node.type)
    : null;
  return normalizeNodeGraphScope2dSettings(node.traceDisplaySettings, typeDefaults);
}


function nodeGraphScope2dTraceSettingsForNode(node) {
  if (!node) {
    return normalizeNodeGraphScope2dTraceSettings();
  }
  const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
    ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(node.type)
    : null;
  return normalizeNodeGraphScope2dTraceSettings(node.traceDisplaySettings, typeDefaults);
}


function nodeGraphGlobalTraceSettings() {
  return normalizeNodeGraphTraceDisplaySettings(nodeGraphMvp?.traceSettings);
}


function nodeGraphTraceDisplaySettingsEditingGlobal() {
  return nodeGraphMvp?.traceDisplaySettingsTargetNode === "__globalTraceSettings";
}


function nodeGraphTraceDisplaySettingsEditingTraceDefaults() {
  if (nodeGraphTraceDisplaySettingsEditingGlobal()) {
    return true;
  }
  const node = nodeGraphPatchNode(nodeGraphMvp?.traceDisplaySettingsTargetNode);
  // Instant Trace is per-module. Only the explicit Global page writes
  // nodeGraphMvp.traceSettings (a seed for unedited faces).
  if (nodeGraphModuleDisplaySettingsSchemaForNode(node) !== "trace") {
    return false;
  }
  if (typeof nodeGraphModuleKeepsPerNodeTraceDisplaySettings === "function") {
    return !nodeGraphModuleKeepsPerNodeTraceDisplaySettings(node?.type);
  }
  return false;
}

