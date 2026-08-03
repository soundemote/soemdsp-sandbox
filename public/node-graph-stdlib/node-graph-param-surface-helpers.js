// Explicit parameter surfaces (Phase F).
//
// Three different ways a control is driven — three different contracts:
//
//   DOMAIN   — the knob/slider value in real units (Hz, −1…1, …).
//              Source of truth for the parameter store / readout.
//
//   MOD      — param-row modulation CV. Always interpreted as a bipolar
//              unit signal in [−1, 1]. Applied with nodeGraphParamApplyMod:
//                • kind "frequency" → 0.1V/Oct style: baseHz * 2^(mod / 0.1)
//                • everything else  → unit-space add, then map back to domain
//                  (with nonlinear mid skew when nonlinearSlider is set).
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
 * DOMAIN bounds: clamp or wrap into [min, max] when finite.
 */
function nodeGraphParamApplyDomainBounds(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  if (metadata.unboundedMin && metadata.unboundedMax) {
    return Number(value) || 0;
  }
  if (metadata.unboundedMin && Number.isFinite(max)) {
    return Math.min(Number(value) || 0, max);
  }
  if (metadata.unboundedMax && Number.isFinite(min)) {
    return Math.max(Number(value) || 0, min);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return Number(value) || 0;
  }
  return metadata.wraparound
    ? nodeGraphParamWrap(Number(value) || 0, min, max)
    : nodeGraphParamClamp(Number(value) || 0, min, max);
}

/**
 * Nonlinear mid skew: maps linear unit 0.5 → mid of domain.
 * exponent 1 = linear.
 */
function nodeGraphParamSkewExponent(metadata = {}) {
  if (!metadata.nonlinearSlider) {
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
 */
function nodeGraphParamApplyMod(base, modSum, metadata = {}) {
  const mod = Number(modSum) || 0;
  if (nodeGraphParamUsesPitchMod(metadata)) {
    // 0.1V/Oct: mod of +0.1 → +1 octave (same scale as pitch jacks).
    const baseFrequency = Math.max(1e-6, Number(base) || 1e-6);
    const octaves = mod / 0.1;
    return nodeGraphParamApplyDomainBounds(baseFrequency * (2 ** octaves), metadata);
  }
  const baseUnit = nodeGraphParamDomainToUnit(base, metadata);
  return nodeGraphParamUnitToDomain(baseUnit + mod, metadata);
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
