// Display Settings control mapping + value clamps.
// Extracted from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after scope-settings-form.js, before scope-settings-ui.js.

/**
 * App-wide −/+ magnitude quantum from current value + step direction.
 *
 * Base (by |value|):
 *   <1 → 0.1 · 1…<10 → 1 · 10…<100 → 10 · 100…<1000 → 100 · ≥1000 → 1000
 *
 * When stepping DOWN from an exact decade boundary, use the next finer step
 * so 1→0.9 (not 1→0), 10→9, 100→90, 1000→900.
 *
 * @param {number} currentValue
 * @param {number} [direction]  -1 = minus, +1 = plus, 0 = base only
 */
function nodeGraphMagnitudeStepperQuantum(currentValue, direction = 0) {
  const abs = Math.abs(Number(currentValue));
  let q;
  if (!Number.isFinite(abs) || abs < 1 - 1e-12) {
    q = 0.1;
  } else if (abs < 10) {
    q = 1;
  } else if (abs < 100) {
    q = 10;
  } else if (abs < 1000) {
    q = 100;
  } else {
    q = 1000;
  }
  // At exactly 1 / 10 / 100 / 1000, base quantum equals |value|, so − would
  // jump a full decade (1→0). Use one decade finer when decreasing.
  if (direction < 0 && Number.isFinite(abs) && abs > 0) {
    const atDecade = Math.abs(abs - q) <= Math.max(1e-9, q * 1e-9);
    if (atDecade) {
      if (q <= 0.1) {
        q = 0.1;
      } else if (q === 1) {
        q = 0.1;
      } else if (q === 10) {
        q = 1;
      } else if (q === 100) {
        q = 10;
      } else {
        q = 100;
      }
    }
  }
  return q;
}

/**
 * −/+ step size for Display Settings.
 * Special fields keep fixed quanta; 0…1 unit fields always 0.1;
 * others use magnitude policy (with down-from-boundary refinement).
 *
 * @param {HTMLInputElement|null} input
 * @param {number|null} currentValue
 * @param {number} [direction]  -1 / +1 for steppers (affects decade boundary)
 */
function nodeGraphTraceDisplayStepperQuantum(input, currentValue = null, direction = 0) {
  if (!input) {
    return 0.1;
  }
  const key = input.dataset?.traceDisplayField;
  if (["cycles", "decimals", "textSizePx"].includes(key)) {
    return 1;
  }
  if (key === "textWeight") {
    return 100;
  }
  if (key === "dotBudget") {
    return 64;
  }
  if (key === "bins") {
    return 8;
  }
  if (key === "fftSize") {
    return 1; // stepped via table in stepNodeGraphTraceDisplaySetting
  }
  // History (s): control-space step (exp map) — fine near short windows.
  if (key === "historySeconds" || key === "zoomSeconds") {
    return 0.025;
  }
  // Fixed sub-unit fields that are not magnitude-stepped.
  if (key === "pixelDensity") {
    return 0.05;
  }
  if (key === "sweepSeconds" || key === "sweepHz") {
    return 0.05;
  }
  if (key === "backgroundHue" || key === "hue") {
    return 1;
  }
  // Stamp Size: fixed control-space quantum (exp-mapped) — not magnitude 0.1.
  if (typeof nodeGraphTraceDisplaySizeControlField === "function"
    && nodeGraphTraceDisplaySizeControlField(key)
    && key !== "capSize") {
    return 0.04;
  }
  // Instant Trace Blur: control-space step (exp map) — fine near a hard line.
  if (typeof nodeGraphTraceDisplayInstantTraceBlurField === "function"
    && nodeGraphTraceDisplayInstantTraceBlurField(key)) {
    return 0.03;
  }
  // 0…1 unit fields (Bright, Ghost Bright, Residual, …): always 0.1.
  if (typeof nodeGraphTraceDisplayUnitDragField === "function"
    && nodeGraphTraceDisplayUnitDragField(key)) {
    return 0.1;
  }
  const value = currentValue != null ? currentValue : Number(input.value);
  return nodeGraphMagnitudeStepperQuantum(value, direction);
}

function nodeGraphTraceDisplaySizeControlField(key) {
  return ["dot1Size", "secondarySize", "capSize"].includes(key);
}

/** Instant Trace Blur (not phosphor stamp blur). */
function nodeGraphTraceDisplayInstantTraceBlurField(key) {
  if (key !== "lineThickness" && key !== "secondaryLineThickness") {
    return false;
  }
  const type = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  return typeof nodeGraphDisplaySettingsIsVectorTraceFormType === "function"
    && nodeGraphDisplaySettingsIsVectorTraceFormType(type);
}

