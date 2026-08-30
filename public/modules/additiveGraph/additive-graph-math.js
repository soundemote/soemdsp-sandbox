// Shared Magenta Graph payload + additive partial tables + Effect modes.
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
  const H = Math.max(1, Math.min(ADDITIVE_GRAPH_MAX_H, Math.round(Number(harmonics) || 1)));
  return {
    harmonics: H,
    ratio: new Float32Array(H),
    phase: new Float32Array(H),
    amplitude: new Float32Array(H),
  };
}

function additiveGraphClonePayload(src) {
  if (!src || !src.ratio) return null;
  const H = src.ratio.length | 0;
  const out = additiveGraphCreatePayload(H);
  out.ratio.set(src.ratio);
  out.phase.set(src.phase);
  out.amplitude.set(src.amplitude);
  return out;
}

/** Build Generator Graph: relative ratios + waveform amps/phases. */
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
  }
  return graph;
}

// --- CheapWalk: once-per-quantum reflecting walk (cheaper than Hypersaw/sample walk) ---

function cheapWalkCreate(seed = 1) {
  return { x: 0, seed: (seed >>> 0) || 1 };
}

function cheapWalkStep(state, speed01) {
  let s = state.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  state.seed = s;
  const bipolar = (s / 4294967295) * 2 - 1;
  const step = additiveGraphClamp(speed01, 0, 1) * 0.35;
  let x = state.x + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  state.x = x;
  return x;
}

// --- Effect modes ---

function additiveGraphApplyLinearFilter(graph, slopeSpan, cutoff01) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const span = additiveGraphClamp(slopeSpan, 0, 1);
  const cut = additiveGraphClamp(cutoff01, 0, 1);
  // ParB: end of slope sits at cut * (H-1). ParA: how wide the ramp is before that end.
  const endIdx = cut * (H - 1);
  const startIdx = endIdx - span * (H - 1);
  for (let i = 0; i < H; i += 1) {
    let g = 1;
    if (i >= endIdx) g = 0;
    else if (i > startIdx) {
      const t = (i - startIdx) / Math.max(1e-9, endIdx - startIdx);
      g = 1 - t;
    }
    graph.amplitude[i] *= g;
  }
  return graph;
}

function additiveGraphApplyAnalogFilter(graph, cutoffRatio, slopeDbOct) {
  const H = graph.harmonics;
  const cut = Math.max(1e-6, Number(cutoffRatio) || 1);
  // ParB 0..1 → 1..48 dB/oct
  const dbOct = 1 + additiveGraphClamp(slopeDbOct, 0, 1) * 47;
  for (let i = 0; i < H; i += 1) {
    const r = Math.max(1e-9, graph.ratio[i]);
    if (r <= cut) continue;
    const octaves = Math.log(r / cut) / Math.LN2;
    const gainDb = -dbOct * octaves;
    graph.amplitude[i] *= Math.pow(10, gainDb / 20);
  }
  return graph;
}

function additiveGraphApplyGrowl(graph, amount, curve) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  // Map amount into a musically useful skew (old C used large scales).
  const scale = amt * amt * 2;
  for (let i = 0; i < H; i += 1) {
    const t = H <= 1 ? 0 : i / (H - 1);
    graph.phase[i] = additiveGraphWrap01(graph.phase[i] + additiveGraphRationalCurve(t, curve) * scale);
  }
  return graph;
}

function additiveGraphApplyNoisy(graph, amount, speed, walks) {
  const H = graph.harmonics;
  const amt = additiveGraphClamp(amount, 0, 1);
  const spd = additiveGraphClamp(speed, 0, 1);
  if (!Array.isArray(walks)) walks = [];
  while (walks.length < H) walks.push(cheapWalkCreate(walks.length * 97 + 13));
  for (let i = 0; i < H; i += 1) {
    const w = cheapWalkStep(walks[i], spd);
    graph.ratio[i] = Math.max(0.01, graph.ratio[i] + w * amt * 0.5);
  }
  return { graph, walks };
}

function additiveGraphApplyEffect(graph, mode, parA, parB, parC, parD, effectState) {
  const out = additiveGraphClonePayload(graph);
  if (!out) return { graph: null, state: effectState };
  const state = effectState || {};
  const m = String(mode || "LinearFilter");
  if (m === "LinearFilter" || m === "0") {
    additiveGraphApplyLinearFilter(out, parA, parB);
  } else if (m === "AnalogFilter" || m === "1") {
    // ParA = cutoff in harmonic-ratio units (1 = fundamental).
    const cutoffRatio = 1 + additiveGraphClamp(parA, 0, 1) * Math.max(1, out.harmonics - 1);
    additiveGraphApplyAnalogFilter(out, cutoffRatio, parB);
  } else if (m === "Growl" || m === "2") {
    additiveGraphApplyGrowl(out, parA, (Number(parB) || 0) * 2 - 1);
  } else if (m === "Noisy" || m === "3") {
    const noisy = additiveGraphApplyNoisy(out, parA, parB, state.walks);
    state.walks = noisy.walks;
  }
  return { graph: out, state };
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

function additiveGraphSumSample(graph, phaseAcc, frequencyHz, masterPhase, masterAmp, sampleRate) {
  if (!graph || !graph.harmonics) return { y: 0, phaseAcc };
  const H = graph.harmonics;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f0 = Number(frequencyHz) || 0;
  const mp = Number(masterPhase) || 0;
  const ma = additiveGraphClamp(masterAmp, 0, 1);
  if (!phaseAcc || phaseAcc.length !== H) {
    phaseAcc = new Float64Array(H);
  }
  let y = 0;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < H; i += 1) {
    const hz = graph.ratio[i] * f0;
    const inc = hz / sr;
    // Always advance phase (even when muted above Nyquist).
    phaseAcc[i] = additiveGraphWrap01(phaseAcc[i] + inc);
    const gain = additiveGraphNyquistAmpGain(hz, sr);
    if (gain <= 0) continue;
    const p = additiveGraphWrap01(phaseAcc[i] + graph.phase[i] + mp);
    y += Math.sin(twoPi * p) * graph.amplitude[i] * ma * gain;
  }
  return { y, phaseAcc };
}
