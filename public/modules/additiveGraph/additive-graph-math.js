// Shared Yellow Graph payload + additive partial tables + Effect modes.
// Graph is once-per-quantum ZOH: parallel arrays length H.

const ADDITIVE_GRAPH_MAX_H = 4096;

function additiveGraphClamp(v, lo, hi) {
  const n = Number(v);
  if (!(n === n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function additiveGraphWrap01(v) {
  const n = Number(v) || 0;
  const w = n - Math.floor(n);
  return w < 0 ? 0 : w >= 1 ? 0 : w;
}

function additiveGraphRationalCurve(t, c) {
  const x = additiveGraphClamp(t, 0, 1);
  const skew = additiveGraphClamp(c, -0.9999, 0.9999);
  const cv = skew * x;
  const den = 2 * cv - skew + 1;
  if (Math.abs(den) < 1e-12) return x;
  return (cv + x) / den;
}

/** Port of native additive_osc.cpp waveform_harmonic. */
function additiveGraphWaveformPartial(waveform, harmonic, morph) {
  const n = Math.max(1, Math.floor(Number(harmonic) || 1));
  const h = n;
  const odd = n % 2 === 1 ? 1 : 0;
  const mod = additiveGraphClamp(morph, 0, 1);
  let amplitude = 0;
  let phase = 0;
  const wf = Math.round(Number(waveform) || 0);
  switch (wf) {
    case 0: // Sawtooth
      amplitude = 1 / h;
      phase = odd ? 0.5 : 0;
      break;
    case 1: // SawSquare
      amplitude = odd ? 1 / h : (1 / h) * mod;
      phase = 0;
      break;
    case 2: { // DoubleSaw
      const pwm = mod * 0.5;
      amplitude = Math.cos(h * pwm) / h;
      phase = 0;
      break;
    }
    case 3: { // MultiSaw
      const pwm = mod * 0.5;
      amplitude = Math.cos(h * h * 0.3 + pwm) / h;
      phase = 0;
      break;
    }
    case 4: { // RoundedSquareDoubleSaw
      const m = 0.125 + 0.75 * mod;
      amplitude = Math.sin(h * h * 0.25 + m) / (h * h);
      phase = 0;
      break;
    }
    case 5: { // SquareDoubleSaw
      const m = 0.125 + 0.75 * mod;
      amplitude = Math.sin(h * h * 0.25 + m) / h;
      phase = 0;
      break;
    }
    case 6: { // PulseCenter
      const pwm = mod * 0.5;
      amplitude = Math.sin(h * pwm) / h;
      phase = 0.25;
      break;
    }
    case 7: { // PulseLeft
      const pwm = mod * 0.5;
      amplitude = Math.sin(h * pwm) / h;
      phase = h * pwm + 0.25;
      break;
    }
    case 8: { // PulseRight
      const pwm = mod * 0.5;
      amplitude = Math.sin(h * pwm) / h;
      phase = h * (-pwm) + 0.25;
      break;
    }
    case 9: { // MultiPulse1
      const pwm = mod * 0.5;
      amplitude = Math.cos(h * h * 0.45 + pwm) / h;
      phase = 0;
      break;
    }
    case 10: { // MultiPulse2
      const pwm = mod * 0.5;
      amplitude = Math.cos(h * h * 0.475 + pwm) / h;
      phase = 0;
      break;
    }
    case 11: // Square
      amplitude = odd ? 1 / h : 0;
      phase = 0;
      break;
    case 12: { // TriSaw
      const peak = additiveGraphClamp(mod, 0.001, 0.999);
      amplitude = (Math.sin(0.5 * h * peak) / (peak * (1 - peak) * h * h)) * 0.2;
      phase = 0;
      break;
    }
    case 13: // Triangle
      amplitude = odd ? 1 / (h * h) : 0;
      phase = n % 4 === 1 ? 0 : 0.5;
      break;
    case 14: // RectifiedSine
      amplitude = 1 / (h * h);
      phase = odd ? 0.25 : 0.75;
      break;
    case 15: { // RectifiedSineTri
      amplitude = Math.sin(h * h * 0.25 + mod) / (h * h);
      phase = 0.25;
      break;
    }
    case 16: { // Organ
      const octaves = Math.max(2, Math.floor(2 + mod * 11));
      let target = 1;
      while (target < n) {
        const next = target * octaves;
        if (next <= target) break;
        target = next;
      }
      amplitude = target === n ? 1 / h : 0;
      phase = 0;
      break;
    }
    default:
      amplitude = 1 / h;
      phase = odd ? 0.5 : 0;
      break;
  }
  return { amplitude, phase: additiveGraphWrap01(phase), ratio: h };
}

function additiveGraphCreatePayload(harmonics) {
  // 0 harmonics = empty graph (valid). Fallback only when non-finite.
  let hCount = Number(harmonics);
  if (!Number.isFinite(hCount)) hCount = 1;
  const H = Math.max(0, Math.min(ADDITIVE_GRAPH_MAX_H, Math.round(hCount)));
  return {
    harmonics: H,
    ratio: new Float32Array(H),
    phase: new Float32Array(H),
    amplitude: new Float32Array(H),
    // Final Graph plane: bipolar pan −1…+1 (0 = center). Additive Out → L/R.
    pan: new Float32Array(H),
  };
}

function additiveGraphClonePayload(src) {
  if (!src || !src.ratio) return null;
  const H = src.ratio.length | 0;
  const out = additiveGraphCreatePayload(H);
  out.ratio.set(src.ratio);
  out.phase.set(src.phase);
  out.amplitude.set(src.amplitude);
  if (src.pan && src.pan.length === H) {
    out.pan.set(src.pan);
  }
  // WhiteNoise recipes + quantum lerps (walks shared by ref for Out).
  const copyNoise = (key) => {
    const n = src[key];
    if (!n || typeof n !== "object") return;
    out[key] = {
      mode: n.mode,
      amount: n.amount,
      speedHz: n.speedHz,
      walks: n.walks,
      seed: n.seed,
    };
  };
  copyNoise("ratioNoise");
  copyNoise("phaseNoise");
  copyNoise("panNoise");
  copyNoise("ampNoise");
  const copyLerp = (key) => {
    const lerp = src[key];
    if (!lerp?.from || !lerp?.to) return;
    const lf = lerp.from;
    const lt = lerp.to;
    const n = Math.min(H, lf.length | 0, lt.length | 0);
    const from = new Float32Array(H);
    const to = new Float32Array(H);
    for (let i = 0; i < n; i += 1) {
      from[i] = lf[i];
      to[i] = lt[i];
    }
    out[key] = { from, to };
  };
  copyLerp("ratioLerp");
  copyLerp("phaseLerp");
  copyLerp("panLerp");
  copyLerp("ampLerp");
  return out;
}

/** Build Generator Graph: relative ratios + waveform amps/phases; pan centered. */
function additiveGraphBuildFromWaveform(waveform, morph, harmonics) {
  const graph = additiveGraphCreatePayload(harmonics);
  const H = graph.harmonics;
  const wf = Number(waveform) || 0;
  const m = additiveGraphClamp(morph, 0, 1);
  for (let i = 0; i < H; i += 1) {
    const partial = additiveGraphWaveformPartial(wf, i + 1, m);
    graph.ratio[i] = partial.ratio;
    graph.phase[i] = partial.phase;
    graph.amplitude[i] = partial.amplitude;
    graph.pan[i] = 0;
  }
  return graph;
}

// --- Noisy modulation sources (once-per-quantum, GPU-friendly state machines) ---

function cheapWalkCreate(seed = 1) {
  return { x: 0, y: 0, seed: (seed >>> 0) || 1 };
}

/** Shared LCG bipolar sample in (−1, +1). Advances state.seed. */
function cheapNoiseWhiteSample(state) {
  let s = state.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  state.seed = s;
  return (s / 4294967295) * 2 - 1;
}

/**
 * CheapWalk tick. speed01 dimensionless (quantum-scaled Hz).
 * Reflecting random walk — great slow deviation; weak as hiss.
 * Speed 0 → frozen (x unchanged).
 */
function cheapWalkStep(state, speed01) {
  const bipolar = cheapNoiseWhiteSample(state);
  const rate = Number(speed01);
  const step = (Number.isFinite(rate) && rate > 0 ? rate : 0) * 0.35;
  let x = (Number(state.x) || 0) + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  state.x = x;
  return x;
}

/**
 * CheapFilteredNoise: white → one-pole, then soft-rail.
 * Low Speed: slow LP + strong drive/tanh → fuller ±1 swings than CheapWalk.
 * High Speed: filter opens → sizzle / hiss (CheapWalk struggles here).
 * Speed 0 → frozen (last soft output).
 */
function cheapFilteredNoiseStep(state, speed01) {
  const rate = Number(speed01);
  if (!(Number.isFinite(rate) && rate > 0)) {
    const held = Number(state.out);
    return Number.isFinite(held) ? held : 0;
  }
  const white = cheapNoiseWhiteSample(state);
  // Compress quantum speed01 into (0,1] pole open amount.
  const a = 1 - Math.exp(-Math.min(24, rate * 2.75));
  const y0 = Number(state.y) || 0;
  const y = y0 + a * (white - y0);
  state.y = y;
  // Variance shrinks with a — over-drive so slow settings visit the rails.
  const boost = Math.min(14, 1 / Math.pow(Math.max(a, 8e-4), 0.72));
  const out = Math.tanh(y * boost);
  state.out = out;
  return out;
}

/**
 * WhiteNoise: fresh bipolar sample each quantum. Speed ignored.
 */
function cheapWhiteNoiseStep(state) {
  const out = cheapNoiseWhiteSample(state);
  state.out = out;
  return out;
}

/** NoisyFreq noiseMode: 0 CheapWalk, 1 CheapFilteredNoise, 2 WhiteNoise. */
function additiveGraphNormalizeNoisyNoiseMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1 || n === 2) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "cheapfilterednoise" || s === "filtered" || s === "cfn") return 1;
  if (s === "2" || s === "whitenoise" || s === "white") return 2;
  return 0;
}

