// Sinepulse — period-reset sine chirp / sweep oscillator.
//
// Rate = master sweep rate (Hz): one chirp period = 1 / Rate.
// LowFreq / HighFreq = pitch endpoints (Hz), capped by project Speed Limit.
// Shift (0..1) = range bias: 0 = full LowFreq…HighFreq span; 1 = LowFreq
//   collapses to HighFreq. Only shrinks the span when there is room.
// Sweep (0..1) = active fraction of each period.
// FreqCurve / AmpCurve ∈ [-1, 1] bipolar shape controls.
// Direction: 0 = Up (Low→High), 1 = Down (High→Low). Flipping Direction
//   reflects period progress so pitch continues the other way without a jump.
// Antialiasing (Rate period) — ordered lo-fi → hi-fi (less high-freq timing jitter):
//   0 Off         continuous fractional Rate (scrub every sample; no period AA)
//   1 Soft Edge   continuous Rate + PolyBLEP residual on tooth wrap / hard-reset
//   2 Adaptive    Noise at long periods; fades to continuous when short
//   3 Shaped      integer lengths + first-order noise-shaped quantizer
//   4 Noise       Robin ±1-sample pitch dither (classic full-sample)
//   5 Fine        Robin dither at half-sample resolution (default / hi-fi)
//
// Outputs: Out (audio), f (Hz), Amp (0..1 env), Freq (0..1 curve pos).

/** AA mode indices (match module parameter choices / labels). */
const NODE_GRAPH_SINEPULSE_AA_OFF = 0;
const NODE_GRAPH_SINEPULSE_AA_SOFT_EDGE = 1; // Cont+BLEP
const NODE_GRAPH_SINEPULSE_AA_ADAPTIVE = 2; // Noise+Blend
const NODE_GRAPH_SINEPULSE_AA_SHAPED = 3; // Noise+Shape
const NODE_GRAPH_SINEPULSE_AA_NOISE = 4;
const NODE_GRAPH_SINEPULSE_AA_FINE = 5; // Noise+½ (default)
const NODE_GRAPH_SINEPULSE_AA_MAX = NODE_GRAPH_SINEPULSE_AA_FINE;
// Aliases (older names in comments / history).
const NODE_GRAPH_SINEPULSE_AA_CONT_BLEP = NODE_GRAPH_SINEPULSE_AA_SOFT_EDGE;
const NODE_GRAPH_SINEPULSE_AA_NOISE_BLEND = NODE_GRAPH_SINEPULSE_AA_ADAPTIVE;
const NODE_GRAPH_SINEPULSE_AA_NOISE_SHAPE = NODE_GRAPH_SINEPULSE_AA_SHAPED;
const NODE_GRAPH_SINEPULSE_AA_NOISE_HALF = NODE_GRAPH_SINEPULSE_AA_FINE;

function nodeGraphSinepulseMaxHz() {
  if (typeof nodeGraphProjectSpeedLimitHz === "function") {
    return nodeGraphProjectSpeedLimitHz();
  }
  if (typeof nodeGraphLiveSpeedLimitHz === "function") {
    return nodeGraphLiveSpeedLimitHz();
  }
  return 20000;
}

function createNodeGraphSinepulseState() {
  return {
    tooth: 0,
    phase: 0,
    lastReset: 0,
    prevOut: 0,
    blepMem: 0,
    // Last Direction choice (0 Up / 1 Down). -1 = unset (no reflect yet).
    lastDirection: -1,
    // Rate pitch-dither voice (Adaptive / Shaped / Noise / Fine).
    rateDither: nodeGraphSinepulseCreateRateDitherVoice(),
  };
}

/**
 * Force Rate-period position to u ∈ [0,1], syncing continuous tooth and
 * integer / half-sample dither counters so Direction reflect sticks.
 */