/** History window fields (seconds) — use exponential control mapping. */
function nodeGraphTraceDisplayHistoryControlField(key) {
  return key === "historySeconds" || key === "zoomSeconds";
}

/**
 * 0…1 unit sliders (Bright, Ghost Bright, Residual, …).
 * Linear drag — same pixel→value gain for all (no exp curve mismatch).
 */
function nodeGraphTraceDisplayUnitDragField(key) {
  return [
    "dot1Brightness",
    "secondaryBrightness",
    "fade",
    "ghostBrightness",
    "residual",
    "ghost",
    "trail",
    "burn",
    "burnAmount",
    "unlitSegments",
    "centsBand",
    "facePadding",
    "screenPadding",
    "innerShadowDistance",
    "innerShadowSharpness",
    "innerShadowOffsetX",
    "innerShadowOffsetY",
    "dialSize",
    "labelSize",
    "valueSize",
    "innerRadius",
    "buttonWidth",
    "buttonHeight",
    "textSize",
    "capLength",
    "capPadding",
    "capSize",
    "lineBrightness",
    "dotBrightness",
    "backgroundBrightness",
  ].includes(key);
}

/** Drag/clamp range for unit-style fields (most are 0…1; shadow offset bipolar). */
function nodeGraphTraceDisplayUnitDragRange(key) {
  if (key === "innerShadowOffsetX" || key === "innerShadowOffsetY") {
    return { min: -1, max: 1 };
  }
  // Value LED/LCD padding: negative grows digits toward plate walls.
  if (key === "facePadding") {
    return { min: -0.5, max: 1 };
  }
  if (key === "buttonWidth" || key === "buttonHeight" || key === "textSize") {
    return { min: 0, max: 1 };
  }
  if (key === "burnAmount") {
    const max = (typeof PhosphorResidual !== "undefined" && PhosphorResidual.BURN_AMOUNT_MAX) || 4;
    return { min: 0, max };
  }
  return { min: 0, max: 1 };
}

function nodeGraphTraceDisplayClampBipolarUnit(value) {
  const n = Number(value);
  return Number.isFinite(n) ? clampNodeSliderValue(n, -1, 1) : 0;
}

/** Pixels of drag for a full 0→1 sweep on unit fields (higher = less sensitive). */
const nodeGraphTraceDisplayUnitDragPixels = 220;

/**
 * Pixels for a full 0→1 *control-space* sweep on stamp Size (exp-mapped).
 * Higher = less sensitive. Separate from unit fields: size sits in exp space
 * so the old quantum×/8 gain made phosphor/trace Size feel far too hot.
 */
const nodeGraphTraceDisplaySizeDragPixels = 520;

/** Instant Trace Blur: longer travel than Bright (visual halo is hot near 0). */
const nodeGraphTraceDisplayBlurDragPixels = 640;

function nodeGraphTraceDisplaySensitiveControlField(key) {
  // Brightness / residual are linear unit drags — not size-style exp maps.
  // Exp remains for stamp size, Instant Trace blur, pixel density, history.
  return nodeGraphTraceDisplaySizeControlField(key) ||
    nodeGraphTraceDisplayHistoryControlField(key) ||
    nodeGraphTraceDisplayInstantTraceBlurField(key) ||
    key === "pixelDensity";
}

/** Exp curve for stamp size — higher = more of the travel near small sizes. */
const nodeGraphTraceDisplaySensitiveControlExponent = 3;
/** History: stronger exp so most useful short windows sit near control 0. */
const nodeGraphTraceDisplayHistoryControlExponent = 3.5;

function nodeGraphTraceDisplaySensitiveControlMax(key) {
  if (key === "pixelDensity") {
    return 1;
  }
  // Bright is 0…1 energy app-wide (1 = full tip / full deposit).
  return 1;
}

/** Seconds range for History (s) by form type. */
function nodeGraphTraceDisplayHistoryControlRange(key) {
  const formType = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  if (key === "historySeconds" && formType === "spectrogramBurn") {
    return { min: 0.1, max: 30 };
  }
  const maxZ = Number(typeof nodeGraphTraceDisplayMaxZoomSeconds !== "undefined"
    ? nodeGraphTraceDisplayMaxZoomSeconds
    : 10);
  return { min: 0, max: Number.isFinite(maxZ) && maxZ > 0 ? maxZ : 10 };
}