function additiveGraphNoisySample(state, speed01, noiseMode) {
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  if (mode === 2) return cheapWhiteNoiseStep(state);
  if (mode === 1) return cheapFilteredNoiseStep(state, speed01);
  return cheapWalkStep(state, speed01);
}

/**
 * Yellow Graph Noisy Speed is Hz. Effects run once per quantum, so scale like
 * Cheap Walk’s per-sample step accumulated over the block:
 *   speed01 = (Hz / sr) * blockFrames
 * Hz=0 → 0 (stopped). Hz≈20000 at 48k/128 → large step ≈ white-ish.
 */
function additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames) {
  const hz = Number(speedHz);
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const frames = Math.max(1, Number(blockFrames) || 128);
  return (hz / sr) * frames;
}

// --- Effect modes (split modules: Linear Filter / Analog Filter / Growl / Noisy) ---

/**
 * Filter choice index matches UI order LP / BP / HP (0 / 1 / 2).
 * (Previously 1→HP and 2→BP, which disagreed with the choice labels.)
 */
function additiveGraphNormalizeFilterMode(mode) {
  const m = String(mode ?? "lp").toLowerCase();
  if (m === "1" || m === "bp" || m === "bandpass" || m === "band") return "bp";
  if (m === "2" || m === "hp" || m === "highpass" || m === "high") return "hp";
  return "lp";
}