function nodeGraphSinepulseSetPeriodU(state, voice, aaMode, uIn) {
  let u = Number(uIn);
  if (!Number.isFinite(u)) u = 0;
  u = Math.max(0, Math.min(1, u));
  state.tooth = u;
  if (!voice || typeof voice !== "object") return u;

  if (
    aaMode === NODE_GRAPH_SINEPULSE_AA_FINE
    || aaMode === NODE_GRAPH_SINEPULSE_AA_NOISE_HALF
  ) {
    let halfLen = Number(voice.halfLen) || 0;
    if (!(halfLen >= 4)) halfLen = 200;
    // Snap to even half-count (each audio sample steps +2).
    let halfCount = Math.round((u * halfLen) / 2) * 2;
    if (halfCount < 0) halfCount = 0;
    if (halfCount >= halfLen) halfCount = Math.max(0, halfLen - 2);
    voice.halfCount = halfCount;
    voice.halfLen = halfLen;
    u = halfCount / Math.max(4, halfLen);
    state.tooth = u;
    return u;
  }

  if (
    aaMode === NODE_GRAPH_SINEPULSE_AA_NOISE
    || aaMode === NODE_GRAPH_SINEPULSE_AA_SHAPED
    || aaMode === NODE_GRAPH_SINEPULSE_AA_NOISE_SHAPE
    || aaMode === NODE_GRAPH_SINEPULSE_AA_ADAPTIVE
    || aaMode === NODE_GRAPH_SINEPULSE_AA_NOISE_BLEND
  ) {
    let lenNow = Number(voice.lenNow) || 0;
    if (!(lenNow >= 2)) lenNow = 100;
    const slope = 1 / Math.max(1, lenNow - 1);
    voice.phaseSlope = slope;
    voice.lenNow = lenNow;
    let sampleCount = Math.round(u / slope);
    if (sampleCount < 0) sampleCount = 0;
    if (sampleCount >= lenNow) sampleCount = lenNow - 1;
    voice.sampleCount = sampleCount;
    u = sampleCount * slope;
    state.tooth = Math.max(0, Math.min(1, u));
    return state.tooth;
  }

  // Off / Soft Edge: continuous tooth only.
  return u;
}

/** One pitch-dithered integer-cycle phasor for the master Rate period. */
function nodeGraphSinepulseCreateRateDitherVoice() {
  return {
    sampleCount: 0,
    lenNow: 100,
    lenMid: 100,
    probShort: 0,
    probMid: 1,
    phaseSlope: 1 / 99,
    // Noise+Shape: accumulated first-order quantizer error (samples).
    shapeErr: 0,
    // Noise+½: counter / length in half-sample units.
    halfCount: 0,
    halfLen: 200,
    // Noise+Blend: 1 = integer-noise path this cycle, 0 = continuous this cycle.
    blendUseNoise: 1,
  };
}

/**
 * Robin / rsPitchDitherOsc cycle distribution: pick among floor-1 / floor /
 * floor+1 sample lengths so mean period matches the desired fractional cycle
 * length and variance stays ~0.25 sample² (hides the quantization in noise).
 */
function nodeGraphSinepulseCalcCycleDistribution(c) {
  const ci = Math.floor(c);
  const cf = c - ci;
  let c2 = ci;
  if (cf >= 0.5) c2 += 1;
  // Keep at least 2 samples so a closed phasor (0…1 over lenNow−1) is defined.
  if (c2 < 2) c2 = 2;
  const c1 = c2 - 1;
  const c3 = c2 + 1;

  const e1 = c1 - c;
  const e2 = c2 - c;
  const e3 = c3 - c;
  const v1 = e1 * e1;
  const v2 = e2 * e2;
  const v3 = e3 * e3;
  const v = 0.25;
  const d1 = v - v1;
  const d2 = v - v2;
  const d3 = v - v3;
  const denom = e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3);
  if (!(Math.abs(denom) > 1e-18)) {
    return { lenMid: c2, probShort: 0, probMid: 1 };
  }
  const s = 1 / denom;
  return {
    lenMid: c2,
    probShort: (d2 * e3 - d3 * e2) * s,
    probMid: (d3 * e1 - d1 * e3) * s,
  };
}

