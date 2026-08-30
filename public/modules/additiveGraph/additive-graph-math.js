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

// --- CheapWalk: once-per-quantum reflecting walk (cheaper than Hypersaw/sample walk) ---

function cheapWalkCreate(seed = 1) {
  return { x: 0, seed: (seed >>> 0) || 1 };
}

/**
 * One CheapWalk tick. speed01 is dimensionless (Cheap Walk audio uses rate/sr).
 * No upper clamp — callers / params own the range. 0 → frozen (x unchanged).
 */
function cheapWalkStep(state, speed01) {
  let s = state.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  state.seed = s;
  const bipolar = (s / 4294967295) * 2 - 1;
  const rate = Number(speed01);
  const step = (Number.isFinite(rate) && rate > 0 ? rate : 0) * 0.35;
  let x = state.x + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  state.x = x;
  return x;
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

function additiveGraphNormalizeFilterMode(mode) {
  const m = String(mode ?? "lp").toLowerCase();
  if (m === "1" || m === "hp" || m === "highpass" || m === "high") return "hp";
  if (m === "2" || m === "bp" || m === "bandpass" || m === "band") return "bp";
  return "lp";
}

/**
 * Amplitude gain 0…1 at normalized harmonic index x ∈ [0,1].
 * slope 0 → brickwall at cutoff; slope 1 → widest transition (±0.5).
 * curveKind "linear" = straight ramp; "analog" = rational curve (skew −1…+1).
 * Port of old AdditiveFilter (LP/HP) + Bandpass.
 */
function additiveGraphFilterResponseGain(x, mode, cutoff01, slope01, curveKind, skew) {
  const cut = additiveGraphClamp(cutoff01, 0, 1);
  const slope = additiveGraphClamp(slope01, 0, 1);
  const half = Math.max(1e-6, slope * 0.5);
  const skewClamped = additiveGraphClamp(Number(skew) || 0, -0.9999, 0.9999);
  const shape = (t) => {
    const u = additiveGraphClamp(t, 0, 1);
    if (curveKind === "analog") return additiveGraphRationalCurve(u, skewClamped);
    return u;
  };
  const m = additiveGraphNormalizeFilterMode(mode);
  const xx = additiveGraphClamp(x, 0, 1);

  if (m === "bp") {
    const lo = cut - half;
    const hi = cut + half;
    const edge = Math.max(1e-6, half * 0.5);
    if (xx < lo - edge || xx > hi + edge) return 0;
    if (xx >= lo && xx <= hi) return 1;
    if (xx < lo) return shape((xx - (lo - edge)) / edge);
    return 1 - shape((xx - hi) / edge);
  }

  const x1 = cut - half;
  const x2 = cut + half;
  if (m === "hp") {
    if (xx <= x1) return 0;
    if (xx >= x2) return 1;
    return shape((xx - x1) / Math.max(1e-9, x2 - x1));
  }
  // lp
  if (xx <= x1) return 1;
  if (xx >= x2) return 0;
  return 1 - shape((xx - x1) / Math.max(1e-9, x2 - x1));
}

/** Sample N points of the filter response for the face (x 0…1 → gain 0…1). */
function additiveGraphFilterResponseCurve(mode, cutoff01, slope01, curveKind, skew, samples = 128) {
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = n <= 1 ? 0 : i / (n - 1);
    ys[i] = additiveGraphFilterResponseGain(x, mode, cutoff01, slope01, curveKind, skew);
  }
  return ys;
}

function additiveGraphApplySlopeFilter(graph, mode, cutoff01, slope01, curveKind, skew) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  for (let i = 0; i < H; i += 1) {
    const x = H <= 1 ? 0 : i / (H - 1);
    graph.amplitude[i] *= additiveGraphFilterResponseGain(
      x, mode, cutoff01, slope01, curveKind, skew,
    );
  }
  return graph;
}

function additiveGraphApplyLinearFilter(graph, mode, cutoff01, slope01) {
  return additiveGraphApplySlopeFilter(graph, mode, cutoff01, slope01, "linear", 0);
}

function additiveGraphApplyAnalogFilter(graph, mode, cutoff01, slope01, skew) {
  return additiveGraphApplySlopeFilter(graph, mode, cutoff01, slope01, "analog", skew);
}

/**
 * Growl — old SoEmAdditive PhaseRotation + PhaseSkew + PhaseSkewCurve.
 * rotation: constant phase add (cycles).
 * skew: ramp step per harmonic (0…1); 0 = rotation only.
 * skewCurve: RationalS shape (−1…+1).
 */
function additiveGraphApplyGrowl(graph, rotation, skew, skewCurve) {
  const H = graph.harmonics;
  const rot = Number(rotation) || 0;
  const skewAmt = additiveGraphClamp(skew, 0, 1);
  const curve = additiveGraphClamp(Number(skewCurve) || 0, -0.9999, 0.9999);
  // Old C scaled RationalS by ~300 (phase units). Yellow Graph phase is cycles —
  // keep a few cycles of warp at full skew so the face/audio stay musical.
  const scale = 2;
  let skewRamp = 0;
  for (let i = 0; i < H; i += 1) {
    const skewPhase = skewAmt <= 0
      ? 0
      : additiveGraphRationalCurve(additiveGraphWrap01(1 - skewRamp), curve) * skewAmt * scale;
    graph.phase[i] = additiveGraphWrap01(graph.phase[i] + rot + skewPhase);
    skewRamp = additiveGraphWrap01(skewRamp + skewAmt);
  }
  return graph;
}

