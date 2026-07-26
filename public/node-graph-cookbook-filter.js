const nodeGraphCookbookFilterModes = Object.freeze([
  "Bypass",
  "Lowpass",
  "Highpass",
  "Bandpass Skirt",
  "Bandpass Peak",
  "Bandreject",
  "Allpass",
  "Peak",
  "Low Shelf",
  "High Shelf",
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
  const freq = clampNodeSliderValue(Number(frequency) || 1000, 20, Math.min(20000, rate * 0.49));
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

// nodeGraphLadderFilterStageCount / nodeGraphLadderFilterMix now live in
// node-graph-stdlib/node-graph-shared-dsp-helpers.js and
// public/modules/ladderFilter/ladder-filter-live-evaluator.js (this file's
// copies were byte-for-byte identical).

// nodeGraphLadderFilterFeedbackFactor / nodeGraphLadderFilterCoefficients
// used to be defined here too, but public/modules/ladderFilter/
// ladder-filter-live-evaluator.js's script tag loads after this file and
// redeclares both under the same global names -- meaning this file's own
// copies were already dead/shadowed code (the call below has actually been
// resolving to ladderFilter's richer version, with its extra runtime/
// nodeId/state sanitization params defaulting harmlessly, ever since that
// module file was added). Removed rather than left as confusing unreachable
// code; no behavior change, since the shadowing was already in effect.

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
  let stagePower = { re: 1, im: 0 };
  let sum = nodeGraphComplexScale(stagePower, coeff.c[0] || 0);
  for (let index = 1; index < coeff.c.length; index += 1) {
    stagePower = nodeGraphComplexMultiply(stagePower, stage);
    sum = nodeGraphComplexAdd(sum, nodeGraphComplexScale(stagePower, coeff.c[index] || 0));
  }
  return Math.hypot(sum.re, sum.im) * coeff.g;
}

function nodeGraphFilterCurveResponseAt(node, frequency, sampleRate) {
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(node.params?.mode) || 0);
    if (mode === 1) {
      return nodeGraphBandpassMagnitudeAt(node.params?.lowFrequency, node.params?.highFrequency, frequency, sampleRate);
    }
    if (mode === 2) {
      return nodeGraphOnePoleHighpassMagnitudeAt(node.params?.lowFrequency, frequency, sampleRate);
    }
    return nodeGraphOnePoleLowpassMagnitudeAt(node.params?.highFrequency, frequency, sampleRate);
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterMagnitudeAt({
      frequency: Number(node.params?.frequency) || 1000,
      mode: Number(node.params?.mode) || 1,
      resonance: Number(node.params?.resonance) || 0,
      stages: Number(node.params?.stages) || 4,
    }, frequency, sampleRate);
  }
  if (node.type === "papoulisFilter") {
    return nodeGraphPapoulisFilterMagnitudeAt(Number(node.params?.cutoff) || 1000, frequency, sampleRate);
  }
  const mode = Number(node.params?.mode) || 0;
  const cutoff = Number(node.params?.frequency) || 1000;
  const q = Number(node.params?.q) || 1;
  const gain = Number(node.params?.gain) || 0;
  const stages = nodeGraphCookbookFilterStageCount(node.params?.stages);
  const coeff = nodeGraphCookbookFilterCoefficients(mode, cutoff, q, gain, sampleRate);
  return nodeGraphCookbookFilterMagnitudeAt(coeff, frequency, sampleRate, stages);
}

function nodeGraphFilterCurveCutoffFrequencies(node) {
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(node.params?.mode) || 0);
    if (mode === 2) {
      return [Number(node.params?.lowFrequency) || 0].filter((v) => Number.isFinite(v) && v >= 0);
    }
    return [node.params?.lowFrequency, node.params?.highFrequency]
      .map((value) => Number(value) || 0)
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (node.type === "papoulisFilter") {
    return [Number(node.params?.cutoff) || 0].filter((value) => Number.isFinite(value) && value >= 0);
  }
  return [Number(node.params?.frequency) || 0].filter((value) => Number.isFinite(value) && value >= 0);
}

