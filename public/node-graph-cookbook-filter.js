// Per-stage biquad is 2-pole (12 dB/oct); cascade Stages multiplies slope.
// Compact labels match Active/TB-303 style (no spaces).
const nodeGraphCookbookFilterModes = Object.freeze([
  "Bypass",
  "LP12",
  "HP12",
  "BP12 Skirt",
  "BP12 Peak",
  "BR12",
  "AP12",
  "Peak",
  "LS12",
  "HS12",
]);

function createNodeGraphCookbookFilterState() {
  return {
    lastStages: 2,
    x1: [0, 0, 0, 0, 0],
    x2: [0, 0, 0, 0, 0],
    y1: [0, 0, 0, 0, 0],
    y2: [0, 0, 0, 0, 0],
  };
}

function resetNodeGraphCookbookFilterState(state) {
  for (const key of ["x1", "x2", "y1", "y2"]) {
    if (Array.isArray(state?.[key])) {
      state[key].fill(0);
    }
  }
}

function nodeGraphCookbookFilterStageCount(stages) {
  const value = Math.round(Number(stages));
  return Number.isFinite(value) ? clampNodeSliderValue(value, 0, 5) : 2;
}

function nodeGraphCookbookFilterCoefficients(
  mode,
  frequency,
  q,
  gainDb,
  sampleRate = 44100,
) {
  const safeMode = Math.round(clampNodeSliderValue(Number(mode) || 0, 0, 9));
  if (safeMode === 0) {
    return { a1: 0, a2: 0, b0: 1, b1: 0, b2: 0 };
  }
  const rate = Math.max(1, Number(sampleRate) || Number(globalThis.nodeGraphMvp?.sampleRate) || 44100);
  // 0 Hz allowed (frozen). Only crash-safety: non-negative + Nyquist ceiling.
  const rawFreq = Number(frequency);
  const freq = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawFreq) ? rawFreq : 0));
  const safeQ = Math.max(0.0001, Number(q) || 1);
  const omega = 2 * Math.PI * freq / rate;
  const sine = Math.sin(omega);
  const cosine = Math.cos(omega);
  const alpha = sine / (2 * safeQ);
  const amplitude = 10 ** (0.025 * (Number(gainDb) || 0));
  const beta = Math.sqrt(amplitude) / safeQ;
  let a0 = 1 + alpha;
  let a1 = -2 * cosine;
  let a2 = 1 - alpha;
  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  if (safeMode === 1) {
    b1 = 1 - cosine;
    b0 = b1 * 0.5;
    b2 = b0;
  } else if (safeMode === 2) {
    b1 = -(1 + cosine);
    b0 = -b1 * 0.5;
    b2 = b0;
  } else if (safeMode === 3) {
    b0 = safeQ * alpha;
    b1 = 0;
    b2 = -b0;
  } else if (safeMode === 4) {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else if (safeMode === 5) {
    b0 = 1;
    b1 = -2 * cosine;
    b2 = 1;
  } else if (safeMode === 6) {
    b0 = 1 - alpha;
    b1 = -2 * cosine;
    b2 = 1 + alpha;
  } else if (safeMode === 7) {
    a0 = 1 + alpha / amplitude;
    a1 = -2 * cosine;
    a2 = 1 - alpha / amplitude;
    b0 = 1 + alpha * amplitude;
    b1 = -2 * cosine;
    b2 = 1 - alpha * amplitude;
  } else if (safeMode === 8) {
    a0 = (amplitude + 1) + (amplitude - 1) * cosine + beta * sine;
    a1 = -2 * ((amplitude - 1) + (amplitude + 1) * cosine);
    a2 = (amplitude + 1) + (amplitude - 1) * cosine - beta * sine;
    b0 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta * sine);
    b1 = 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine);
    b2 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta * sine);
  } else if (safeMode === 9) {
    a0 = (amplitude + 1) - (amplitude - 1) * cosine + beta * sine;
    a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosine);
    a2 = (amplitude + 1) - (amplitude - 1) * cosine - beta * sine;
    b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta * sine);
    b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine);
    b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta * sine);
  }
  const scale = a0 !== 0 ? 1 / a0 : 1;
  return {
    a1: a1 * scale,
    a2: a2 * scale,
    b0: b0 * scale,
    b1: b1 * scale,
    b2: b2 * scale,
  };
}

function nodeGraphCookbookFilterSample(
  state,
  input,
  mode,
  frequency,
  q,
  gainDb,
  stages,
  sampleRate,
  runtime = null,
  nodeId = "",
) {
  const stageCount = nodeGraphCookbookFilterStageCount(stages);
  if (!state || stageCount <= 0 || Math.round(Number(mode) || 0) === 0) {
    return Number(input) || 0;
  }
  if (state.lastStages !== stageCount) {
    resetNodeGraphCookbookFilterState(state);
    state.lastStages = stageCount;
  }
  const coeff = nodeGraphCookbookFilterCoefficients(mode, frequency, q, gainDb, sampleRate);
  let value = typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "cookbook filter input")
    : Number(input) || 0;
  for (let index = 0; index < stageCount; index += 1) {
    const previousInput = value;
    value = coeff.b0 * value + coeff.b1 * state.x1[index] + coeff.b2 * state.x2[index]
      - coeff.a1 * state.y1[index] - coeff.a2 * state.y2[index];
    state.x2[index] = state.x1[index];
    state.x1[index] = previousInput;
    state.y2[index] = state.y1[index];
    state.y1[index] = value;
  }
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(value, runtime, nodeId, state, "cookbook filter output")
    : value;
}

