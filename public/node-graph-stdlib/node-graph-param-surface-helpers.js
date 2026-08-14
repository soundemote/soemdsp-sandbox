// Explicit parameter surfaces (Phase F — metaparam MOD SSOT).
//
// Three different ways a control is driven — three different contracts:
//
//   DOMAIN   — the knob/slider value in real units (Hz, −1…1, …).
//              Source of truth for the parameter store / readout.
//              min/max define the *slider* range (and DOMAIN↔unit for UI).
//              UI domain↔unit may use mid/custom skew; MOD never uses skew.
//
//   MOD      — param-row modulation CV. One SSOT in nodeGraphParamApplyMod:
//              • |Σmod| ≤ 1  → linear unit map across [min, max] (NO skew):
//                  unit = linearDomainToUnit(base) + mod
//                  effective = min + unit * (max − min)
//                Unipolar Uni X 0…1 + base at min → full range sweep.
//              • |Σmod| > 1  → domain-add absolute (Pitch Detector Hz, etc.):
//                  effective = base + mod
//              Unipolar: clip mod contribution ≥ 0. Bipolar: signed (TZFM).
//              Pitch exponential is NOT on MOD — use 0.1V/Oct jack.
//
//   SIGNAL IN — named input jacks (In, 0.1V/Oct, Phase, Amplitude, …).
//              NOT the same as MOD. Handled by module evaluators.
//
// Pure: no DOM, no nodeGraphMvp. Safe for main thread + AudioWorklet Blob.

/** @typedef {"domain"|"mod"|"signalIn"} NodeGraphParamSurface */

const NODE_GRAPH_PARAM_SURFACES = Object.freeze({
  domain: "domain",
  mod: "mod",
  signalIn: "signalIn",
});

function nodeGraphParamClamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) {
    return lo;
  }
  return x < lo ? lo : (x > hi ? hi : x);
}

function nodeGraphParamWrap(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x) || !(hi > lo)) {
    return Number.isFinite(lo) ? lo : 0;
  }
  const span = hi - lo;
  return lo + ((((x - lo) % span) + span) % span);
}

function nodeGraphParamKind(metadata = {}) {
  return String(metadata?.kind || "").trim().toLowerCase();
}

/**
 * True when MOD may be signed (thru-zero / bipolar domain).
 * Explicit metadata.bipolar wins; else infer from min < 0 < max.
 */
function nodeGraphParamIsBipolar(metadata = {}) {
  if (metadata && Object.hasOwn(metadata, "bipolar")) {
    return Boolean(metadata.bipolar);
  }
  const min = Number(metadata?.min);
  const max = Number(metadata?.max);
  return Number.isFinite(min) && min < 0 && Number.isFinite(max) && max > 0;
}

/** @deprecated Pitch exponential is 0.1V/Oct jack only — never param MOD. */
function nodeGraphParamUsesPitchMod(_metadata = {}) {
  return false;
}

/**
 * True when DOMAIN must stay inside min/max (hard clip / wrap).
 * Default false — min/max are slider/unit-map guides only.
 * Hard clamp only for:
 *   • wraparound (toroidal domain — always wrap)
 *   • constraint cpu | gpu | ram (resource limits)
 *   • hardClamp: true (explicit)
 */
function nodeGraphParamShouldHardClampDomain(metadata = {}) {
  if (metadata.wraparound) {
    return true;
  }
  if (metadata.hardClamp === true) {
    return true;
  }
  const c = String(metadata.constraint || "").trim().toLowerCase();
  if (c === "cpu" || c === "gpu" || c === "ram" || c === "memory") {
    return true;
  }
  return false;
}

/**
 * DOMAIN bounds for *storage / effective* values.
 * Does not hard-clip ordinary params to min/max (type large Amplitude freely).
 * Wraparound always wraps; resource-constrained / hardClamp params clamp.
 */
