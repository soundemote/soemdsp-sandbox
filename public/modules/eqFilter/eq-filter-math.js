// EQ Filter — pure math (main thread + AudioWorklet).
//
// Zero-delay feedback (ZDF) state-variable filter (SVF) with trapezoidal
// integrators — the full RBJ-style mode set in one cheap min-phase stage.
//
// Direct port of the setup + process math from Robin Schmidt's
// rapt::rsStateVariableFilter (RS-MET). Zero added latency; suitable for
// the sandbox live graph.
//
// Credit: Robin Schmidt / RS-MET
// https://github.com/RobinSchmidt/RS-MET
// Notes: https://github.com/RobinSchmidt/RS-MET/blob/work/Notes/StateVariableFilter.txt

// 2-pole ZDF SVF → 12 dB/oct LP/HP (and matching 2-pole BP/BR/AP/shelves).
// Compact pole labels, no spaces (HP12 not "HP 12").
const nodeGraphEqFilterModes = Object.freeze([
  "Bypass",
  "HP12",
  "LP12",
  "BP12 Skirt",
  "BP12 Peak",
  "BR12",
  "AP12",
  "Peak",
  "LS12",
  "HS12",
]);

function createNodeGraphEqFilterState() {
  return {
    // Integrator states (Robin: z1, z2)
    z1: 0,
    z2: 0,
    // Cached setup signature so we only recompute coeffs on change
    lastMode: -1,
    lastOmega: NaN,
    lastQ: NaN,
    lastA: NaN,
    // Coeffs
    g: 0,
    c: 0,
    s: 1,
    aL: 0,
    aB: 0,
    aH: 1,
  };
}

function createNodeGraphStereoEqFilterState() {
  return {
    left: createNodeGraphEqFilterState(),
    mono: createNodeGraphEqFilterState(),
    right: createNodeGraphEqFilterState(),
  };
}

function nodeGraphEqFilterClamp(value, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function nodeGraphEqFilterSetupMuted(state) {
  state.g = 0;
  state.c = 0;
  state.s = 0;
  state.aL = 0;
  state.aB = 0;
  state.aH = 0;
}

function nodeGraphEqFilterSetupBypass(state) {
  state.g = 0;
  state.c = 0;
  state.s = 1;
  state.aL = 0;
  state.aB = 0;
  state.aH = 1;
}

function nodeGraphEqFilterSetupCore(state, omega, r, aL, aB, aH, gScale) {
  // 0 Hz is valid (ω=0 → g=tan(0)=0). Only clamp the Nyquist-side pole so tan stays finite.
  // Do not floor ω with 1e-9: that makes 0 and ~0 different and can desync UI from DSP.
  const rawW = Number(omega);
  const w = Number.isFinite(rawW)
    ? Math.max(0, Math.min(Math.PI * 0.999, rawW))
    : 0;
  const safeR = Math.max(1e-9, Number(r) || 1e-9);
  const g = Math.tan(0.5 * w) * (Number(gScale) || 1);
  const c = g + safeR;
  const denom = 1 + g * c;
  state.g = g;
  state.c = c;
  state.s = denom !== 0 ? 1 / denom : 0;
  state.aL = aL;
  state.aB = aB;
  state.aH = aH;
}

/**
 * Configure SVF coeffs for the given mode.
 * omega = 2*pi*f/fs, Q > 0, A = linear shelf/bell gain (10^(dB/40) for shelves/bells per RBJ/Robin).
 */
function nodeGraphEqFilterSetup(state, mode, omega, q, linearA) {
  const safeMode = Math.round(nodeGraphEqFilterClamp(mode, 0, 9));
  const Q = Math.max(1e-4, Number(q) || 0.707);
  const A = Math.max(1e-6, Number(linearA) || 1);

  if (safeMode === 0) {
    nodeGraphEqFilterSetupBypass(state);
    return;
  }
  if (safeMode === 1) {
    // HP (first after Bypass in the mode list)
    nodeGraphEqFilterSetupCore(state, omega, 1 / Q, 0, 0, 1, 1);
    return;
  }
  if (safeMode === 2) {
    // LP: H(s) = 1 / (s^2 + s/Q + 1)
    nodeGraphEqFilterSetupCore(state, omega, 1 / Q, 1, 0, 0, 1);
    return;
  }
  if (safeMode === 3) {
    // BP skirt (peak gain = Q)
    nodeGraphEqFilterSetupCore(state, omega, 1 / Q, 0, 1, 0, 1);
    return;
  }
  if (safeMode === 4) {
    // BP peak (0 dB peak)
    const r = 1 / Q;
    nodeGraphEqFilterSetupCore(state, omega, r, 0, r, 0, 1);
    return;
  }
  if (safeMode === 5) {
    // Bandreject / notch
    nodeGraphEqFilterSetupCore(state, omega, 1 / Q, 1, 0, 1, 1);
    return;
  }
  if (safeMode === 6) {
    // Allpass
    const r = 1 / Q;
    nodeGraphEqFilterSetupCore(state, omega, r, 1, -r, 1, 1);
    return;
  }
  if (safeMode === 7) {
    // Bell: H(s) = (s^2 + s*(A/Q) + 1) / (s^2 + s/(A*Q) + 1)
    const r = 1 / (Q * A);
    nodeGraphEqFilterSetupCore(state, omega, r, 1, A * A * r, 1, 1);
    return;
  }
  if (safeMode === 8) {
    // Low shelf
    const r = 1 / Q;
    const gScale = 1 / Math.sqrt(A);
    nodeGraphEqFilterSetupCore(state, omega, r, A * A, A * r, 1, gScale);
    return;
  }
  if (safeMode === 9) {
    // High shelf
    const r = 1 / Q;
    const gScale = Math.sqrt(A);
    nodeGraphEqFilterSetupCore(state, omega, r, 1, A * r, A * A, gScale);
    return;
  }
  nodeGraphEqFilterSetupMuted(state);
}

function nodeGraphEqFilterEnsureSetup(state, mode, frequency, q, gainDb, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const safeMode = Math.round(nodeGraphEqFilterClamp(mode, 0, 9));
  // Param may be 0 (frozen). Only non-negative + Nyquist — no musical floor.
  const rawFreq = Number(frequency);
  const freq = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawFreq) ? rawFreq : 0));
  const omega = (2 * Math.PI * freq) / rate;
  const safeQ = Math.max(0.05, Number(q) || 0.707);
  // Robin / RBJ: A = 10^(dB/40) for shelf and bell (amplitude = sqrt of power gain).
  const A = Math.pow(10, 0.025 * (Number(gainDb) || 0));

  if (
    state.lastMode === safeMode
    && state.lastOmega === omega
    && state.lastQ === safeQ
    && state.lastA === A
  ) {
    return;
  }
  nodeGraphEqFilterSetup(state, safeMode, omega, safeQ, A);
  state.lastMode = safeMode;
  state.lastOmega = omega;
  state.lastQ = safeQ;
  state.lastA = A;
}