/** Robin PDF roll → integer length (Noise). */
function nodeGraphSinepulseUpdateRateCycleLength(voice) {
  const r = Math.random();
  let len;
  if (r < voice.probShort) {
    len = voice.lenMid - 1;
  } else if (r < voice.probShort + voice.probMid) {
    len = voice.lenMid;
  } else {
    len = voice.lenMid + 1;
  }
  voice.lenNow = Math.max(2, len | 0);
  // phasorRangeClosed = true → slope so count 0…lenNow-1 spans 0…1.
  voice.phaseSlope = 1 / Math.max(1, voice.lenNow - 1);
}

/**
 * First-order noise-shaped integer period (Noise+Shape).
 * Quantizes meanC + residual; leftover error feeds the next wrap so low-rate
 * patterned PM is pushed upward (less “tick-tick” at moderate Rates).
 */
function nodeGraphSinepulseUpdateRateCycleLengthShaped(voice, meanC) {
  const c = Math.max(2, Number(meanC) || 2);
  let err = Number(voice.shapeErr) || 0;
  if (!Number.isFinite(err)) err = 0;
  // Soft-clip residual so a bad start can't walk length forever.
  if (err > 4) err = 4;
  if (err < -4) err = -4;
  const v = c + err;
  let len = Math.round(v);
  const ci = Math.floor(c);
  const lo = Math.max(2, ci - 2);
  const hi = Math.max(lo, ci + 3);
  if (len < lo) len = lo;
  if (len > hi) len = hi;
  voice.shapeErr = v - len;
  voice.lenNow = len | 0;
  voice.phaseSlope = 1 / Math.max(1, voice.lenNow - 1);
}

/** Half-sample length roll (Noise+½) — same PDF on 2× mean cycle. */
function nodeGraphSinepulseUpdateRateHalfCycleLength(voice) {
  const r = Math.random();
  let len;
  if (r < voice.probShort) {
    len = voice.lenMid - 1;
  } else if (r < voice.probShort + voice.probMid) {
    len = voice.lenMid;
  } else {
    len = voice.lenMid + 1;
  }
  // At least 4 half-samples (= 2 audio samples) for a defined phasor.
  voice.halfLen = Math.max(4, len | 0);
}

/** Continuous fractional Rate advance (Off / Soft Edge / Adaptive continuous side). */
function nodeGraphSinepulseAdvanceContinuous(state, toothHz, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);
  let tooth = Number(state.tooth) || 0;
  if (!Number.isFinite(tooth)) tooth = 0;
  let wrapped = false;
  if (th > 0) {
    tooth += th / sr;
    if (tooth >= 1 || tooth < 0) {
      tooth = tooth - Math.floor(tooth);
      if (tooth >= 1) tooth = 0;
      wrapped = true;
    }
  }
  // Rate 0: hold.
  state.tooth = tooth;
  return { u: tooth, wrapped, dt: th > 0 ? th / sr : 0 };
}

/**
 * Integer +1 sample advance along a locked cycle length (Noise / Shape core).
 * Distribution refreshed every sample for the *next* roll; lenNow only changes on wrap.
 */
function nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sampleRate, shaped) {
  if (!voice || typeof voice !== "object") {
    return { u: 0, wrapped: false };
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);

  if (!(voice.lenNow >= 2) || !Number.isFinite(voice.phaseSlope) || !(voice.phaseSlope > 0)) {
    if (shaped) {
      nodeGraphSinepulseUpdateRateCycleLengthShaped(voice, Math.max(2, sr / Math.max(th, 1e-9)));
    } else {
      nodeGraphSinepulseUpdateRateCycleLength(voice);
    }
  }

  let sampleCount = Number(voice.sampleCount) || 0;
  if (!Number.isFinite(sampleCount) || sampleCount < 0) sampleCount = 0;
  let u = sampleCount * (Number(voice.phaseSlope) || 0);
  if (!Number.isFinite(u)) u = 0;
  u = Math.max(0, Math.min(1, u));

  if (!(th > 0)) {
    voice.sampleCount = sampleCount;
    return { u, wrapped: false };
  }

  const meanCycleLength = Math.max(2, sr / th);
  if (!shaped) {
    const dist = nodeGraphSinepulseCalcCycleDistribution(meanCycleLength);
    voice.lenMid = dist.lenMid;
    voice.probShort = dist.probShort;
    voice.probMid = dist.probMid;
  }

  sampleCount += 1;
  let wrapped = false;
  if (sampleCount >= voice.lenNow) {
    sampleCount = 0;
    if (shaped) {
      nodeGraphSinepulseUpdateRateCycleLengthShaped(voice, meanCycleLength);
    } else {
      nodeGraphSinepulseUpdateRateCycleLength(voice);
    }
    wrapped = true;
  }
  voice.sampleCount = sampleCount;
  u = (Number(voice.phaseSlope) || 0) * sampleCount;
  if (!Number.isFinite(u)) u = 0;
  return { u: Math.max(0, Math.min(1, u)), wrapped };
}