function nodeGraphParamApplyDomainBounds(value, metadata = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  if (metadata.wraparound && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return nodeGraphParamWrap(n, min, max);
  }
  if (!nodeGraphParamShouldHardClampDomain(metadata)) {
    return n;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return n;
  }
  return nodeGraphParamClamp(n, min, max);
}

/**
 * After MOD, re-apply DOMAIN hard bounds?
 * Default false. Explicit modClamp wins; else same policy as hard domain clamp
 * (wraparound / constraint / hardClamp). Legacy unboundedMax/Min → false.
 */
function nodeGraphParamModClamp(metadata = {}) {
  if (Object.hasOwn(metadata, "modClamp")) {
    return Boolean(metadata.modClamp);
  }
  if (metadata.unboundedMax || metadata.unboundedMin) {
    return false;
  }
  return nodeGraphParamShouldHardClampDomain(metadata);
}

/**
 * Nonlinear mid-style skew exponent for DOMAIN↔unit (MOD path).
 * - mid skew: unit 0.5 → domain mid
 * - custom skew: same power law; knee from curveAmount (SENSITIVITY −1…+1)
 * - edge skew / linear: 1 (edge S-curve is UI drag only)
 * exponent 1 = linear.
 */
function nodeGraphParamSkewExponent(metadata = {}) {
  const curve = typeof normalizeNodeSliderCurve === "function"
    ? normalizeNodeSliderCurve(metadata.sliderCurve, metadata.nonlinearSlider)
    : (metadata.nonlinearSlider ? "skew" : "linear");
  if (curve === "custom") {
    const amount = typeof normalizeNodeSliderCurveAmount === "function"
      ? normalizeNodeSliderCurveAmount(metadata.curveAmount)
      : Math.max(-1, Math.min(1, Number(metadata.curveAmount) || 0));
    if (typeof nodeSliderSkewExponentFromSensitivity === "function") {
      return nodeSliderSkewExponentFromSensitivity(amount);
    }
    // Fallback if slider-values not loaded yet (same mapping as UI).
    const a = Math.max(-1, Math.min(1, Number(amount) || 0));
    if (a <= 0) {
      return 1 + (-a) * 3; // 1…4
    }
    return 1 + a * (0.25 - 1); // 1…0.25
  }
  if (curve !== "skew") {
    return 1;
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const mid = Number(metadata.mid);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(mid)) {
    return 1;
  }
  const normalizedMid = nodeGraphParamClamp((mid - min) / range, 0.000001, 0.999999);
  return Math.log(normalizedMid) / Math.log(0.5);
}

/**
 * DOMAIN → unit [0, 1] for UI / display (may apply mid/custom skew).
 */
function nodeGraphParamDomainToUnit(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const bounded = metadata.wraparound
    ? nodeGraphParamWrap(Number(value) || 0, min, max)
    : nodeGraphParamClamp(Number(value) || 0, min, max);
  const normalizedValue = nodeGraphParamClamp((bounded - min) / range, 0, 1);
  const exp = nodeGraphParamSkewExponent(metadata);
  return nodeGraphParamClamp(normalizedValue ** (1 / exp), 0, 1);
}

/**
 * Unit [0, 1] → DOMAIN for UI (inverse of skewed domainToUnit).
 */
function nodeGraphParamUnitToDomain(unit, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return Number.isFinite(min) ? min : 0;
  }
  const normalizedSignal = metadata.wraparound
    ? nodeGraphParamWrap(Number(unit) || 0, 0, 1)
    : nodeGraphParamClamp(Number(unit) || 0, 0, 1);
  const exp = nodeGraphParamSkewExponent(metadata);
  const normalizedValue = normalizedSignal ** exp;
  return nodeGraphParamApplyDomainBounds(min + range * normalizedValue, metadata);
}

/**
 * Linear DOMAIN → unit (MOD path only). Never applies slider skew.
 * Unclamped result so base outside [min,max] still offsets correctly.
 */
function nodeGraphParamDomainToUnitLinear(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  if (metadata.wraparound) {
    return (nodeGraphParamWrap(v, min, max) - min) / range;
  }
  return (v - min) / range;
}

