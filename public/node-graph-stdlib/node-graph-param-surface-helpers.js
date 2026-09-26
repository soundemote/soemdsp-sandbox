// Parameter surfaces - MOD / domain SSOT (pure helpers; main + worklet).
//
// Three drive paths (do not mix contracts):
//
//   DOMAIN  - absolute knob value in params[key] (Hz, -1..1, ...).
//             min/max = slider range + DOMAIN<->unit map. UI may skew; MOD never does.
//
//   MOD     - param-row CV. Fold SSOT: nodeGraphParamFoldModSources /
//             nodeGraphParamApplyMod.
//             * Normal dest: |mod|<=1 -> linear unit add across [min,max] (no skew);
//               domain-tagged / |mod|>1 / engineering-unit -> ADD to Control/knob:
//               effective = paramValue + sum(domainMods)  (knob is an offset).
//             * outputDomain ("Use real mod values"): same ADD rule.
//               effective = paramValue + sum(domainMods) + domainOffset
//               domainOffset (paramMeta, default 0) always applies, even with no
//               MOD wires. Slider edits offset on +/-|max|, linear (no curve yet).
//             * Slider is always an offset: MOD always ADDs. Never multiply,
//               never replace. Unipolar clip when metadata.unipolarMod.
//
//   SIGNAL IN - named jacks (In, pitch/♯/♭, ...). Not MOD. Module evaluators.
//
// Native stamp: bit4 = real values (domain ADD, no clamp). Unit-band 0…1
// ADDs then clamps to min/max. No multiply. No replace.
//
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

/** @deprecated Pitch exponential is pitch (♯/♭) jack only — never param MOD. */
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
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  const min = Number(meta.min);
  const max = Number(meta.max);
  if (meta.wraparound && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return nodeGraphParamWrap(n, min, max);
  }
  if (!nodeGraphParamShouldHardClampDomain(meta)) {
    return n;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return n;
  }
  return nodeGraphParamClamp(n, min, max);
}

/**
 * After MOD, re-apply DOMAIN hard bounds?
 * Default **true** (Knob/Amp ranges stay in min…max). Explicit `modClamp: false`
 * or legacy unboundedMax/Min opts out. Wraparound always wraps via apply bounds.
 */