function nodeGraphCookbookFilterMagnitudeAt(coeff, frequency, sampleRate, stages) {
  const omega = 2 * Math.PI * Math.max(0, frequency) / Math.max(1, sampleRate);
  const c1 = Math.cos(omega);
  const s1 = Math.sin(omega);
  const c2 = Math.cos(2 * omega);
  const s2 = Math.sin(2 * omega);
  const numeratorRe = coeff.b0 + coeff.b1 * c1 + coeff.b2 * c2;
  const numeratorIm = -(coeff.b1 * s1 + coeff.b2 * s2);
  const denominatorRe = 1 + coeff.a1 * c1 + coeff.a2 * c2;
  const denominatorIm = -(coeff.a1 * s1 + coeff.a2 * s2);
  const numerator = Math.hypot(numeratorRe, numeratorIm);
  const denominator = Math.max(1e-12, Math.hypot(denominatorRe, denominatorIm));
  return (numerator / denominator) ** nodeGraphCookbookFilterStageCount(stages);
}

function nodeGraphOnePoleFilterCoefficient(frequency, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || Number(globalThis.nodeGraphMvp?.sampleRate) || 44100);
  const frequencyValue = Math.max(0, Number(frequency) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  return Math.exp(-w);
}

function nodeGraphOnePoleLowpassMagnitudeAt(cutoff, frequency, sampleRate) {
  const a1 = nodeGraphOnePoleFilterCoefficient(cutoff, sampleRate);
  const b0 = 1 - a1;
  const omega = 2 * Math.PI * Math.max(0, frequency) / Math.max(1, sampleRate);
  const denominator = Math.max(1e-12, Math.hypot(1 - a1 * Math.cos(omega), a1 * Math.sin(omega)));
  return Math.abs(b0) / denominator;
}

function nodeGraphOnePoleHighpassMagnitudeAt(cutoff, frequency, sampleRate) {
  const a1 = nodeGraphOnePoleFilterCoefficient(cutoff, sampleRate);
  const b0 = 0.5 * (1 + a1);
  const omega = 2 * Math.PI * Math.max(0, frequency) / Math.max(1, sampleRate);
  const numerator = Math.hypot(b0 - b0 * Math.cos(omega), b0 * Math.sin(omega));
  const denominator = Math.max(1e-12, Math.hypot(1 - a1 * Math.cos(omega), a1 * Math.sin(omega)));
  return numerator / denominator;
}

function nodeGraphBandpassMagnitudeAt(lowCut, highCut, frequency, sampleRate) {
  const low = Math.min(Number(lowCut) || 0, Number(highCut) || 0);
  const high = Math.max(Number(lowCut) || 0, Number(highCut) || 0);
  return nodeGraphOnePoleHighpassMagnitudeAt(low, frequency, sampleRate) *
    nodeGraphOnePoleLowpassMagnitudeAt(high, frequency, sampleRate);
}

function nodeGraphCookbookSweepHz(hz, semitones) {
  if (typeof nodeGraphSweepFrequencyHz === "function") {
    return nodeGraphSweepFrequencyHz(hz, semitones);
  }
  const f = Number(hz);
  if (!Number.isFinite(f) || f <= 0) {
    return 0;
  }
  const st = Number(semitones);
  if (!Number.isFinite(st) || st === 0) {
    return f;
  }
  const out = f * (2 ** (st / 12));
  return Number.isFinite(out) && out > 0 ? out : 0;
}

function nodeGraphActiveFilterSlopeMagnitudeAt(kind, cutoff, frequency, slope, sampleRate) {
  const stages = (Number.isFinite(Number(slope)) ? Math.max(0, Math.min(3, Math.round(Number(slope)))) : 1) + 1;
  const one = kind === "hp"
    ? nodeGraphOnePoleHighpassMagnitudeAt(cutoff, frequency, sampleRate)
    : nodeGraphOnePoleLowpassMagnitudeAt(cutoff, frequency, sampleRate);
  let mag = 1;
  for (let i = 0; i < stages; i += 1) {
    mag *= one;
  }
  return mag;
}

// Ladder stage/mix/coefficients: node-graph-shared-dsp-helpers.js (always
// loaded). Do not depend on ladder-filter-live-evaluator.js — release shells
// omit that twin for native ladder.

function nodeGraphComplexMultiply(a, b) {
  return {
    im: a.re * b.im + a.im * b.re,
    re: a.re * b.re - a.im * b.im,
  };
}

function nodeGraphComplexAdd(a, b) {
  return { im: a.im + b.im, re: a.re + b.re };
}

function nodeGraphComplexScale(a, scalar) {
  return { im: a.im * scalar, re: a.re * scalar };
}

function nodeGraphLadderFilterMagnitudeAt(params, frequency, sampleRate) {
  // Match ladder-filter-live-evaluator topology:
  //   y0 = g*x - k*y4 ; yi = onePole(y{i-1}) ; out = Σ c[i]*yi
  // Frequency response must close the feedback loop or Resonance only
  // scales overall gain (no peak at cutoff on the module face).
  const coeff = nodeGraphLadderFilterCoefficients(
    params.frequency,
    params.resonance,
    params.mode,
    params.stages,
    sampleRate,
  );
  const omega = 2 * Math.PI * Math.max(0, frequency) / Math.max(1, sampleRate);
  const zInv = { im: -Math.sin(omega), re: Math.cos(omega) };
  const denominator = nodeGraphComplexAdd({ re: 1, im: 0 }, nodeGraphComplexScale(zInv, coeff.a));
  const stage = nodeGraphComplexScale(
    { re: denominator.re, im: -denominator.im },
    (1 + coeff.a) / Math.max(1e-12, denominator.re * denominator.re + denominator.im * denominator.im),
  );
  // taps[i] = S^i (relative to y0). Feedback always reads y4.
  const taps = [{ re: 1, im: 0 }];
  let stagePower = { re: 1, im: 0 };
  for (let index = 1; index <= 4; index += 1) {
    stagePower = nodeGraphComplexMultiply(stagePower, stage);
    taps.push({ re: stagePower.re, im: stagePower.im });
  }
  const s4 = taps[4];
  const feedbackDen = nodeGraphComplexAdd(
    { re: 1, im: 0 },
    nodeGraphComplexScale(s4, Number(coeff.k) || 0),
  );
  const invDenMag2 = Math.max(
    1e-12,
    feedbackDen.re * feedbackDen.re + feedbackDen.im * feedbackDen.im,
  );
  const y0FromX = nodeGraphComplexScale(
    { re: feedbackDen.re, im: -feedbackDen.im },
    (Number(coeff.g) || 1) / invDenMag2,
  );
  let sum = { re: 0, im: 0 };
  for (let index = 0; index < coeff.c.length; index += 1) {
    const weight = Number(coeff.c[index]) || 0;
    if (!weight) {
      continue;
    }
    const tap = taps[index] || { re: 0, im: 0 };
    sum = nodeGraphComplexAdd(
      sum,
      nodeGraphComplexScale(nodeGraphComplexMultiply(tap, y0FromX), weight),
    );
  }
  const mag = Math.hypot(sum.re, sum.im);
  return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
}

