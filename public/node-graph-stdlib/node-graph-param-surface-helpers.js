// Explicit parameter surfaces (Phase F).
//
// Three different ways a control is driven — three different contracts:
//
//   DOMAIN   — the knob/slider value in real units (Hz, −1…1, …).
//              Source of truth for the parameter store / readout.
//              min/max define the *slider* range (and unit mapping for MOD),
//              not a hard clip on stored/effective values — unless the param
//              is wraparound, has constraint cpu|gpu|ram, or hardClamp:true.
//
//   MOD      — param-row modulation CV. Always interpreted as a bipolar
//              unit signal in [−1, 1]. Applied with nodeGraphParamApplyMod:
//                • kind "frequency" → 0.1V/Oct style: baseHz * 2^(mod / 0.1)
//                • everything else  → unit-space add, then map back to domain
//                  (with mid/custom skew when sliderCurve is skew/custom).
//              After MOD, hard clamp only when wraparound / resource constraint
//              / hardClamp / explicit modClamp:true (default: do not re-clamp).
//
//   SIGNAL IN — named input jacks (In, 0.1V/Oct, Phase, Amplitude, …).
//              NOT the same as MOD. Handled by module evaluators:
//                • additive In:     nodeGraphDspBiasFromIn / In + domain
//                • pitch 0.1V/Oct:  nodeGraphPitchedFrequency
//                • Phase jack:      usually domain + CV (cycles)
//                • Amplitude jack:  usually domain * CV
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

/** True when this param should use 0.1V/Oct-style mod (not unit-space add). */
function nodeGraphParamUsesPitchMod(metadata = {}) {
  return nodeGraphParamKind(metadata) === "frequency";
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
 * DOMAIN → unit [0, 1] (for mod math on non-frequency params).
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
 * Unit [0, 1] → DOMAIN (inverse of domainToUnit).
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
 * MOD surface: raw bus sample → bipolar unit [−1, 1].
 * Always bipolar so LFOs through-zero work on any param (not only frequency).
 */
function nodeGraphParamNormalizeModInput(value, _metadata = {}) {
  return nodeGraphParamClamp(Number(value) || 0, -1, 1);
}

/**
 * Apply summed MOD (already normalized, may be outside [−1,1] if multi-source)
 * onto a DOMAIN base value.
 * Hard re-clamp after MOD only when nodeGraphParamModClamp says so
 * (wraparound / resource constraint / hardClamp / explicit modClamp:true).
 */
function nodeGraphParamApplyMod(base, modSum, metadata = {}) {
  const mod = Number(modSum) || 0;
  const shouldClamp = nodeGraphParamModClamp(metadata);
  let result;
  if (nodeGraphParamUsesPitchMod(metadata)) {
    // 0.1V/Oct: mod of +0.1 → +1 octave. Through-zero: keep sign of base.
    const baseFrequency = Number(base);
    const b = Number.isFinite(baseFrequency) ? baseFrequency : 0;
    if (Math.abs(b) < 1e-18) {
      result = 0;
    } else {
      result = b * (2 ** (mod / 0.1));
    }
  } else {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    const baseUnit = nodeGraphParamDomainToUnit(base, metadata);
    const unit = baseUnit + mod;
    if (!Number.isFinite(range) || range <= 0) {
      result = Number.isFinite(min) ? min : 0;
    } else if (metadata.wraparound) {
      // Wraparound params always stay in range (toroidal domain).
      result = nodeGraphParamUnitToDomain(unit, metadata);
      return result;
    } else {
      const exp = nodeGraphParamSkewExponent(metadata);
      // Inside [0,1]: mid/custom power skew. Outside: linear unit so MOD can open.
      const nv = (unit >= 0 && unit <= 1) ? (unit ** exp) : unit;
      result = min + range * nv;
    }
  }
  if (!Number.isFinite(result)) {
    return 0;
  }
  return shouldClamp ? nodeGraphParamApplyDomainBounds(result, metadata) : result;
}

/**
 * DOMAIN value as a unit signal for *output* (parameter ports used as sources).
 * Same as domainToUnit — named for the "parameter output → bus" direction.
 */
function nodeGraphParamDomainToModOutput(value, metadata = {}) {
  return nodeGraphParamDomainToUnit(value, metadata);
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
 * Resolve osc pitch from domain frequency + optional 0.1V/Oct + optional f jack.
 * Through-zero: signed Hz (negative reverses phase). When f is wired:
 * hz = f × Frequency (signed). 0.1V/Oct scales magnitude, keeps base sign.
 */
function nodeGraphParamResolveOscPitchHz(options = {}) {
  const rawBase = Number(options.baseHz);
  const baseHz = Number.isFinite(rawBase) ? rawBase : 0;
  const pitchCv = options.pitchCv;
  const referenceVoltage = Number(options.referenceVoltage);
  const ref = Number.isFinite(referenceVoltage) ? referenceVoltage : 0;
  const hasPitch = options.hasPitchCv === true;
  const fHz = options.fHz;
  // f wired: Frequency multiplies f (signed TZ); pitch CV not applied here.
  if (fHz != null && Number.isFinite(Number(fHz))) {
    if (typeof nodeGraphResolveFrequencyHz === "function") {
      return nodeGraphResolveFrequencyHz(baseHz, Number(fHz));
    }
    const hz = Number(fHz) * baseHz;
    return Number.isFinite(hz) ? hz : 0;
  }
  const cv = hasPitch ? pitchCv : ref;
  if (typeof nodeGraphPitchedFrequency === "function") {
    return nodeGraphPitchedFrequency(baseHz, cv, ref);
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