/**
 * Map stored seconds → 0…1 control. Exponential so short windows have fine drag.
 * min≤0: t = (s/max)^(1/exp); min>0: t = log(s/min)/log(max/min).
 */
function nodeGraphTraceDisplaySecondsToControlValue(seconds, min, max) {
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo + 1e-9, Number(max) || 10);
  const s = clampNodeSliderValue(Number(seconds) || 0, lo, hi);
  const exp = nodeGraphTraceDisplayHistoryControlExponent;
  if (lo <= 0) {
    if (s <= 0) {
      return 0;
    }
    return Math.pow(s / hi, 1 / exp);
  }
  return Math.log(Math.max(lo, s) / lo) / Math.log(hi / lo);
}

/** Map 0…1 control → stored seconds (inverse of SecondsToControl). */
function nodeGraphTraceDisplayControlToSecondsValue(control, min, max) {
  const t = clampNodeSliderValue(Number(control) || 0, 0, 1);
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo + 1e-9, Number(max) || 10);
  const exp = nodeGraphTraceDisplayHistoryControlExponent;
  if (lo <= 0) {
    return Math.pow(t, exp) * hi;
  }
  return lo * Math.pow(hi / lo, t);
}

function nodeGraphTraceDisplaySizeToControlValue(value, max = 1) {
  return Math.pow(
    clampNodeSliderValue(Number(value) || 0, 0, max) / max,
    1 / nodeGraphTraceDisplaySensitiveControlExponent,
  );
}

function nodeGraphTraceDisplayControlToSizeValue(value, max = 1) {
  const control = clampNodeSliderValue(Number(value) || 0, 0, 1);
  return Math.pow(control, nodeGraphTraceDisplaySensitiveControlExponent) * max;
}

function adjustNodeGraphTraceDisplaySettingByControlDelta(key, startValue, delta) {
  // History (s): exp control-space so most useful short windows sit near 0.
  if (nodeGraphTraceDisplayHistoryControlField(key)) {
    const { min, max } = nodeGraphTraceDisplayHistoryControlRange(key);
    return nodeGraphTraceDisplayControlToSecondsValue(
      nodeGraphTraceDisplaySecondsToControlValue(startValue, min, max) + delta,
      min,
      max,
    );
  }
  // Linear 0…1 unit fields (Bright / Ghost Bright / Residual share one gain).
  if (nodeGraphTraceDisplayUnitDragField(key)) {
    return Number(startValue) + delta;
  }
  if (!nodeGraphTraceDisplaySensitiveControlField(key)) {
    return startValue + delta;
  }
  const max = nodeGraphTraceDisplaySensitiveControlMax(key);
  return nodeGraphTraceDisplayControlToSizeValue(
    nodeGraphTraceDisplaySizeToControlValue(startValue, max) + delta,
    max,
  );
}
function nodeGraphTraceDisplayClampUnit(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphTraceDisplayClampNonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

/** History / zoom window: 0 … nodeGraphTraceDisplayMaxZoomSeconds (10 s). */
function nodeGraphTraceDisplayClampHistorySeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return clampNodeSliderValue(n, 0, nodeGraphTraceDisplayMaxZoomSeconds);
}

/**
 * Display Bright / Ghost Bright 0…1.
 * Interactive path: hard clamp only. Do NOT legacy-half here — that made values
 * jump (e.g. overshoot 1.2 → 0.6) and NaN used to fall back to 1 (felt like wrap).
 * Legacy 0…2 migration lives in normalizeNodeGraphTraceDisplayBrightness on load.
 */
function nodeGraphTraceDisplayClampBrightness(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  // One-shot legacy: only when clearly still on the old 0…2 scale.
  if (n > 1 && n <= 2.0001) {
    return clampNodeSliderValue(n * 0.5, 0, 1);
  }
  return clampNodeSliderValue(n, 0, 1);
}

function nodeGraphTraceDisplayClampPixelDensity(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

// Stamp blur 0–1 (hard→soft). Migrates legacy signed -1..1 patch values.
function nodeGraphTraceDisplayClampStampBlur(value) {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer?.normalizeBlur) {
    return PhosphorDrawer.normalizeBlur(value, 0.35);
  }
  let v = Number(value);
  if (!Number.isFinite(v)) return 0.35;
  if (v < 0) v = (Math.max(-1, v) + 1) * 0.5;
  return clampNodeSliderValue(v, 0, 1);
}

