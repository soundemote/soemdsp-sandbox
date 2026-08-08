// Sinepulse — period-reset sine chirp / sweep oscillator.
//
// Rate = master sweep rate (Hz): one chirp period = 1 / Rate.
// LowFreq / HighFreq = pitch endpoints (Hz), capped by project Speed Limit.
// Shift (0..1) = range bias: 0 = full LowFreq…HighFreq span; 1 = LowFreq
//   collapses to HighFreq. Only shrinks the span when there is room.
// Sweep (0..1) = active fraction of each period.
// FreqCurve / AmpCurve ∈ [-1, 1] bipolar shape controls.
// Direction: 0 = Up (Low→High), 1 = Down (High→Low).
//
// Outputs: Out (audio), f (Hz), Amp (0..1 env), Freq (0..1 curve pos).

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
  };
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
) {
  if (!state || typeof state !== "object") return nodeGraphSinepulseSilentOut();
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const toothHz = nodeGraphSinepulseToothRateHz(frequencyHz);
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
    state.phase = 0;
  }
  state.lastReset = on ? 1 : 0;

  if (!(toothHz > 0) || !(fTop > 0)) {
    return nodeGraphSinepulseSilentOut();
  }

  const toothInc = toothHz / sr + (Number(increment) || 0);
  let tooth = (Number(state.tooth) || 0) + toothInc;
  let wrapped = false;

  if (tooth >= 1 || tooth < 0) {
    tooth = tooth - Math.floor(tooth);
    wrapped = true;
    state.phase = 0;
  }
  state.tooth = tooth;

  const u = tooth;
  const fill = nodeGraphSinepulseActiveFill(sweep, toothHz, sr);

  if (u >= fill) {
    return nodeGraphSinepulseSilentOut();
  }

  if (wrapped) {
    state.phase = 0;
  }

  // direction 0 = Up (Low→High), 1 = Down (High→Low)
  const up = Math.round(Number(direction) || 0) === 0;
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
  const env = nodeGraphSinepulseActiveEnv(localT, direction, ampCurve);
  let y = Math.sin(ph * Math.PI * 2) * amp * env;
  if (!Number.isFinite(y)) y = 0;
  if (y > -1e-30 && y < 1e-30) y = 0;

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
