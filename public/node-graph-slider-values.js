const nodeSliderHandleHalfWidthPx = 8;
const nodeSliderMinSkewExponent = 0.25;
const nodeSliderMaxSkewExponent = 4;
const nodeGraphAutoSmoothingDefaultSeconds = 0.5;

const nodeGraphSmoothingModes = Object.freeze(["global", "internal", "internalGlobal", "off"]);

function nodeGraphSmoothingModeNormalize(value) {
  // blockSize UI retired; map any saved value to global.
  if (value === "blockSize") {
    return "global";
  }
  return nodeGraphSmoothingModes.includes(value) ? value : "global";
}

function clampNodeGraphAutoSmoothingSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) {
    return nodeGraphAutoSmoothingDefaultSeconds;
  }
  return Math.max(0, value);
}

function nodeGraphSmoothingFrequencyFromSeconds(seconds) {
  const normalized = clampNodeGraphAutoSmoothingSeconds(seconds);
  return normalized <= 0 ? 0 : 1 / normalized;
}

function nodeGraphSmoothingSampleRate() {
  const rate = Number(nodeGraphMvp?.sampleRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 44100;
}

function nodeGraphSmoothingSamplesFromSeconds(seconds) {
  return Math.max(0, Math.round(clampNodeGraphAutoSmoothingSeconds(seconds) * nodeGraphSmoothingSampleRate()));
}

function nodeGraphSmoothingSecondsFromSamples(samples) {
  const value = Number(samples);
  const safeSamples = Number.isFinite(value) ? Math.max(0, value) : nodeGraphSmoothingSamplesFromSeconds(nodeGraphAutoSmoothingDefaultSeconds);
  return clampNodeGraphAutoSmoothingSeconds(safeSamples / nodeGraphSmoothingSampleRate());
}

function nodeGraphDefaultSmoothingBlockSeconds() {
  return clampNodeGraphAutoSmoothingSeconds(128 / nodeGraphSmoothingSampleRate());
}

function nodeGraphNumericModifierReserved() {
  return false;
}

function nodeGraphNumericDragMultiplier(event) {
  if (event?.shiftKey && (event.ctrlKey || event.metaKey) && event.altKey) {
    return 0.001;
  }
  if (event?.shiftKey && (event.ctrlKey || event.metaKey)) {
    return 0.01;
  }
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
    return 0.1;
  }
  if (event?.altKey) {
    return 10;
  }
  return 1;
}

/**
 * App-wide pointer drag axes (screen space).
 *
 * Policy: no separate “horizontal only” / “vertical only” value change for
 * 1D controls. Right and up both increase; left and down both decrease:
 *   horizontal = clientX - startX
 *   vertical   = startY - clientY   (up is positive)
 *   combined   = horizontal + vertical
 *
 * Same formula as slider drag, global smoothing drag, color widgets, etc.
 * Prefer this helper over hand-rolled dx/dy so the policy stays one place.
 *
 * @returns {{ horizontal: number, vertical: number, combined: number }}
 */
function nodeGraphPointerDragScreenDelta(startClientX, startClientY, clientX, clientY) {
  const startX = Number(startClientX);
  const startY = Number(startClientY);
  const x = Number(clientX);
  const y = Number(clientY);
  const horizontal = (Number.isFinite(x) && Number.isFinite(startX) ? x - startX : 0);
  // Invert Y so upward mouse motion is positive (matches value increase).
  const vertical = (Number.isFinite(startY) && Number.isFinite(y) ? startY - y : 0);
  return {
    horizontal,
    vertical,
    combined: horizontal + vertical,
  };
}

/**
 * 1D travel delta in unit space (0..1 span) from the diagonal drag policy.
 * `travelWidthPx` is the pixel distance that maps to a full 0→1 sweep
 * (slider lane width, graph plot width, etc.).
 */
function nodeGraphPointerDragTravelDelta(startClientX, startClientY, clientX, clientY, travelWidthPx, fineScale = 1) {
  const width = Math.max(1, Number(travelWidthPx) || 1);
  const scale = Number.isFinite(Number(fineScale)) ? Number(fineScale) : 1;
  const { combined } = nodeGraphPointerDragScreenDelta(startClientX, startClientY, clientX, clientY);
  return (combined / width) * scale;
}

/**
 * True when the diagonal drag has moved past a small click threshold.
 */
function nodeGraphPointerDragExceededMoveThreshold(startClientX, startClientY, clientX, clientY, thresholdPx = 1) {
  const { horizontal, vertical } = nodeGraphPointerDragScreenDelta(startClientX, startClientY, clientX, clientY);
  const limit = Math.max(0, Number(thresholdPx) || 0);
  return Math.abs(horizontal) > limit || Math.abs(vertical) > limit;
}

function clampNodeSliderValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapNodeSliderValue(value, min, max) {
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return min;
  }
  return min + ((((value - min) % range) + range) % range);
}

function shortestNodeGraphWrapDelta(from, to, min, max) {
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return to - from;
  }
  let delta = to - from;
  if (delta > range / 2) {
    delta -= range;
  } else if (delta < -range / 2) {
    delta += range;
  }
  return delta;
}

// Prefer shared constant from parameter-smoother-filters.js (1e-6).
const nodeGraphSmootherConvergenceEpsilon =
  typeof nodeGraphParameterSmootherConvergenceEpsilon === "number"
    ? nodeGraphParameterSmootherConvergenceEpsilon
    : 1e-6;

// Mirrors soemdsp::filter::SmootherBase::needsSmoothing() -- a settled/
// unmodulated parameter has outputBuffer already within epsilon of
// targetSignal, so the one-pole recompute can be skipped entirely instead
// of running (and reaching the same answer) every single sample forever.
function nodeGraphSmootherNeedsWork(smoother) {
  return Math.abs((smoother.outputBuffer ?? 0) - (smoother.targetSignal ?? 0)) > nodeGraphSmootherConvergenceEpsilon;
}

function nodeGraphOnePoleParameterLowpassSample(state, input, frequency, rate) {
  const safeRate = Math.max(1, Number(rate) || nodeGraphMvp?.sampleRate || 44100);
  const safeInput = Number.isFinite(Number(input)) ? Number(input) : state.outputBuffer || 0;
  const frequencyValue = Math.max(0, Number.isFinite(Number(frequency)) ? Number(frequency) : 0);
  const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  let out = b0 * safeInput + a1 * (Number(state.outputBuffer) || 0);
  if (Math.abs(out - safeInput) <= nodeGraphSmootherConvergenceEpsilon) {
    out = safeInput;
  }
  state.outputBuffer = out;
  return out;
}