/**
 * Half-sample dither advance: each audio sample steps +2 half-units.
 * Period resolution is 0.5 samples → less timing grain than full-sample Noise.
 */
function nodeGraphSinepulseAdvanceHalfSample(voice, toothHz, sampleRate) {
  if (!voice || typeof voice !== "object") {
    return { u: 0, wrapped: false };
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);

  let halfCount = Number(voice.halfCount) || 0;
  if (!Number.isFinite(halfCount) || halfCount < 0) halfCount = 0;
  let halfLen = Number(voice.halfLen) || 0;
  if (!(halfLen >= 4)) {
    halfLen = 200;
    voice.halfLen = halfLen;
  }

  let u = halfCount / halfLen;
  if (!Number.isFinite(u)) u = 0;
  u = Math.max(0, Math.min(1, u));

  if (!(th > 0)) {
    voice.halfCount = halfCount;
    return { u, wrapped: false };
  }

  // Mean cycle in half-samples; same Robin PDF on that grid.
  const meanHalf = Math.max(4, (2 * sr) / th);
  const dist = nodeGraphSinepulseCalcCycleDistribution(meanHalf);
  voice.lenMid = dist.lenMid;
  voice.probShort = dist.probShort;
  voice.probMid = dist.probMid;

  halfCount += 2;
  let wrapped = false;
  if (halfCount >= halfLen) {
    halfCount = 0;
    nodeGraphSinepulseUpdateRateHalfCycleLength(voice);
    halfLen = voice.halfLen;
    wrapped = true;
  }
  voice.halfCount = halfCount;
  u = halfCount / Math.max(4, halfLen);
  if (!Number.isFinite(u)) u = 0;
  return { u: Math.max(0, Math.min(1, u)), wrapped };
}

/**
 * Noise+Blend: at long mean periods use integer Noise; at short periods use
 * continuous. Mid range: sticky per-cycle coin-flip with P(noise) from a
 * smoothstep so high-Rate mod loses patterned ±1-sample PM.
 *
 * Blend thresholds (samples): ≤12 → always continuous; ≥64 → always Noise.
 */
function nodeGraphSinepulseAdvanceNoiseBlend(state, voice, toothHz, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);
  if (!(th > 0)) {
    return nodeGraphSinepulseAdvanceContinuous(state, toothHz, sampleRate);
  }
  const mean = Math.max(2, sr / th);
  const lo = 12;
  const hi = 64;
  let pNoise = 1;
  if (mean <= lo) pNoise = 0;
  else if (mean < hi) {
    const t = (mean - lo) / (hi - lo);
    // smoothstep
    pNoise = t * t * (3 - 2 * t);
  }

  // Re-roll path at wrap (or if voice never chose).
  if (voice.blendUseNoise !== 0 && voice.blendUseNoise !== 1) {
    voice.blendUseNoise = pNoise >= 0.5 ? 1 : 0;
  }

  if (pNoise <= 0) {
    voice.blendUseNoise = 0;
    const cont = nodeGraphSinepulseAdvanceContinuous(state, toothHz, sampleRate);
    if (cont.wrapped) voice.blendUseNoise = 0;
    return cont;
  }
  if (pNoise >= 1) {
    voice.blendUseNoise = 1;
    const n = nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sampleRate, false);
    state.tooth = n.u;
    if (n.wrapped) voice.blendUseNoise = 1;
    return n;
  }

  if (voice.blendUseNoise) {
    const n = nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sampleRate, false);
    state.tooth = n.u;
    if (n.wrapped) {
      voice.blendUseNoise = Math.random() < pNoise ? 1 : 0;
    }
    return n;
  }
  const cont = nodeGraphSinepulseAdvanceContinuous(state, toothHz, sampleRate);
  if (cont.wrapped) {
    voice.blendUseNoise = Math.random() < pNoise ? 1 : 0;
  }
  return cont;
}