/**
 * Shared log-frequency X axis for Additive Out / filter faces.
 * Matches harmonicLines: ~20 Hz … project speed limit (log).
 */
function additiveGraphDisplayFreqAxis(sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const xMaxHz = typeof nodeGraphProjectSpeedLimitHz === "function"
    ? Math.max(1, nodeGraphProjectSpeedLimitHz())
    : Math.max(1, Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedLimit : 0) || 20000);
  const xMinHz = Math.min(20, xMaxHz * 0.5);
  const logXMin = Math.log(Math.max(1e-6, xMinHz));
  const logXSpan = Math.max(1e-9, Math.log(Math.max(xMinHz * 1.0001, xMaxHz)) - logXMin);
  return {
    sampleRate: sr,
    nyquist: sr * 0.5,
    xMinHz,
    xMaxHz,
    logXMin,
    logXSpan,
    hzToT(hz) {
      const c = Math.max(xMinHz, Math.min(xMaxHz, Number(hz) || 0));
      return (Math.log(c) - logXMin) / logXSpan;
    },
    tToHz(t) {
      const u = Math.max(0, Math.min(1, Number(t) || 0));
      return Math.exp(logXMin + u * logXSpan);
    },
  };
}

/**
 * Slope in dB/octave → Butterworth-ish order (6 dB/oct per pole).
 * 0 dB/oct → flat (order 0). Large values (e.g. 96) → near brickwall.
 */
function additiveGraphFilterOrderFromSlopeDbOct(slopeDbOct) {
  const db = Number(slopeDbOct);
  if (!(db > 0)) return 0;
  return Math.min(64, db / 6);
}

/**
 * One-sided Butterworth magnitude.
 * LP: 1/sqrt(1+(f/fc)^(2n)); HP: 1/sqrt(1+(fc/f)^(2n)).
 * LP + fc≤0 → 0 (silence). HP + fc≤0 → 1 (all-pass). order≤0 → flat.
 */
function additiveGraphButterworthMag(freqHz, cutoffHz, order, kind) {
  const f = Math.max(0, Number(freqHz) || 0);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const n = Math.max(0, Number(order) || 0);
  if (!(n > 0)) return 1;
  if (kind === "lp") {
    if (!(fc > 0)) return 0;
    if (!(f > 0)) return 1;
    const r = f / fc;
    return 1 / Math.sqrt(1 + Math.pow(r, 2 * n));
  }
  // hp
  if (!(fc > 0)) return 1;
  if (!(f > 0)) return 0;
  const r = fc / Math.max(1e-12, f);
  return 1 / Math.sqrt(1 + Math.pow(r, 2 * n));
}

/**
 * Analog skew: stretch/compress log(f/fc) before the magnitude law
 * (asymmetric skirt character; 0 = plain Butterworth).
 */
function additiveGraphFilterSkewedFreqRatio(freqHz, cutoffHz, skew) {
  const f = Math.max(1e-12, Number(freqHz) || 0);
  const fc = Math.max(1e-12, Number(cutoffHz) || 0);
  const sk = additiveGraphClamp(Number(skew) || 0, -0.9999, 0.9999);
  if (!(Math.abs(sk) > 1e-9)) return f / fc;
  const oct = Math.log(f / fc) / Math.LN2;
  // Positive skew steepens above fc for LP (compress positive octaves).
  const warped = oct >= 0
    ? oct * (1 + sk * 0.85)
    : oct / Math.max(1e-6, 1 + sk * 0.85);
  return Math.pow(2, warped);
}

/**
 * Approximate analog/spectral filter gain at an absolute frequency.
 * slopeDbOct = asymptotic skirt in dB/octave (unit on the Slope param).
 * curveKind "analog" applies Skew on log(f/fc); "linear" = plain Butterworth.
 */