function normalizeNodeGraphSmootherSignal(value, metadata = {}) {
  if (typeof nodeGraphParameterValueToNormalizedSignal === "function") {
    return nodeGraphParameterValueToNormalizedSignal(value, metadata);
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  return clampNodeSliderValue((Number(value) - min) / range, 0, 1);
}

function denormalizeNodeGraphSmootherSignal(signal, metadata = {}) {
  if (typeof nodeGraphNormalizedSignalToParameterValue === "function") {
    return nodeGraphNormalizedSignalToParameterValue(signal, metadata);
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  return Number.isFinite(range) && range > 0 ? min + range * clampNodeSliderValue(signal, 0, 1) : signal;
}

// smoothingSeconds metadata is a SAMPLE COUNT, not seconds: 0 bypasses
// smoothing entirely, and any N > 0 smooths over exactly N samples.
function nodeGraphParameterSmoothingSecondsFromMetadata(metadata = {}) {
  // metadata.smoothingSeconds is already normalized to null (unset -> defer to
  // the global auto-smoothing time) or a finite number by
  // normalizeNodeGraphMetadataSmoothingSeconds. Number(null) === 0 in JS, so
  // coercing a literal null here would silently turn "unset" into "0 seconds"
  // (instant, no smoothing) instead of preserving the fallback.
  if (metadata.smoothingSeconds === null || metadata.smoothingSeconds === undefined) {
    return null;
  }
  const value = Number(metadata.smoothingSeconds);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  // Values in (0, 1) are seconds (e.g. 0.0333); ≥ 1 are sample counts.
  if (value > 0 && value < 1) {
    const rate = Math.max(1, Number(nodeGraphMvp?.sampleRate) || 44100);
    return Math.max(1, Math.round(value * rate));
  }
  return Math.max(0, Math.round(value));
}

// See resolveSmoothingSecondsForMode() in node-live-audio-worklet-core.js for the
// per-mode meaning (internal / global / blockSize / internalGlobal / off).
function nodeGraphResolveSmoothingSecondsForMode(mode, smoothingSamples, frames, rate, globalSeconds) {
  const safeRate = Math.max(1, Number(rate) || nodeGraphMvp?.sampleRate || 44100);
  const safeGlobal = Number.isFinite(Number(globalSeconds)) ? Math.max(0, Number(globalSeconds)) : 0;
  const internalSeconds = smoothingSamples > 0 ? smoothingSamples / safeRate : 0;
  switch (mode) {
    case "off":
      return 0;
    case "blockSize":
      return Math.max(1, Number(frames) || 1) / safeRate;
    case "global":
      return safeGlobal;
    case "internalGlobal":
      return internalSeconds + safeGlobal;
    case "internal":
    default:
      if (internalSeconds > 0) {
        return internalSeconds;
      }
      return typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
        ? nodeGraphModuleSmoothingDefaultSeconds()
        : 0.0333;
  }
}

function createNodeGraphParameterSmoother(initialValue, metadata = {}) {
  const value = Number(initialValue);
  const safeValue = Number.isFinite(value) ? value : 0;
  const signal = normalizeNodeGraphSmootherSignal(safeValue, metadata);
  const smoothingType = typeof normalizeNodeGraphMetadataSmoothingType === "function"
    ? normalizeNodeGraphMetadataSmoothingType(metadata.smoothingType)
    : "onePole";
  const usesFilter = typeof nodeGraphParameterSmootherUsesFilter === "function"
    ? nodeGraphParameterSmootherUsesFilter(smoothingType)
    : (smoothingType !== "none" && metadata.linearSmoothing !== false);
  const smoother = {
    current: safeValue,
    linearSmoothing: usesFilter,
    max: Number.isFinite(Number(metadata.max)) ? Number(metadata.max) : 1,
    metadata,
    min: Number.isFinite(Number(metadata.min)) ? Number(metadata.min) : 0,
    smoothingMode: nodeGraphSmoothingModeNormalize(metadata.smoothingMode),
    smoothingSeconds: nodeGraphParameterSmoothingSecondsFromMetadata(metadata),
    smoothingType,
    outputBuffer: signal,
    targetSignal: signal,
    target: safeValue,
    lastValue: safeValue,
    wraparound: Boolean(metadata.wraparound),
    filterState: null,
    filterStateType: null,
  };
  if (typeof nodeGraphEnsureParameterSmootherFilterState === "function") {
    nodeGraphEnsureParameterSmootherFilterState(smoother, smoothingType);
  }
  return smoother;
}

/**
 * Offline / script-processor path: soemdsp SmootherManager-style dirty list.
 * runtime.activeSmoothers + runtime.activeSmootherKeys hold only moving chases.
 */
function nodeGraphEnsureRuntimeActiveSmootherLists(runtime) {
  if (!runtime) {
    return;
  }
  if (!Array.isArray(runtime.activeSmoothers)) {
    runtime.activeSmoothers = [];
  }
  if (!(runtime.activeSmootherKeys instanceof Set)) {
    runtime.activeSmootherKeys = new Set();
  }
}

function nodeGraphSettleParameterSmoother(smoother, { snapFilter = true } = {}) {
  if (!smoother) {
    return;
  }
  smoother.current = smoother.target;
  smoother.outputBuffer = smoother.targetSignal;
  smoother.lastValue = smoother.target;
  if (snapFilter && typeof nodeGraphParameterSmootherFilterSnap === "function") {
    nodeGraphParameterSmootherFilterSnap(smoother, smoother.targetSignal);
  }
}

function nodeGraphClearParameterSmootherActiveMembership(runtime, smoother) {
  if (!smoother) {
    return;
  }
  const key = smoother._activeKey;
  if (key && runtime?.activeSmootherKeys) {
    runtime.activeSmootherKeys.delete(key);
  }
  smoother._activeKey = null;
  smoother._activeDrop = false;
}

function nodeGraphActivateParameterSmoother(runtime, key, smoother) {
  if (!runtime || !smoother || !key || !smoother.linearSmoothing) {
    return false;
  }
  if (!nodeGraphSmootherNeedsWork(smoother)) {
    return false;
  }
  nodeGraphEnsureRuntimeActiveSmootherLists(runtime);
  if (runtime.activeSmootherKeys.has(key)) {
    return true;
  }
  runtime.activeSmootherKeys.add(key);
  smoother._activeKey = key;
  smoother._activeDrop = false;
  runtime.activeSmoothers.push(smoother);
  return true;
}

function nodeGraphDeactivateParameterSmoother(runtime, key, smoother) {
  if (!runtime || !key) {
    return;
  }
  nodeGraphEnsureRuntimeActiveSmootherLists(runtime);
  if (!runtime.activeSmootherKeys.has(key)) {
    if (smoother) {
      smoother._activeKey = null;
    }
    return;
  }
  runtime.activeSmootherKeys.delete(key);
  if (smoother) {
    smoother._activeKey = null;
    smoother._activeDrop = true;
  }
}

/** One sample step. Returns true if still chasing. */
function nodeGraphStepParameterSmootherOneSample(smoother, frames) {
  if (!smoother?.linearSmoothing) {
    nodeGraphSettleParameterSmoother(smoother, { snapFilter: false });
    return false;
  }
  if (!nodeGraphSmootherNeedsWork(smoother)) {
    nodeGraphSettleParameterSmoother(smoother);
    return false;
  }
  const smoothingSeconds = clampNodeGraphAutoSmoothingSeconds(nodeGraphResolveSmoothingSecondsForMode(
    smoother.smoothingMode,
    smoother.smoothingSeconds || 0,
    frames,
    nodeGraphMvp?.sampleRate || 44100,
    nodeGraphMvp?.live?.autoSmoothingSeconds,
  ));
  if (smoothingSeconds <= 0) {
    nodeGraphSettleParameterSmoother(smoother);
    return false;
  }
  const cutoff = nodeGraphSmoothingFrequencyFromSeconds(smoothingSeconds);
  const rate = nodeGraphMvp?.sampleRate || 44100;
  const signal = typeof nodeGraphParameterSmootherFilterSample === "function"
    ? nodeGraphParameterSmootherFilterSample(smoother, smoother.targetSignal, cutoff, rate)
    : nodeGraphOnePoleParameterLowpassSample(smoother, smoother.targetSignal, cutoff, rate);
  // Critical: when the filter lands inside epsilon, snap domain value to the
  // exact target. Returning needsWork===false without settle left lastValue
  // stuck at ~0.999… (Number Readout never showed 1.00).
  if (!nodeGraphSmootherNeedsWork(smoother)) {
    nodeGraphSettleParameterSmoother(smoother);
    return false;
  }
  const value = denormalizeNodeGraphSmootherSignal(signal, smoother.metadata);
  smoother.current = value;
  smoother.lastValue = value;
  return true;
}

/** soemdsp SmootherManager::run + clean for offline runtime. */
function nodeGraphRunActiveParameterSmoothers(runtime, frames) {
  if (!runtime) {
    return;
  }
  nodeGraphEnsureRuntimeActiveSmootherLists(runtime);
  const list = runtime.activeSmoothers;
  if (!list.length) {
    return;
  }
  let write = 0;
  for (let i = 0; i < list.length; i += 1) {
    const smoother = list[i];
    if (!smoother || smoother._activeDrop) {
      nodeGraphClearParameterSmootherActiveMembership(runtime, smoother);
      continue;
    }
    if (nodeGraphStepParameterSmootherOneSample(smoother, frames)) {
      list[write] = smoother;
      write += 1;
    } else {
      nodeGraphClearParameterSmootherActiveMembership(runtime, smoother);
    }
  }
  list.length = write;
}

function updateNodeGraphParameterSmoother(smoother, targetValue, metadata = {}, runtime = null, smootherKey = null) {
  const value = Number(targetValue);
  smoother.target = Number.isFinite(value) ? value : smoother.target;
  smoother.max = Number.isFinite(Number(metadata.max)) ? Number(metadata.max) : smoother.max;
  smoother.metadata = metadata;
  smoother.min = Number.isFinite(Number(metadata.min)) ? Number(metadata.min) : smoother.min;
  smoother.smoothingMode = nodeGraphSmoothingModeNormalize(metadata.smoothingMode);
  smoother.smoothingSeconds = nodeGraphParameterSmoothingSecondsFromMetadata(metadata);
  const nextType = typeof normalizeNodeGraphMetadataSmoothingType === "function"
    ? normalizeNodeGraphMetadataSmoothingType(metadata.smoothingType)
    : "onePole";
  if (smoother.smoothingType !== nextType) {
    smoother.smoothingType = nextType;
    smoother.filterState = null;
    smoother.filterStateType = null;
  } else {
    smoother.smoothingType = nextType;
  }
  smoother.linearSmoothing = typeof nodeGraphParameterSmootherUsesFilter === "function"
    ? nodeGraphParameterSmootherUsesFilter(nextType)
    : (nextType !== "none" && metadata.linearSmoothing !== false);
  smoother.targetSignal = normalizeNodeGraphSmootherSignal(smoother.target, metadata);
  smoother.wraparound = Boolean(metadata.wraparound);
  const key = smootherKey || smoother._activeKey || null;
  if (!smoother.linearSmoothing || !nodeGraphSmootherNeedsWork(smoother)) {
    nodeGraphSettleParameterSmoother(smoother);
    if (runtime && key) {
      nodeGraphDeactivateParameterSmoother(runtime, key, smoother);
    }
    return;
  }
  if (runtime && key) {
    nodeGraphActivateParameterSmoother(runtime, key, smoother);
  }
}

/**
 * Readers only — active list advances once per sample before evaluate.
 * Falls back to a single step if dirty but not on the list (safety).
 */
function readNodeGraphSmoothedParameter(smoother, frame, frames, runtime = null, smootherKey = null) {
  if (!smoother || !smoother.linearSmoothing) {
    return smoother?.target ?? 0;
  }
  const key = smootherKey || smoother._activeKey || null;
  if (
    runtime
    && key
    && nodeGraphSmootherNeedsWork(smoother)
    && !runtime.activeSmootherKeys?.has(key)
  ) {
    nodeGraphActivateParameterSmoother(runtime, key, smoother);
    nodeGraphStepParameterSmootherOneSample(smoother, frames);
    if (!nodeGraphSmootherNeedsWork(smoother)) {
      nodeGraphDeactivateParameterSmoother(runtime, key, smoother);
    }
  }
  return Number.isFinite(smoother.lastValue) ? smoother.lastValue : smoother.target;
}

function finishNodeGraphParameterSmoothing(smoothers, runtime = null) {
  if (runtime) {
    nodeGraphEnsureRuntimeActiveSmootherLists(runtime);
    const list = runtime.activeSmoothers;
    let write = 0;
    for (let i = 0; i < list.length; i += 1) {
      const smoother = list[i];
      if (!smoother || smoother._activeDrop) {
        nodeGraphClearParameterSmootherActiveMembership(runtime, smoother);
        continue;
      }
      smoother.current = smoother.lastValue ?? smoother.current;
      list[write] = smoother;
      write += 1;
    }
    list.length = write;
    return;
  }
  for (const smoother of smoothers.values()) {
    if (!smoother.linearSmoothing) {
      smoother.current = smoother.wraparound
        ? wrapNodeSliderValue(smoother.target, smoother.min, smoother.max)
        : smoother.target;
      continue;
    }
    smoother.current = smoother.lastValue ?? smoother.current;
  }
}

/**
 * Normalize a domain value for the slider *thumb* / HTML range.
 * Ordinary params are not hard-clipped (min/max are guides). Wraparound wraps.
 * Resource-constrained params (data-constraint cpu|gpu|ram) and hardClamp clamp.
 */
function normalizeNodeSliderValue(slider, value, min = Number(slider.min), max = Number(slider.max)) {
  if (!Number.isFinite(value)) {
    return Number.isFinite(min) ? min : 0;
  }
  if (nodeSliderShouldWraparound(slider)) {
    return wrapNodeSliderValue(value, min, max);
  }
  const constraint = String(slider?.dataset?.constraint || "").toLowerCase();
  const hard = slider?.dataset?.hardClamp === "true"
    || constraint === "cpu"
    || constraint === "gpu"
    || constraint === "ram"
    || constraint === "memory";
  if (!hard) {
    return value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return value;
  }
  return clampNodeSliderValue(value, min, max);
}

/** Thumb position on an HTML range (must stay in min/max). */
function nodeSliderThumbDisplayValue(slider, domainValue) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const n = Number(domainValue);
  if (!Number.isFinite(n)) {
    return Number.isFinite(min) ? min : 0;
  }
  if (nodeSliderShouldWraparound(slider) && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return wrapNodeSliderValue(n, min, max);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return n;
  }
  return clampNodeSliderValue(n, min, max);
}

function normalizedNodeSliderMid(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const mid = clampNodeSliderValue(Number(slider.dataset.mid), min, max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0.5;
  }

  return clampNodeSliderValue((mid - min) / range, 0.000001, 0.999999);
}

/**
 * Mid-style power exponent for travel→value.
 * - mid skew: knee from domain MID (center of travel lands on mid)
 * - custom skew: knee from SENSITIVITY (−1…+1): 0 = linear,
 *   +1 = fine near min (mid toward max), −1 = fine near max (mid toward min)
 * - edge skew / off: 1 (linear in this path; edges uses its own S-curve)
 */
function nodeSliderSkewExponentFromSensitivity(amount) {
  const a = clampNodeSliderValue(Number(amount) || 0, -1, 1);
  if (a <= 0) {
    return 1 + (-a) * (nodeSliderMaxSkewExponent - 1);
  }
  return 1 + a * (nodeSliderMinSkewExponent - 1);
}

function nodeSliderSkewExponent(slider) {
  const curve = nodeSliderCurve(slider);
  if (curve === "custom") {
    return nodeSliderSkewExponentFromSensitivity(nodeSliderCurveAmount(slider));
  }
  if (curve !== "skew") {
    return 1;
  }
  const exponent = Math.log(normalizedNodeSliderMid(slider)) / Math.log(0.5);
  return clampNodeSliderValue(exponent, nodeSliderMinSkewExponent, nodeSliderMaxSkewExponent);
}

function nodeSliderEdgeCurvePower(slider) {
  if (nodeSliderCurve(slider) !== "edges") {
    return 1;
  }
  return 1 + Math.abs(nodeSliderCurveAmount(slider)) * 7;
}

/**
 * Rational map on 0…1. Same continuous form as nodeGraphGraphRationalCurveContinuous.
 * c < 0 stays below p (compress toward 0); c > 0 stays above p.
 */
function nodeSliderRationalCurveContinuous(position, contour) {
  const p = clampNodeSliderValue(Number(position) || 0, 0, 1);
  const c = clampNodeSliderValue(Number(contour) || 0, -1, 1);
  if (Math.abs(c) < 0.000001) {
    return p;
  }
  const cSafe = clampNodeSliderValue(c, -0.999999, 0.999999);
  return cSafe < 0
    ? (p * (1 + cSafe)) / (1 + cSafe * p)
    : p / (1 - cSafe + cSafe * p);
}

function nodeSliderRationalCurveContinuousInverse(value, contour) {
  const y = clampNodeSliderValue(Number(value) || 0, 0, 1);
  const c = clampNodeSliderValue(Number(contour) || 0, -1, 1);
  if (Math.abs(c) < 0.000001) {
    return y;
  }
  const cSafe = clampNodeSliderValue(c, -0.999999, 0.999999);
  if (cSafe < 0) {
    const denom = 1 + cSafe - y * cSafe;
    return denom === 0 ? y : clampNodeSliderValue(y / denom, 0, 1);
  }
  const denom = 1 - y * cSafe;
  return denom === 0 ? y : clampNodeSliderValue(y * (1 - cSafe) / denom, 0, 1);
}

/**
 * Symmetric around travel 0.5. Sensitivity 0 = linear;
 * +1 = finer at center; −1 = finer at extremes.
 */
function nodeSliderBipolarRationalValueFromTravel(travel, amount) {
  const t = clampNodeSliderValue(Number(travel) || 0, 0, 1);
  const signed = (t - 0.5) * 2;
  if (signed === 0) {
    return 0.5;
  }
  const mapped = nodeSliderRationalCurveContinuous(Math.abs(signed), -Number(amount) || 0);
  return 0.5 + 0.5 * Math.sign(signed) * mapped;
}

function nodeSliderBipolarRationalTravelFromValue(value, amount) {
  const v = clampNodeSliderValue(Number(value) || 0, 0, 1);
  const signed = (v - 0.5) * 2;
  if (signed === 0) {
    return 0.5;
  }
  const mapped = nodeSliderRationalCurveContinuousInverse(Math.abs(signed), -Number(amount) || 0);
  return 0.5 + 0.5 * Math.sign(signed) * mapped;
}

function nodeSliderCurveValueFromTravel(slider, travel) {
  const normalizedTravel = normalizeNodeSliderTravel(slider, travel);
  const curve = nodeSliderCurve(slider);
  if (curve === "bipolarRational") {
    return nodeSliderBipolarRationalValueFromTravel(normalizedTravel, nodeSliderCurveAmount(slider));
  }
  if (curve === "edges") {
    const amount = nodeSliderCurveAmount(slider);
    const power = nodeSliderEdgeCurvePower(slider);
    if (amount >= 0) {
      if (normalizedTravel <= 0.5) {
        return 0.5 * (normalizedTravel * 2) ** power;
      }
      return 1 - 0.5 * (2 - normalizedTravel * 2) ** power;
    }
    if (normalizedTravel <= 0.5) {
      return 0.5 * (1 - (1 - normalizedTravel * 2) ** power);
    }
    return 0.5 + 0.5 * ((normalizedTravel - 0.5) * 2) ** power;
  }
  // mid skew + custom skew: shared power law
  return normalizedTravel ** nodeSliderSkewExponent(slider);
}

function nodeSliderCurveTravelFromValue(slider, normalizedValue) {
  const value = clampNodeSliderValue(normalizedValue, 0, 1);
  const curve = nodeSliderCurve(slider);
  if (curve === "bipolarRational") {
    return nodeSliderBipolarRationalTravelFromValue(value, nodeSliderCurveAmount(slider));
  }
  if (curve === "edges") {
    const amount = nodeSliderCurveAmount(slider);
    const power = nodeSliderEdgeCurvePower(slider);
    if (amount >= 0) {
      if (value <= 0.5) {
        return 0.5 * (value * 2) ** (1 / power);
      }
      return 1 - 0.5 * (2 - value * 2) ** (1 / power);
    }
    if (value <= 0.5) {
      return 0.5 * (1 - (1 - value * 2) ** (1 / power));
    }
    return 0.5 + 0.5 * ((value - 0.5) * 2) ** (1 / power);
  }
  return value ** (1 / nodeSliderSkewExponent(slider));
}

function normalizeNodeSliderTravel(slider, travel) {
  const number = Number(travel);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return nodeSliderShouldWraparound(slider)
    ? wrapNodeSliderValue(number, 0, 1)
    : clampNodeSliderValue(number, 0, 1);
}

function nodeSliderValueFromTravel(slider, travel) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return min;
  }

  return min + range * nodeSliderCurveValueFromTravel(slider, travel);
}