/**
 * Classic 2-point PolyBLEP residual (unit step / saw edge).
 * t = phase 0…1, dt = phase increment per sample. Used by Soft Edge.
 */
function nodeGraphSinepulsePolyBlep(t, dt) {
  if (!(dt > 1e-12) || !Number.isFinite(t) || !Number.isFinite(dt)) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Legacy name: Noise-mode integer advance. */
function nodeGraphSinepulseAdvanceRateDither(voice, toothHz, sampleRate) {
  return nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sampleRate, false);
}

function nodeGraphSinepulseSilentOut() {
  return { Out: 0, f: 0, Amp: 0, Freq: 0 };
}

function nodeGraphSinepulseClampHz(hz) {
  if (typeof nodeGraphClampHzToProjectSpeedLimit === "function") {
    return nodeGraphClampHzToProjectSpeedLimit(hz);
  }
  const n = Number(hz);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(nodeGraphSinepulseMaxHz(), n);
}

/**
 * Shift 0..1 collapses Low toward High (High stays put).
 * At 0: full span. At 1: Low = High (no room left / single tone at High).
 * Both always clamped to [0, 20000].
 */
function nodeGraphSinepulseApplyShift(frequencyHigh, frequencyLow, shift01) {
  let hi = nodeGraphSinepulseClampHz(frequencyHigh);
  let lo = nodeGraphSinepulseClampHz(frequencyLow);
  // Order so hi >= lo for span math
  if (lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  let s = Number(shift01);
  if (!Number.isFinite(s)) s = 0;
  s = Math.max(0, Math.min(1, s));

  // Move low toward high; high unchanged → never exceeds High or 20k.
  const span = hi - lo;
  const effectiveLow = lo + span * s;
  const effectiveHigh = hi;
  return {
    high: nodeGraphSinepulseClampHz(effectiveHigh),
    low: nodeGraphSinepulseClampHz(effectiveLow),
  };
}

/**
 * Ordered endpoints for chirp (fTop >= fBot > 0 for DSP; 0 Hz allowed as endpoint
 * via a tiny floor only for log math).
 */
function nodeGraphSinepulseEndpoints(frequencyHigh, frequencyLow) {
  const hi = nodeGraphSinepulseClampHz(frequencyHigh);
  const lo = nodeGraphSinepulseClampHz(frequencyLow);
  const fTop = Math.max(hi, lo);
  const fBot = Math.min(hi, lo);
  if (!(fTop > 0) && !(fBot > 0)) {
    return { fTop: 0, fBot: 0 };
  }
  // Floor only for math stability when Low is 0 (still "0 Hz" end of sweep).
  return {
    fTop: Math.max(fTop, 1e-6),
    fBot: Math.max(fBot, 1e-6),
  };
}

/** Master period rate (chirps per second). */
function nodeGraphSinepulseToothRateHz(frequencyHz) {
  const f = Math.abs(Number(frequencyHz) || 0);
  if (!(f > 0) || !Number.isFinite(f)) return 0;
  return Math.min(nodeGraphSinepulseMaxHz(), f);
}

/**
 * Active fraction of the period (u-space).
 * Sweep 0 → one sample; Sweep 1 → full period.
 */
function nodeGraphSinepulseActiveFill(sweep, toothHz, sampleRate) {
  const s = Math.max(0, Math.min(1, Number(sweep) || 0));
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);
  const oneSampleU = th > 0 ? Math.min(1, th / sr) : 1 / sr;
  return oneSampleU + s * (1 - oneSampleU);
}