function nodeGraphParamModClamp(metadata = {}) {
  if (Object.hasOwn(metadata, "modClamp")) {
    return Boolean(metadata.modClamp);
  }
  if (metadata.unboundedMax || metadata.unboundedMin) {
    return false;
  }
  return true;
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
      : nodeGraphFiniteNumber(metadata.curveAmount);
    if (typeof nodeSliderSkewExponentFromSensitivity === "function") {
      return nodeSliderSkewExponentFromSensitivity(amount);
    }
    // Fallback if slider-values not loaded yet (same mapping as UI).
    // `amount` already -1…1 from normalize or the branch above.
    const a = amount;
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
 * Throw 0…1 → normalized domain 0…1.
 * Bipolar rational is symmetric about the center (more travel around 0 on a
 * −1…1 range). Other curves keep the power-law skew.
 */
function nodeGraphParamNormalizedFromThrow(throw01, metadata = {}) {
  const t = nodeGraphParamClamp(nodeGraphFiniteNumber(throw01), 0, 1);
  const curve = typeof normalizeNodeSliderCurve === "function"
    ? normalizeNodeSliderCurve(metadata.sliderCurve, metadata.nonlinearSlider)
    : "";
  if (
    curve === "bipolarRational"
    && typeof nodeSliderBipolarRationalValueFromTravel === "function"
  ) {
    return nodeSliderBipolarRationalValueFromTravel(t, metadata.curveAmount);
  }
  const exp = nodeGraphParamSkewExponent(metadata);
  return nodeGraphParamClamp(t ** exp, 0, 1);
}

/** Inverse of nodeGraphParamNormalizedFromThrow. */
function nodeGraphParamThrowFromNormalized(normalized01, metadata = {}) {
  const n = nodeGraphParamClamp(nodeGraphFiniteNumber(normalized01), 0, 1);
  const curve = typeof normalizeNodeSliderCurve === "function"
    ? normalizeNodeSliderCurve(metadata.sliderCurve, metadata.nonlinearSlider)
    : "";
  if (
    curve === "bipolarRational"
    && typeof nodeSliderBipolarRationalTravelFromValue === "function"
  ) {
    return nodeSliderBipolarRationalTravelFromValue(n, metadata.curveAmount);
  }
  const exp = nodeGraphParamSkewExponent(metadata);
  const inv = exp === 0 ? 1 : 1 / exp;
  return nodeGraphParamClamp(n ** inv, 0, 1);
}

/**
 * Widget throw: 0 = bottom/left of the control, 1 = top/right.
 * Reverse swaps which domain end sits at the bottom. Skew is included.
 * Ghosts and jacks must NOT use this — they follow the stored value.
 */
function nodeGraphParamControlPosition(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const bounded = metadata.wraparound
    ? nodeGraphParamWrap(nodeGraphFiniteNumber(value), min, max)
    : nodeGraphParamClamp(nodeGraphFiniteNumber(value), min, max);
  const normalizedValue = nodeGraphParamClamp((bounded - min) / range, 0, 1);
  const unit = nodeGraphParamThrowFromNormalized(normalizedValue, metadata);
  return metadata.reverse === true ? (1 - unit) : unit;
}

/** Inverse of nodeGraphParamControlPosition. */
function nodeGraphParamDomainFromControlPosition(position, metadata = {}) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const min = Number(meta.min);
  const max = Number(meta.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return Number.isFinite(min) ? min : 0;
  }
  let unitIn = nodeGraphFiniteNumber(position);
  if (meta.reverse === true) unitIn = 1 - unitIn;
  const normalizedSignal = meta.wraparound
    ? nodeGraphParamWrap(unitIn, 0, 1)
    : nodeGraphParamClamp(unitIn, 0, 1);
  const normalizedValue = nodeGraphParamNormalizedFromThrow(normalizedSignal, meta);
  return nodeGraphParamApplyDomainBounds(min + range * normalizedValue, meta);
}

/**
 * DOMAIN → unit [0, 1] for UI / display (may apply mid/custom skew).
 * Straight map of the stored value. Reverse is not applied.
 */
function nodeGraphParamDomainToUnit(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const bounded = metadata.wraparound
    ? nodeGraphParamWrap(nodeGraphFiniteNumber(value), min, max)
    : nodeGraphParamClamp(nodeGraphFiniteNumber(value), min, max);
  const normalizedValue = nodeGraphParamClamp((bounded - min) / range, 0, 1);
  return nodeGraphParamThrowFromNormalized(normalizedValue, metadata);
}

/**
 * Unit [0, 1] → DOMAIN for UI (inverse of skewed domainToUnit).
 */
function nodeGraphParamUnitToDomain(unit, metadata = {}) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const min = Number(meta.min);
  const max = Number(meta.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return Number.isFinite(min) ? min : 0;
  }
  const normalizedSignal = meta.wraparound
    ? nodeGraphParamWrap(nodeGraphFiniteNumber(unit), 0, 1)
    : nodeGraphParamClamp(nodeGraphFiniteNumber(unit), 0, 1);
  const normalizedValue = nodeGraphParamNormalizedFromThrow(normalizedSignal, meta);
  return nodeGraphParamApplyDomainBounds(min + range * normalizedValue, meta);
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
 * Coerce to number; use fallback ONLY when non-finite.
 * 0 is a real value — never write `nodeGraphFiniteNumber(x, default)` for knobs/CV.
 */
function nodeGraphFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Unit mods are offsets inside the parameter range (clamped).
 * Domain / real units only when the parameter or source is tagged
 * (Use real mod values). Magnitude never switches the mode.
 */