function additiveGraphFilterResponseGainHz(
  freqHz, mode, cutoffHz, slopeDbOct, curveKind, skew,
) {
  const m = additiveGraphNormalizeFilterMode(mode);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const order = additiveGraphFilterOrderFromSlopeDbOct(slopeDbOct);
  const f = Math.max(0, Number(freqHz) || 0);

  if (m === "bp") {
    if (!(fc > 0) || !(order > 0)) return 0;
    // Bandwidth from slope: gentler slope → wider band (octaves).
    // order high (steep) → narrow; order low → wide.
    const oct = Math.max(0.02, 4 / Math.max(order, 0.25));
    const fLo = fc / Math.pow(2, oct);
    const fHi = fc * Math.pow(2, oct);
    let fEff = f;
    if (curveKind === "analog") {
      const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
      fEff = fc * r;
    }
    return additiveGraphButterworthMag(fEff, fHi, order, "lp")
      * additiveGraphButterworthMag(fEff, fLo, order, "hp");
  }

  if (m === "hp") {
    if (!(order > 0)) return 1;
    if (curveKind === "analog" && fc > 0 && f > 0) {
      const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
      // HP uses fc/f — rebuild from skewed ratio.
      const fEff = fc / Math.max(1e-12, r);
      return additiveGraphButterworthMag(fEff, fc, order, "hp");
    }
    return additiveGraphButterworthMag(f, fc, order, "hp");
  }

  // lp
  if (!(order > 0)) return 1;
  if (!(fc > 0)) return 0;
  if (curveKind === "analog" && f > 0) {
    const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
    return 1 / Math.sqrt(1 + Math.pow(Math.max(1e-12, r), 2 * order));
  }
  return additiveGraphButterworthMag(f, fc, order, "lp");
}

/** @deprecated normalized API — prefer additiveGraphFilterResponseGainHz */
function additiveGraphFilterResponseGain(x, mode, cutoffNorm, slopeDbOct, curveKind, skew) {
  // Interpret x/cutoffNorm as fractions of an arbitrary Nyquist=1 Hz for legacy callers.
  const f = additiveGraphClamp(x, 0, 1);
  const fc = additiveGraphClamp(cutoffNorm, 0, 1);
  return additiveGraphFilterResponseGainHz(f, mode, fc, slopeDbOct, curveKind, skew);
}

/** Sample N points on a linear 0…1 freq axis (legacy / tests). */
function additiveGraphFilterResponseCurve(mode, cutoffNorm, slopeDbOct, curveKind, skew, samples = 128) {
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = n <= 1 ? 0 : i / (n - 1);
    ys[i] = additiveGraphFilterResponseGain(x, mode, cutoffNorm, slopeDbOct, curveKind, skew);
  }
  return ys;
}

/**
 * Filter response on Additive Out’s log-Hz axis (overlay-compatible).
 * curveKind "rational" → Linear Filter (slope 0…1 + skew).
 * otherwise → Butterworth (slope in dB/oct + skew).
 * Returns { ys, axis, cutoffT }.
 */
function additiveGraphFilterResponseCurveLogHz(
  mode, cutoffHz, slope, curveKind, skew, sampleRate, samples = 128,
) {
  const axis = additiveGraphDisplayFreqAxis(sampleRate);
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  const rational = curveKind === "rational" || curveKind === "linear";
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const hz = axis.tToHz(t);
    ys[i] = rational
      ? additiveGraphFilterResponseGainRational(hz, mode, cutoffHz, slope, skew)
      : additiveGraphFilterResponseGainHz(hz, mode, cutoffHz, slope, "analog", skew);
  }
  return {
    ys,
    axis,
    cutoffT: axis.hzToT(Number(cutoffHz) || 0),
  };
}

/**
 * Resolve fundamental Hz for spectral filters (partialHz = ratio × fund).
 * Prefers graph.frequencyHz, else first downstream Additive Out Frequency, else 100.
 */
function additiveGraphResolveFundamentalHz({
  graph = null,
  nodes = null,
  connections = null,
  fromNodeId = "",
  readFrequency = null,
  fallback = 100,
} = {}) {
  const stamped = Number(graph?.frequencyHz);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;

  const fb = Number.isFinite(Number(fallback)) && Number(fallback) > 0 ? Number(fallback) : 100;
  if (!nodes || !connections || !fromNodeId) return fb;

  const queue = [String(fromNodeId)];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (let i = 0; i < connections.length; i += 1) {
      const c = connections[i];
      if (!c || String(c.sourceNode || "") !== id) continue;
      if (String(c.destinationPort || "") !== "Graph") continue;
      const dstId = String(c.destinationNode || "");
      if (!dstId || seen.has(dstId)) continue;
      const node = typeof nodes.get === "function" ? nodes.get(dstId) : nodes[dstId];
      if (!node) continue;
      if (String(node.type || "") === "additiveOut") {
        const hz = typeof readFrequency === "function"
          ? Number(readFrequency(node))
          : Number(node?.params?.frequency ?? node?.parameters?.frequency);
        return Number.isFinite(hz) && hz > 0 ? hz : fb;
      }
      queue.push(dstId);
    }
  }
  return fb;
}

/**
 * Apply slope filter in absolute Hz: partialHz = ratio[i] × fundHz vs cutoffHz.
 * Face/response use freq/Nyquist; slope is still 0…1 of the Nyquist span.
 */
/**
 * Rational-curve spectral filter (Linear Filter module).
 * Cutoff Hz (LP @ 0 → silence). Slope 0…1 = brickwall → gradual (octaves).
 * Skew = rationalCurve bend on the skirt (−1…+1).
 */