/**
 * Bipolar curve c ∈ [-1, 1] → warp of progress u ∈ [0, 1] + expMix.
 *   −1 super-log … −0.5 log … 0 linear … +0.5 exp … +1 super-exp
 */
function nodeGraphSinepulseBipolarCurve(u, curve) {
  const t = Math.max(0, Math.min(1, Number(u) || 0));
  let c = Number(curve);
  if (!Number.isFinite(c)) c = 0;
  c = Math.max(-1, Math.min(1, c));

  const abs = Math.abs(c);
  const expMix = Math.min(1, abs * 2);
  const superAmt = abs <= 0.5 ? 0 : (abs - 0.5) * 2;

  let warped;
  if (c >= 0) {
    const power = 1 + superAmt * 3;
    warped = Math.pow(t, power);
  } else {
    const power = 1 + superAmt * 3;
    warped = 1 - Math.pow(1 - t, power);
  }
  return { warped, expMix, c };
}

/**
 * Instantaneous Hz: f0 → f1 over localT with bipolar FreqCurve.
 * Result hard-capped to 20 kHz.
 */
function nodeGraphSinepulseInstantHz(f0, f1, localT, freqCurve) {
  let a = Math.max(1e-6, Number(f0) || 0);
  let b = Math.max(1e-6, Number(f1) || 0);
  if (!(a > 0) || !Number.isFinite(a)) {
    return { f: 0, freqPos: 0 };
  }
  if (!(b > 0) || !Number.isFinite(b)) b = a;

  const t = Math.max(0, Math.min(1, Number(localT) || 0));
  const { warped, expMix } = nodeGraphSinepulseBipolarCurve(t, freqCurve);

  const fLin = a + (b - a) * warped;
  const rr = b / a;
  const fExp = (rr > 0 && Number.isFinite(rr))
    ? a * Math.pow(rr, warped)
    : fLin;

  let f = fLin * (1 - expMix) + fExp * expMix;
  if (!Number.isFinite(f) || f <= 0) f = a;
  f = Math.min(nodeGraphSinepulseMaxHz(), f);
  return { f, freqPos: warped };
}

/**
 * Amplitude envelope 0..1 with bipolar AmpCurve.
 */
function nodeGraphSinepulseActiveEnv(localT, direction, ampCurve) {
  const t = Math.max(0, Math.min(1, Number(localT) || 0));
  const up = Math.round(Number(direction) || 0) === 0;
  const away = up ? 1 - t : t;

  const { warped, expMix } = nodeGraphSinepulseBipolarCurve(away, ampCurve);

  const envLin = 1 - warped;
  const envExp = Math.exp(-3.2 * warped);
  let env = envLin * (1 - expMix) + envExp * expMix;

  const attack = up
    ? Math.min(1, t * 12 + 0.08)
    : Math.min(1, t * 80 + 0.35);
  env *= attack;

  const tail = t < 0.92
    ? 1
    : 0.5 * (1 + Math.cos(Math.PI * ((t - 0.92) / 0.08)));
  env *= tail;

  if (!Number.isFinite(env) || env < 0) return 0;
  return env > 1 ? 1 : env;
}

/**
 * One sample → { Out, f, Amp, Freq }.
 * antialias: 0 Off, 1 Soft Edge, 2 Adaptive, 3 Shaped, 4 Noise, 5 Fine (default).
 * hardReset: 0 = continuous sine phase across teeth; 1 = zero phase each tooth / Reset.
 */
