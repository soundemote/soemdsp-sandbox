// Mode Resonator — complex 2-pole ring for predictable "ping" resonance.
// Not analog modeling / self-osc howl. Sole purpose: stable, measurable ring at f0.
//
//   y[n] = 2 r cos(ω) y[n-1] − r² y[n-2] + g x[n]
//
// Poles at r·e^{±jω} with ω = 2π f0/fs → rings at exactly f0 Hz (digital).
// Decay τ (seconds to 1/e of envelope): r = exp(−1/(τ·fs)); Hold → r = 1.
// Impulse-normalized: g = sin(ω)·amplitude so envelope peak ≈ Amplitude across f0.

function createNodeGraphModeResonatorState() {
  return {
    y1: 0,
    y2: 0,
    lastF: NaN,
    lastDecay: NaN,
    lastHold: -1,
    lastRate: NaN,
    lastAmp: NaN,
    // cached coeffs
    a1: 0, // 2 r cos(ω)
    a2: 0, // −r²
    g: 0,
  };
}

/**
 * @param {number} decaySec time to decay to 1/e of envelope
 * @param {number} sampleRate
 * @param {boolean} hold if true, r = 1 (undamped / forever)
 */
function nodeGraphModeResonatorRadius(decaySec, sampleRate, hold) {
  if (hold) return 1;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const tau = Math.max(1e-6, Number(decaySec) || 1e-6);
  // r = e^{−1/(τ fs)}  →  τ is 1/e envelope time
  let r = Math.exp(-1 / (tau * rate));
  if (!(r >= 0) || !Number.isFinite(r)) r = 0;
  if (r > 1) r = 1;
  // Keep strictly < 1 unless Hold (numerical safety for long decays)
  if (r > 1 - 1e-12) r = 1 - 1e-12;
  return r;
}

function nodeGraphModeResonatorEnsure(
  state,
  frequencyHz,
  decaySec,
  hold,
  amplitude,
  sampleRate,
) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Math.min(rate * 0.499, Number(frequencyHz) || 0));
  const decay = Math.max(0, Number(decaySec) || 0);
  const isHold = hold ? 1 : 0;
  const amp = Number(amplitude);
  const level = Number.isFinite(amp) ? amp : 1;

  if (
    state.lastF === f
    && state.lastDecay === decay
    && state.lastHold === isHold
    && state.lastRate === rate
    && state.lastAmp === level
  ) {
    return;
  }

  state.lastF = f;
  state.lastDecay = decay;
  state.lastHold = isHold;
  state.lastRate = rate;
  state.lastAmp = level;

  // Resonant frequency: digital angle ω = 2π f / fs (exact ring frequency of this recurrence).
  let omega = (2 * Math.PI * f) / rate;
  if (omega < 1e-12) omega = 1e-12;
  if (omega > Math.PI - 1e-12) omega = Math.PI - 1e-12;

  const r = nodeGraphModeResonatorRadius(decay, rate, isHold === 1);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);

  state.a1 = 2 * r * cosw;
  state.a2 = -(r * r);
  // Normalized impulse: with g=sin(ω), h[n] ≈ r^n sin((n+1)ω) → peak envelope ≈ 1, then × Amplitude.
  // Floor sin(ω) so DC-ish doesn't go fully silent (still quiet at very low f).
  const sinAbs = Math.abs(sinw);
  const gNorm = sinAbs < 1e-6 ? 1e-6 : sinAbs;
  state.g = gNorm * level;
}

/**
 * One sample. Input is the excitation (impulse, click, audio).
 */
function nodeGraphModeResonatorSample(
  state,
  input,
  frequencyHz,
  decaySec,
  hold,
  amplitude,
  sampleRate,
) {
  if (!state || typeof state !== "object") return 0;
  nodeGraphModeResonatorEnsure(state, frequencyHz, decaySec, hold, amplitude, sampleRate);

  const x = Number(input) || 0;
  // y = g x + a1 y1 + a2 y2   with a2 = −r² already
  let y = state.g * x + state.a1 * state.y1 + state.a2 * state.y2;
  if (!Number.isFinite(y)) y = 0;
  if (y > 1) y = 1;
  else if (y < -1) y = -1;
  // Kill denormals
  if (y > -1e-30 && y < 1e-30) y = 0;

  state.y2 = state.y1;
  state.y1 = y;
  return y;
}

/** Rising-edge trigger: inject a unit impulse this sample (adds to audio in). */
function nodeGraphModeResonatorTriggerEdge(state, trigger, threshold = 0.5) {
  if (!state || typeof state !== "object") return 0;
  if (state._lastTrig == null) state._lastTrig = 0;
  const t = Number(trigger) || 0;
  const on = t > threshold;
  const edge = on && !state._lastTrig;
  state._lastTrig = on ? 1 : 0;
  return edge ? 1 : 0;
}