function additiveGraphFilterResponseGainRational(freqHz, mode, cutoffHz, slope01, skew) {
  const m = additiveGraphNormalizeFilterMode(mode);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const slope = additiveGraphClamp(slope01, 0, 1);
  const f = Math.max(0, Number(freqHz) || 0);
  const skewC = additiveGraphClamp(Number(skew) || 0, -0.9999, 0.9999);
  const shape = (t) => additiveGraphRationalCurve(additiveGraphClamp(t, 0, 1), skewC);
  // half-width in octaves around fc (slope 0 → brickwall / tiny).
  const halfOct = slope <= 1e-6 ? 0 : (0.05 + slope * 5);

  if (m === "lp") {
    if (!(fc > 0)) return 0;
    if (!(f > 0)) return 1;
    if (halfOct <= 0) return f <= fc ? 1 : 0;
    const oct = Math.log(f / fc) / Math.LN2;
    const t = additiveGraphClamp((oct + halfOct) / (2 * halfOct), 0, 1);
    return 1 - shape(t);
  }
  if (m === "hp") {
    if (!(fc > 0)) return 1;
    if (!(f > 0)) return 0;
    if (halfOct <= 0) return f >= fc ? 1 : 0;
    const oct = Math.log(f / fc) / Math.LN2;
    const t = additiveGraphClamp((oct + halfOct) / (2 * halfOct), 0, 1);
    return shape(t);
  }
  // bp — pass near fc; slope widens band + edges (mirrored rational skirts)
  if (!(fc > 0) || !(f > 0)) return 0;
  const passOct = halfOct <= 0 ? 0.02 : Math.max(0.02, halfOct * 0.35);
  const edgeOct = halfOct <= 0 ? 0.01 : Math.max(0.02, halfOct * 0.65);
  const a = Math.abs(Math.log(f / fc) / Math.LN2);
  if (a <= passOct) return 1;
  if (a >= passOct + edgeOct) return 0;
  return shape(1 - ((a - passOct) / edgeOct));
}

/** Apply Butterworth-ish spectral filter (dB/oct Slope). */
function additiveGraphApplyButterworthFilter(
  graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate,
) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const f0 = Math.max(0, Number(fundHz) || 0);
  const fc = Number(cutoffHz) || 0;
  const slope = Number(slopeDbOct);
  const slopeSafe = Number.isFinite(slope) ? slope : 12;
  for (let i = 0; i < H; i += 1) {
    const partialHz = Math.max(0, Number(graph.ratio[i]) || 0) * f0;
    graph.amplitude[i] *= additiveGraphFilterResponseGainHz(
      partialHz, mode, fc, slopeSafe, "analog", skew,
    );
  }
  return graph;
}

/** @deprecated alias — Additive “Analog Filter” renamed Butterworth Filter */
function additiveGraphApplyAnalogFilter(graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate) {
  return additiveGraphApplyButterworthFilter(
    graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate,
  );
}

/** Apply rational-curve spectral filter (Linear Filter module). */
function additiveGraphApplyLinearFilter(graph, mode, cutoffHz, slope01, skew, fundHz, sampleRate) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const f0 = Math.max(0, Number(fundHz) || 0);
  const fc = Number(cutoffHz) || 0;
  const slope = Number(slope01);
  const slopeSafe = Number.isFinite(slope) ? slope : 0.25;
  const sk = Number(skew) || 0;
  for (let i = 0; i < H; i += 1) {
    const partialHz = Math.max(0, Number(graph.ratio[i]) || 0) * f0;
    graph.amplitude[i] *= additiveGraphFilterResponseGainRational(
      partialHz, mode, fc, slopeSafe, sk,
    );
  }
  return graph;
}

/** @deprecated use applyButterworth / applyLinear */
function additiveGraphApplySlopeFilter(
  graph, mode, cutoffHz, slope, curveKind, skew, fundHz, sampleRate,
) {
  if (curveKind === "rational" || curveKind === "linear") {
    return additiveGraphApplyLinearFilter(
      graph, mode, cutoffHz, slope, skew, fundHz, sampleRate,
    );
  }
  return additiveGraphApplyButterworthFilter(
    graph, mode, cutoffHz, slope, skew, fundHz, sampleRate,
  );
}

/**
 * Growl — Hydrus SoEmAdditive Phase Skew (c/h Additive + SoEmAdditive.c):
 *   skewPhase[h] = rationalCurve(h / numHarmonics, curve) * skewAmount
 * Hydrus ranges: Phase Skew 0…1000, Curve −0.9999…+0.9999.
 * rotation = constant phase add (cycles) on every harmonic.
 * No upper clamp on skewAmount — param max owns the range.
 */
function additiveGraphApplyGrowl(graph, rotation, skew, skewCurve) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const rot = Number(rotation) || 0;
  const skewAmt = Number(skew);
  const amount = Number.isFinite(skewAmt) && skewAmt > 0 ? skewAmt : 0;
  const curve = additiveGraphClamp(Number(skewCurve) || 0, -0.9999, 0.9999);
  for (let i = 0; i < H; i += 1) {
    // Hydrus: h / numHarmonics with h in [0, H).
    const t = i / H;
    const skewPhase = amount <= 0 ? 0 : additiveGraphRationalCurve(t, curve) * amount;
    graph.phase[i] = additiveGraphWrap01(graph.phase[i] + rot + skewPhase);
  }
  return graph;
}

/**
 * Per-harmonic CheapWalk / noise states.
 * `seed` = module Seed; `salt` = family (freq/phase/pan/amp).
 * Changing Seed rebuilds all streams; growing H appends new harmonics only.
 */
