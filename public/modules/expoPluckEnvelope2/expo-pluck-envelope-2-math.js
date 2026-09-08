// Expo Pluck Envelope 2 — SoEmPluck / soemdsp::PluckEnvelope (mirrors native).

const EXPO_PLUCK2_MIN = 1e-8;
const EXPO_PLUCK2_MAX_FB = 1 - 1e-6;

function createExpoPluckEnvelope2State() {
  return {
    autoReleasePhasor: 0,
    currentValue: 0,
    decayIncrement: 0,
    lastRelease: 0,
    lastTrigger: 0,
    phasor: 0,
    releaseIncrement: 0,
    peak: 0,
    stage: "off", // off | attack | decay | release
  };
}

function expoPluck2ExponentialCurve(value, skew) {
  const v = Math.min(1, Math.max(0, Number(value) || 0));
  let s = Math.min(0.99, Math.max(-0.99, Number(skew) || 0));
  if (s === 0) return v;
  const c = 0.5 * (s + 1);
  const a = 2 * Math.log10((1 - c) / c);
  const denom = 1 - Math.exp(a);
  return denom === 0 ? v : (1 - Math.exp(v * a)) / denom;
}

function expoPluck2PrepareForDecay(state, rate, peak) {
  state.phasor = 0;
  state.autoReleasePhasor = 0;
  state.currentValue = peak;
  state.decayIncrement = (state.currentValue - 1) / Math.max(1, rate) / 50;
}

function expoPluck2DecayFeedback(state, p) {
  let finalDecayMod = p.sustain;
  if (state.phasor < 1) {
    let dmc = p.envelopeCurve;
    if (dmc > 0.99) dmc = 0.99;
    if (dmc < -0.99) dmc = -0.99;
    if (dmc === 0) dmc = -1e-8;
    const shaped = expoPluck2ExponentialCurve(state.phasor, dmc);
    // decay_ + map0to1(curve(phasor), top, bottom)
    finalDecayMod = p.decaySlopeMid
      + p.decaySlopeTop
      + shaped * (p.decaySlopeBottom - p.decaySlopeTop);
  }
  return Math.min(EXPO_PLUCK2_MAX_FB, Math.exp(-finalDecayMod * 10));
}

function expoPluck2Sanitize(params = {}) {
  return {
    attack: Math.max(0, Number(params.attack) || 0),
    decaySlopeTop: Math.min(1.8, Math.max(0.001, Number(params.decaySlopeTop) || 0.9)),
    decaySlopeMid: Math.min(1, Math.max(0.1, Number(params.decaySlopeMid) || 0.7)),
    decaySlopeBottom: Math.min(6, Math.max(0.01, Number(params.decaySlopeBottom) || 4.8)),
    sustain: Math.min(1.4, Math.max(0, Number(params.sustain) || 1.2)),
    release: Math.min(1, Math.max(0, Number(params.release) || 0.86)),
    autoReleaseTime: Math.min(500, Math.max(0, Number(params.autoReleaseTime) || 0)),
    envelopeCurve: Math.min(1, Math.max(-1, Number(params.envelopeCurve) || -0.5)),
    envelopeDamping: Math.min(100, Math.max(0, Number(params.envelopeDamping) || 15)),
    velocity: Math.min(1, Math.max(0, Number(params.velocity) || 1)),
    velocitySensitivity: Math.min(1, Math.max(0, Number(params.velocitySensitivity) || 0.5)),
    level: Math.max(0, Number(params.level) || 0),
  };
}

/**
 * Cheap preview contour for the face (SoEm defaults).
 */
