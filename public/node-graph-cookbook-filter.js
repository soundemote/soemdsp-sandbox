// Face/plot twin of RS-MET rosic::CookbookFilter (RBJ biquad cascade).
// Audio is native cookbook_filter.cpp. Per-stage biquad is 2-pole (12 dB/oct);
// cascade Stages multiplies slope. Not analog ladder (RAPT::rsLadderFilter).
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
  const safeMode = Math.round(clampNodeSliderValue(nodeGraphFiniteNumber(mode), 0, 9));
  if (safeMode === 0) {
    return { a1: 0, a2: 0, b0: 1, b1: 0, b2: 0 };
  }
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, nodeGraphFiniteNumber(globalThis.nodeGraphMvp?.sampleRate, 44100)));
  // 0 Hz allowed (frozen). Only crash-safety: non-negative + Nyquist ceiling.
  const rawFreq = Number(frequency);
  const freq = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawFreq) ? rawFreq : 0));
  const safeQ = Math.max(0.0001, nodeGraphFiniteNumber(q, 1));
  const omega = 2 * Math.PI * freq / rate;
  const sine = Math.sin(omega);
  const cosine = Math.cos(omega);
  const alpha = sine / (2 * safeQ);
  const amplitude = 10 ** (0.025 * (nodeGraphFiniteNumber(gainDb)));
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
  if (!state || stageCount <= 0 || Math.round(nodeGraphFiniteNumber(mode)) === 0) {
    return nodeGraphFiniteNumber(input);
  }
  if (state.lastStages !== stageCount) {
    resetNodeGraphCookbookFilterState(state);
    state.lastStages = stageCount;
  }
  const coeff = nodeGraphCookbookFilterCoefficients(mode, frequency, q, gainDb, sampleRate);
  let value = typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "cookbook filter input")
    : nodeGraphFiniteNumber(input);
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
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, nodeGraphFiniteNumber(globalThis.nodeGraphMvp?.sampleRate, 44100)));
  const frequencyValue = Math.max(0, nodeGraphFiniteNumber(frequency));
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
  const low = Math.min(nodeGraphFiniteNumber(lowCut), nodeGraphFiniteNumber(highCut));
  const high = Math.max(nodeGraphFiniteNumber(lowCut), nodeGraphFiniteNumber(highCut));
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
  // Slope: 0 Bypass, 1=6 … 4=24 dB → stage count = slope (when > 0).
  const stages = Number.isFinite(Number(slope))
    ? Math.max(0, Math.min(4, Math.round(Number(slope))))
    : 1;
  if (stages <= 0) return 1;
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
    nodeGraphComplexScale(s4, nodeGraphFiniteNumber(coeff.k)),
  );
  const invDenMag2 = Math.max(
    1e-12,
    feedbackDen.re * feedbackDen.re + feedbackDen.im * feedbackDen.im,
  );
  const y0FromX = nodeGraphComplexScale(
    { re: feedbackDen.re, im: -feedbackDen.im },
    (nodeGraphFiniteNumber(coeff.g, 1)) / invDenMag2,
  );
  let sum = { re: 0, im: 0 };
  for (let index = 0; index < coeff.c.length; index += 1) {
    const weight = nodeGraphFiniteNumber(coeff.c[index]);
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
  let base = nodeGraphFiniteNumber(fallback);
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
  const splits = Math.max(1, (nodeGraphFiniteNumber(bandCount, 2)) - 1);
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
  const order = Math.round(nodeGraphFiniteNumber(lrOrder, 4));
  const stages = order <= 2 ? 1 : order >= 8 ? 4 : 2;
  const n = Math.max(2, nodeGraphFiniteNumber(bandCount, 2));
  const b = Math.max(0, Math.min(n - 1, nodeGraphFiniteNumber(bandIndex)));
  const freqs = Array.isArray(splits) ? splits : [];
  let mag = 1;
  for (let i = 0; i < freqs.length; i += 1) {
    const fc = Math.max(0, nodeGraphFiniteNumber(freqs[i]));
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
    const params = {
      highFrequency: nodeGraphFilterCurveLiveParam(node, "highFrequency", 1000),
      hpSlope: nodeGraphFilterCurveLiveParam(node, "hpSlope", 0),
      lowFrequency: nodeGraphFilterCurveLiveParam(node, "lowFrequency", 200),
      lpSlope: nodeGraphFilterCurveLiveParam(node, "lpSlope", 4),
      mode: nodeGraphFilterCurveLiveParam(node, "mode", 3),
      sweep: nodeGraphFilterCurveLiveParam(node, "sweep", 0),
    };
    const resolved = typeof nodeGraphActiveFilterResolveParams === "function"
      ? nodeGraphActiveFilterResolveParams(params)
      : { bandpass: false, ...params };
    return {
      type: node.type,
      bandpass: !!resolved.bandpass,
      bypass: !!resolved.bypass,
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
  if (nodeGraphIsScientificIirType(node.type)) {
    return {
      type: node.type,
      kind: nodeGraphScientificIirKinds[node.type],
      mode: Math.round(nodeGraphFilterCurveLiveParam(node, "mode", 0)),
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      order: nodeGraphFilterCurveLiveParam(node, "order", 4),
      bandwidth: nodeGraphFilterCurveLiveParam(node, "bandwidth", 1),
      ripple: nodeGraphFilterCurveLiveParam(node, "ripple", 1),
    };
  }
  if (node.type === "phaser") {
    const outs = nodeGraphPhaserWiredOuts(node);
    const rate = nodeGraphFilterCurveLiveParam(node, "rate", 0.2);
    const depth = nodeGraphFilterCurveLiveParam(node, "depth", 0.5);
    const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
    const sweep = (rate > 1e-9 || rate < -1e-9)
      ? Math.sin(2 * Math.PI * t * rate) * depth
      : 0;
    const face = typeof normalizeNodeGraphPhaserFaceDisplaySettings === "function"
      ? normalizeNodeGraphPhaserFaceDisplaySettings(node.traceDisplaySettings)
      : nodeGraphPhaserFaceDisplaySettingsDefaults;
    return {
      type: node.type,
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      bands: nodeGraphFilterCurveLiveParam(node, "stages", 4),
      slope: nodeGraphFilterCurveLiveParam(node, "slope", 0),
      spread: nodeGraphFilterCurveLiveParam(node, "spread", 0.5),
      stereoSpread: nodeGraphFilterCurveLiveParam(node, "stereoSpread", 0),
      q: nodeGraphFilterCurveLiveParam(node, "q", 1),
      kernel: nodeGraphFilterCurveLiveParam(node, "mode", 0),
      mix: nodeGraphFilterCurveLiveParam(node, "mix", 0.5),
      leftOut: outs.left,
      rightOut: outs.right,
      sweep,
      barThickness: face.barThickness,
      curveThickness: face.curveThickness,
    };
  }
  if (node.type === "eqFilter") {
    const uiMode = nodeGraphFilterCurveLiveParam(node, "mode", 1);
    const ignoreBoost = typeof nodeGraphEqFilterUiIgnoresBoostCut === "function"
      ? nodeGraphEqFilterUiIgnoresBoostCut(uiMode)
      : uiMode <= 2;
    const dspMode = typeof nodeGraphEqFilterUiToDsp === "function"
      ? nodeGraphEqFilterUiToDsp(uiMode)
      : uiMode;
    return {
      type: node.type,
      mode: dspMode,
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      q: nodeGraphFilterCurveLiveParam(node, "q", 0.707),
      gain: ignoreBoost ? 0 : nodeGraphFilterCurveLiveParam(node, "gain", 0),
    };
  }
  if (node.type === "graphicEq") {
    const bands = new Array(30);
    for (let i = 0; i < 30; i += 1) {
      bands[i] = nodeGraphFilterCurveLiveParam(node, `band${i}`, 0);
    }
    return {
      type: node.type,
      bands,
      q: nodeGraphFilterCurveLiveParam(node, "q", 4.32),
      mix: nodeGraphFilterCurveLiveParam(node, "mix", 1),
      // Decade markers for log-frequency orientation (not all 30 ISO centers).
      frequencies: [100, 1000, 10000],
    };
  }
  if (node.type === "bandpass" || node.type === "allpass"
      || node.type === "lowpass" || node.type === "highpass") {
    const slope = Math.round(nodeGraphFilterCurveLiveParam(node, "slope", 0));
    const zdfStages = Math.max(1, Math.min(4, slope + 1));
    const mode = node.type === "bandpass" ? 4
      : node.type === "allpass" ? 6
      : node.type === "highpass" ? 1
      : 2;
    const q0 = node.type === "bandpass" ? 1 : 0.707;
    return {
      type: node.type,
      mode,
      frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
      q: nodeGraphFilterCurveLiveParam(node, "q", q0),
      gain: 0,
      zdfStages,
    };
  }
  // cookbook / multi-stage family
  return {
    type: node.type,
    mode: nodeGraphFilterCurveLiveParam(node, "mode", 0),
    frequency: nodeGraphFilterCurveLiveParam(node, "frequency", 1000),
    q: nodeGraphFilterCurveLiveParam(node, "q", 1),
    gain: 0,
    stages: nodeGraphFilterCurveLiveParam(node, "stages", 1),
  };
}

/** Domain Hz for curve math. 0 is valid — never use `x || fallback` (0 is falsy). */
function nodeGraphFilterCurveFiniteHz(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** ISO 1/3-octave centers — must match native graphic_eq.cpp. */
const nodeGraphGraphicEqCentersHz = Object.freeze([
  25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200,
  250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
  2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
]);

/** Cascade of peaking bands. Mix blends toward flat. */
function nodeGraphGraphicEqMagnitudeAt(view, probeHz, sampleRate) {
  const bands = Array.isArray(view?.bands) ? view.bands : null;
  if (!bands || bands.length < 1) {
    return 1;
  }
  const q = Math.max(0.05, nodeGraphFiniteNumber(view?.q, 4.32));
  let mag = 1;
  if (typeof nodeGraphEqFilterMagnitudeAt === "function") {
    for (let i = 0; i < bands.length && i < nodeGraphGraphicEqCentersHz.length; i += 1) {
      const gainDb = nodeGraphFiniteNumber(bands[i]);
      if (!(Math.abs(gainDb) > 1e-4)) continue;
      const f0 = nodeGraphGraphicEqCentersHz[i];
      const bandMag = nodeGraphEqFilterMagnitudeAt(7, f0, q, gainDb, probeHz, sampleRate);
      if (Number.isFinite(bandMag) && bandMag > 0) mag *= bandMag;
    }
  }
  const mix = Math.max(0, Math.min(1, nodeGraphFiniteNumber(view?.mix, 1)));
  // Dry/wet on magnitude: flat → EQ.
  mag = (1 - mix) * 1 + mix * mag;
  return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
}

function nodeGraphFilterCurveResponseAt(node, frequency, sampleRate, view = null) {
  const v = view || nodeGraphFilterCurveView(node) || {};
  if (nodeGraphIsCrossoverType(node.type) || v.bandCount) {
    // Composite flat-ish sum of band magnitudes (visual check that bands cover spectrum).
    const bandCount = Number(v.bandCount) || nodeGraphCrossoverBandCountFromType(node.type) || 2;
    const splits = Array.isArray(v.frequencies) ? v.frequencies : [];
    const order = nodeGraphFiniteNumber(v.order, 4);
    let sum = 0;
    for (let b = 0; b < bandCount; b += 1) {
      sum += nodeGraphCrossoverBandMagnitudeAt(frequency, splits, b, bandCount, order, sampleRate);
    }
    return Number.isFinite(sum) && sum > 0 ? sum : 1e-6;
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(nodeGraphFiniteNumber(v.mode));
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
        : [nodeGraphFiniteNumber(fc)]
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
    if (v.bypass) return 1;
    const hp = nodeGraphFiniteNumber(v.hpSlope);
    const lp = nodeGraphFiniteNumber(v.lpSlope);
    let mag = 1;
    if (hp > 0) {
      mag *= nodeGraphActiveFilterSlopeMagnitudeAt("hp", v.lowFrequency, frequency, hp, sampleRate);
    }
    if (lp > 0) {
      mag *= nodeGraphActiveFilterSlopeMagnitudeAt("lp", v.highFrequency, frequency, lp, sampleRate);
    }
    return mag;
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterMagnitudeAt({
      frequency: nodeGraphFilterCurveFiniteHz(v.frequency, 1000),
      mode: nodeGraphFiniteNumber(v.mode, 1),
      resonance: nodeGraphFiniteNumber(v.resonance),
      stages: nodeGraphFiniteNumber(v.stages, 4),
    }, frequency, sampleRate);
  }
  if (node.type === "papoulisFilter") {
    return nodeGraphPapoulisFilterMagnitudeAt(nodeGraphFilterCurveFiniteHz(v.cutoff, 1000), frequency, sampleRate);
  }
  if (node.type === "tb303Filter") {
    if (typeof nodeGraphTb303FilterMagnitudeAt === "function") {
      const mag = nodeGraphTb303FilterMagnitudeAt({
        cutoff: nodeGraphFilterCurveFiniteHz(v.cutoff, 1000),
        drive: nodeGraphFiniteNumber(v.drive),
        mode: nodeGraphFiniteNumber(v.mode, 4),
        resonance: nodeGraphFiniteNumber(v.resonance),
      }, frequency, sampleRate);
      return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
    }
    return 1;
  }
  if (nodeGraphIsScientificIirType(node.type)) {
    return nodeGraphScientificIirMagnitudeAt(
      nodeGraphFiniteNumber(v.kind, nodeGraphScientificIirKinds[node.type] || 0),
      Math.round(nodeGraphFiniteNumber(v.mode)),
      nodeGraphFiniteNumber(v.order, 4),
      nodeGraphFilterCurveFiniteHz(v.frequency, 1000),
      nodeGraphFiniteNumber(v.bandwidth, 1),
      nodeGraphFiniteNumber(v.ripple, 1),
      frequency,
      sampleRate,
    );
  }
  if (node.type === "graphicEq") {
    return nodeGraphGraphicEqMagnitudeAt(v, frequency, sampleRate);
  }
  if (node.type === "eqFilter" || node.type === "bandpass" || node.type === "allpass"
      || node.type === "lowpass" || node.type === "highpass") {
    if (typeof nodeGraphEqFilterMagnitudeAt === "function") {
      const rawMode = Number(v.mode);
      const dspMode = Number.isFinite(rawMode)
        ? rawMode
        : (node.type === "bandpass" ? 4 : node.type === "allpass" ? 6 : 1);
      let mag = nodeGraphEqFilterMagnitudeAt(
        dspMode,
        nodeGraphFilterCurveFiniteHz(v.frequency, 1000),
        nodeGraphFiniteNumber(v.q, 0.707),
        nodeGraphFiniteNumber(v.gain),
        frequency,
        sampleRate,
      );
      const copies = Math.max(1, Math.min(4, Math.round(nodeGraphFiniteNumber(v.zdfStages, 1))));
      if (copies > 1 && Number.isFinite(mag) && mag > 0) {
        mag **= copies;
      }
      return Number.isFinite(mag) && mag > 0 ? mag : 1e-6;
    }
    return 1;
  }
  const mode = nodeGraphFiniteNumber(v.mode);
  const cutoff = nodeGraphFilterCurveFiniteHz(v.frequency, 1000);
  const q = nodeGraphFiniteNumber(v.q, 1);
  const gain = nodeGraphFiniteNumber(v.gain);
  const stages = nodeGraphCookbookFilterStageCount(v.stages);
  const coeff = nodeGraphCookbookFilterCoefficients(mode, cutoff, q, gain, sampleRate);
  return nodeGraphCookbookFilterMagnitudeAt(coeff, frequency, sampleRate, stages);
}

function nodeGraphFilterCurveCutoffFrequencies(node, view = null) {
  const v = view || nodeGraphFilterCurveView(node) || {};
  if (node.type === "graphicEq" || nodeGraphIsCrossoverType(node.type) || Array.isArray(v.frequencies)) {
    return (Array.isArray(v.frequencies) ? v.frequencies : [])
      .map((value) => nodeGraphFilterCurveFiniteHz(value, 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(nodeGraphFiniteNumber(v.mode));
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
    if (v.bypass) return [];
    const marks = [];
    if ((nodeGraphFiniteNumber(v.hpSlope)) > 0) marks.push(v.lowFrequency);
    if ((nodeGraphFiniteNumber(v.lpSlope)) > 0) marks.push(v.highFrequency);
    return marks
      .map((value) => nodeGraphFilterCurveFiniteHz(value, 0))
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
    const order = Math.round(nodeGraphFiniteNumber(node.params?.order, 4));
    return `${n}-way LR${order}`;
  }
  if (node.type === "passiveFilter") {
    const mode = Math.round(nodeGraphFiniteNumber(node.params?.mode));
    const stages = typeof nodeGraphPassiveFilterStageCount === "function"
      ? nodeGraphPassiveFilterStageCount(node.params?.slope)
      : 1;
    const db = stages * 6;
    return mode === 1 ? `BP${db}` : mode === 2 ? `HP${db}` : `LP${db}`;
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterModes[Math.round(nodeGraphFiniteNumber(node.params?.mode))] || "Ladder";
  }
  if (node.type === "papoulisFilter") {
    return "Papoulis LP";
  }
  if (node.type === "tb303Filter") {
    const modes = typeof nodeGraphTb303FilterModes !== "undefined" ? nodeGraphTb303FilterModes : null;
    return modes?.[Math.round(nodeGraphFiniteNumber(node.params?.mode, 4))] || "TB-303";
  }
  if (nodeGraphIsScientificIirType(node.type)) {
    const modes = ["LP", "HP", "BP", "BR"];
    const mode = modes[Math.round(nodeGraphFiniteNumber(node.params?.mode))] || "LP";
    const order = nodeGraphScientificIirClampOrder(node.params?.order);
    return `${mode}${order * 6}`;
  }
  if (node.type === "phaser") {
    return "";
  }
  if (node.type === "eqFilter") {
    const modes = typeof nodeGraphEqFilterModes !== "undefined" ? nodeGraphEqFilterModes : null;
    return modes?.[Math.round(nodeGraphFiniteNumber(node.params?.mode, 1))] || "EQ";
  }
  if (node.type === "graphicEq") {
    return "Graphic EQ";
  }
  if (node.type === "bandpass" || node.type === "allpass"
      || node.type === "lowpass" || node.type === "highpass") {
    const slope = Math.round(nodeGraphFiniteNumber(node.params?.slope));
    const db = (Math.max(0, Math.min(3, slope)) + 1) * 12;
    const prefix = node.type === "bandpass" ? "BP"
      : node.type === "allpass" ? "AP"
      : node.type === "highpass" ? "HP"
      : "LP";
    return `${prefix}${db}`;
  }
  if (node.type === "activeFilter") {
    const hp = Math.round(nodeGraphFiniteNumber(node.params?.hpSlope));
    const lp = Math.round(nodeGraphFiniteNumber(node.params?.lpSlope));
    const label = (n) => (n <= 0 ? "Off" : `${n * 6}`);
    if (hp <= 0 && lp <= 0) return "Thru";
    if (hp > 0 && lp > 0) return `BP HP${label(hp)}/LP${label(lp)}`;
    if (hp > 0) return `HP${label(hp)}`;
    return `LP${label(lp)}`;
  }
  return nodeGraphCookbookFilterModes[Math.round(nodeGraphFiniteNumber(node.params?.mode))] || "Filter";
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
    || cls?.contains("node-sincos4-display")
    || cls?.contains("node-pulse-curve-display")
  ) {
    return true;
  }
  return Boolean(
    el.closest?.(".node-filter-curve-display")
    || el.closest?.(".node-envelope-curve-display")
    || el.closest?.(".node-round-shape-display")
    || el.closest?.(".node-basic-shape-display")
    || el.closest?.(".node-sincos4-display")
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
  let rawW = nodeGraphFiniteNumber(section.clientWidth || section.offsetWidth);
  let rawH = nodeGraphFiniteNumber(section.clientHeight || section.offsetHeight);
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
    if (stage?.id === "nodeScreenSoloStage") {
      const cols = Math.max(1, nodeGraphFiniteNumber(stage.style.getPropertyValue("--node-screen-solo-cols"), 1));
      const rows = Math.max(1, nodeGraphFiniteNumber(stage.style.getPropertyValue("--node-screen-solo-rows"), 1));
      rawW = Math.max(rawW, Math.floor((stage.clientWidth || window.innerWidth || 0) / cols));
      rawH = Math.max(rawH, Math.floor((stage.clientHeight || window.innerHeight || 0) / rows));
    }
  }
  if (rawW < 8 || rawH < 8) {
    const host = section.closest?.(".dsp-node");
    if (host) {
      rawW = Math.max(rawW, nodeGraphFiniteNumber(host.clientWidth || host.offsetWidth));
      const gu = nodeGraphFiniteNumber(
        (host.style && host.style.getPropertyValue("--node-module-display-height-units"))
        || (typeof getComputedStyle === "function"
          ? getComputedStyle(host).getPropertyValue("--node-module-display-height-units")
          : "")
        || 5,
        5,
      );
      const gridH = nodeGraphFiniteNumber(
        (typeof getComputedStyle === "function"
          ? parseFloat(getComputedStyle(host).getPropertyValue("--node-grid-height"))
          : 0)
        || 28,
        28,
      );
      rawH = Math.max(rawH, Math.round(gridH * Math.max(2, gu)));
    }
  }
  return { rawW, rawH };
}

const nodeGraphPhaserFaceDisplaySettingsDefaults = Object.freeze({
  barThickness: 0.04,
  curveThickness: 0.02,
});

function normalizeNodeGraphPhaserFaceDisplaySettings(source) {
  const raw = source && typeof source === "object" ? source : {};
  const bar = Number(raw.barThickness);
  const curve = Number(raw.curveThickness);
  return {
    barThickness: Number.isFinite(bar)
      ? Math.max(0, Math.min(1, bar))
      : nodeGraphPhaserFaceDisplaySettingsDefaults.barThickness,
    curveThickness: Number.isFinite(curve)
      ? Math.max(0, Math.min(1, curve))
      : nodeGraphPhaserFaceDisplaySettingsDefaults.curveThickness,
  };
}

function nodeGraphPhaserWiredOuts(node) {
  const id = node?.id;
  const conns = (typeof nodeGraphMvp === "object" && nodeGraphMvp?.connections) || [];
  let left = false;
  let right = false;
  if (!id) return { left, right };
  for (let i = 0; i < conns.length; i += 1) {
    const c = conns[i];
    if (!c || c.sourceNode !== id) continue;
    const p = String(c.sourcePort || "");
    if (p === "Left") left = true;
    else if (p === "Right") right = true;
  }
  return { left, right };
}

function nodeGraphPhaserBpMag(freq, f0, q, cascade) {
  const f = Math.max(1e-9, freq);
  const fC = Math.max(1e-9, f0);
  const ratio = f / fC - fC / f;
  const den = Math.sqrt(1 + (q * q) * (ratio * ratio));
  let h = den > 0 ? 1 / den : 0;
  if (cascade > 1) h **= cascade;
  return h;
}

function nodeGraphPhaserApComplex(freq, f0, q, cascade) {
  const f = Math.max(1e-9, freq);
  const fC = Math.max(1e-9, f0);
  const u = q * (f / fC - fC / f);
  const d = 1 + u * u;
  let re = (1 - u * u) / d;
  let im = (-2 * u) / d;
  const n = Math.max(1, cascade);
  for (let k = 1; k < n; k += 1) {
    const nr = re * ((1 - u * u) / d) - im * ((-2 * u) / d);
    const ni = re * ((-2 * u) / d) + im * ((1 - u * u) / d);
    re = nr;
    im = ni;
  }
  return { re, im };
}

function drawNodeGraphPhaserPeakMarks(context, view, box) {
  const width = box.width;
  const height = box.height;
  const logMin = box.logMin;
  const logRange = box.logRange;
  const n = Math.max(1, Math.min(8, Math.round(nodeGraphFiniteNumber(view?.bands, 4))));
  const f0 = Math.max(1e-6, nodeGraphFilterCurveFiniteHz(view?.frequency, 1000));
  const spread = nodeGraphFiniteNumber(view?.spread, 0.5);
  const stereo = nodeGraphFiniteNumber(view?.stereoSpread);
  const sweep = nodeGraphFiniteNumber(view?.sweep);
  const q = Math.max(0.01, nodeGraphFiniteNumber(view?.q, 1));
  const cascade = Math.max(1, Math.min(4, Math.round(nodeGraphFiniteNumber(view?.slope)) + 1));
  const mid = 0.5 * (n - 1);
  const minSide = displayFaceMinSide(width, height);
  const barT = clampDisplayUnit01(view?.barThickness, 0.04);
  const curveT = clampDisplayUnit01(view?.curveThickness, 0.02);
  const barW = barT > 0 ? Math.max(1, displayScaleToPx(barT, minSide)) : 0;
  const curveW = curveT > 0 ? Math.max(1, displayScaleToPx(curveT, minSide)) : 0;
  const leftOut = view?.leftOut === true;
  const rightOut = view?.rightOut === true;
  const stereoOut = leftOut || rightOut;
  const xOf = (hz) => {
    const h = Math.max(1e-9, hz);
    return ((Math.log10(h) - logMin) / logRange) * width;
  };
  const centers = (octOffset) => {
    const list = [];
    for (let i = 0; i < n; i += 1) {
      list.push(f0 * (2 ** ((i - mid) * spread + octOffset + sweep)));
    }
    return list;
  };
  const kernel = Math.round(nodeGraphFiniteNumber(view?.kernel));
  const mix = nodeGraphFiniteNumber(view?.mix, 0.5);
  const magAt = (hz, octOffset) => {
    const list = centers(octOffset);
    if (kernel === 1) {
      let re = 1;
      let im = 0;
      for (let i = 0; i < list.length; i += 1) {
        const ap = nodeGraphPhaserApComplex(hz, list[i], q, cascade);
        const nr = re * ap.re - im * ap.im;
        const ni = re * ap.im + im * ap.re;
        re = nr;
        im = ni;
      }
      const wr = (1 - mix) + mix * re;
      const wi = mix * im;
      return Math.hypot(wr, wi);
    }
    let sum = 0;
    for (let i = 0; i < list.length; i += 1) {
      sum += nodeGraphPhaserBpMag(hz, list[i], q, cascade);
    }
    return Math.abs(1 - mix) * 1 + Math.abs(mix) * sum;
  };
  const drawBars = (octOffset, color) => {
    if (!(barW > 0)) return;
    context.fillStyle = color;
    const list = centers(octOffset);
    for (let i = 0; i < list.length; i += 1) {
      const x = xOf(list[i]);
      if (!Number.isFinite(x)) continue;
      context.fillRect(x - barW * 0.5, 0, barW, height);
    }
  };
  const drawCurve = (octOffset, color) => {
    if (!(curveW > 0)) return;
    const step = Math.max(2, Math.ceil(width / 96));
    let peak = 1e-9;
    const ys = [];
    for (let x = 0; x < width; x += step) {
      const progress = width <= 1 ? 0 : x / (width - 1);
      const hz = 10 ** (logMin + progress * logRange);
      const m = magAt(hz, octOffset);
      ys.push({ x, m });
      if (m > peak) peak = m;
    }
    context.strokeStyle = color;
    context.lineWidth = curveW;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    for (let i = 0; i < ys.length; i += 1) {
      const y = height * (1 - ys[i].m / peak);
      if (i === 0) context.moveTo(ys[i].x, y);
      else context.lineTo(ys[i].x, y);
    }
    context.stroke();
  };
  const colorL = "rgb(255, 128, 128)";
  const colorR = "rgb(128, 128, 255)";
  const colorM = "rgb(80, 220, 110)";
  context.save();
  context.globalCompositeOperation = "lighter";
  if (!stereoOut) {
    drawBars(0, colorM);
    drawCurve(0, "rgb(160, 255, 180)");
  } else {
    if (leftOut || !rightOut) {
      drawBars(-0.5 * stereo, colorL);
      drawCurve(-0.5 * stereo, colorL);
    }
    if (rightOut || !leftOut) {
      drawBars(0.5 * stereo, colorR);
      drawCurve(0.5 * stereo, colorR);
    }
  }
  context.restore();
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
  const amplitude = Math.max(0, nodeGraphFilterCurveLiveParam(node, "amplitude", 1));
  const signature = JSON.stringify(view) + "|a=" + amplitude;
  // Drop provisional px width/height from older pre-layout fallback. That stamp
  // overrode CSS width:100% and froze the face when the module was widened.
  if (section.style.width || section.style.height) {
    section.style.width = "";
    section.style.height = "";
  }
  // Layout size: offsetWidth avoids getBoundingClientRect (cheaper; zoom is
  // applied via CSS transform on the workspace, not on face layout size).
  const measured = nodeGraphFilterCurveMeasureBox(section);
  const rawW = measured.rawW;
  const rawH = measured.rawH;
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
  if (rawW < 8 || rawH < 8) {
    // Face not laid out yet — do not cache signature; keep retrying.
    section._filterCurveLaidOut = false;
    section._filterCurveForceDraw = true;
    const tries = (nodeGraphFiniteNumber(section._filterCurveRetryCount)) + 1;
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
  const sampleRate = Math.max(1, nodeGraphFiniteNumber(nodeGraphMvp?.sampleRate, 44100));
  const minFreq = 20;
  const maxFreq = Math.max(minFreq * 2, Math.min(20000, sampleRate * 0.5));
  const minDb = -48;
  const maxDb = 18;
  const minSide = displayFaceMinSide(width, height);
  const strokeGrid = Math.max(1, displayScaleToPx(0.008, minSide));
  const strokeCurve = Math.max(1, displayScaleToPx(0.012, minSide));
  const strokeCutoff = Math.max(1, displayScaleToPx(0.008, minSide));
  const fontPx = Math.max(8, displayScaleToPx(0.07, minSide));
  const titlePx = Math.max(8, displayScaleToPx(0.078, minSide));
  const labelGap = Math.max(2, displayScaleToPx(0.022, minSide));
  const titlePad = Math.max(2, displayScaleToPx(0.045, minSide));
  const staggerPx = displayScaleToPx(0.07, minSide);
  section._filterCurveSignature = signature;
  section._filterCurveCssW = cssW;
  section._filterCurveCssH = cssH;
  section._filterCurveForceDraw = false;
  section._filterCurveLaidOut = true;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);
  const isPhaser = node.type === "phaser";
  const zeroDbY = (1 - ((0 - minDb) / (maxDb - minDb))) * height;
  if (!isPhaser && Number.isFinite(zeroDbY)) {
    context.strokeStyle = "rgba(255, 255, 255, 0.22)";
    context.lineWidth = strokeGrid;
    context.beginPath();
    context.moveTo(0, zeroDbY);
    context.lineTo(width, zeroDbY);
    context.stroke();
  }
  const logMin = Math.log10(minFreq);
  const logRange = Math.log10(maxFreq) - logMin;
  if (isPhaser) {
    drawNodeGraphPhaserPeakMarks(context, view, {
      width,
      height,
      logMin,
      logRange,
      minFreq,
      maxFreq,
      zeroDbY,
    });
  }
  const cutoffLineWidth = strokeCutoff;
  const cutoffInset = cutoffLineWidth * 0.5;
  const cutoffDrawableWidth = Math.max(1, width - cutoffLineWidth);
  const cutoffs = nodeGraphFilterCurveCutoffFrequencies(node, view);
  const isCrossover = nodeGraphIsCrossoverType(node.type);

  // Crossover faces: split lines + Hz only (no magnitude curves / band titles).
  // Keeps 1gu display height readable and cheap to paint.
  if (!isCrossover && !isPhaser) {
    // Cap sample density for filter magnitude paths.
    const maxSamples = 220;
    const step = Math.max(1, Math.ceil(width / maxSamples));
    context.strokeStyle = "rgba(61, 224, 255, 0.95)";
    context.lineWidth = strokeCurve;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let started = false;
    for (let x = 0; x < width; x += step) {
      const progress = width <= 1 ? 0 : x / (width - 1);
      const hz = 10 ** (logMin + progress * logRange);
      let magnitude = nodeGraphFilterCurveResponseAt(node, hz, sampleRate, view);
      if (!Number.isFinite(magnitude) || magnitude <= 0) {
        magnitude = 1e-6;
      }
      magnitude *= amplitude;
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
      magnitude *= amplitude;
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

  // Vertical frequency markers + Hz labels (incl. single-cutoff LP/HP).
  context.strokeStyle = "rgba(226, 168, 109, 0.85)";
  context.lineWidth = cutoffLineWidth;
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  context.textBaseline = "middle";
  const labelY = height * 0.5;
  if (!isPhaser) cutoffs.forEach((frequency, index) => {
    // 0 Hz (and anything below the log axis floor) → left edge, not minFreq.
    const cutoffRatio = nodeGraphFilterCurveCutoffRatio(frequency, minFreq, maxFreq);
    const cutoffX = cutoffInset + cutoffRatio * cutoffDrawableWidth;
    context.beginPath();
    context.moveTo(cutoffX, 0);
    context.lineTo(cutoffX, height);
    context.stroke();
    if (cutoffs.length > 0) {
      const label = nodeGraphFilterCurveFormatHz(frequency);
      const textW = context.measureText(label).width;
      let textX = cutoffX + labelGap;
      if (textX + textW > width - labelGap) {
        textX = Math.max(labelGap, cutoffX - textW - labelGap);
      }
      const stagger = height >= fontPx * 4 ? ((index % 3) - 1) * staggerPx : 0;
      const textY = Math.max(fontPx * 0.55, Math.min(height - fontPx * 0.55, labelY + stagger));
      context.fillStyle = "rgba(2, 6, 9, 0.75)";
      context.fillRect(textX - labelGap * 0.35, textY - fontPx * 0.55, textW + labelGap, fontPx + labelGap * 0.7);
      context.fillStyle = "rgba(255, 220, 170, 0.95)";
      context.fillText(label, textX, textY);
    }
  });

  // Non-crossover filter title (crossovers stay markers-only).
  if (!isCrossover && !isPhaser) {
    const title = nodeGraphFilterCurveLabel(node);
    context.font = `600 ${titlePx}px system-ui, sans-serif`;
    context.textBaseline = "top";
    const titleW = context.measureText(title).width;
    const titleY = titlePad * 0.5;
    context.fillStyle = "rgba(2, 6, 9, 0.65)";
    context.fillRect(titlePad, titleY - titlePad * 0.15, titleW + titlePad * 0.7, titlePx + titlePad * 0.35);
    context.fillStyle = "rgba(229, 238, 242, 0.82)";
    context.fillText(title, titlePad * 1.3, titleY);
  }

  // Keep the dimmer hole open after paint. Stop wipe used to leave strength 0
  // on this light-source, so the room veil covered a perfectly drawn curve.
  nodeGraphFilterCurveApplyScreenLight(section, canvas);
}

function drawNodeGraphFilterCurveDisplays() {
  document.querySelectorAll(".node-filter-curve-display").forEach((section) => {
    // RoundShape / BasicShape / SinCos4 reuse the filter-curve plate class but
    // own drawers. Calling the generic filter-curve painter on them flashes a
    // second UI (especially visible when scrubbing Mode on SinCos4).
    if (section.classList.contains("node-round-shape-display")) {
      if (typeof drawNodeGraphRoundShapeDisplay === "function") {
        drawNodeGraphRoundShapeDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-basic-shape-display")) {
      if (typeof drawNodeGraphBasicShapeDisplay === "function") {
        drawNodeGraphBasicShapeDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-softwave-osc-display")) {
      if (typeof drawNodeGraphSoftwaveOscDisplay === "function") {
        drawNodeGraphSoftwaveOscDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-expo-pluck-display")) {
      if (typeof drawNodeGraphExpoPluckEnvelopeDisplay === "function") {
        drawNodeGraphExpoPluckEnvelopeDisplay(section);
      }
      return;
    }
    if (section.classList.contains("node-expo-pluck2-display")) {
      if (typeof drawNodeGraphExpoPluckEnvelope2Display === "function") {
        drawNodeGraphExpoPluckEnvelope2Display(section);
      }
      return;
    }
    if (section.classList.contains("node-sincos4-display")) {
      if (typeof drawNodeGraphSinCos4Display === "function") {
        drawNodeGraphSinCos4Display(section);
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
        || section.classList.contains("node-expo-pluck-display")
        || section.classList.contains("node-expo-pluck2-display")
        || section.classList.contains("node-phone-tone-display")
        || section.classList.contains("node-harmonic-series-display")
        || section.classList.contains("node-basic-shape-display")
        || section.classList.contains("node-softwave-osc-display")
        || section.classList.contains("node-sincos4-display")
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