function additiveGraphEnsureWalks(walks, H, salt = 13, seed = 1) {
  const s0 = (Math.floor(Number(seed)) || 0) >>> 0;
  const family = (Math.floor(Number(salt)) || 0) >>> 0;
  const need = Math.max(0, Math.floor(Number(H)) || 0);
  if (!Array.isArray(walks) || walks.__seed !== s0 || walks.__salt !== family) {
    walks = [];
    walks.__seed = s0;
    walks.__salt = family;
  }
  while (walks.length < need) {
    const i = walks.length;
    const mixed = (
      Math.imul(s0 ^ 0x9e3779b9, family + 0x85ebca6b)
      + Math.imul(i + 1, 0xc2b2ae35)
    ) >>> 0;
    walks.push(cheapWalkCreate(mixed || (i + 1)));
  }
  if (walks.length > need) {
    walks.length = need;
  }
  return walks;
}

/**
 * NoisyFreq — additive jitter on harmonic ratio (hz' = (ratio+Δ)×f0).
 * `add` = max |Δ| from bipolar noise (DOMAIN, not 0…1). No hidden ×0.5.
 * noiseMode: 0 CheapWalk / 1 CheapFilteredNoise — quantum + ratioLerp at Out.
 *            2 WhiteNoise — ratioNoise per-sample add at Out (Speed ignored).
 */
function additiveGraphApplyNoisyFreq(
  graph, add, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const amt = Number(add);
  const depth = Number.isFinite(amt) && amt > 0 ? amt : 0;
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 13, seed);

  // WhiteNoise: audio-rate ratio add at Additive Out.
  if (mode === 2) {
    graph.ratioNoise = {
      mode: 2,
      amount: depth,
      speedHz: 0,
      walks,
      seed: (Math.floor(Number(seed)) || 0) >>> 0,
    };
    graph.ratioLerp = null;
    return { graph, walks, lerpFrom };
  }

  // CheapWalk / CheapFilteredNoise: new target this quantum; Out lerps from→to.
  graph.ratioNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = Math.max(0, graph.ratio[i] + w * depth);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to); // first quantum: no step-in
  }
  graph.ratioLerp = { from, to };
  graph.ratio.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

/** Effective harmonic ratio at block position (linear from→to when ratioLerp set). */
function additiveGraphEffectiveRatio(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.ratioLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t;
  }
  return Number(graph?.ratio?.[i]) || 0;
}

/** @deprecated use additiveGraphApplyNoisyFreq */
function additiveGraphApplyNoisy(
  graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode, lerpFrom, seed,
) {
  return additiveGraphApplyNoisyFreq(
    graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode, lerpFrom, seed,
  );
}

/** Shortest-path lerp on unit circle [0,1). */
function additiveGraphLerpPhase01(from, to, t) {
  let d = (Number(to) || 0) - (Number(from) || 0);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return additiveGraphWrap01((Number(from) || 0) + d * t);
}

/** Shared: stamp WhiteNoise recipe; clear matching lerp. */
function additiveGraphStampWhiteNoise(graph, key, amount, walks, seed = 1) {
  graph[key] = {
    mode: 2,
    amount: additiveGraphClamp(amount, 0, 1),
    speedHz: 0,
    walks,
    seed: (Math.floor(Number(seed)) || 0) >>> 0,
  };
}

/**
 * NoisyPhase — phase jitter (cycles).
 * 0/1 quantum + phaseLerp; 2 WhiteNoise → phaseNoise at Out.
 */
function additiveGraphApplyNoisyPhase(
  graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 29, seed);
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "phaseNoise", amt, walks, seed);
    graph.phaseLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.phaseNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = additiveGraphWrap01(graph.phase[i] + w * amt * 0.5);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.phaseLerp = { from, to };
  graph.phase.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

function additiveGraphEffectivePhase(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.phaseLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return additiveGraphLerpPhase01(lerp.from[i], lerp.to[i], t);
  }
  return additiveGraphWrap01(Number(graph?.phase?.[i]) || 0);
}

/**
 * NoisyPan — pan jitter (−1…+1).
 * 0/1 quantum + panLerp; 2 WhiteNoise → panNoise at Out.
 */
function additiveGraphApplyNoisyPan(
  graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  if (!graph.pan || graph.pan.length !== H) {
    graph.pan = new Float32Array(H);
  }
  const amt = additiveGraphClamp(amount, 0, 1);
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 47, seed);
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "panNoise", amt, walks, seed);
    graph.panLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.panNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    const p = Number(graph.pan[i]) || 0;
    to[i] = additiveGraphClamp(p + w * amt, -1, 1);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.panLerp = { from, to };
  graph.pan.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

/** Effective pan at block position (linear from→to when panLerp set). */
function additiveGraphEffectivePan(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.panLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return additiveGraphClamp(lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t, -1, 1);
  }
  if (graph?.pan && i >= 0 && i < graph.pan.length) {
    return additiveGraphClamp(Number(graph.pan[i]) || 0, -1, 1);
  }
  return 0;
}

/**
 * NoisyAmp — amplitude jitter (0…1).
 * 0/1 quantum + ampLerp; 2 WhiteNoise → ampNoise at Out.
 */