/**
 * Live display value for a filter param (domain units only — Hz, Q, dB, …).
 * Prefers the slider’s domainValue (mid-drag before patch commit), then patch
 * params. Metaparameters own min/max mapping; do not invent unit→domain math here.
 * Ghost parameter-source mods still apply when present.
 */
function nodeGraphFilterCurveLiveParam(node, key, fallback = 0) {
  const nodeId = node?.id || "";
  const rawMeta = typeof nodeGraphReadPatchParameterMetadata === "function"
    ? nodeGraphReadPatchParameterMetadata(node, key)
    : (node?.paramMeta?.[key] || {});
  const metadata = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
  let base = Number(fallback) || 0;
  const slider = typeof nodeGraphSliderForParameter === "function"
    ? nodeGraphSliderForParameter(nodeId, key)
    : null;
  if (slider) {
    // Domain value only (metaparam range). Never use input.value (unit thumb).
    const fromDomain = Number(slider.dataset?.domainValue);
    if (Number.isFinite(fromDomain)) {
      base = fromDomain;
    } else if (typeof nodeGraphReadNodeNumber === "function") {
      const fromNode = Number(nodeGraphReadNodeNumber(nodeId, key));
      if (Number.isFinite(fromNode)) base = fromNode;
    }
  } else {
    const fromPatch = Number(node?.params?.[key]);
    if (Number.isFinite(fromPatch)) {
      base = fromPatch;
    }
  }
  // Ghost signal is base + param-source mods in normalized space.
  if (typeof nodeGraphParameterGhostSignal === "function"
    && typeof nodeGraphNormalizedSignalToParameterValue === "function") {
    const ghost = nodeGraphParameterGhostSignal(nodeId, key);
    if (ghost !== null && Number.isFinite(ghost)) {
      return nodeGraphNormalizedSignalToParameterValue(ghost, metadata);
    }
  }
  if (typeof nodeGraphApplyParameterBounds === "function") {
    return nodeGraphApplyParameterBounds(base, metadata);
  }
  return base;
}

function nodeGraphIsCrossoverType(type) {
  return /^crossover[2-6]$/.test(String(type || ""));
}

function nodeGraphCrossoverBandCountFromType(type) {
  const match = String(type || "").match(/^crossover([2-6])$/);
  return match ? Number(match[1]) : 0;
}

/** Param keys for the N-1 split frequencies on a crossover module. */
function nodeGraphCrossoverSplitFreqKeys(bandCount) {
  const splits = Math.max(1, (Number(bandCount) || 2) - 1);
  if (splits === 1) {
    return ["frequency"];
  }
  return Array.from({ length: splits }, (_v, index) => `frequency${index + 1}`);
}

function nodeGraphFilterCurveFormatHz(hz) {
  const f = Number(hz);
  if (!Number.isFinite(f) || f < 0) {
    return "—";
  }
  if (f >= 10000) {
    return `${Math.round(f / 1000)}k`;
  }
  if (f >= 1000) {
    const k = f / 1000;
    const text = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "");
    return `${text}k`;
  }
  if (f >= 100) {
    return String(Math.round(f));
  }
  if (f >= 10) {
    return f.toFixed(1).replace(/\.0$/, "");
  }
  return f.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Approximate successive LR band magnitude (visual guide, not bit-identical DSP).
 * stages ≈ LR order/2 one-pole sections (LR2→1, LR4→2, LR8→4).
 */
function nodeGraphCrossoverBandMagnitudeAt(hz, splits, bandIndex, bandCount, lrOrder, sampleRate) {
  const order = Math.round(Number(lrOrder) || 4);
  const stages = order <= 2 ? 1 : order >= 8 ? 4 : 2;
  const n = Math.max(2, Number(bandCount) || 2);
  const b = Math.max(0, Math.min(n - 1, Number(bandIndex) || 0));
  const freqs = Array.isArray(splits) ? splits : [];
  let mag = 1;
  for (let i = 0; i < freqs.length; i += 1) {
    const fc = Math.max(0, Number(freqs[i]) || 0);
    for (let s = 0; s < stages; s += 1) {
      if (b > i) {
        mag *= nodeGraphOnePoleHighpassMagnitudeAt(fc, hz, sampleRate);
      } else if (b === i && b < n - 1) {
        mag *= nodeGraphOnePoleLowpassMagnitudeAt(fc, hz, sampleRate);
      } else if (b < i) {
        // Already extracted; not in this remaining path.
      } else if (b === n - 1) {
        mag *= nodeGraphOnePoleHighpassMagnitudeAt(fc, hz, sampleRate);
      }
    }
  }
  return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
}