/**
 * Character filters (Superlove / Yellowjacket / …) map Frequency 0…1 → MIDI pitch
 * −12…135 → Hz inside native. PitchHz (and retired absolute ƒ) send real Hz.
 * Convert Hz → that 0…1 norm so domain REPLACE actually tracks the knob.
 */
const NODE_GRAPH_NORM_PITCH_FREQ_TYPES = new Set([
  "superloveFilter",
  "superloveRev2",
  "vcvrackSuperloveFilter",
  "yellowjacketFilter",
  "flowerChildFilter",
  "humanFilter",
  "resonatorFilter",
  "chaoticPhaseLockingFilter",
]);

function nodeGraphIsNormPitchFrequencyParam(nodeType, paramKey) {
  return NODE_GRAPH_NORM_PITCH_FREQ_TYPES.has(String(nodeType || ""))
    && String(paramKey || "") === "frequency";
}

/** Inverse of pitchToFreq(jmap01(n, −12, 135)). */
function nodeGraphHzToNormPitchFrequency(hz) {
  const h = Number(hz);
  if (!(h > 1e-12) || !Number.isFinite(h)) return 0;
  const pitch = 69 + 12 * (Math.log(h / 440) / Math.LN2);
  let n = (pitch + 12) / 147;
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  return n;
}

/** PitchHz Out → Superlove-style Frequency: Pitch→Hz is Hz; Hz→Pitch is MIDI pitch. */
function nodeGraphPitchHzSampleToNormPitchFrequency(srcNode, sample) {
  const mode = Number(
    srcNode?.params?.mode ?? srcNode?.parameters?.mode ?? 0,
  );
  const v = Number(sample);
  if (!Number.isFinite(v)) return 0;
  // mode >= 0.5 → Hz→Pitch (Out is MIDI-ish pitch)
  if (mode >= 0.5) {
    let n = (v + 12) / 147;
    if (n < 0) n = 0;
    if (n > 1) n = 1;
    return n;
  }
  return nodeGraphHzToNormPitchFrequency(v);
}

function nodeGraphIsControllerModSourceType(type) {
  const t = String(type || "");
  return t === "knob"
    || t === "pluginSlider"
    || t === "bias"
    || t === "toggleButton"
    || t === "momentaryButton";
}

/**
 * Knob/Bias/PitchHz/Hz → Superlove Frequency 0…1 (domain REPLACE payload).
 * Returns null when this source should use the normal unit/domain path.
 */
function nodeGraphNormPitchFrequencyModFromSource(dstType, paramKey, srcType, srcNode, sample) {
  if (!nodeGraphIsNormPitchFrequencyParam(dstType, paramKey)) {
    return null;
  }
  const v = Number(sample);
  if (!Number.isFinite(v)) {
    return { value: 0, domain: true };
  }
  if (srcType === "pitchHz") {
    return {
      value: nodeGraphPitchHzSampleToNormPitchFrequency(srcNode, v),
      domain: true,
    };
  }
  if (nodeGraphIsControllerModSourceType(srcType)) {
    const n = v < 0 ? 0 : (v > 1 ? 1 : v);
    return { value: n, domain: true };
  }
  return null;
}

/**
 * Normalize one MOD source entry to { value, domain }.
 * Accepts a bare number or { value|mod|sample, domain|isDomain|outputDomain }.
 * Domain only when the source is tagged (Use real mod values / outputDomain).
 * A bare number is a unit offset. Crossing ±1 does not retag it.
 */
function nodeGraphParamNormalizeModSource(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const value = Number(
      raw.value != null ? raw.value
        : raw.mod != null ? raw.mod
          : raw.sample != null ? raw.sample
            : raw,
    );
    const tagged = raw.domain === true
      || raw.isDomain === true
      || raw.outputDomain === true;
    const v = Number.isFinite(value) ? value : 0;
    return { value: v, domain: tagged };
  }
  const v = Number(raw);
  const n = Number.isFinite(v) ? v : 0;
  return { value: n, domain: false };
}