/**
 * Linear unit → DOMAIN (MOD path only). Never applies slider skew.
 */
function nodeGraphParamUnitToDomainLinear(unit, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return Number.isFinite(min) ? min : 0;
  }
  let u = Number(unit);
  if (!Number.isFinite(u)) {
    u = 0;
  }
  if (metadata.wraparound) {
    u = nodeGraphParamWrap(u, 0, 1);
  }
  const result = min + u * range;
  if (!Number.isFinite(result)) {
    return 0;
  }
  return nodeGraphParamModClamp(metadata)
    ? nodeGraphParamApplyDomainBounds(result, metadata)
    : result;
}

/**
 * MOD surface: raw bus sample as-is (Uni 0…1, Bi −1…1, or absolute Hz).
 */
function nodeGraphParamNormalizeModInput(value, _metadata = {}) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * |mod| ≤ this → treat as unit CV across [min,max] (linear, no skew).
 * |mod| above → domain-add absolute (Pitch Detector Hz, large Knob Bias, …).
 */
const NODE_GRAPH_PARAM_MOD_UNIT_BAND = 1 + 1e-9;

/**
 * Apply summed MOD onto DOMAIN base. Single SSOT for live + worklet.
 *
 * Unit-band (|mod| ≤ 1): linear map across param min…max, bypassing skew.
 *   Uni 0…1 + base at min → full range (e.g. Freq 1…20000).
 * Absolute (|mod| > 1): domain-add base + mod (exact Hz sources).
 *
 * Signed MOD on every dest (negative LFO moves toward min). Only clip
 * negatives when metadata.unipolarMod === true (explicit).
 * Callers that have several sources should fold unit vs absolute per source
 * via nodeGraphParamFoldModSources, not by summing first (avoids the |Σ| > 1 cliff).
 */
function nodeGraphParamApplyMod(base, modSum, metadata = {}) {
  const folded = nodeGraphParamFoldModSources(base, [modSum], metadata);
  return folded;
}

/**
 * Combine one or more MOD samples onto DOMAIN base.
 * Each source: |mod| ≤ 1 → unit-map contribution; |mod| > 1 → domain-add.
 */
function nodeGraphParamFoldModSources(base, sources, metadata = {}) {
  const baseN = Number(base);
  const b = Number.isFinite(baseN) ? baseN : 0;
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  const clipNeg = metadata && metadata.unipolarMod === true;
  let unitAdd = 0;
  let domainAdd = 0;
  const list = Array.isArray(sources) ? sources : [sources];
  for (const raw of list) {
    let mod = Number(raw);
    if (!Number.isFinite(mod)) {
      mod = 0;
    }
    if (clipNeg) {
      mod = Math.max(0, mod);
    }
    if (Number.isFinite(range) && range > 0 && Math.abs(mod) <= NODE_GRAPH_PARAM_MOD_UNIT_BAND) {
      unitAdd += mod;
    } else {
      domainAdd += mod;
    }
  }
  let result = b + domainAdd;
  if (Number.isFinite(range) && range > 0 && unitAdd !== 0) {
    const baseUnit = nodeGraphParamDomainToUnitLinear(b, metadata);
    result = nodeGraphParamUnitToDomainLinear(baseUnit + unitAdd, metadata) + domainAdd;
  }
  if (!Number.isFinite(result)) {
    return 0;
  }
  if (metadata.wraparound) {
    return nodeGraphParamApplyDomainBounds(result, metadata);
  }
  return nodeGraphParamModClamp(metadata)
    ? nodeGraphParamApplyDomainBounds(result, metadata)
    : result;
}

/**
 * Parameter port as MOD source: emit linear unit 0…1 of its domain (no skew)
 * so chaining stays unit-compatible with Uni/Bi style CVs.
 */
function nodeGraphParamDomainToModOutput(value, metadata = {}) {
  return nodeGraphParamDomainToUnitLinear(value, metadata);
}

/**
 * SIGNAL IN — additive domain (Knob-style): result = domain + inSample.
 * Unwired inSample should be passed as 0.
 */
