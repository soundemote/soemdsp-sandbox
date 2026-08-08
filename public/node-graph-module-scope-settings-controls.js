// Display Settings control mapping + value clamps.
// Extracted from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after scope-settings-form.js, before scope-settings-ui.js.

function nodeGraphTraceDisplayStepperQuantum(input) {
  if (!input) {
    return 0.1;
  }
  if (["cycles", "decimals"].includes(input.dataset?.traceDisplayField)) {
    return 1;
  }
  if (input.dataset?.traceDisplayField === "dotBudget") {
    return 64;
  }
  if (input.dataset?.traceDisplayField === "bins") {
    return 8;
  }
  if (input.dataset?.traceDisplayField === "fftSize") {
    return 1; // stepped via table in stepNodeGraphTraceDisplaySetting
  }
  // Spectrogram view band (Hz).
  if (
    input.dataset?.traceDisplayField === "minFreq"
    || input.dataset?.traceDisplayField === "maxFreq"
  ) {
    return 10;
  }
  // History (s): control-space step (exp map) — fine near short windows.
  if (
    input.dataset?.traceDisplayField === "historySeconds"
    || input.dataset?.traceDisplayField === "zoomSeconds"
  ) {
    return 0.025;
  }
  if (input.dataset?.traceDisplayField === "pixelDensity") {
    return 0.05;
  }
  if (input.dataset?.traceDisplayField === "sweepSeconds") {
    return 0.05;
  }
  if (input.dataset?.traceDisplayField === "sweepHz") {
    return 0.05;
  }
  return 0.1;
}

function nodeGraphTraceDisplaySizeControlField(key) {
  return ["dot1Size", "secondarySize", "capSize"].includes(key);
}

/** History window fields (seconds) — use exponential control mapping. */
function nodeGraphTraceDisplayHistoryControlField(key) {
  return key === "historySeconds" || key === "zoomSeconds";
}

function nodeGraphTraceDisplaySensitiveControlField(key) {
  return nodeGraphTraceDisplaySizeControlField(key) ||
    nodeGraphTraceDisplayHistoryControlField(key) ||
    key === "pixelDensity" ||
    ["dot1Brightness", "secondaryBrightness"].includes(key);
}

const nodeGraphTraceDisplaySensitiveControlExponent = 3;
/** History: stronger exp so most useful short windows sit near control 0. */
const nodeGraphTraceDisplayHistoryControlExponent = 3.5;

function nodeGraphTraceDisplaySensitiveControlMax(key) {
  if (key === "pixelDensity") {
    return 4;
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

/** Display Bright 0…1 (1 = full energy). Legacy 0…2 values halved once (same as normalize). */
function nodeGraphTraceDisplayClampBrightness(value) {
  if (typeof normalizeNodeGraphTraceDisplayBrightness === "function") {
    return normalizeNodeGraphTraceDisplayBrightness(value, 1);
  }
  let n = Number(value);
  if (!Number.isFinite(n)) n = 0;
  if (n > 1 && n <= 2.0001) n *= 0.5;
  return clampNodeSliderValue(n, 0, 1);
}

function nodeGraphTraceDisplayClampPixelDensity(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 4);
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
  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n)) {
    return 2048;
  }
  return Math.max(64, Math.min(8192, n));
}

// Clamp rules shared by every display-settings form type, keyed by field name.
// Each entry owns exactly one field's rule — adding/changing a rule for one
// display type cannot silently change behavior for another.
const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({
  ghost: nodeGraphTraceDisplayClampUnit,
  capLength: nodeGraphTraceDisplayClampUnit,
  capSize: nodeGraphTraceDisplayClampUnit,
  cycles: (value) => Math.max(1, Math.min(64, Math.round(Number(value) || 0))),
  trail: nodeGraphTraceDisplayClampUnit,
  dotBudget: nodeGraphTraceDisplayClampDotBudget,
  decimals: (value) => Math.max(0, Math.min(8, Math.round(Number(value) || 0))),
  dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  dot1Size: nodeGraphTraceDisplayClampUnit,
  ghost: nodeGraphTraceDisplayClampUnit,
  historySeconds: nodeGraphTraceDisplayClampHistorySeconds,
  lineLength: nodeGraphTraceDisplayClampUnit,
  lineThickness: nodeGraphTraceDisplayClampNonNegative,
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
      return ((n % 360) + 360) % 360;
    },
    lineThickness: nodeGraphTraceDisplayClampUnit,
    rounding: (value) => clampNodeSliderValue(Number(value) || 0, 0, 100),
    dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  }),
  // Phosphor Dot: same blur continuum as 2D Phosphor stamps.
  dot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
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
