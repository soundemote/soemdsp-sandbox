// Kick Envelope — one-shot analog envelope only (T → A).
//
// A is 0…1 (mapped through Low/High). It is not a frequency and not audio.
// Rising T starts a body from High → Low over Speed, then rests at Low.
// Sharpness 0 = sine (smooth), 1 = square (hold then snap).

const NODE_GRAPH_KICK_ENVELOPE_DURATION_S = 0.2;

function nodeGraphKickEnvelopeDurationS(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n <= 0) {
    return NODE_GRAPH_KICK_ENVELOPE_DURATION_S;
  }
  return Math.max(0.001, Math.min(30, n));
}

function nodeGraphKickEnvelopeClampUnit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphKickEnvelopeReadUnit(primary, legacy, fallback) {
  const p = Number(primary);
  if (Number.isFinite(p)) {
    return nodeGraphKickEnvelopeClampUnit(p, fallback);
  }
  const old = Number(legacy);
  if (Number.isFinite(old) && old >= 0 && old <= 1) {
    return old;
  }
  return fallback;
}

function createNodeGraphKickEnvelopeState() {
  return {
    t: 0,
    lastTrig: 0,
    active: 0,
    a: 0,
  };
}

function nodeGraphKickEnvelopeApplyAmp(a, amplitude) {
  const g = Number(amplitude);
  const gain = Number.isFinite(g) ? Math.max(0, g) : 1;
  const y = (Number(a) || 0) * gain;
  return Number.isFinite(y) ? y : 0;
}

function nodeGraphKickEnvelopeIdleOut(low = 0, sharpness = 0, amplitude = 1) {
  const a = nodeGraphKickEnvelopeApplyAmp(nodeGraphKickEnvelopeClampUnit(low, 0), amplitude);
  const pt = nodeGraphKickEnvelopeQuarterPoint(1, sharpness);
  return { A: a, U: 1, X: pt.x, Y: pt.y };
}

/**
 * Unit envelope 1→0 over progress u.
 * Sharpness 0 = cosine (round). 1 = rectangular hold then snap.
 */
function nodeGraphKickEnvelopeEnv01(localT, sharpness) {
  const t = Math.max(0, Math.min(1, Number(localT) || 0));
  const s = nodeGraphKickEnvelopeClampUnit(sharpness, 0);
  const sineEnv = Math.cos((Math.PI * t) / 2);
  const squareEnv = t < 1 ? 1 : 0;
  const env = sineEnv * (1 - s) + squareEnv * s;
  if (!Number.isFinite(env) || env < 0) return 0;
  return env > 1 ? 1 : env;
}

function nodeGraphKickEnvelopeCurveIsExpo(curve) {
  return Math.round(Number(curve) || 0) !== 0;
}

/**
 * Map unit env 1→0 onto Low…High.
 * Linear: lerp. Exponential: 2^k unit warp (pitch-style).
 */
function nodeGraphKickEnvelopeMapA(env01, low, high, curve = 0) {
  const a0 = nodeGraphKickEnvelopeClampUnit(low, 0);
  const a1 = nodeGraphKickEnvelopeClampUnit(high, 1);
  const e = nodeGraphKickEnvelopeClampUnit(env01, 0);
  if (!nodeGraphKickEnvelopeCurveIsExpo(curve)) {
    return a0 + (a1 - a0) * e;
  }
  const k = 4;
  const den = (2 ** k) - 1;
  const w = den > 0 ? ((2 ** (k * e)) - 1) / den : e;
  const y = a0 + (a1 - a0) * (Number.isFinite(w) ? w : e);
  return Math.max(0, Math.min(1, y));
}