function nodeGraphTraceDisplayClampDotBudget(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 2048;
  }
  return Math.max(0, Math.min(8192, n));
}

// Clamp rules shared by every display-settings form type, keyed by field name.
// Each entry owns exactly one field's rule — adding/changing a rule for one
// display type cannot silently change behavior for another.
const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({
  ghost: nodeGraphTraceDisplayClampUnit,
  capLength: nodeGraphTraceDisplayClampUnit,
  capPadding: nodeGraphTraceDisplayClampUnit,
  capSize: nodeGraphTraceDisplayClampUnit,
  cycles: (value) => Math.max(1, Math.min(64, Math.round(Number(value) || 0))),
  trail: nodeGraphTraceDisplayClampUnit,
  // Sticky residual floor 0…1.
  burn: nodeGraphTraceDisplayClampUnit,
  // Deposit gain vs Bright (0…4, default 1).
  burnAmount: (value) => {
    const max = (typeof PhosphorResidual !== "undefined" && PhosphorResidual.BURN_AMOUNT_MAX) || 4;
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 1;
    }
    return clampNodeSliderValue(n, 0, max);
  },
  // Number Readout residual hang + Ghost Bright (min gradient stop).
  residual: nodeGraphTraceDisplayClampUnit,
  ghostBrightness: nodeGraphTraceDisplayClampBrightness,
  unlitSegments: nodeGraphTraceDisplayClampUnit,
  centsBand: nodeGraphTraceDisplayClampUnit,
  facePadding: (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? clampNodeSliderValue(n, -0.5, 1) : 0;
  },
  screenPadding: nodeGraphTraceDisplayClampUnit,
  innerShadowDistance: nodeGraphTraceDisplayClampUnit,
  innerShadowSharpness: nodeGraphTraceDisplayClampUnit,
  innerShadowOffsetX: nodeGraphTraceDisplayClampBipolarUnit,
  innerShadowOffsetY: nodeGraphTraceDisplayClampBipolarUnit,
  // Knob dial / label / value size 0…1.
  dialSize: nodeGraphTraceDisplayClampUnit,
  labelSize: nodeGraphTraceDisplayClampUnit,
  valueSize: nodeGraphTraceDisplayClampUnit,
  dotBudget: nodeGraphTraceDisplayClampDotBudget,
  digits: (value) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) {
      return 8;
    }
    return Math.max(1, Math.min(12, n));
  },
  decimals: (value) => Math.max(0, Math.min(8, Math.round(Number(value) || 0))),
  dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  dot1Size: nodeGraphTraceDisplayClampUnit,
  ghost: nodeGraphTraceDisplayClampUnit,
  historySeconds: nodeGraphTraceDisplayClampHistorySeconds,
  fade: nodeGraphTraceDisplayClampUnit,
  lineLength: nodeGraphTraceDisplayClampUnit,
  lineThickness: nodeGraphTraceDisplayClampNonNegative,
  lineBlur: (value) => clampNodeSliderValue(Number(value) || 0, 0, 8),
  pixelDensity: nodeGraphTraceDisplayClampPixelDensity,
  puckSize: (value) => clampNodeSliderValue(Number(value) || 0, 0.005, 0.25),
  scale: nodeGraphTraceDisplayClampNonNegative,
  secondaryBrightness: nodeGraphTraceDisplayClampBrightness,
  secondaryLineThickness: nodeGraphTraceDisplayClampNonNegative,
  secondarySize: nodeGraphTraceDisplayClampUnit,
  // 1D Phosphor: seconds for one left→right pass.
  sweepSeconds: nodeGraphTraceDisplayClampSweepSeconds,
  // Legacy Hz field (migrated on load); keep clamp if old UI still posts it.
  sweepHz: (value) => clampNodeSliderValue(Number(value) || 0, 0.01, 100),
  fftSize: (value) => (typeof nodeGraphSpectrogramSnapFftSize === "function"
    ? nodeGraphSpectrogramSnapFftSize(value)
    : 1024),
  minFreq: (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 20;
    return clampNodeSliderValue(n, 1, 24000);
  },
  maxFreq: (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 20000;
    return clampNodeSliderValue(n, 1, 24000);
  },
  zoomSeconds: nodeGraphTraceDisplayClampHistorySeconds,
  backgroundBrightness: nodeGraphTraceDisplayClampUnit,
  backgroundHue: (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return clampNodeSliderValue(n, 0, 360);
  },
  textSize: (value) => (typeof nodeGraphKeypadClampTextSize === "function"
    ? nodeGraphKeypadClampTextSize(value)
    : Math.max(0, Math.min(1, Number(value) || 0.55))),
  textSizePx: (value) => (typeof nodeGraphKeypadClampTextSize === "function"
    ? nodeGraphKeypadClampTextSize(value)
    : Math.max(0, Math.min(1, Number(value) || 0.55))),
  textWeight: (value) => (typeof nodeGraphKeypadClampWeight === "function"
    ? nodeGraphKeypadClampWeight(value)
    : Math.max(100, Math.min(900, Math.round((Number(value) || 400) / 100) * 100))),
  buttonWidth: (value) => (typeof nodeGraphKeypadClampWidth === "function"
    ? nodeGraphKeypadClampWidth(value)
    : Math.max(0, Math.min(1, Number(value) || 0.94))),
  buttonHeight: (value) => (typeof nodeGraphKeypadClampHeight === "function"
    ? nodeGraphKeypadClampHeight(value)
    : Math.max(0, Math.min(1, Number(value) || 0.94))),
});