/** Domain-mode offset (Use real mod values). Default 0. */
function nodeGraphParamDomainOffset(metadata = {}) {
  const n = Number(metadata && metadata.domainOffset);
  return Number.isFinite(n) ? n : 0;
}

/** Offset slider span half-width: |param max| (fallback |min|, else 1). */
function nodeGraphParamDomainOffsetExtent(metadata = {}) {
  const max = Number(metadata && metadata.max);
  if (Number.isFinite(max) && Math.abs(max) > 0) {
    return Math.abs(max);
  }
  const min = Number(metadata && metadata.min);
  if (Number.isFinite(min) && Math.abs(min) > 0) {
    return Math.abs(min);
  }
  return 1;
}

/**
 * Apply one MOD sample onto DOMAIN base. SSOT: nodeGraphParamFoldModSources.
 * See file header for unit vs domain vs outputDomain+domainOffset rules.
 */
function nodeGraphParamApplyMod(base, modSum, metadata = {}) {
  const folded = nodeGraphParamFoldModSources(base, [modSum], metadata);
  return folded;
}

/**
 * Slider is always an offset. MOD always ADDs — never replace.
 */
function nodeGraphParamDomainModReplacesBase(_metadata = {}) {
  return false;
}

/**
 * Classify MOD sources into unit-band vs domain accumulators.
 * Domain mods ADD to the Control/knob (offset). Never replace.
 * Same per-source rules as fold — used by efficient native set_param_mod.
 * @returns {{ unitAdd: number, domainAdd: number, domainReplace: boolean }}
 */
function nodeGraphParamModAccumulators(sources, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  const clipNeg = metadata && metadata.unipolarMod === true;
  let unitAdd = 0;
  let domainAdd = 0;
  const list = Array.isArray(sources) ? sources : [sources];
  // Dest "Use real mod values" / outputDomain: every MOD is domain-valued ADD.
  const destDomain = metadata && metadata.outputDomain === true;
  for (const raw of list) {
    const src = nodeGraphParamNormalizeModSource(raw);
    let mod = src.value;
    let domain = src.domain;
    if (destDomain) domain = true;
    if (clipNeg) {
      mod = Math.max(0, mod);
    }
    if (domain) {
      domainAdd += mod;
    } else if (Number.isFinite(range) && range > 0) {
      unitAdd += mod;
    } else {
      domainAdd += mod;
    }
  }
  return { unitAdd, domainAdd, domainReplace: false };
}

/**
 * Effective-param early-out + fold. SSOT for live + worklet call sites.
 * - No mod sources AND not outputDomain → return base (skip fold work).
 * - outputDomain (mods optional / empty OK) → nodeGraphParamFoldModSources.
 * - Else fold mapped sources via nodeGraphParamFoldModSources.
 * Source tagging stays at the call site; this only gates + folds.
 */
function nodeGraphParamFoldOrBase(base, sources, metadata = {}) {
  const list = Array.isArray(sources) ? sources : (sources == null ? [] : [sources]);
  if (!list.length && !(metadata && metadata.outputDomain === true)) {
    return base;
  }
  return nodeGraphParamFoldModSources(base, list, metadata);
}