function nodeSliderValueFromPointerTravel(slider, travel) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return min;
  }

  return min + range * nodeSliderCurveValueFromTravel(slider, travel);
}

function nodeSliderValueFromRelativeTravel(slider, travel) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const range = max - min;
  const numericTravel = Number(travel);
  if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(numericTravel)) {
    return min;
  }
  // No UI overshoot — travel outside [0,1] clamps via pointer travel helper.
  return nodeSliderValueFromPointerTravel(slider, numericTravel);
}

function nodeSliderTravelFromValue(slider, value) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }

  const normalizedValue = clampNodeSliderValue((value - min) / range, 0, 1);
  return nodeSliderCurveTravelFromValue(slider, normalizedValue);
}

function nodeSliderElementLayoutWidth(element) {
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(element)
  ) {
    const last = Number(element?._awakeClientWidth);
    return last > 0 ? last : 0;
  }
  const width = Number(element?.clientWidth || element?.offsetWidth || 0);
  if (Number.isFinite(width) && width > 0) {
    if (element) {
      element._awakeClientWidth = width;
    }
    return width;
  }
  const rectWidth = Number(element?.getBoundingClientRect?.().width) || 0;
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  return Math.max(0, rectWidth / zoom);
}

function nodeSliderElementLayoutHeight(element) {
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(element)
  ) {
    const last = Number(element?._awakeClientHeight);
    return last > 0 ? last : 0;
  }
  const height = Number(element?.clientHeight || element?.offsetHeight || 0);
  if (Number.isFinite(height) && height > 0) {
    if (element) {
      element._awakeClientHeight = height;
    }
    return height;
  }
  const rectHeight = Number(element?.getBoundingClientRect?.().height) || 0;
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  return Math.max(0, rectHeight / zoom);
}