// Per-formType overrides, only for the (formType, field) pairs that diverge
// from the shared table above. Isolated per formType so a new override can't
// leak into unrelated display types.
const nodeGraphTraceDisplayFormTypeValueClampOverrides = Object.freeze({
  // Spectrogram: History (s) 0…30 (waterfall scroll rate; longer = slower).
  spectrogramBurn: Object.freeze({
    historySeconds: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 2;
      // 0 is not meaningful (was silently treated as ~0.05 s).
      if (n <= 0) return 0.1;
      return clampNodeSliderValue(n, 0.1, 30);
    },
    minFreq: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 20;
      return clampNodeSliderValue(n, 1, 24000);
    },
    maxFreq: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 20000;
      return clampNodeSliderValue(n, 1, 24000);
    },
  }),
  // LED lamp: hue degrees, blur 0–1, rounding %, brightness 0–1.
  ledLamp: Object.freeze({
    hue: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      // App-wide hue policy: no wrap — clamp to red edges (0…360).
      return clampNodeSliderValue(n, 0, 360);
    },
    lineThickness: nodeGraphTraceDisplayClampUnit,
    rounding: (value) => clampNodeSliderValue(Number(value) || 0, 0, 100),
    dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  }),
  // Phosphor Dot: same blur continuum as 2D Phosphor stamps.
  dot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  vectorDot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampUnit,
    dot1Size: nodeGraphTraceDisplayClampUnit,
    dot1Brightness: nodeGraphTraceDisplayClampBrightness,
    backgroundBrightness: nodeGraphTraceDisplayClampUnit,
  }),
  pulseDot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampUnit,
    dot1Size: nodeGraphTraceDisplayClampUnit,
    dot1Brightness: nodeGraphTraceDisplayClampBrightness,
    backgroundBrightness: nodeGraphTraceDisplayClampUnit,
  }),
  // 1D Phosphor: stamp blur + sweep rate.
  lineBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  // Soft phosphor stamps: blur 0 hard … 1 full soft.
  scope2d: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  phosphorLight: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  videoscopeBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  oscilloscopeBankBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  hypersawBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  xyPad: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  scope2dTrace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  roundShapeFace: Object.freeze({
    lineThickness: (value) => clampNodeSliderValue(Number(value) || 2, 0.25, 16),
    lineBlur: (value) => clampNodeSliderValue(Number(value) || 0, 0, 8),
    lineBrightness: (value) => clampNodeSliderValue(Number(value) || 0, 0, 1),
    dotThickness: (value) => clampNodeSliderValue(Number(value) || 5, 0.25, 32),
    dotBrightness: (value) => clampNodeSliderValue(Number(value) || 0, 0, 1),
    backgroundBrightness: (value) => clampNodeSliderValue(Number(value) || 0, 0, 1),
    pixelDensity: nodeGraphTraceDisplayClampPixelDensity,
  }),
  // 1D Trace / Output: blur 0 hard … 1 soft skirt (instant, no persistence).
  trace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
    secondaryLineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
});

function normalizeNodeGraphTraceDisplaySettingValueForKey(key, value) {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const clamp = nodeGraphTraceDisplayFormTypeValueClampOverrides[formType]?.[key] ||
    nodeGraphTraceDisplaySharedValueClamps[key];
  return clamp ? clamp(value) : value;
}