function nodeGraphParamFoldModSources(base, sources, metadata = {}) {
  // "Use real mod values": Control/knob (+ domainOffset) is an OFFSET added to
  // domain MOD sources. Offset applies even with no mod wires. No slider curve.
  if (metadata && metadata.outputDomain === true) {
    let domainAdd = 0;
    const list = Array.isArray(sources) ? sources : (sources == null ? [] : [sources]);
    if (list.length) {
      const acc = nodeGraphParamModAccumulators(list, metadata);
      domainAdd = Number(acc.domainAdd);
      if (!Number.isFinite(domainAdd)) domainAdd = 0;
    }
    const baseN = Number(base);
    const b = Number.isFinite(baseN) ? baseN : 0;
    // Knob is the parameter. outputDomain only means cables add in real units.
    let result = b + domainAdd;
    if (!Number.isFinite(result)) {
      return 0;
    }
    if (metadata.wraparound) {
      return nodeGraphParamApplyDomainBounds(result, metadata);
    }
    // min/max are display zoom only — do not hard-clip.
    return result;
  }

  const baseN = Number(base);
  const b = Number.isFinite(baseN) ? baseN : 0;
  const { unitAdd, domainAdd } = nodeGraphParamModAccumulators(sources, metadata);
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  const dAdd = Number(domainAdd);
  const domainSum = Number.isFinite(dAdd) ? dAdd : 0;
  let result = b;
  if (Number.isFinite(range) && range > 0 && unitAdd !== 0) {
    const baseUnit = nodeGraphParamDomainToUnitLinear(b, metadata);
    result = nodeGraphParamUnitToDomainLinear(baseUnit + unitAdd, metadata);
  }
  result = result + domainSum;
  if (!Number.isFinite(result)) {
    return 0;
  }
  if (metadata.wraparound) {
    return nodeGraphParamApplyDomainBounds(result, metadata);
  }
  // Real values: no clamp. Unit-band 0…1: clamp to min/max.
  if (domainSum !== 0 || (metadata && metadata.outputDomain === true)) {
    return result;
  }
  if (nodeGraphParamModClamp(metadata)) {
    const lo = Number(metadata.min);
    const hi = Number(metadata.max);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
      return nodeGraphParamClamp(result, lo, hi);
    }
  }
  return result;
}


/**
 * Parameter port as MOD/bus source.
 * Default: linear unit 0…1 of its domain (no skew) for Uni/Bi CV chaining.
 * `outputDomain: true` (per-param opt-in): emit raw DOMAIN (Hz, cycles, …)
 * — never normalize. Choice sliders are never tagged.
 */
function nodeGraphParamDomainToModOutput(value, metadata = {}) {
  if (metadata && metadata.outputDomain === true) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return nodeGraphParamDomainToUnitLinear(value, metadata);
}

/**
 * SIGNAL IN — additive domain (Knob-style): result = domain + inSample.
 * Unwired inSample should be passed as 0.
 */
function nodeGraphParamSignalInAdditive(domainValue, inSample) {
  return nodeGraphFiniteNumber(domainValue) + nodeGraphFiniteNumber(inSample);
}

/**
 * SIGNAL IN — multiplicative depth (Amplitude-style): domain * scale.
 * Unwired scale should be passed as 1.
 */
function nodeGraphParamSignalInMultiply(domainValue, scaleSample, defaultScale = 1) {
  const s = Number(scaleSample);
  const scale = Number.isFinite(s) ? s : defaultScale;
  return (nodeGraphFiniteNumber(domainValue)) * scale;
}

/**
 * SIGNAL IN — phase jack adds to phase knob (cycles), wrapped to [0, 1).
 * Unwired phaseCv should be 0.
 */
function nodeGraphParamSignalInPhaseAdd(domainPhase, phaseCv) {
  const p = nodeGraphFiniteNumber(domainPhase) + nodeGraphFiniteNumber(phaseCv);
  return p - Math.floor(p);
}

/**
 * SIGNAL IN — Amplitude jack multiplies level knob when wired.
 * hasAmp false → return domainLevel unchanged; true → domain * amp (default amp 1).
 */
function nodeGraphParamSignalInAmplitude(domainLevel, ampSample, hasAmp) {
  if (!hasAmp) {
    return nodeGraphFiniteNumber(domainLevel);
  }
  return nodeGraphParamSignalInMultiply(domainLevel, ampSample, 1);
}

/**
 * Retired absolute-Hz jack resolver (always null). Domain MOD replaces ƒ.
 */
function nodeGraphResolveAbsHzJack(/* hasInput, mixInput, nodeId */) {
  // Absolute ƒ jack retired — domain MOD on Frequency replaces it.
  return null;
}