function nodeSliderElementVisualScale(element) {
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(element)
  ) {
    return 1;
  }
  const layoutWidth = nodeSliderElementLayoutWidth(element);
  const rectWidth = Number(element?.getBoundingClientRect?.().width) || 0;
  if (!Number.isFinite(layoutWidth) || !Number.isFinite(rectWidth) || layoutWidth <= 0 || rectWidth <= 0) {
    return 1;
  }
  return Math.max(0.01, rectWidth / layoutWidth);
}

function nodeSliderVisualLane(surface, slider) {
  const width = nodeSliderElementLayoutWidth(surface);
  const handleHalfWidth = Math.min(nodeSliderHandleHalfWidthPx, width / 2);
  // Travel is handle-center. Zero clearance: at 0 the handle left edge is
  // the track left; at 1 the handle right edge is the track right.
  const leftInset = nodeSliderShouldWraparound(slider) ? 0 : handleHalfWidth;
  const rightInset = nodeSliderShouldWraparound(slider) ? 0 : handleHalfWidth;
  return {
    handleHalfWidth,
    inset: leftInset,
    leftInset,
    rightInset,
    travelWidth: Math.max(1, width - leftInset - rightInset),
    width: Math.max(1, width),
  };
}

function nodeSliderVisualCenterFromTravel(slider, surface, travel) {
  const lane = nodeSliderVisualLane(surface, slider);
  const normalizedTravel = normalizeNodeSliderTravel(slider, travel);
  return lane.inset + normalizedTravel * lane.travelWidth;
}