function nodeGraphParamSignalInAdditive(domainValue, inSample) {
  return (Number(domainValue) || 0) + (Number(inSample) || 0);
}

/**
 * SIGNAL IN — multiplicative depth (Amplitude-style): domain * scale.
 * Unwired scale should be passed as 1.
 */
function nodeGraphParamSignalInMultiply(domainValue, scaleSample, defaultScale = 1) {
  const s = Number(scaleSample);
  const scale = Number.isFinite(s) ? s : defaultScale;
  return (Number(domainValue) || 0) * scale;
}

/**
 * SIGNAL IN — phase jack adds to phase knob (cycles), wrapped to [0, 1).
 * Unwired phaseCv should be 0.
 */
function nodeGraphParamSignalInPhaseAdd(domainPhase, phaseCv) {
  const p = (Number(domainPhase) || 0) + (Number(phaseCv) || 0);
  return p - Math.floor(p);
}

/**
 * SIGNAL IN — Amplitude jack multiplies level knob when wired.
 * hasAmp false → return domainLevel unchanged; true → domain * amp (default amp 1).
 */
function nodeGraphParamSignalInAmplitude(domainLevel, ampSample, hasAmp) {
  if (!hasAmp) {
    return Number(domainLevel) || 0;
  }
  return nodeGraphParamSignalInMultiply(domainLevel, ampSample, 1);
}

/**
 * Absolute-Hz jack (ƒ / Freq) when wired. Returns null if unwired.
 */
function nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId) {
  if (typeof hasInput !== "function" || typeof mixInput !== "function" || !nodeId) {
    return null;
  }
  if (hasInput(nodeId, "f")) {
    return mixInput(nodeId, "f");
  }
  if (hasInput(nodeId, "Freq")) {
    return mixInput(nodeId, "Freq");
  }
  return null;
}

/**
 * Resolve osc pitch from domain frequency + optional 0.1V/Oct jack.
 * Wired ƒ / Freq is absolute Hz and wins over the Frequency knob + 0.1V/Oct.
 * Through-zero: signed base Hz (negative reverses phase via bipolar Freq).
 */
function nodeGraphParamResolveOscPitchHz(options = {}) {
  if (options.hasAbsHz === true) {
    const abs = Number(options.fHz);
    return Number.isFinite(abs) ? abs : 0;
  }
  const jackHz = nodeGraphResolveAbsHzJack(options.hasInput, options.mixInput, options.nodeId);
  if (jackHz != null) {
    const abs = Number(jackHz);
    return Number.isFinite(abs) ? abs : 0;
  }
  const rawBase = Number(options.baseHz);
  const baseHz = Number.isFinite(rawBase) ? rawBase : 0;
  const pitchCv = options.pitchCv;
  const referenceVoltage = Number(options.referenceVoltage);
  const ref = Number.isFinite(referenceVoltage) ? referenceVoltage : 0;
  const hasPitch = options.hasPitchCv === true;
  const cv = hasPitch ? pitchCv : ref;
  if (typeof nodeGraphPitchedFrequency === "function") {
    return nodeGraphPitchedFrequency(baseHz, cv, ref);
  }
  if (!hasPitch) {
    return baseHz;
  }
  const c = Number(cv);
  const pitch = Number.isFinite(c) ? c : 0;
  const out = baseHz * (2 ** ((pitch - ref) / 0.1));
  return Number.isFinite(out) ? out : 0;
}

// Aliases matching older live/worklet names (thin adapters call these).
function nodeGraphParamValueToNormalizedSignal(value, metadata) {
  return nodeGraphParamDomainToUnit(value, metadata);
}
function nodeGraphParamNormalizedSignalToValue(signal, metadata) {
  return nodeGraphParamUnitToDomain(signal, metadata);
}
function nodeGraphParamApplyParameterModulation(base, modulationSignal, metadata) {
  return nodeGraphParamApplyMod(base, modulationSignal, metadata);
}