function nodeGraphFilterCurveLabel(node) {
  if (node.type === "passiveFilter") {
    const mode = Math.round(Number(node.params?.mode) || 0);
    return mode === 1 ? "1-Pole BP" : mode === 2 ? "1-Pole HP" : "1-Pole LP";
  }
  if (node.type === "ladderFilter") {
    return nodeGraphLadderFilterModes[Math.round(Number(node.params?.mode) || 0)] || "Ladder";
  }
  if (node.type === "papoulisFilter") {
    return "Papoulis LP";
  }
  return nodeGraphCookbookFilterModes[Math.round(Number(node.params?.mode) || 0)] || "Filter";
}

function createNodeGraphFilterCurveDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-filter-curve-display";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas";
  section.append(canvas);
  requestAnimationFrame(() => drawNodeGraphFilterCurveDisplay(section));
  return section;
}

function drawNodeGraphFilterCurveDisplay(section) {
  const node = nodeGraphPatchNode(section?.dataset?.node || "");
  const canvas = section?.querySelector?.(".node-filter-curve-canvas");
  if (!node || !canvas) {
    return;
  }
  const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
  if (!metrics) {
    return;
  }
  const { context, cssHeight: height, cssWidth: width, pixelRatio } = metrics;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const sampleRate = Math.max(1, Number(nodeGraphMvp?.sampleRate) || 44100);
  const minFreq = 20;
  const maxFreq = Math.max(minFreq * 2, Math.min(20000, sampleRate * 0.5));
  const minDb = -48;
  const maxDb = 18;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(127, 199, 217, 0.18)";
  context.lineWidth = 1;
  for (let line = 0; line <= 4; line += 1) {
    const y = (line / 4) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  const logMin = Math.log10(minFreq);
  const logRange = Math.log10(maxFreq) - logMin;
  context.strokeStyle = "rgba(226, 168, 109, 0.5)";
  const cutoffLineWidth = 1;
  const cutoffInset = cutoffLineWidth * 0.5;
  const cutoffDrawableWidth = Math.max(1, width - cutoffLineWidth);
  context.lineWidth = cutoffLineWidth;
  for (const frequency of nodeGraphFilterCurveCutoffFrequencies(node)) {
    const cutoffRatio = (Math.log10(clampNodeSliderValue(frequency, minFreq, maxFreq)) - logMin) / logRange;
    const cutoffX = cutoffInset + cutoffRatio * cutoffDrawableWidth;
    context.beginPath();
    context.moveTo(cutoffX, 0);
    context.lineTo(cutoffX, height);
    context.stroke();
  }
  context.strokeStyle = "rgba(61, 224, 255, 0.95)";
  context.lineWidth = 1.5;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const progress = width <= 1 ? 0 : x / (width - 1);
    const hz = 10 ** (logMin + progress * logRange);
    const magnitude = nodeGraphFilterCurveResponseAt(node, hz, sampleRate);
    const db = clampNodeSliderValue(20 * Math.log10(Math.max(1e-6, magnitude)), minDb, maxDb);
    const y = (1 - ((db - minDb) / (maxDb - minDb))) * height;
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  context.fillStyle = "rgba(229, 238, 242, 0.74)";
  context.font = "600 10px system-ui, sans-serif";
  context.fillText(nodeGraphFilterCurveLabel(node), 8, 14);
}

function drawNodeGraphFilterCurveDisplays() {
  document.querySelectorAll(".node-filter-curve-display").forEach(drawNodeGraphFilterCurveDisplay);
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
    drawNodeGraphFilterCurveDisplays();
  });
}

function syncNodeGraphFilterCurveDisplays() {
  if (typeof scheduleNodeGraphFilterCurveDraw === "function") {
    scheduleNodeGraphFilterCurveDraw();
  }
}