function nodeGraphSinepulseSample(
  state,
  frequencyHz,
  frequencyHigh,
  frequencyLow,
  shift01,
  sweep,
  direction,
  freqCurve,
  ampCurve,
  phaseOffset,
  amplitude,
  increment,
  resetGate,
  sampleRate,
  antialias = 5,
  hardReset = 1,
) {
  if (!state || typeof state !== "object") return nodeGraphSinepulseSilentOut();
  const sr = Math.max(1, Number(sampleRate) || 44100);
  // Increment jack is cycles-per-sample → add to master Rate (Hz).
  let toothHz = nodeGraphSinepulseToothRateHz(frequencyHz);
  const incHz = (Number(increment) || 0) * sr;
  if (Number.isFinite(incHz) && incHz !== 0) {
    toothHz = nodeGraphSinepulseToothRateHz(toothHz + incHz);
  }
  let aaMode = Math.round(Number(antialias));
  if (!Number.isFinite(aaMode) || aaMode < 0) aaMode = NODE_GRAPH_SINEPULSE_AA_FINE;
  if (aaMode > NODE_GRAPH_SINEPULSE_AA_MAX) aaMode = NODE_GRAPH_SINEPULSE_AA_FINE;
  const doHardReset = Math.round(Number(hardReset) || 0) !== 0;
  const useSoftEdge = aaMode === NODE_GRAPH_SINEPULSE_AA_SOFT_EDGE;
  const shifted = nodeGraphSinepulseApplyShift(
    frequencyHigh,
    frequencyLow,
    shift01,
  );
  const { fTop, fBot } = nodeGraphSinepulseEndpoints(shifted.high, shifted.low);

  const g = Number(resetGate) || 0;
  const on = g > 0.5;
  if (on && !state.lastReset) {
    state.tooth = 0;
    if (doHardReset) {
      state.phase = 0;
    }
    if (state.rateDither) {
      state.rateDither.sampleCount = 0;
      state.rateDither.halfCount = 0;
      state.rateDither.shapeErr = 0;
    } else {
      state.rateDither = nodeGraphSinepulseCreateRateDitherVoice();
    }
    state.blepMem = 0;
  }
  state.lastReset = on ? 1 : 0;

  // Need a usable pitch span; Rate may be 0 (freeze chirp position, keep tone).
  if (!(fTop > 0)) {
    state.prevOut = 0;
    return nodeGraphSinepulseSilentOut();
  }

  if (!state.rateDither || typeof state.rateDither !== "object") {
    state.rateDither = nodeGraphSinepulseCreateRateDitherVoice();
  }
  const voice = state.rateDither;

  let u;
  let wrapped = false;
  let dt = toothHz > 0 ? toothHz / sr : 0;

  if (aaMode === NODE_GRAPH_SINEPULSE_AA_OFF || useSoftEdge) {
    const cont = nodeGraphSinepulseAdvanceContinuous(state, toothHz, sr);
    u = cont.u;
    wrapped = cont.wrapped;
    dt = cont.dt;
  } else if (aaMode === NODE_GRAPH_SINEPULSE_AA_ADAPTIVE) {
    const advanced = nodeGraphSinepulseAdvanceNoiseBlend(state, voice, toothHz, sr);
    u = advanced.u;
    wrapped = advanced.wrapped;
    if (advanced.dt != null) dt = advanced.dt;
  } else if (aaMode === NODE_GRAPH_SINEPULSE_AA_SHAPED) {
    const advanced = nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sr, true);
    u = advanced.u;
    wrapped = advanced.wrapped;
    state.tooth = u;
  } else if (aaMode === NODE_GRAPH_SINEPULSE_AA_NOISE) {
    const advanced = nodeGraphSinepulseAdvanceIntegerLocked(voice, toothHz, sr, false);
    u = advanced.u;
    wrapped = advanced.wrapped;
    state.tooth = u;
  } else if (aaMode === NODE_GRAPH_SINEPULSE_AA_FINE) {
    const advanced = nodeGraphSinepulseAdvanceHalfSample(voice, toothHz, sr);
    u = advanced.u;
    wrapped = advanced.wrapped;
    state.tooth = u;
  } else {
    // Fallback: Fine
    const advanced = nodeGraphSinepulseAdvanceHalfSample(voice, toothHz, sr);
    u = advanced.u;
    wrapped = advanced.wrapped;
    state.tooth = u;
  }

  const fill = nodeGraphSinepulseActiveFill(sweep, toothHz, sr);

  // Direction flip: reflect active progress so f0/f1 swap keeps the same Hz
  // (linear path exact; continues modulation the other way without a pitch jump).
  const dir = Math.round(Number(direction) || 0) !== 0 ? 1 : 0;
  const prevDir = Number(state.lastDirection);
  if ((prevDir === 0 || prevDir === 1) && dir !== prevDir && fill > 1e-12 && u < fill) {
    u = nodeGraphSinepulseSetPeriodU(state, voice, aaMode, fill - u);
  }
  state.lastDirection = dir;

  // Soft Edge: carry residual from previous sample (2nd half of edge correction).
  let blepCarry = 0;
  if (useSoftEdge) {
    blepCarry = Number(state.blepMem) || 0;
    state.blepMem = 0;
  }

  if (u >= fill) {
    let ySilent = blepCarry;
    if (useSoftEdge && dt > 0) {
      const prev = Number(state.prevOut) || 0;
      if (Math.abs(prev) > 1e-8 && u - fill < dt * 2) {
        ySilent = prev * 0.5 + blepCarry;
        state.blepMem = 0;
      }
    }
    if (!Number.isFinite(ySilent)) ySilent = 0;
    state.prevOut = ySilent;
    if (Math.abs(ySilent) < 1e-30) {
      return nodeGraphSinepulseSilentOut();
    }
    return { Out: ySilent, f: 0, Amp: 0, Freq: 0 };
  }

  // Hard Reset On: zero sine phase at each tooth boundary (and Reset edge above).
  if (wrapped && doHardReset) {
    state.phase = 0;
  }

  // direction 0 = Up (Low→High), 1 = Down (High→Low)
  const up = dir === 0;
  const f0 = up ? fBot : fTop;
  const f1 = up ? fTop : fBot;

  const localT = fill > 1e-12 ? u / fill : 0;
  const { f: fInst, freqPos } = nodeGraphSinepulseInstantHz(f0, f1, localT, freqCurve);
  const signedInst = Number(frequencyHz) < 0 ? -fInst : fInst;

  state.phase += signedInst / sr;
  if (state.phase > 1e6 || state.phase < -1e6) {
    state.phase -= Math.floor(state.phase);
  }

  const ph = (Number(state.phase) || 0) + (Number(phaseOffset) || 0);
  const amp = Number.isFinite(Number(amplitude)) ? Number(amplitude) : 1;
  const env = nodeGraphSinepulseActiveEnv(localT, dir, ampCurve);
  let y = Math.sin(ph * Math.PI * 2) * amp * env;
  if (!Number.isFinite(y)) y = 0;

  // Soft Edge: PolyBLEP residual around tooth wrap / hard-reset edge.
  if (useSoftEdge && dt > 0 && toothHz > 0) {
    const prev = Number(state.prevOut) || 0;
    let edgeH = 0;
    if (wrapped) {
      edgeH = y - prev;
      if (!Number.isFinite(edgeH)) edgeH = 0;
      if (edgeH > 2) edgeH = 2;
      if (edgeH < -2) edgeH = -2;
    }
    const blep = nodeGraphSinepulsePolyBlep(u, dt);
    if (wrapped || Math.abs(blep) > 1e-12) {
      const scale = wrapped ? edgeH : (doHardReset ? amp * env * 0.35 * Math.sign(blep || 1) : 0);
      if (wrapped) {
        y = y - edgeH * 0.5 + blepCarry;
        state.blepMem = edgeH * 0.5 * (1 + blep * 0.25);
      } else {
        y = y - scale * blep + blepCarry;
      }
    } else {
      y += blepCarry;
    }
  }

  if (!Number.isFinite(y)) y = 0;
  if (y > -1e-30 && y < 1e-30) y = 0;
  state.prevOut = y;

  const fOut = Number.isFinite(fInst) ? Math.min(nodeGraphSinepulseMaxHz(), fInst) : 0;
  const ampOut = Number.isFinite(env) ? Math.max(0, Math.min(1, env)) : 0;
  const freqOut = Number.isFinite(freqPos) ? Math.max(0, Math.min(1, freqPos)) : 0;

  return {
    Out: y,
    f: fOut,
    Amp: ampOut,
    Freq: freqOut,
  };
}