/** Ellipsoid sine→square (same law as RoundShape). */
function nodeGraphKickEnvelopeSineToSquare(phaseCycles, shape, frequencyHz, sampleRate) {
  if (typeof nodeGraphEllipsoidSineToSquare === "function") {
    return nodeGraphEllipsoidSineToSquare(phaseCycles, shape, frequencyHz, sampleRate);
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const angle = (Number(phaseCycles) || 0) * Math.PI * 2;
  const sinPhase = Math.sin(angle);
  const cosPhase = Math.cos(angle);
  let c = 1 - nodeGraphKickEnvelopeClampUnit(shape, 0);
  const cMin = Math.max(0, Math.min(1, (Math.PI * 2 * f) / sr));
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

/** Bottom-left quarter: 0 = left (−1,0), 1 = bottom (0,−1). Sharpness = sine→square. */
function nodeGraphKickEnvelopeQuarterPoint(progress01, sharpness) {
  const u = nodeGraphKickEnvelopeClampUnit(progress01, 0);
  const s = nodeGraphKickEnvelopeClampUnit(sharpness, 0);
  const phase = 0.5 + u * 0.25;
  if (typeof nodeGraphEllipsoidSineToSquareVector === "function") {
    const v = nodeGraphEllipsoidSineToSquareVector(phase, {
      amplitude: 1,
      shape: s,
      frequencyHz: 0,
      sampleRate: 44100,
    });
    return {
      x: Number(v["Bi X"]) || 0,
      y: Number(v["Bi Y"]) || 0,
    };
  }
  if (!(s > 0)) {
    const th = Math.PI + u * Math.PI * 0.5;
    return { x: Math.cos(th), y: Math.sin(th) };
  }
  return {
    x: nodeGraphKickEnvelopeSineToSquare(phase, s, 0, 44100),
    y: nodeGraphKickEnvelopeSineToSquare(phase - 0.25, s, 0, 44100),
  };
}

function nodeGraphKickEnvelopePointForA(a, low, high, sharpness) {
  const a0 = nodeGraphKickEnvelopeClampUnit(low, 0);
  const a1 = nodeGraphKickEnvelopeClampUnit(high, 1);
  const span = a1 - a0;
  const norm = Math.abs(span) < 1e-9
    ? 1
    : nodeGraphKickEnvelopeClampUnit(1 - (nodeGraphKickEnvelopeClampUnit(a, a0) - a0) / span, 1);
  const pt = nodeGraphKickEnvelopeQuarterPoint(norm, sharpness);
  return { u: norm, x: pt.x, y: pt.y };
}

function nodeGraphKickEnvelopeSample(
  state,
  trigger,
  low,
  high,
  sharpness,
  sampleRate,
  curve = 0,
  speed = 0.2,
  amplitude = 1,
) {
  if (!state || typeof state !== "object") {
    return nodeGraphKickEnvelopeIdleOut(low, sharpness, amplitude);
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const a0 = nodeGraphKickEnvelopeClampUnit(low, 0);
  const a1 = nodeGraphKickEnvelopeClampUnit(high, 1);
  const s = nodeGraphKickEnvelopeClampUnit(sharpness, 0);
  const g = Number(trigger) || 0;
  const on = g > 0.5;
  if (on && !state.lastTrig) {
    state.t = 0;
    state.active = 1;
    state.a = a1;
  }
  state.lastTrig = on ? 1 : 0;
  if (!state.active) {
    const idle = nodeGraphKickEnvelopeIdleOut(a0, s, amplitude);
    state.a = idle.A;
    return idle;
  }
  const dur = nodeGraphKickEnvelopeDurationS(speed);
  const dt = 1 / Math.max(1e-4, dur * sr);
  state.t += dt;
  if (state.t >= 1) {
    state.t = 1;
    state.active = 0;
    const done = nodeGraphKickEnvelopeIdleOut(a0, s, amplitude);
    state.a = done.A;
    return done;
  }
  const env = nodeGraphKickEnvelopeEnv01(state.t, s);
  const a = nodeGraphKickEnvelopeApplyAmp(nodeGraphKickEnvelopeMapA(env, a0, a1, curve), amplitude);
  const pt = nodeGraphKickEnvelopeQuarterPoint(state.t, s);
  state.a = a;
  return { A: a, U: state.t, X: pt.x, Y: pt.y };
}