function additiveGraphEnsureWalks(walks, H, salt = 13) {
  if (!Array.isArray(walks)) walks = [];
  while (walks.length < H) walks.push(cheapWalkCreate(walks.length * 97 + salt));
  return walks;
}

/** NoisyFreq — CheapWalk jitter on harmonic ratios. speed = Hz. */
function additiveGraphApplyNoisyFreq(graph, amount, speedHz, walks, sampleRate, blockFrames) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  walks = additiveGraphEnsureWalks(walks, H, 13);
  for (let i = 0; i < H; i += 1) {
    const w = cheapWalkStep(walks[i], spd);
    graph.ratio[i] = Math.max(0, graph.ratio[i] + w * amt * 0.5);
  }
  return { graph, walks };
}

/** @deprecated use additiveGraphApplyNoisyFreq */
function additiveGraphApplyNoisy(graph, amount, speedHz, walks, sampleRate, blockFrames) {
  return additiveGraphApplyNoisyFreq(graph, amount, speedHz, walks, sampleRate, blockFrames);
}

/** NoisyPhase — CheapWalk jitter on harmonic phase (cycles). speed = Hz. */
function additiveGraphApplyNoisyPhase(graph, amount, speedHz, walks, sampleRate, blockFrames) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  walks = additiveGraphEnsureWalks(walks, H, 29);
  for (let i = 0; i < H; i += 1) {
    const w = cheapWalkStep(walks[i], spd);
    graph.phase[i] = additiveGraphWrap01(graph.phase[i] + w * amt * 0.5);
  }
  return { graph, walks };
}

/** NoisyPan — CheapWalk jitter on bipolar pan (−1…+1). speed = Hz. */
function additiveGraphApplyNoisyPan(graph, amount, speedHz, walks, sampleRate, blockFrames) {
  const H = graph.harmonics;
  if (!graph.pan || graph.pan.length !== H) {
    graph.pan = new Float32Array(H);
  }
  const amt = additiveGraphClamp(amount, 0, 1);
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  walks = additiveGraphEnsureWalks(walks, H, 47);
  for (let i = 0; i < H; i += 1) {
    const w = cheapWalkStep(walks[i], spd);
    const p = Number(graph.pan[i]) || 0;
    graph.pan[i] = additiveGraphClamp(p + w * amt, -1, 1);
  }
  return { graph, walks };
}

/** NoisyAmp — CheapWalk jitter on amplitude, clamped 0…1. speed = Hz. */
function additiveGraphApplyNoisyAmp(graph, amount, speedHz, walks, sampleRate, blockFrames) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  walks = additiveGraphEnsureWalks(walks, H, 61);
  for (let i = 0; i < H; i += 1) {
    const w = cheapWalkStep(walks[i], spd);
    graph.amplitude[i] = additiveGraphClamp(graph.amplitude[i] + w * amt * 0.5, 0, 1);
  }
  return { graph, walks };
}

/** Legacy combined Additive Effect dispatcher (retired module / tests). */
function additiveGraphApplyEffect(graph, mode, parA, parB, parC, parD, effectState) {
  const out = additiveGraphClonePayload(graph);
  if (!out) return { graph: null, state: effectState };
  const state = effectState || {};
  const m = String(mode || "LinearFilter");
  const filterMode = additiveGraphNormalizeFilterMode(parC);
  if (m === "LinearFilter" || m === "0") {
    // parA=slope, parB=cutoff (was span/cutoff; swapped to match new module labels).
    additiveGraphApplyLinearFilter(out, filterMode, parB, parA);
  } else if (m === "AnalogFilter" || m === "1") {
    const skew = (Number(parD) || 0) * 2 - 1;
    additiveGraphApplyAnalogFilter(out, filterMode, parB, parA, skew);
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

/**
 * Sum one sample. Mono = unpanned sum; Left/Right use graph.pan[] (−1…+1).
 * Missing pan → center (equal L/R).
 */
function additiveGraphSumSample(graph, phaseAcc, frequencyHz, masterPhase, masterAmp, sampleRate) {
  if (!graph || !graph.harmonics) {
    return { y: 0, left: 0, right: 0, mono: 0, phaseAcc };
  }
  const H = graph.harmonics;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f0 = Number(frequencyHz) || 0;
  const mp = Number(masterPhase) || 0;
  const ma = additiveGraphClamp(masterAmp, 0, 1);
  if (!phaseAcc || phaseAcc.length !== H) {
    phaseAcc = new Float64Array(H);
  }
  const hasPan = graph.pan && graph.pan.length === H;
  let mono = 0;
  let left = 0;
  let right = 0;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < H; i += 1) {
    const hz = graph.ratio[i] * f0;
    const inc = hz / sr;
    // Always advance phase (even when muted above Nyquist).
    phaseAcc[i] = additiveGraphWrap01(phaseAcc[i] + inc);
    const gain = additiveGraphNyquistAmpGain(hz, sr);
    if (gain <= 0) continue;
    const p = additiveGraphWrap01(phaseAcc[i] + graph.phase[i] + mp);
    const s = Math.sin(twoPi * p) * graph.amplitude[i] * ma * gain;
    mono += s;
    const gains = additiveGraphPanGains(hasPan ? graph.pan[i] : 0);
    left += s * gains.left;
    right += s * gains.right;
  }
  return { y: mono, mono, left, right, phaseAcc };
}