function nodeSliderHandleRangeFromTravel(slider, surface, travel) {
  const lane = nodeSliderVisualLane(surface, slider);
  const center = nodeSliderVisualCenterFromTravel(slider, surface, travel);
  return {
    center,
    end: center + lane.handleHalfWidth,
    handleHalfWidth: lane.handleHalfWidth,
    start: center - lane.handleHalfWidth,
    width: lane.width,
  };
}

function nodeSliderTravelFromPointer(slider, surface, clientX) {
  const drag = nodeGraphMvp?.sliderDragging;
  const rect = (drag && drag.surface === surface && drag.surfaceRect)
    ? drag.surfaceRect
    : surface.getBoundingClientRect();
  const lane = nodeSliderVisualLane(surface, slider);
  const scale = nodeSliderElementVisualScale(surface);
  const x = (clientX - rect.left) / scale;
  return normalizeNodeSliderTravel(slider, (x - lane.inset) / lane.travelWidth);
}

function setNodeSliderMetadata(slider, metadata) {
  const control = slider.closest(".node-parameter-control");
  const alias = normalizeNodeGraphPatchMetadataAlias(metadata.alias);
  slider.dataset.alias = alias;
  // Display name: custom alias wins, else factory default (e.g. "←" out), else prior label.
  const nextLabel = alias
    || control?.dataset?.defaultParamLabel
    || control?.dataset?.paramLabel
    || "";
  if (control) {
    control.dataset.paramLabel = nextLabel;
    control.setAttribute("aria-label", nextLabel || slider.dataset.param || slider.id);
  }
  // Readout keeps its own data-param-label (set at create time). It used to
  // stay stuck on the factory label ("→") after alias edits because
  // syncNodeSliderReadout preferred readout.dataset.paramLabel over the control.
  const readout = control?.querySelector?.(".node-slider-readout")
    || slider.closest?.("label")?.querySelector?.(".node-slider-readout");
  if (readout && nextLabel) {
    readout.dataset.paramLabel = nextLabel;
    readout.setAttribute(
      "aria-label",
      `${nextLabel} current value`,
    );
  }
  slider.min = String(metadata.min);
  slider.max = String(metadata.max);
  slider.dataset.mid = String(clampNodeSliderValue(metadata.mid, metadata.min, metadata.max));
  slider.dataset.default = String(
    clampNodeSliderValue(metadata.def, metadata.min, metadata.max),
  );
  slider.step = metadata.step > 0 ? String(metadata.step) : "any";
  slider.dataset.step = slider.step;
  slider.dataset.kind = metadata.kind || "decimal";
  slider.dataset.maxDigits = String(
    normalizeNodeGraphMetadataMaxDigits(metadata.maxDigits, metadata.kind),
  );
  slider.dataset.unit = metadata.unit ?? "";
  slider.dataset.tooltip = metadata.tooltip ?? "";
  slider.dataset.choices = formatNodeMetadataChoices(metadata.choices || []);
  // Independent flags (labels vs separators) — never mirror one onto the other.
  slider.dataset.displayChoices = metadata.displayChoices ? "true" : "false";
  slider.dataset.divideChoicesVisibly = metadata.divideChoicesVisibly ? "true" : "false";
  const smoothingType = typeof normalizeNodeGraphMetadataSmoothingType === "function"
    ? normalizeNodeGraphMetadataSmoothingType(metadata.smoothingType)
    : "onePole";
  const linearSmoothing = typeof nodeGraphMetadataLinearSmoothingFromType === "function"
    ? nodeGraphMetadataLinearSmoothingFromType(smoothingType)
    : (metadata.linearSmoothing !== false && smoothingType !== "none");
  slider.dataset.linearSmoothing = linearSmoothing ? "true" : "false";
  slider.dataset.smoothingMode = nodeGraphSmoothingModeNormalize(metadata.smoothingMode);
  slider.dataset.smoothingType = smoothingType;
  slider.dataset.smoothingSeconds = Number.isFinite(Number(metadata.smoothingSeconds)) && Number(metadata.smoothingSeconds) >= 0
    ? String(metadata.smoothingSeconds)
    : "";
  slider.dataset.sliderCurve = normalizeNodeSliderCurve(metadata.sliderCurve, metadata.nonlinearSlider);
  slider.dataset.curveAmount = String(normalizeNodeSliderCurveAmount(metadata.curveAmount));
  slider.dataset.nonlinearSlider = slider.dataset.sliderCurve === "linear" ? "false" : "true";
  slider.dataset.showSign = metadata.showSign ? "true" : "false";
  slider.dataset.removeTrailingZeros = metadata.removeTrailingZeros ? "true" : "false";
  slider.dataset.bipolar = metadata.bipolar ? "true" : "false";
  // Clear legacy overshoot keys if present (older sessions).
  if (slider.dataset.unboundedMax != null) delete slider.dataset.unboundedMax;
  if (slider.dataset.unboundedMin != null) delete slider.dataset.unboundedMin;
  if (slider.dataset.unboundedValue != null) delete slider.dataset.unboundedValue;
  slider.dataset.wraparound = metadata.wraparound ? "true" : "false";
  if (Object.hasOwn(metadata, "visible")) {
    slider.dataset.visible = metadata.visible === false ? "false" : "true";
  }
  // Prefer existing domainValue so metadata edits do not snap the parameter to
  // a clamped HTML thumb (or leave domainValue stale relative to value).
  const domainSource = Number.isFinite(Number(slider.dataset.domainValue))
    ? Number(slider.dataset.domainValue)
    : Number(slider.value);
  const domain = normalizeNodeSliderValue(slider, domainSource, metadata.min, metadata.max);
  slider.dataset.domainValue = String(domain);
  slider.value = String(
    typeof nodeSliderThumbDisplayValue === "function"
      ? nodeSliderThumbDisplayValue(slider, domain)
      : domain,
  );
  syncNodeSliderReadout(slider);
}

function quantizeNodeSliderDragValue(slider, value) {
  const step = Number(slider.dataset.step);
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  const min = Number(slider.min);
  const origin = Number.isFinite(min) ? min : 0;
  return origin + Math.round((value - origin) / step) * step;
}