function additiveGraphApplyNoisyAmp(
  graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 61, seed);
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "ampNoise", amt, walks, seed);
    graph.ampLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.ampNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = additiveGraphClamp(graph.amplitude[i] + w * amt * 0.5, 0, 1);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.ampLerp = { from, to };
  graph.amplitude.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

function additiveGraphEffectiveAmp(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.ampLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return additiveGraphClamp(lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t, 0, 1);
  }
  return additiveGraphClamp(Number(graph?.amplitude?.[i]) || 0, 0, 1);
}

/** Legacy combined Additive Effect dispatcher (retired module / tests). */
function additiveGraphApplyEffect(graph, mode, parA, parB, parC, parD, effectState) {
  const out = additiveGraphClonePayload(graph);
  if (!out) return { graph: null, state: effectState };
  const state = effectState || {};
  const m = String(mode || "LinearFilter");
  const filterMode = additiveGraphNormalizeFilterMode(parC);
  if (m === "LinearFilter" || m === "0") {
    // Legacy: parA=slope 0…1, parB=cutoffHz, parD→skew; fund/sr defaulted.
    const skew = (Number(parD) || 0) * 2 - 1;
    additiveGraphApplyLinearFilter(out, filterMode, parB, parA, skew, 100, 44100);
  } else if (m === "AnalogFilter" || m === "ButterworthFilter" || m === "1") {
    const skew = (Number(parD) || 0) * 2 - 1;
    additiveGraphApplyButterworthFilter(out, filterMode, parB, parA, skew, 100, 44100);
  } else if (m === "Growl" || m === "2") {
    // parA=rotation, parB=skew amount, parC=skewCurve 0…1 → −1…+1
    const curve = (Number(parC) || 0) * 2 - 1;
    additiveGraphApplyGrowl(out, parA, parB, curve);
  } else if (m === "Noisy" || m === "NoisyFreq" || m === "3") {
    const noisy = additiveGraphApplyNoisyFreq(out, parA, parB, state.walks);
    state.walks = noisy.walks;
  }
  return { graph: out, state };
}

/** Linear pan −1…+1 → { left, right } gains (sum = 1). */
function additiveGraphPanGains(pan) {
  const p = additiveGraphClamp(Number(pan) || 0, -1, 1);
  return {
    left: 0.5 * (1 - p),
    right: 0.5 * (1 + p),
  };
}

/**
 * Phase → RGBA stops: 0 red, 0.25 orange, 0.5 blue, 0.75 pink, 1 red.
 */
function additiveGraphPhaseColor(phase01) {
  const t = additiveGraphWrap01(phase01);
  const stops = [
    { t: 0, r: 255, g: 40, b: 40 },
    { t: 0.25, r: 255, g: 140, b: 40 },
    { t: 0.5, r: 60, g: 100, b: 255 },
    { t: 0.75, r: 255, g: 105, b: 180 },
    { t: 1, r: 255, g: 40, b: 40 },
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1].t) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

/**
 * Instantaneous Nyquist / speed-limit amp curve (not smoothed over time):
 *   hz < 0.75·Nyquist → 1
 *   0.75·Nyquist … Nyquist → linear 1→0
 *   hz ≥ Nyquist → 0
 * Phase still advances above Nyquist so harmonics stay coherent if they return.
 */
function additiveGraphNyquistAmpGain(hz, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = 0.5 * sr;
  const f = Math.abs(Number(hz) || 0);
  if (!(nyquist > 0) || !(f >= 0)) return 0;
  if (f >= nyquist) return 0;
  const rampStart = 0.75 * nyquist;
  if (f <= rampStart) return 1;
  return 1 - (f - rampStart) / Math.max(1e-12, nyquist - rampStart);
}

/** One WhiteNoise sample for a stamped *Noise recipe (walks by ref). */
function additiveGraphWhiteNoiseSample(recipe, harmonicIndex, salt = 13) {
  if (!recipe || !(Number(recipe.amount) > 0)) return 0;
  if (additiveGraphNormalizeNoisyNoiseMode(recipe.mode) !== 2) return 0;
  const H = Math.max(1, harmonicIndex + 1);
  const walks = additiveGraphEnsureWalks(recipe.walks, H, salt, recipe.seed ?? 1);
  recipe.walks = walks;
  const i = Math.max(0, harmonicIndex | 0);
  return cheapWhiteNoiseStep(walks[i]);
}

/**
 * WhiteNoise ratio addend (Out): bipolar × Add depth each sample.
 * Effective ratio = max(0, baseRatio + addend). Frequency add via ×f0.
 */
function additiveGraphRatioNoiseAddend(graph, harmonicIndex) {
  const rn = graph?.ratioNoise;
  if (!rn) return 0;
  const amt = Number(rn.amount);
  if (!(amt > 0)) return 0;
  const w = additiveGraphWhiteNoiseSample(rn, harmonicIndex, 13);
  return w * amt;
}

// Half-cycle sine LUT (0…π), 2^15 samples + 1 for lerp. Second half = −reverse.
const ADDITIVE_SIN_LUT_HALF = 32768; // 2^15
let additiveGraphSinLut = null;