/**
 * One sample of Robin's ZDF SVF.
 * @param {ReturnType<typeof createNodeGraphEqFilterState>} state
 */
function nodeGraphEqFilterSample(state, input, mode, frequency, q, gainDb, sampleRate) {
  const x = Number(input) || 0;
  const safeMode = Math.round(nodeGraphEqFilterClamp(mode, 0, 9));
  if (safeMode === 0) {
    return x;
  }

  nodeGraphEqFilterEnsureSetup(state, safeMode, frequency, q, gainDb, sampleRate);

  const g = state.g;
  const c = state.c;
  const s = state.s;
  const z1 = state.z1;
  const z2 = state.z2;

  // HP, BP, LP (Robin getPartialOutputs)
  const yH = (x - c * z1 - z2) * s;
  const yB = z1 + g * yH;
  const yL = z2 + g * yB;

  // TDF2 integrator update
  state.z1 = 2 * yB - z1;
  state.z2 = 2 * yL - z2;

  return state.aH * yH + state.aB * yB + state.aL * yL;
}

/**
 * Convert current SVF coeffs to equivalent DF1 biquad (Robin convertToBiquad).
 * Denominator uses negative-a convention: y = b0 x + b1 x1 + b2 x2 - a1 y1 - a2 y2
 * with Robin's a1/a2 already matching that form.
 */
function nodeGraphEqFilterBiquadFromState(state) {
  const g = state.g;
  const c = state.c;
  const s = state.s;
  const aL = state.aL;
  const aB = state.aB;
  const aH = state.aH;

  const a1 = 2 * (c * g + g * g) * s - 2;
  const a2 = -2 * (c * g - g * g) * s + 1;

  const lp0 = s * g * g;
  const lp1 = 2 * s * g * g;
  const lp2 = s * g * g;
  const bp0 = g * s;
  const bp1 = 0;
  const bp2 = -g * s;
  const hp0 = s;
  const hp1 = -2 * s;
  const hp2 = s;

  return {
    a1,
    a2,
    b0: aL * lp0 + aB * bp0 + aH * hp0,
    b1: aL * lp1 + aB * bp1 + aH * hp1,
    b2: aL * lp2 + aB * bp2 + aH * hp2,
  };
}

/** Magnitude response |H(e^{jω})| for curve display (does not touch audio state). */
function nodeGraphEqFilterMagnitudeAt(mode, frequency, q, gainDb, probeHz, sampleRate) {
  const safeMode = Math.round(nodeGraphEqFilterClamp(mode, 0, 9));
  if (safeMode === 0) {
    return 1;
  }
  const scratch = createNodeGraphEqFilterState();
  nodeGraphEqFilterEnsureSetup(scratch, safeMode, frequency, q, gainDb, sampleRate);
  const coeff = nodeGraphEqFilterBiquadFromState(scratch);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const w = (2 * Math.PI * Math.max(0, Number(probeHz) || 0)) / rate;
  const cos1 = Math.cos(w);
  const cos2 = Math.cos(2 * w);
  const sin1 = Math.sin(w);
  const sin2 = Math.sin(2 * w);
  // H = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)
  const numRe = coeff.b0 + coeff.b1 * cos1 + coeff.b2 * cos2;
  const numIm = -(coeff.b1 * sin1 + coeff.b2 * sin2);
  const denRe = 1 + coeff.a1 * cos1 + coeff.a2 * cos2;
  const denIm = -(coeff.a1 * sin1 + coeff.a2 * sin2);
  const denMag2 = denRe * denRe + denIm * denIm;
  if (!(denMag2 > 0)) {
    return 1e-6;
  }
  const mag2 = (numRe * numRe + numIm * numIm) / denMag2;
  return Math.sqrt(Math.max(mag2, 1e-30));
}