function nodeGraphFilterCurveView(node) {
  if (!node) {
    return null;
  }
  if (nodeGraphIsCrossoverType(node.type)) {
    const bandCount = nodeGraphCrossoverBandCountFromType(node.type);
    const keys = nodeGraphCrossoverSplitFreqKeys(bandCount);
    const defaults = typeof nodeGraphCrossoverDefaultFreqs === "function"
      ? nodeGraphCrossoverDefaultFreqs(bandCount)
      : keys.map(() => 1000);
    const frequencies = keys.map((key, index) =>
      nodeGraphFilterCurveLiveParam(node, key, defaults[index] ?? 1000));
    // Enforce non-decreasing for display (same as DSP).
    for (let i = 1; i < frequencies.length; i += 1) {
      if (frequencies[i] < frequencies[i - 1]) {
        frequencies[i] = frequencies[i - 1];
      }
    }
    return {
      type: node.type,
      bandCount,
      frequencies,
      order: nodeGraphFilterCurveLiveParam(node, "order", 4),
      bandNames: typeof nodeGraphCrossoverBandNames === "function"
        ? nodeGraphCrossoverBandNames(bandCount)
        : null,
    };
  }
  if (node.type === "passiveFilter") {
    const sweep = nodeGraphFilterCurveLiveParam(node, "sweep", 0);
    return {
      type: node.type,
      mode: Math.round(nodeGraphFilterCurveLiveParam(node, "mode", 0)),
      lowFrequency: nodeGraphCookbookSweepHz(nodeGraphFilterCurveLiveParam(node, "lowFrequency", 200), sweep),
      highFrequency: nodeGraphCookbookSweepHz(nodeGraphFilterCurveLiveParam(node, "highFrequency", 1000), sweep),
      slope: nodeGraphFilterCurveLiveParam(node, "slope", 0),
      stagger: nodeGraphFilterCurveLiveParam(node, "stagger", 1),
      gainCompensation: nodeGraphFilterCurveLiveParam(node, "gainCompensation", 1),
    };
  }
  if (node.type === "activeFilter") {
    const mode = Math.round(nodeGraphFilterCurveLiveParam(node, "mode", 3));
    const params = {
      highFrequency: nodeGraphFilterCurveLiveParam(node, "highFrequency", 1000),
      hpSlope: nodeGraphFilterCurveLiveParam(node, "hpSlope", 1),
      lowFrequency: nodeGraphFilterCurveLiveParam(node, "lowFrequency", 200),
      lpSlope: nodeGraphFilterCurveLiveParam(node, "lpSlope", 1),
      mode,
      sweep: nodeGraphFilterCurveLiveParam(node, "sweep", 0),
    };
    const resolved = typeof nodeGraphActiveFilterResolveParams === "function"
      ? nodeGraphActiveFilterResolveParams(params)
      : { bandpass: mode >= 8, ...params };
    return {
      type: node.type,
      bandpass: !!resolved.bandpass,
      frequency: resolved.frequency,
      highFrequency: resolved.highFrequency,
      hpSlope: resolved.hpSlope,
      lowFrequency: resolved.lowFrequency,
      lpSlope: resolved.lpSlope,
      mode: resolved.mode,
    };
  }
  if (node.type === "ladderFilter") {
    return {
      type: node.type,
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      mode: nodeGraphFilterCurveLiveParam(node, "mode", 1),
      resonance: nodeGraphFilterCurveLiveParam(node, "resonance", 0),
      stages: nodeGraphFilterCurveLiveParam(node, "stages", 4),
    };
  }
  if (node.type === "papoulisFilter") {
    return {
      type: node.type,
      cutoff: nodeGraphFilterCurveLiveParam(node, "cutoff", 1000),
    };
  }
  if (node.type === "tb303Filter") {
    return {
      type: node.type,
      mode: nodeGraphFilterCurveLiveParam(node, "mode", 4),
      cutoff: nodeGraphFilterCurveLiveParam(node, "cutoff", 1000),
      resonance: nodeGraphFilterCurveLiveParam(node, "resonance", 0),
      drive: nodeGraphFilterCurveLiveParam(node, "drive", 0),
    };
  }
  if (node.type === "eqFilter") {
    return {
      type: node.type,
      mode: nodeGraphFilterCurveLiveParam(node, "mode", 1),
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      q: nodeGraphFilterCurveLiveParam(node, "q", 0.707),
      gain: nodeGraphFilterCurveLiveParam(node, "gain", 0),
    };
  }
  if (node.type === "bandpass") {
    return {
      type: node.type,
      mode: 4, // Bandpass Peak
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      q: nodeGraphFilterCurveLiveParam(node, "q", 1),
      gain: 0,
    };
  }
  if (node.type === "allpass") {
    return {
      type: node.type,
      mode: 6, // Allpass (flat magnitude — curve still draws ~0 dB)
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      q: nodeGraphFilterCurveLiveParam(node, "q", 0.707),
      gain: 0,
    };
  }
  // cookbook / multi-stage family
  return {
    type: node.type,
    mode: nodeGraphFilterCurveLiveParam(node, "mode", 0),
    frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
    q: nodeGraphFilterCurveLiveParam(node, "q", 1),
    gain: nodeGraphFilterCurveLiveParam(node, "gain", 0),
    stages: nodeGraphFilterCurveLiveParam(node, "stages", 1),
  };
}