/** Patch-wide pitch transpose ratio (2^octaves). 1 when unset / 0. */
function nodeGraphPatchPitchOffsetRatio() {
  const audio = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio)
    : null;
  const oct = nodeGraphFiniteNumber(audio?.pitchOffsetOctaves, 0);
  if (oct === 0) return 1;
  const ratio = 2 ** oct;
  return Number.isFinite(ratio) ? ratio : 1;
}

/**
 * Wired ƒ / Freq = absolute Hz (cancels Frequency knob + pitch).
 * Else wired pitch (♯/♭ MIDI note) pitches the Frequency knob vs patch
 * pitchReferenceMidiNote (default 69). Else knobHz.
 * Then × patch Pitch (−10…+10 oct). Same as WASM.
 */
function nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId) {
  let hz;
  const jack = nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId);
  if (jack != null) {
    const n = Number(jack);
    hz = Number.isFinite(n) ? n : 0;
  } else {
    const hasPitch = typeof hasInput === "function" && (
      hasInput(nodeId, "pitch") || hasInput(nodeId, "0.1V/Oct")
    );
    if (hasPitch && typeof mixInput === "function") {
      const referenceMidi =
        typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
          ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote
          : 69;
      const pitchCv = nodeGraphFiniteNumber(
        mixInput(nodeId, "pitch") ?? mixInput(nodeId, "0.1V/Oct"),
      );
      if (typeof nodeGraphParamResolveOscPitchHz === "function") {
        hz = nodeGraphParamResolveOscPitchHz({
          baseHz: knobHz,
          hasPitchCv: true,
          pitchCv,
          referenceVoltage: referenceMidi,
          skipPatchPitchOffset: true,
        });
      } else if (typeof nodeGraphPitchedFrequency === "function") {
        hz = nodeGraphPitchedFrequency(knobHz, pitchCv, referenceMidi);
      } else {
        const base = Number(knobHz);
        hz = (Number.isFinite(base) ? base : 0) * (2 ** ((pitchCv - referenceMidi) / 12));
      }
    } else {
      const k = Number(knobHz);
      hz = Number.isFinite(k) ? k : 0;
    }
  }
  const out = hz * nodeGraphPatchPitchOffsetRatio();
  return Number.isFinite(out) ? out : 0;
}

/**
 * Resolve osc pitch from domain frequency + optional pitch (♯/♭) jack.
 * Wired ƒ / Freq is absolute Hz and wins over the Frequency knob + pitch.
 * Through-zero: signed base Hz (negative reverses phase via bipolar Freq).
 * referenceVoltage option is MIDI note (legacy name kept).
 */
function nodeGraphParamResolveOscPitchHz(options = {}) {
  let hz;
  if (options.hasAbsHz === true) {
    const abs = Number(options.fHz);
    hz = Number.isFinite(abs) ? abs : 0;
  } else {
    const jackHz = nodeGraphResolveAbsHzJack(options.hasInput, options.mixInput, options.nodeId);
    if (jackHz != null) {
      const abs = Number(jackHz);
      hz = Number.isFinite(abs) ? abs : 0;
    } else {
      const rawBase = Number(options.baseHz);
      const baseHz = Number.isFinite(rawBase) ? rawBase : 0;
      const pitchCv = options.pitchCv;
      const referenceVoltage = Number(options.referenceVoltage);
      const ref = Number.isFinite(referenceVoltage) ? referenceVoltage : 69;
      const hasPitch = options.hasPitchCv === true;
      const cv = hasPitch ? pitchCv : ref;
      if (typeof nodeGraphPitchedFrequency === "function") {
        hz = nodeGraphPitchedFrequency(baseHz, cv, ref);
      } else if (!hasPitch) {
        hz = baseHz;
      } else {
        const c = Number(cv);
        const pitch = Number.isFinite(c) ? c : 0;
        hz = baseHz * (2 ** ((pitch - ref) / 12));
      }
    }
  }
  if (options.skipPatchPitchOffset === true) {
    return Number.isFinite(hz) ? hz : 0;
  }
  const out = (Number.isFinite(hz) ? hz : 0) * nodeGraphPatchPitchOffsetRatio();
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