function additiveGraphEnsureSinLut() {
  if (additiveGraphSinLut && additiveGraphSinLut.length === ADDITIVE_SIN_LUT_HALF + 1) {
    return additiveGraphSinLut;
  }
  const n = ADDITIVE_SIN_LUT_HALF;
  const lut = new Float32Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    lut[i] = Math.sin(Math.PI * (i / n));
  }
  additiveGraphSinLut = lut;
  return lut;
}

/** phase01 in turns [0,1). Linear-interpolated half-sine wavetable. */
function additiveGraphSinTurn(phase01) {
  const lut = additiveGraphEnsureSinLut();
  const n = ADDITIVE_SIN_LUT_HALF;
  let p = Number(phase01) || 0;
  p -= Math.floor(p);
  if (p < 0) p += 1;
  if (p < 0.5) {
    const x = p * 2 * n;
    const i = x | 0;
    const f = x - i;
    const a = lut[i];
    const b = lut[i + 1 < lut.length ? i + 1 : i];
    return a + (b - a) * f;
  }
  const x = (p - 0.5) * 2 * n;
  const i = x | 0;
  const f = x - i;
  const a = lut[i];
  const b = lut[i + 1 < lut.length ? i + 1 : i];
  return -(a + (b - a) * f);
}

/** Optimize: 0 None, 1 Inaudible Harmonics (skip amp≤0 or hz≥Nyquist entirely). */
function additiveGraphNormalizeOptimizeMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1) return 1;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "inaudible" || s === "inaudibleharmonics" || s === "inaudible harmonics") {
    return 1;
  }
  return 0;
}

/**
 * Sum one sample. Mono = unpanned sum; Left/Right use pan (−1…+1).
 * *Lerp fields: linear from→to across the block. *Noise: WhiteNoise per sample.
 * optimizeMode 1: skip inaudible partials (amp≤0 or hz≥Nyquist) — no phase advance.
 */
function additiveGraphSumSample(
  graph, phaseAcc, frequencyHz, masterPhase, masterAmp, sampleRate,
  blockFrame = 0, blockFrames = 1, optimizeMode = 0,
) {
  if (!graph || !graph.harmonics) {
    return { y: 0, left: 0, right: 0, mono: 0, phaseAcc };
  }
  const H = graph.harmonics;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = sr * 0.5;
  const f0 = Number(frequencyHz) || 0;
  const mp = Number(masterPhase) || 0;
  const ma = additiveGraphClamp(masterAmp, 0, 1);
  if (!phaseAcc || phaseAcc.length !== H) {
    phaseAcc = new Float64Array(H);
  }
  const skipInaudible = additiveGraphNormalizeOptimizeMode(optimizeMode) === 1;
  const hasPan = Boolean(graph.pan && graph.pan.length === H)
    || Boolean(graph.panLerp)
    || Boolean(graph.panNoise);
  const hasRatioNoise = Boolean(graph.ratioNoise && Number(graph.ratioNoise.amount) > 0);
  const hasPhaseNoise = Boolean(graph.phaseNoise && Number(graph.phaseNoise.amount) > 0);
  const hasPanNoise = Boolean(graph.panNoise && Number(graph.panNoise.amount) > 0);
  const hasAmpNoise = Boolean(graph.ampNoise && Number(graph.ampNoise.amount) > 0);
  let mono = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < H; i += 1) {
    let partialAmp = additiveGraphEffectiveAmp(graph, i, blockFrame, blockFrames);
    if (hasAmpNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.ampNoise, i, 61);
      const amt = additiveGraphClamp(graph.ampNoise.amount, 0, 1);
      partialAmp = additiveGraphClamp(partialAmp + w * amt * 0.5, 0, 1);
    }
    if (skipInaudible && !(partialAmp > 0)) continue;

    let baseRatio = additiveGraphEffectiveRatio(graph, i, blockFrame, blockFrames);
    if (hasRatioNoise) {
      baseRatio = Math.max(0, baseRatio + additiveGraphRatioNoiseAddend(graph, i));
    }
    const hz = baseRatio * f0;
    if (skipInaudible && hz >= nyquist) continue;

    const inc = hz / sr;
    // None: always advance phase (coherent if partial returns from above Nyquist).
    // Inaudible: skipped partials above don't advance (CPU); may click if pitch drops.
    phaseAcc[i] = additiveGraphWrap01(phaseAcc[i] + inc);
    const gain = additiveGraphNyquistAmpGain(hz, sr);
    if (gain <= 0) continue;

    let partialPhase = additiveGraphEffectivePhase(graph, i, blockFrame, blockFrames);
    if (hasPhaseNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.phaseNoise, i, 29);
      const amt = additiveGraphClamp(graph.phaseNoise.amount, 0, 1);
      partialPhase = additiveGraphWrap01(partialPhase + w * amt * 0.5);
    }

    const p = additiveGraphWrap01(phaseAcc[i] + partialPhase + mp);
    const s = additiveGraphSinTurn(p) * partialAmp * ma * gain;
    mono += s;

    let pan = hasPan ? additiveGraphEffectivePan(graph, i, blockFrame, blockFrames) : 0;
    if (hasPanNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.panNoise, i, 47);
      const amt = additiveGraphClamp(graph.panNoise.amount, 0, 1);
      pan = additiveGraphClamp(pan + w * amt, -1, 1);
    }
    const gains = additiveGraphPanGains(pan);
    left += s * gains.left;
    right += s * gains.right;
  }
  return { y: mono, mono, left, right, phaseAcc };
}