/** Domain Hz for curve math. 0 is valid — never use `x || fallback` (0 is falsy). */
function nodeGraphFilterCurveFiniteHz(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphFilterCurveResponseAt(node, frequency, sampleRate, view = null) {
  const v = view || nodeGraphFilterCurveView(node) || {};
  if (nodeGraphIsCrossoverType(node.type) || v.bandCount) {
    // Composite flat-ish sum of band magnitudes (visual check that bands cover spectrum).
    const bandCount = Number(v.bandCount) || nodeGraphCrossoverBandCountFromType(node.type) || 2;
    const splits = Array.isArray(v.frequencies) ? v.frequencies : [];
    const order = Number(v.order) || 4;
    let sum = 0;
    for (let b = 0; b < bandCount; b += 1) {
      sum += nodeGraphCrossoverBandMagnitudeAt(frequency, splits, b, bandCount, order, sampleRate);
    }
    return Number.isFinite(sum) && sum > 0 ? sum : 1e-6;
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(v.mode) || 0);
    const stages = typeof nodeGraphPassiveFilterStageCount === "function"
      ? nodeGraphPassiveFilterStageCount(v.slope)
      : 1;
    const k = typeof nodeGraphPassiveFilterStaggerRatio === "function"
      ? nodeGraphPassiveFilterStaggerRatio(v.stagger)
      : 1;
    const comp = Number(v.gainCompensation) > 0.5 ? 1 : 0;
    const stackHz = (fc, kind) => (
      typeof nodeGraphPassiveFilterStackFrequencies === "function"
        ? nodeGraphPassiveFilterStackFrequencies(fc, stages, k, comp, kind)
        : [Number(fc) || 0]
    );
    let mag = 1;
    if (mode === 1 || mode === 2) {
      const hpHz = stackHz(v.lowFrequency, "hp");
      for (let i = 0; i < hpHz.length; i += 1) {
        mag *= nodeGraphOnePoleHighpassMagnitudeAt(hpHz[i], frequency, sampleRate);
      }
    }
    if (mode === 1 || mode === 0) {
      const lpHz = stackHz(v.highFrequency, "lp");
      for (let i = 0; i < lpHz.length; i += 1) {
        mag *= nodeGraphOnePoleLowpassMagnitudeAt(lpHz[i], frequency, sampleRate);
      }
    }
    return mag;
  }
  if (node.type === "activeFilter") {
    if (v.bandpass) {
      return nodeGraphActiveFilterSlopeMagnitudeAt("hp", v.lowFrequency, frequency, v.hpSlope, sampleRate)
        * nodeGraphActiveFilterSlopeMagnitudeAt("lp", v.highFrequency, frequency, v.lpSlope, sampleRate);
    }
    const mode = Math.round(Number(v.mode) || 0);
    const kind = mode >= 4 ? "hp" : "lp";
    const slope = mode >= 4 ? mode - 4 : mode;
    return nodeGraphActiveFilterSlopeMagnitudeAt(kind, v.frequency, frequency, slope, sampleRate);
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterMagnitudeAt({
      frequency: nodeGraphFilterCurveFiniteHz(v.frequency, 1000),
      mode: Number(v.mode) || 1,
      resonance: Number(v.resonance) || 0,
      stages: Number(v.stages) || 4,
    }, frequency, sampleRate);
  }
  if (node.type === "papoulisFilter") {
    return nodeGraphPapoulisFilterMagnitudeAt(nodeGraphFilterCurveFiniteHz(v.cutoff, 1000), frequency, sampleRate);
  }
  if (node.type === "tb303Filter") {
    if (typeof nodeGraphTb303FilterMagnitudeAt === "function") {
      const mag = nodeGraphTb303FilterMagnitudeAt({
        cutoff: nodeGraphFilterCurveFiniteHz(v.cutoff, 1000),
        drive: Number(v.drive) || 0,
        mode: Number(v.mode) || 4,
        resonance: Number(v.resonance) || 0,
      }, frequency, sampleRate);
      return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
    }
    return 1;
  }
  if (node.type === "eqFilter" || node.type === "bandpass" || node.type === "allpass") {
    if (typeof nodeGraphEqFilterMagnitudeAt === "function") {
      const mag = nodeGraphEqFilterMagnitudeAt(
        Number(v.mode) || (node.type === "bandpass" ? 4 : node.type === "allpass" ? 6 : 1),
        nodeGraphFilterCurveFiniteHz(v.frequency, 1000),
        Number(v.q) || 0.707,
        Number(v.gain) || 0,
        frequency,
        sampleRate,
      );
      return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
    }
    return 1;
  }
  const mode = Number(v.mode) || 0;
  const cutoff = nodeGraphFilterCurveFiniteHz(v.frequency, 1000);
  const q = Number(v.q) || 1;
  const gain = Number(v.gain) || 0;
  const stages = nodeGraphCookbookFilterStageCount(v.stages);
  const coeff = nodeGraphCookbookFilterCoefficients(mode, cutoff, q, gain, sampleRate);
  return nodeGraphCookbookFilterMagnitudeAt(coeff, frequency, sampleRate, stages);
}

