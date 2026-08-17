// Passive Filter — cascaded real 1-poles (no Q).
// Slope 0..3 → 1..4 stages (6/12/18/24 dB/oct).
// Stagger k≥1 geometric spread around fc (k=1 identical poles).
// Gain Comp On scales the stack so analog |H(jωc)| = −3 dB.

const nodeGraphPassiveFilterMaxStages = 4;

function nodeGraphPassiveFilterStageCount(slope) {
  const n = Math.round(Number(slope));
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.max(1, Math.min(nodeGraphPassiveFilterMaxStages, n + 1));
}

function nodeGraphPassiveFilterStaggerRatio(stagger) {
  const k = Number(stagger);
  if (!Number.isFinite(k) || k < 1) {
    return 1;
  }
  return Math.min(8, k);
}

function nodeGraphPassiveFilterSafeNumber(value, runtime, nodeId, state, source) {
  if (typeof nodeGraphSafeFilterNumber === "function") {
    return nodeGraphSafeFilterNumber(value, runtime, nodeId, state, source);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nodeGraphPassiveFilterSampleRate(sampleRate) {
  const rate = Number(sampleRate);
  if (Number.isFinite(rate) && rate >= 1) {
    return rate;
  }
  if (typeof nodeGraphMvp !== "undefined" && Number(nodeGraphMvp?.sampleRate) >= 1) {
    return Number(nodeGraphMvp.sampleRate);
  }
  return 44100;
}

function createNodeGraphPassiveFilterState() {
  const pole = () => ({ inputBuffer: 0, outputBuffer: 0 });
  return {
    hp: [pole(), pole(), pole(), pole()],
    lp: [pole(), pole(), pole(), pole()],
  };
}

function nodeGraphEnsurePassiveFilterState(state) {
  const next = state && typeof state === "object" ? state : createNodeGraphPassiveFilterState();
  if (!Array.isArray(next.hp) || next.hp.length < nodeGraphPassiveFilterMaxStages) {
    next.hp = [];
  }
  if (!Array.isArray(next.lp) || next.lp.length < nodeGraphPassiveFilterMaxStages) {
    next.lp = [];
  }
  while (next.hp.length < nodeGraphPassiveFilterMaxStages) {
    next.hp.push({ inputBuffer: 0, outputBuffer: 0 });
  }
  while (next.lp.length < nodeGraphPassiveFilterMaxStages) {
    next.lp.push({ inputBuffer: 0, outputBuffer: 0 });
  }
  if (next.highpass && typeof next.highpass === "object") {
    next.hp[0] = next.highpass;
    next.highpass = null;
  }
  if (next.lowpass && typeof next.lowpass === "object") {
    next.lp[0] = next.lowpass;
    next.lowpass = null;
  }
  return next;
}

function nodeGraphOnePoleHighpassSample(state, input, frequency, sampleRate, runtime = null, nodeId = "") {
  const pole = state && typeof state === "object" ? state : { inputBuffer: 0, outputBuffer: 0 };
  const rate = nodeGraphPassiveFilterSampleRate(sampleRate);
  const safeInput = nodeGraphPassiveFilterSafeNumber(input, runtime, nodeId, pole, "highpass input");
  const frequencyValue = Math.max(0, nodeGraphPassiveFilterSafeNumber(frequency, runtime, nodeId, pole, "highpass frequency"));
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  const b1 = -b0;
  pole.outputBuffer = nodeGraphPassiveFilterSafeNumber(
    b0 * safeInput + b1 * pole.inputBuffer + a1 * pole.outputBuffer,
    runtime,
    nodeId,
    pole,
    "highpass output",
  );
  pole.inputBuffer = safeInput;
  return pole.outputBuffer;
}

function nodeGraphPassiveFilterLowpassSample(state, input, frequency, sampleRate, runtime, nodeId) {
  if (typeof nodeGraphOnePoleLowpassSample === "function") {
    return nodeGraphOnePoleLowpassSample(state, input, frequency, sampleRate, runtime, nodeId);
  }
  const pole = state && typeof state === "object" ? state : { inputBuffer: 0, outputBuffer: 0 };
  const rate = nodeGraphPassiveFilterSampleRate(sampleRate);
  const safeInput = nodeGraphPassiveFilterSafeNumber(input, runtime, nodeId, pole, "lowpass input");
  const frequencyValue = Math.max(0, nodeGraphPassiveFilterSafeNumber(frequency, runtime, nodeId, pole, "lowpass frequency"));
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  pole.outputBuffer = nodeGraphPassiveFilterSafeNumber(
    b0 * safeInput + a1 * pole.outputBuffer,
    runtime,
    nodeId,
    pole,
    "lowpass output",
  );
  return pole.outputBuffer;
}

/** Analog |H(jωc)| of cascaded 1-poles at fc after scaling every pole by alpha. */
function nodeGraphPassiveFilterAnalogMagAtFc(kind, freqs, fc, alpha) {
  const c = Number(fc);
  if (!(c > 0)) {
    return 1;
  }
  let mag = 1;
  for (let i = 0; i < freqs.length; i += 1) {
    const fi = Math.max(0, Number(freqs[i]) || 0) * alpha;
    const den = Math.hypot(c, fi);
    if (!(den > 0)) {
      mag = 0;
      break;
    }
    mag *= kind === "hp" ? c / den : fi / den;
  }
  return mag;
}

/** Scale factor so analog |H(jωc)| = 1/√2. Identical poles use the closed form. */
function nodeGraphPassiveFilterCompAlpha(kind, freqs, fc) {
  const n = freqs.length;
  const c = Number(fc);
  if (!(n > 0) || !(c > 0)) {
    return 1;
  }
  let identical = true;
  for (let i = 0; i < n; i += 1) {
    if (Math.abs((Number(freqs[i]) || 0) - c) > 1e-9 * Math.max(1, c)) {
      identical = false;
      break;
    }
  }
  if (identical) {
    const s = Math.sqrt((2 ** (1 / n)) - 1);
    if (!(s > 0)) {
      return 1;
    }
    return kind === "hp" ? s : 1 / s;
  }
  const target = Math.SQRT1_2;
  let lo = 1e-6;
  let hi = 1e6;
  for (let i = 0; i < 20; i += 1) {
    const mid = Math.sqrt(lo * hi);
    const mag = nodeGraphPassiveFilterAnalogMagAtFc(kind, freqs, c, mid);
    if (kind === "lp") {
      if (mag < target) lo = mid;
      else hi = mid;
    } else if (mag < target) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return Math.sqrt(lo * hi);
}

// Geometric stagger: alpha depends on (kind, N, k), not fc. Search once, not per sample.
const nodeGraphPassiveFilterAlphaMemo = new Map();

function nodeGraphPassiveFilterMemoizedCompAlpha(kind, freqs, fc, stagger) {
  const n = freqs.length;
  const k = nodeGraphPassiveFilterStaggerRatio(stagger);
  const key = `${kind}\0${n}\0${Math.round(k * 1000)}`;
  const hit = nodeGraphPassiveFilterAlphaMemo.get(key);
  if (hit != null) {
    return hit;
  }
  const alpha = nodeGraphPassiveFilterCompAlpha(kind, freqs, fc);
  if (nodeGraphPassiveFilterAlphaMemo.size > 4096) {
    nodeGraphPassiveFilterAlphaMemo.clear();
  }
  nodeGraphPassiveFilterAlphaMemo.set(key, alpha);
  return alpha;
}

/**
 * Stage cutoffs around fc. k=1 → all fc; k>1 geometric.
 * Gain Comp On: one scale so |H(jωc)| = −3 dB (LP vs HP reciprocal when k=1).
 */
function nodeGraphPassiveFilterStackFrequencies(fc, stageCount, stagger, gainCompensation, kind) {
  const n = Math.max(1, Math.min(nodeGraphPassiveFilterMaxStages, Math.round(Number(stageCount) || 1)));
  const k = nodeGraphPassiveFilterStaggerRatio(stagger);
  const center = Math.max(0, Number(fc) || 0);
  const mid = (n - 1) / 2;
  const freqs = [];
  for (let i = 0; i < n; i += 1) {
    freqs.push(center * (k ** (i - mid)));
  }
  const compOn = Number(gainCompensation) > 0.5;
  if (!compOn || !(center > 0)) {
    return freqs;
  }
  const alpha = nodeGraphPassiveFilterMemoizedCompAlpha(
    kind === "hp" ? "hp" : "lp",
    freqs,
    center,
    k,
  );
  for (let i = 0; i < freqs.length; i += 1) {
    freqs[i] *= alpha;
  }
  return freqs;
}

function nodeGraphPassiveFilterCascade(poles, input, freqs, kind, sampleRate, runtime, nodeId) {
  let x = input;
  const n = freqs.length;
  const hp = kind === "hp";
  for (let i = 0; i < n; i += 1) {
    const pole = poles[i];
    x = hp
      ? nodeGraphOnePoleHighpassSample(pole, x, freqs[i], sampleRate, runtime, nodeId)
      : nodeGraphPassiveFilterLowpassSample(pole, x, freqs[i], sampleRate, runtime, nodeId);
  }
  return x;
}

function nodeGraphPassiveFilterPrepare(
  pack,
  mode,
  lowFrequency,
  highFrequency,
  slope,
  stagger,
  gainCompensation,
) {
  const host = pack && typeof pack === "object" ? pack : {};
  const safeMode = Math.round(Number(mode)) || 0;
  const stages = nodeGraphPassiveFilterStageCount(slope);
  const k = nodeGraphPassiveFilterStaggerRatio(stagger);
  const comp = Number(gainCompensation) > 0.5 ? 1 : 0;
  const lo = Math.max(0, Number(lowFrequency) || 0);
  const hi = Math.max(0, Number(highFrequency) || 0);
  const key = `${safeMode}|${stages}|${k}|${comp}|${lo}|${hi}`;
  if (host._pfKey === key && host._pfCoeff) {
    return host._pfCoeff;
  }
  let hpHz = null;
  let lpHz = null;
  if (safeMode === 1) {
    const low = Math.min(lo, hi);
    const high = Math.max(lo, hi);
    hpHz = nodeGraphPassiveFilterStackFrequencies(low, stages, k, comp, "hp");
    lpHz = nodeGraphPassiveFilterStackFrequencies(high, stages, k, comp, "lp");
  } else if (safeMode === 2) {
    hpHz = nodeGraphPassiveFilterStackFrequencies(lo, stages, k, comp, "hp");
  } else {
    lpHz = nodeGraphPassiveFilterStackFrequencies(hi, stages, k, comp, "lp");
  }
  const coeff = { safeMode, hpHz, lpHz };
  host._pfKey = key;
  host._pfCoeff = coeff;
  return coeff;
}

function nodeGraphPassiveFilterProcess(state, input, coeff, sampleRate, runtime, nodeId) {
  const next = nodeGraphEnsurePassiveFilterState(state);
  const spec = coeff || {};
  if (spec.safeMode === 1 && spec.hpHz && spec.lpHz) {
    const hp = nodeGraphPassiveFilterCascade(next.hp, input, spec.hpHz, "hp", sampleRate, runtime, nodeId);
    return nodeGraphPassiveFilterCascade(next.lp, hp, spec.lpHz, "lp", sampleRate, runtime, nodeId);
  }
  if (spec.safeMode === 2 && spec.hpHz) {
    return nodeGraphPassiveFilterCascade(next.hp, input, spec.hpHz, "hp", sampleRate, runtime, nodeId);
  }
  if (spec.lpHz) {
    return nodeGraphPassiveFilterCascade(next.lp, input, spec.lpHz, "lp", sampleRate, runtime, nodeId);
  }
  return input;
}

function nodeGraphPassiveFilterSample(
  state,
  input,
  mode,
  lowFrequency,
  highFrequency,
  sampleRate,
  runtime,
  nodeId,
  slope,
  stagger,
  gainCompensation,
) {
  const coeff = nodeGraphPassiveFilterPrepare(
    state,
    mode,
    lowFrequency,
    highFrequency,
    slope,
    stagger,
    gainCompensation,
  );
  return nodeGraphPassiveFilterProcess(state, input, coeff, sampleRate, runtime, nodeId);
}