function expoPluckEnvelope2PreviewCurve(params = {}, pointCount = 128, sampleRate = 800) {
  const state = createExpoPluckEnvelope2State();
  const sr = Math.max(100, Number(sampleRate) || 800);
  const pts = Math.max(48, Math.floor(Number(pointCount) || 128));
  const p = expoPluck2Sanitize({ ...params, level: 1 });
  const series = [];
  const maxSamples = Math.min(Math.floor(sr * 4), 6000);
  for (let i = 0; i < maxSamples; i += 1) {
    const y = expoPluckEnvelope2Sample(state, {
      trigger: i === 0 ? 1 : 0,
      releaseGate: 0,
      ...p,
    }, sr);
    series.push(Math.max(0, Math.min(1, y)));
    if (i > 8 && state.stage === "off") break;
  }
  if (!series.length) series.push(0);
  const total = series.length;
  const points = [];
  const steps = Math.max(pts - 1, 1);
  for (let i = 0; i <= steps; i += 1) {
    const idx = Math.min(total - 1, Math.round((i / steps) * (total - 1)));
    points.push({ t: i / steps, y: series[idx] });
  }
  return { points, totalSec: total / sr, level: Math.min(1, Number(params.level) || 1) };
}

/**
 * @param {object} params
 * @param {number} params.trigger — Trigger jack
 * @param {number} params.releaseGate — Release jack (not the Release knob)
 * @param {number} params.release — Release knob 0…1
 */
function expoPluckEnvelope2Sample(state, params, rate) {
  const sr = Math.max(1, Number(rate) || 44100);
  const period = 1 / sr;
  const trig = Number(params.trigger) || 0;
  const relGate = Number(params.releaseGate) || 0;
  const p = expoPluck2Sanitize(params);

  if (state.lastTrigger <= 0 && trig > 0) {
    const peak = (1 - p.velocitySensitivity) + p.velocity * p.velocitySensitivity;
    state.peak = peak;
    if (p.attack <= EXPO_PLUCK2_MIN) {
      state.stage = "decay";
      expoPluck2PrepareForDecay(state, sr, peak);
    } else {
      state.stage = "attack";
      state.currentValue = 0;
    }
  }
  if (state.lastRelease <= 0 && relGate > 0) {
    if (state.stage !== "release") {
      state.stage = "release";
      state.releaseIncrement = state.currentValue / sr / 50;
    }
  }
  state.lastTrigger = trig;
  state.lastRelease = relGate;

  const fbAttack = 1 / (Math.max(p.attack, EXPO_PLUCK2_MIN) * sr);
  const fbRelease = Math.min(EXPO_PLUCK2_MAX_FB, Math.exp(-p.release * 10));
  const autoRelSec = p.autoReleaseTime / 1000;
  const autoInc = autoRelSec <= EXPO_PLUCK2_MIN
    ? 0
    : 1 / (Math.max(autoRelSec, EXPO_PLUCK2_MIN) * sr);
  const phasorInc = p.envelopeDamping / sr;

  if (state.stage === "attack") {
    state.currentValue += period + state.currentValue * fbAttack;
    if (state.currentValue >= state.peak) {
      state.stage = "decay";
      expoPluck2PrepareForDecay(state, sr, state.peak);
    }
  } else if (state.stage === "decay") {
    const fb = expoPluck2DecayFeedback(state, p);
    state.currentValue -= state.decayIncrement
      + state.currentValue * state.currentValue * fb;
    state.phasor += phasorInc;
    state.autoReleasePhasor += autoInc;
    if (autoInc > 0 && state.autoReleasePhasor >= 1) {
      state.stage = "release";
      state.releaseIncrement = state.currentValue / sr / 50;
    }
    if (state.currentValue < 0) {
      state.currentValue = 0;
      state.phasor = 0;
      state.autoReleasePhasor = 0;
      state.stage = "off";
    }
  } else if (state.stage === "release") {
    state.currentValue -= state.releaseIncrement
      + state.currentValue * state.currentValue * fbRelease;
    if (state.currentValue <= 0) {
      state.currentValue = 0;
      state.phasor = 0;
      state.autoReleasePhasor = 0;
      state.stage = "off";
    }
  }

  const out = Math.max(0, state.currentValue * p.level);
  return Number.isFinite(out) ? out : 0;
}
