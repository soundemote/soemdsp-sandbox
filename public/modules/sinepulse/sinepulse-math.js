// Sinepulse — period-reset sine chirp / sweep oscillator.
//
// Rate = master sweep rate (Hz): one chirp period = 1 / Rate.
// LowFreq / HighFreq = pitch endpoints (Hz), capped by project Speed Limit.
// Shift (0..1) = range bias: 0 = full LowFreq…HighFreq span; 1 = LowFreq
//   collapses to HighFreq. Only shrinks the span when there is room.
// Sweep (0..1) = active fraction of each period.
// FreqCurve / AmpCurve ∈ [-1, 1] bipolar shape controls.
// Direction: 0 = Up (Low→High), 1 = Down (High→Low).
// Antialiasing (Rate): when On, master period uses Robin Schmidt pitch
//   dithering (same idea as RobinSupersaw) — integer sample cycle lengths
//   chosen so mean Rate is exact and the quantization error is noise, not
//   a fixed spectral comb. Off = continuous fractional tooth advance.
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
    // Rate pitch-dither voice (rsPitchDitherOsc-style; only used when AA On).
    rateDither: nodeGraphSinepulseCreateRateDitherVoice(),
  };
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
 * Advance Rate dither phasor one sample. Returns { u, wrapped } where u is
 * the 0…1 position in the current chirp period.
 */
function nodeGraphSinepulseAdvanceRateDither(voice, toothHz, sampleRate) {
  if (!voice || typeof voice !== "object") {
    return { u: 0, wrapped: false };
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const th = Math.max(0, Number(toothHz) || 0);
  // Mean samples per chirp period. Floor at 2 (Nyquist-ish period floor).
  const meanCycleLength = th > 0 ? Math.max(2, sr / th) : 2;
  const dist = nodeGraphSinepulseCalcCycleDistribution(meanCycleLength);
  voice.lenMid = dist.lenMid;
  voice.probShort = dist.probShort;
  voice.probMid = dist.probMid;

  if (!(voice.lenNow >= 2) || !Number.isFinite(voice.phaseSlope) || !(voice.phaseSlope > 0)) {
    nodeGraphSinepulseUpdateRateCycleLength(voice);
  }

  const p = voice.phaseSlope * (Number(voice.sampleCount) || 0);
  voice.sampleCount = (Number(voice.sampleCount) || 0) + 1;
  let wrapped = false;
  if (voice.sampleCount >= voice.lenNow) {
    voice.sampleCount = 0;
    nodeGraphSinepulseUpdateRateCycleLength(voice);
    wrapped = true;
  }
  const u = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  return { u, wrapped };
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
 * antialias: 0 = Off (continuous Rate phasor), 1 = On (pitch-dithered Rate).
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
  antialias = 0,
) {
  if (!state || typeof state !== "object") return nodeGraphSinepulseSilentOut();
  const sr = Math.max(1, Number(sampleRate) || 44100);
  // Increment jack is cycles-per-sample → add to master Rate (Hz).
  let toothHz = nodeGraphSinepulseToothRateHz(frequencyHz);
  const incHz = (Number(increment) || 0) * sr;
  if (Number.isFinite(incHz) && incHz !== 0) {
    toothHz = nodeGraphSinepulseToothRateHz(toothHz + incHz);
  }
  const aaOn = Math.round(Number(antialias) || 0) !== 0;
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
    if (state.rateDither) {
      state.rateDither.sampleCount = 0;
    } else {
      state.rateDither = nodeGraphSinepulseCreateRateDitherVoice();
    }
  }
  state.lastReset = on ? 1 : 0;

  if (!(toothHz > 0) || !(fTop > 0)) {
    return nodeGraphSinepulseSilentOut();
  }

  let u;
  let wrapped = false;

  if (aaOn) {
    if (!state.rateDither || typeof state.rateDither !== "object") {
      state.rateDither = nodeGraphSinepulseCreateRateDitherVoice();
    }
    const advanced = nodeGraphSinepulseAdvanceRateDither(state.rateDither, toothHz, sr);
    u = advanced.u;
    wrapped = advanced.wrapped;
    state.tooth = u;
  } else {
    // Continuous fractional advance (legacy). Increment already in toothHz.
    const toothInc = toothHz / sr;
    let tooth = (Number(state.tooth) || 0) + toothInc;
    if (tooth >= 1 || tooth < 0) {
      tooth = tooth - Math.floor(tooth);
      wrapped = true;
      state.phase = 0;
    }
    state.tooth = tooth;
    u = tooth;
  }

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