function nodeGraphFilterCurveCutoffFrequencies(node, view = null) {
  const v = view || nodeGraphFilterCurveView(node) || {};
  if (nodeGraphIsCrossoverType(node.type) || Array.isArray(v.frequencies)) {
    return (Array.isArray(v.frequencies) ? v.frequencies : [])
      .map((value) => nodeGraphFilterCurveFiniteHz(value, 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(v.mode) || 0);
    if (mode === 2) {
      return [nodeGraphFilterCurveFiniteHz(v.lowFrequency, 0)]
        .filter((x) => Number.isFinite(x) && x >= 0);
    }
    if (mode === 0) {
      return [nodeGraphFilterCurveFiniteHz(v.highFrequency, 0)]
        .filter((x) => Number.isFinite(x) && x >= 0);
    }
    return [v.lowFrequency, v.highFrequency]
      .map((value) => nodeGraphFilterCurveFiniteHz(value, 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (node.type === "activeFilter") {
    if (v.bandpass) {
      return [v.lowFrequency, v.highFrequency]
        .map((value) => nodeGraphFilterCurveFiniteHz(value, 0))
        .filter((value) => Number.isFinite(value) && value >= 0);
    }
    return [nodeGraphFilterCurveFiniteHz(v.frequency, 0)]
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (node.type === "papoulisFilter" || node.type === "tb303Filter") {
    // 0 Hz is valid — still draw the marker at the left edge of the log axis.
    return [nodeGraphFilterCurveFiniteHz(v.cutoff, 0)]
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  return [nodeGraphFilterCurveFiniteHz(v.frequency, 0)]
    .filter((value) => Number.isFinite(value) && value >= 0);
}

/**
 * Map cutoff Hz → [0,1] along the log frequency axis.
 * Axis floor is minFreq for drawing only; domain 0 (and any f < minFreq) pins to the left edge.
 * Never clamp the domain value itself up to minFreq — that made 0 look like 20 Hz.
 */
function nodeGraphFilterCurveCutoffRatio(frequencyHz, minFreq, maxFreq) {
  const f = Number(frequencyHz);
  if (!Number.isFinite(f) || f <= 0 || f <= minFreq) {
    return 0;
  }
  if (f >= maxFreq) {
    return 1;
  }
  const logMin = Math.log10(minFreq);
  const logRange = Math.log10(maxFreq) - logMin;
  if (!(logRange > 0)) {
    return 0;
  }
  return (Math.log10(f) - logMin) / logRange;
}

function nodeGraphFilterCurveLabel(node) {
  if (nodeGraphIsCrossoverType(node.type)) {
    const n = nodeGraphCrossoverBandCountFromType(node.type);
    const order = Math.round(Number(node.params?.order) || 4);
    return `${n}-way LR${order}`;
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(node.params?.mode) || 0);
    const stages = typeof nodeGraphPassiveFilterStageCount === "function"
      ? nodeGraphPassiveFilterStageCount(node.params?.slope)
      : 1;
    const db = stages * 6;
    return mode === 1 ? `BP${db}` : mode === 2 ? `HP${db}` : `LP${db}`;
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterModes[Math.round(Number(node.params?.mode) || 0)] || "Ladder";
  }
  if (node.type === "papoulisFilter") {
    return "Papoulis LP";
  }
  if (node.type === "tb303Filter") {
    const modes = typeof nodeGraphTb303FilterModes !== "undefined" ? nodeGraphTb303FilterModes : null;
    return modes?.[Math.round(Number(node.params?.mode) || 4)] || "TB-303";
  }
  if (node.type === "eqFilter") {
    const modes = typeof nodeGraphEqFilterModes !== "undefined" ? nodeGraphEqFilterModes : null;
    return modes?.[Math.round(Number(node.params?.mode) || 1)] || "EQ";
  }
  if (node.type === "activeFilter") {
    const mode = Math.round(Number(node.params?.mode) || 3);
    if (mode >= 8) {
      return "BP";
    }
    const modes = typeof nodeGraphActiveFilterModes !== "undefined" ? nodeGraphActiveFilterModes : null;
    return modes?.[mode] || "Active";
  }
  return nodeGraphCookbookFilterModes[Math.round(Number(node.params?.mode) || 0)] || "Filter";
}

/** Room dimmer punch strength for crossover faces (dimmer than full scopes). */
const nodeGraphCrossoverDisplayLightStrength = 2 / 3;

function nodeGraphFilterCurveApplyCrossoverLightCutout(section, canvas, type) {
  if (!section || !nodeGraphIsCrossoverType(type || section.dataset?.nodeType)) {
    return;
  }
  const s = nodeGraphCrossoverDisplayLightStrength;
  const strength = s.toFixed(6);
  section.classList.add("node-light-source");
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = strength;
  if (canvas?.dataset) {
    canvas.dataset.lightSource = "screen";
    canvas.dataset.lightStrength = strength;
  }
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(section, s);
    if (canvas) {
      setNodeGraphLightStrength(canvas, s);
    }
  }
}

/** Parameter plots stay punched through the room dimmer (not live scopes). */
function nodeGraphFilterCurveApplyScreenLight(section, canvas) {
  if (!section) {
    return;
  }
  const type = section.dataset?.nodeType;
  if (typeof nodeGraphIsCrossoverType === "function" && nodeGraphIsCrossoverType(type)) {
    nodeGraphFilterCurveApplyCrossoverLightCutout(section, canvas, type);
    return;
  }
  section.classList.add("node-light-source");
  if (section.dataset) {
    section.dataset.lightSource = "screen";
    section.dataset.lightStrength = "1";
  }
  if (canvas?.dataset) {
    canvas.dataset.lightSource = "screen";
    canvas.dataset.lightStrength = "1";
  }
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(section, 1);
    if (canvas) {
      setNodeGraphLightStrength(canvas, 1);
    }
  }
}

function nodeGraphFilterCurveIsPersistentScreen(el) {
  if (!el) {
    return false;
  }
  const cls = el.classList;
  if (
    cls?.contains("node-filter-curve-display")
    || cls?.contains("node-filter-curve-canvas")
    || cls?.contains("node-envelope-curve-display")
    || cls?.contains("node-round-shape-display")
    || cls?.contains("node-basic-shape-display")
    || cls?.contains("node-pulse-curve-display")
  ) {
    return true;
  }
  return Boolean(
    el.closest?.(".node-filter-curve-display")
    || el.closest?.(".node-envelope-curve-display")
    || el.closest?.(".node-round-shape-display")
    || el.closest?.(".node-basic-shape-display")
    || el.closest?.(".node-pulse-curve-display")
  );
}

function createNodeGraphFilterCurveDisplay(nodeId, type) {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-light-source";
  section.dataset.node = id;
  section.dataset.nodeType = type;
  section.dataset.lightSource = "screen";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  // Hook into the shared parameter-visual contract so mid-drag flush redraws
  // the curve every frame (same path as bug button / XY pad).
  section.dataset.parameterVisual = "true";
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "1";
  section.dataset.lightStrength = "1";
  section.append(canvas);
  // Crossovers: room-dimmer cutout at 2/3 (not as bright as full displays).
  nodeGraphFilterCurveApplyCrossoverLightCutout(section, canvas, type);
  // Continuous pump at Simulation FPS so modulated cutoff/Q animate. Slider
  // drag / syncFromParameters still paint immediately (force).
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `filterCurve:${el.dataset?.node || ""}`,
    forceKey: "_filterCurveForceDraw",
    paint: drawNodeGraphFilterCurveDisplay,
    onResize: (el) => { el._filterCurveLaidOut = false; },
    paintOnCreate: false,
  });
  // Layout may land after the first rAF (article not in the workspace yet).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      section._filterCurveForceDraw = true;
      section._filterCurveLaidOut = false;
      drawNodeGraphFilterCurveDisplay(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function drawNodeGraphFilterCurveDisplay(section) {
  try {
    drawNodeGraphFilterCurveDisplayInner(section);
  } catch (error) {
    // SE console often prints Error as {} — include message/stack text.
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[filter-curve] draw failed", detail, error);
    // Allow a later layout/param pass to retry after a thrown paint.
    if (section) {
      section._filterCurveForceDraw = true;
      section._filterCurveLaidOut = false;
    }
  }
}

function nodeGraphFilterCurveMeasureBox(section) {
  let rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  let rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
    if (stage?.id === "nodeScreenSoloStage") {
      const cols = Math.max(1, Number(stage.style.getPropertyValue("--node-screen-solo-cols")) || 1);
      const rows = Math.max(1, Number(stage.style.getPropertyValue("--node-screen-solo-rows")) || 1);
      rawW = Math.max(rawW, Math.floor((stage.clientWidth || window.innerWidth || 0) / cols));
      rawH = Math.max(rawH, Math.floor((stage.clientHeight || window.innerHeight || 0) / rows));
    }
  }
  if (rawW < 8 || rawH < 8) {
    const host = section.closest?.(".dsp-node");
    if (host) {
      rawW = Math.max(rawW, Number(host.clientWidth || host.offsetWidth) || 0);
      const gu = Number(
        (host.style && host.style.getPropertyValue("--node-module-display-height-units"))
        || (typeof getComputedStyle === "function"
          ? getComputedStyle(host).getPropertyValue("--node-module-display-height-units")
          : "")
        || 5,
      ) || 5;
      const gridH = Number(
        (typeof getComputedStyle === "function"
          ? parseFloat(getComputedStyle(host).getPropertyValue("--node-grid-height"))
          : 0)
        || 28,
      ) || 28;
      rawH = Math.max(rawH, Math.round(gridH * Math.max(2, gu)));
    }
  }
  return { rawW, rawH };
}

function drawNodeGraphFilterCurveDisplayInner(section) {
  if (section) {
    section.hidden = false;
  }
  const node = nodeGraphPatchNode(
    section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "",
  );
  const canvas = section?.querySelector?.(".node-filter-curve-canvas");
  if (!node || !canvas) {
    return;
  }
  // Snapshot live params first (cheap). Only skip work when params are
  // unchanged AND we already painted a real layout-sized face. Never treat a
  // 1×1 pre-layout paint as final (that froze crossover faces blank).
  const view = nodeGraphFilterCurveView(node);
  const signature = JSON.stringify(view);
  if (
    section._filterCurveSignature === signature
    && !section._filterCurveForceDraw
    && section._filterCurveLaidOut === true
  ) {
    return;
  }
  // Layout size: offsetWidth avoids getBoundingClientRect (cheaper; zoom is
  // applied via CSS transform on the workspace, not on face layout size).
  const measured = nodeGraphFilterCurveMeasureBox(section);
  const rawW = measured.rawW;
  const rawH = measured.rawH;
  if (rawW < 8 || rawH < 8) {
    // Face not laid out yet — do not cache signature; keep retrying.
    section._filterCurveLaidOut = false;
    section._filterCurveForceDraw = true;
    const tries = (Number(section._filterCurveRetryCount) || 0) + 1;
    section._filterCurveRetryCount = tries;
    if (tries <= 45 && !section._filterCurveRetryFrame) {
      section._filterCurveRetryFrame = requestAnimationFrame(() => {
        section._filterCurveRetryFrame = 0;
        drawNodeGraphFilterCurveDisplay(section);
      });
    }
    return;
  }
  section._filterCurveRetryCount = 0;
  if ((Number(section.clientWidth) || 0) < 8 || (Number(section.clientHeight) || 0) < 8) {
    section.style.width = `${Math.max(8, rawW)}px`;
    section.style.height = `${Math.max(8, rawH)}px`;
  }
  const cssW = Math.max(1, rawW);
  const cssH = Math.max(1, rawH);
  if (
    section._filterCurveSignature === signature
    && section._filterCurveCssW === cssW
    && section._filterCurveCssH === cssH
    && !section._filterCurveForceDraw
    && section._filterCurveLaidOut === true
  ) {
    return;
  }
  const metrics = nodeGraphSizeDisplayCanvas(section, canvas, { pixelDensity: 1 });
  if (!metrics) {
    return;
  }
  const { context, cssHeight: height, cssWidth: width, pixelRatio } = metrics;
  if (!(width >= 8) || !(height >= 8)) {
    section._filterCurveLaidOut = false;
    section._filterCurveForceDraw = true;
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const sampleRate = Math.max(1, Number(nodeGraphMvp?.sampleRate) || 44100);
  const minFreq = 20;
  const maxFreq = Math.max(minFreq * 2, Math.min(20000, sampleRate * 0.5));
  const minDb = -48;
  const maxDb = 18;
  section._filterCurveSignature = signature;
  section._filterCurveCssW = cssW;
  section._filterCurveCssH = cssH;
  section._filterCurveForceDraw = false;
  section._filterCurveLaidOut = true;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);
  const logMin = Math.log10(minFreq);
  const logRange = Math.log10(maxFreq) - logMin;
  const cutoffLineWidth = 1;
  const cutoffInset = cutoffLineWidth * 0.5;
  const cutoffDrawableWidth = Math.max(1, width - cutoffLineWidth);
  const cutoffs = nodeGraphFilterCurveCutoffFrequencies(node, view);
  const isCrossover = nodeGraphIsCrossoverType(node.type);

  // Crossover faces: split lines + Hz only (no magnitude curves / band titles).
  // Keeps 1gu display height readable and cheap to paint.
  if (!isCrossover) {
    context.strokeStyle = "rgba(127, 199, 217, 0.18)";
    context.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const y = (line / 4) * height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    // Cap sample density for filter magnitude paths.
    const maxSamples = 220;
    const step = Math.max(1, Math.ceil(width / maxSamples));
    context.strokeStyle = "rgba(61, 224, 255, 0.95)";
    context.lineWidth = 1.5;
    context.beginPath();
    let started = false;
    for (let x = 0; x < width; x += step) {
      const progress = width <= 1 ? 0 : x / (width - 1);
      const hz = 10 ** (logMin + progress * logRange);
      let magnitude = nodeGraphFilterCurveResponseAt(node, hz, sampleRate, view);
      if (!Number.isFinite(magnitude) || magnitude <= 0) {
        magnitude = 1e-6;
      }
      const db = clampNodeSliderValue(20 * Math.log10(Math.max(1e-6, magnitude)), minDb, maxDb);
      const y = (1 - ((db - minDb) / (maxDb - minDb))) * height;
      if (!Number.isFinite(y)) {
        continue;
      }
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
    if (started && (width - 1) % step !== 0) {
      const x = width - 1;
      const progress = width <= 1 ? 0 : x / (width - 1);
      const hz = 10 ** (logMin + progress * logRange);
      let magnitude = nodeGraphFilterCurveResponseAt(node, hz, sampleRate, view);
      if (!Number.isFinite(magnitude) || magnitude <= 0) {
        magnitude = 1e-6;
      }
      const db = clampNodeSliderValue(20 * Math.log10(Math.max(1e-6, magnitude)), minDb, maxDb);
      const y = (1 - ((db - minDb) / (maxDb - minDb))) * height;
      if (Number.isFinite(y)) {
        context.lineTo(x, y);
      }
    }
    if (started) {
      context.stroke();
    }
  }

  // Vertical frequency markers (+ Hz labels for crossovers / multi-cutoff).
  context.strokeStyle = "rgba(226, 168, 109, 0.85)";
  context.lineWidth = cutoffLineWidth;
  // Fit labels on 1gu faces (~28px): single baseline, compact type.
  const fontPx = height < 36 ? 8 : 9;
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  context.textBaseline = "middle";
  const labelY = height * 0.5;
  cutoffs.forEach((frequency, index) => {
    // 0 Hz (and anything below the log axis floor) → left edge, not minFreq.
    const cutoffRatio = nodeGraphFilterCurveCutoffRatio(frequency, minFreq, maxFreq);
    const cutoffX = cutoffInset + cutoffRatio * cutoffDrawableWidth;
    context.beginPath();
    context.moveTo(cutoffX, 0);
    context.lineTo(cutoffX, height);
    context.stroke();
    if (isCrossover || cutoffs.length > 1) {
      const label = nodeGraphFilterCurveFormatHz(frequency);
      const textW = context.measureText(label).width;
      let textX = cutoffX + 3;
      if (textX + textW > width - 2) {
        textX = Math.max(2, cutoffX - textW - 3);
      }
      // Slight vertical stagger only when the face is tall enough.
      const stagger = height >= 40 ? ((index % 3) - 1) * 10 : 0;
      const textY = Math.max(fontPx * 0.55, Math.min(height - fontPx * 0.55, labelY + stagger));
      context.fillStyle = "rgba(2, 6, 9, 0.75)";
      context.fillRect(textX - 1, textY - fontPx * 0.55, textW + 3, fontPx + 2);
      context.fillStyle = "rgba(255, 220, 170, 0.95)";
      context.fillText(label, textX, textY);
    }
  });

  // Non-crossover filter title (crossovers stay markers-only).
  if (!isCrossover) {
    const title = nodeGraphFilterCurveLabel(node);
    context.font = "600 10px system-ui, sans-serif";
    context.textBaseline = "top";
    const titleW = context.measureText(title).width;
    const titleY = 3;
    context.fillStyle = "rgba(2, 6, 9, 0.65)";
    context.fillRect(6, titleY - 1, titleW + 4, 12);
    context.fillStyle = "rgba(229, 238, 242, 0.82)";
    context.fillText(title, 8, titleY);
  }

  // Keep the dimmer hole open after paint. Stop wipe used to leave strength 0
  // on this light-source, so the room veil covered a perfectly drawn curve.
  nodeGraphFilterCurveApplyScreenLight(section, canvas);
}

function drawNodeGraphFilterCurveDisplays() {
  document.querySelectorAll(".node-filter-curve-display").forEach((section) => {
    // RoundShape reuses the filter-curve plate class but has its own drawer.
    if (section.classList.contains("node-round-shape-display")) {
      if (typeof drawNodeGraphRoundShapeDisplay === "function") {
        drawNodeGraphRoundShapeDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-envelope-curve-display")) {
      if (typeof drawNodeGraphEnvelopeCurveDisplay === "function") {
        drawNodeGraphEnvelopeCurveDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-phone-tone-display")) {
      if (typeof drawNodeGraphPhoneToneFaceItem === "function") {
        drawNodeGraphPhoneToneFaceItem(section);
      }
      return;
    }
    if (section.classList.contains("node-harmonic-series-display")) {
      if (typeof drawNodeGraphHarmonicSeriesFaceItem === "function") {
        drawNodeGraphHarmonicSeriesFaceItem(section);
      }
      return;
    }
    drawNodeGraphFilterCurveDisplay(section);
  });
  if (typeof drawNodeGraphPulseCurveDisplay === "function") {
    document.querySelectorAll(".node-pulse-curve-display").forEach(drawNodeGraphPulseCurveDisplay);
  }
  if (typeof drawNodeGraphWallRoomDisplay === "function") {
    document.querySelectorAll(".node-wall-room-display").forEach(drawNodeGraphWallRoomDisplay);
  }
}

function scheduleNodeGraphFilterCurveDraw() {
  if (nodeGraphMvp.filterCurveDrawFrame) {
    return;
  }
  nodeGraphMvp.filterCurveDrawFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp.filterCurveDrawFrame = 0;
    // UI event path (slider drag, layout, wipe): paint this frame, ungated.
    // Live modulation keeps moving via per-face Simulation FPS loops.
    for (const section of document.querySelectorAll(".node-filter-curve-display")) {
      if (
        section.classList.contains("node-round-shape-display")
        || section.classList.contains("node-envelope-curve-display")
        || section.classList.contains("node-phone-tone-display")
        || section.classList.contains("node-harmonic-series-display")
        || section.classList.contains("node-basic-shape-display")
      ) {
        continue;
      }
      section._filterCurveForceDraw = true;
      if (typeof section._startFaceLoop === "function") {
        section._startFaceLoop();
      }
    }
    drawNodeGraphFilterCurveDisplays();
  });
}

function syncNodeGraphFilterCurveDisplays() {
  if (typeof scheduleNodeGraphFilterCurveDraw === "function") {
    scheduleNodeGraphFilterCurveDraw();
  }
}
