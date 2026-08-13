// Sine Kick — analog kick voice (T → Out audio, A envelope).
//
// Impulse on a decaying oscillator:
//   f(t) = pitch × 2^(punch × e^{-t/τ_p})
//   env(t) = e^{-t/τ_a}
//   Out = Amplitude × env × sineToSquare(φ, Sharpness)
// Sharpness 0 = sine. 1 = square (same ellipsoid law as RoundShape).

const NODE_GRAPH_SINE_KICK_DECAY_S = 0.28;
const NODE_GRAPH_SINE_KICK_PITCH_HZ = 52;
const NODE_GRAPH_SINE_KICK_PUNCH_OCT = 1.7;
const NODE_GRAPH_SINE_KICK_LN100 = Math.log(100);
const NODE_GRAPH_SINE_KICK_PITCH_FASTER = 4.5;
const NODE_GRAPH_SINE_KICK_TWO_PI = Math.PI * 2;

function nodeGraphSineKickDecayS(decay) {
  const n = Number(decay);
  if (!Number.isFinite(n) || n <= 0) {
    return NODE_GRAPH_SINE_KICK_DECAY_S;
  }
  return Math.max(0.01, Math.min(8, n));
}

function nodeGraphSineKickPitchHz(pitch) {
  const n = Number(pitch);
  if (!Number.isFinite(n) || n <= 0) {
    return NODE_GRAPH_SINE_KICK_PITCH_HZ;
  }
  const cap = typeof nodeGraphProjectSpeedLimitHz === "function"
    ? nodeGraphProjectSpeedLimitHz()
    : 20000;
  return Math.max(8, Math.min(cap, n));
}

function nodeGraphSineKickPunchOct(punch) {
  const n = Number(punch);
  if (!Number.isFinite(n)) {
    return NODE_GRAPH_SINE_KICK_PUNCH_OCT;
  }
  return Math.max(0, Math.min(4, n));
}

function nodeGraphSineKickClampUnit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphSineKickGain(amplitude) {
  const g = Number(amplitude);
  return Number.isFinite(g) ? Math.max(0, g) : 1;
}

function createNodeGraphSineKickState() {
  return {
    t: 0,
    phase: 0,
    lastTrig: 0,
    active: 0,
    a: 0,
  };
}

function nodeGraphSineKickTauA(decayS) {
  return nodeGraphSineKickDecayS(decayS) / NODE_GRAPH_SINE_KICK_LN100;
}

function nodeGraphSineKickAmp01(timeS, decayS) {
  const t = Math.max(0, Number(timeS) || 0);
  const amp = Math.exp(-t / nodeGraphSineKickTauA(decayS));
  if (!Number.isFinite(amp) || amp < 1e-8) {
    return 0;
  }
  return amp > 1 ? 1 : amp;
}

function nodeGraphSineKickHz(timeS, pitchHz, punchOct, decayS, pitchCvRatio = 1) {
  const rest = nodeGraphSineKickPitchHz(pitchHz);
  const cv = Number(pitchCvRatio);
  const ratio = Number.isFinite(cv) && cv > 0 ? cv : 1;
  const punch = nodeGraphSineKickPunchOct(punchOct);
  const t = Math.max(0, Number(timeS) || 0);
  const tauP = nodeGraphSineKickTauA(decayS) / NODE_GRAPH_SINE_KICK_PITCH_FASTER;
  const oct = punch * Math.exp(-t / Math.max(1e-6, tauP));
  const hz = rest * ratio * (2 ** oct);
  return Number.isFinite(hz) && hz > 0 ? hz : 0;
}

function nodeGraphSineKickSineToSquare(phaseCycles, shape, frequencyHz, sampleRate) {
  if (typeof nodeGraphEllipsoidSineToSquare === "function") {
    return nodeGraphEllipsoidSineToSquare(phaseCycles, shape, frequencyHz, sampleRate);
  }
  if (typeof nodeGraphKickEnvelopeSineToSquare === "function") {
    return nodeGraphKickEnvelopeSineToSquare(phaseCycles, shape, frequencyHz, sampleRate);
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const angle = (Number(phaseCycles) || 0) * Math.PI * 2;
  const sinPhase = Math.sin(angle);
  const cosPhase = Math.cos(angle);
  let c = 1 - nodeGraphSineKickClampUnit(shape, 0);
  const cMin = Math.max(0, Math.min(1, (NODE_GRAPH_SINE_KICK_TWO_PI * f) / sr));
  if (c < cMin) c = cMin;
  const xx = (cosPhase * cosPhase) + (sinPhase * c) * (sinPhase * c);
  if (xx <= 1e-24) {
    if (cosPhase > 0) return 1;
    if (cosPhase < 0) return -1;
    return 0;
  }
  const out = cosPhase / Math.sqrt(xx);
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphSineKickIdleOut(sharpness = 0) {
  const pt = typeof nodeGraphKickEnvelopeQuarterPoint === "function"
    ? nodeGraphKickEnvelopeQuarterPoint(1, sharpness)
    : { x: 0, y: -1 };
  return { Out: 0, A: 0, U: 1, X: pt.x, Y: pt.y, f: 0 };
}

function nodeGraphSineKickSample(
  state,
  trigger,
  pitchHz,
  punchOct,
  decayS,
  amplitude,
  sampleRate,
  pitchCvRatio = 1,
  sharpness = 0,
) {
  if (!state || typeof state !== "object") {
    return nodeGraphSineKickIdleOut(sharpness);
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const dt = 1 / sr;
  const gain = nodeGraphSineKickGain(amplitude);
  const decay = nodeGraphSineKickDecayS(decayS);
  const sharp = nodeGraphSineKickClampUnit(sharpness, 0);
  const g = Number(trigger) || 0;
  const on = g > 0.5;
  if (on && !state.lastTrig) {
    state.t = 0;
    state.phase = 0;
    state.active = 1;
    state.a = gain;
  }
  state.lastTrig = on ? 1 : 0;
  if (!state.active) {
    const idle = nodeGraphSineKickIdleOut(sharp);
    state.a = 0;
    return idle;
  }
  const env = nodeGraphSineKickAmp01(state.t, decay);
  if (env <= 1e-6) {
    state.active = 0;
    state.a = 0;
    return nodeGraphSineKickIdleOut(sharp);
  }
  const hz = nodeGraphSineKickHz(state.t, pitchHz, punchOct, decay, pitchCvRatio);
  const nyquist = sr * 0.45;
  const f = hz > nyquist ? nyquist : hz;
  // sineToSquare(φ) = cos(2πφ) at sharpness 0. Offset −0.25 → sin, starts at 0.
  const wave = nodeGraphSineKickSineToSquare(state.phase - 0.25, sharp, f, sr);
  const a = gain * env;
  const out = a * wave;
  const u = 1 - env;
  const pt = typeof nodeGraphKickEnvelopeQuarterPoint === "function"
    ? nodeGraphKickEnvelopeQuarterPoint(u, sharp)
    : { x: 0, y: -1 };
  state.a = a;
  state.phase += f / sr;
  if (state.phase >= 1 || state.phase < 0) {
    state.phase -= Math.floor(state.phase);
  }
  state.t += dt;
  return {
    Out: Number.isFinite(out) ? out : 0,
    A: a,
    U: u,
    X: pt.x,
    Y: pt.y,
    f,
  };
}
