// Expo Pluck Envelope — offline/render math (mirrors native KS Env CV).
// Comb-style: Decay long, Frequency = material, Damping 0…1.
// Attack = 1-pole LPF toward peak. Recalc On Trig latches by default.

const EXPO_PLUCK_IDLE_FLOOR = 1e-5;
const EXPO_PLUCK_PEAK = 1;

function createExpoPluckEnvelopeState() {
  return {
    env: 0,
    lastTrigger: 0,
    lastGate: 0,
    stage: "idle", // idle | attack | hold | decay
    modeGate: false,
    live: null,
    shot: null,
  };
}

function expoPluckSanitize(p) {
  const out = { ...p };
  out.attack = Math.max(0, Number(out.attack) || 0);
  out.decay = Math.max(0.01, Number(out.decay) || 5);
  out.frequency = Math.min(20000, Math.max(10, Number(out.frequency) || 110));
  out.damping = Math.min(1, Math.max(0, Number(out.damping) || 0));
  out.level = Math.max(0, Number(out.level) || 0);
  return out;
}

function expoPluckOnePoleToward(env, target, attackSec, rate) {
  const sr = Math.max(1, rate);
  if (!Number.isFinite(attackSec) || attackSec <= 1 / sr) return target;
  const coeff = 1 - Math.exp(-1 / (attackSec * sr));
  return env + (target - env) * coeff;
}

function expoPluckKsMul(frequencyHz, damping01, decaySec, rate) {
  const f0 = Math.max(10, frequencyHz);
  const D = Math.min(1, Math.max(0, damping01));
  const T = Math.max(0.01, decaySec);
  const sr = Math.max(1, rate);
  // Comb loop LPF uses coef=D² (D=1 kills feedback → impulse). Env approx:
  // collapse effective Decay by (1-D)² so 0 = open ring, 1 = tiny impulse.
  if (D >= 1 - 1e-9) return 0;
  const open = 1 - D;
  const open2 = open * open;
  const tEff = T * open2;
  if (!(tEff > 1e-12)) return 0;
  const x = -f0 / (tEff * sr);
  if (x <= -80) return 0;
  return Math.exp(x);
}

/**
 * Cheap preview contour for the face: Attack (1-pole to 1) then KS decay to floor.
 * Single forward pass — O(samples), then resampled to pointCount.
 * Returns { points: [{ t, y }], attackEndT, totalSec }.
 */
function expoPluckEnvelopePreviewCurve(params = {}, pointCount = 128, sampleRate = 800) {
  const p = expoPluckSanitize(params);
  const sr = Math.max(100, Number(sampleRate) || 800);
  const pts = Math.max(48, Math.floor(Number(pointCount) || 128));
  const attack = Math.max(0, p.attack);
  const mul = expoPluckKsMul(p.frequency, p.damping, p.decay, sr);
  const series = [];
  let env = 0;
  let stage = "attack";
  let attackEndSample = 0;
  // Cap preview length so the face stays cheap (≈2s @ sr, or until floor).
  const maxSamples = Math.min(Math.floor(sr * 2.5), 4000);
  for (let s = 0; s < maxSamples; s += 1) {
    if (stage === "attack") {
      env = expoPluckOnePoleToward(env, EXPO_PLUCK_PEAK, attack, sr);
      if (env >= EXPO_PLUCK_PEAK - 1e-4) {
        env = EXPO_PLUCK_PEAK;
        stage = "decay";
        attackEndSample = s;
      }
    } else {
      env *= mul;
      if (env < EXPO_PLUCK_IDLE_FLOOR) {
        env = 0;
        series.push(env);
        break;
      }
    }
    series.push(Math.max(0, Math.min(1, env)));
    if (stage === "decay" && env <= 0) {
      break;
    }
  }
  if (!series.length) {
    series.push(0);
  }
  const totalSamples = series.length;
  const totalSec = totalSamples / sr;
  const points = [];
  const steps = Math.max(pts - 1, 1);
  for (let i = 0; i <= steps; i += 1) {
    const idx = Math.min(totalSamples - 1, Math.round((i / steps) * (totalSamples - 1)));
    points.push({ t: i / steps, y: series[idx] });
  }
  return {
    points,
    attackEndT: totalSamples > 1 ? attackEndSample / (totalSamples - 1) : 0,
    totalSec,
    level: Math.min(1, p.level),
  };
}

function expoPluckEnvelopeSample(state, params, rate) {
  const sr = Math.max(1, Number(rate) || 44100);
  const live = expoPluckSanitize({
    attack: params.attack,
    decay: params.decay,
    frequency: params.frequency,
    damping: params.damping,
    level: params.level,
  });
  state.live = live;

  const recalcRaw = params.recalculateOnTrigger;
  const latch = !(recalcRaw === "Off" || recalcRaw === false || Number(recalcRaw) === 0);
  if (!latch || !state.shot) {
    state.shot = { ...live };
  }

  const trig = Number(params.trigger) || 0;
  const gat = Number(params.gate) || 0;
  const trigRise = state.lastTrigger <= 0 && trig > 0;
  const gateRise = state.lastGate <= 0 && gat > 0;
  const gateFall = state.lastGate > 0 && gat <= 0;
  state.lastTrigger = trig;
  state.lastGate = gat;

  const strike = (gateMode) => {
    state.modeGate = Boolean(gateMode);
    if (latch) state.shot = { ...live };
    state.stage = "attack";
  };

  if (gateRise) strike(true);
  else if (trigRise) strike(gat > 0);
  else if (gateFall && state.modeGate
    && (state.stage === "attack" || state.stage === "hold")) {
    state.stage = "decay";
  }

  const p = state.shot || live;

  if (state.stage === "attack") {
    state.env = expoPluckOnePoleToward(state.env, EXPO_PLUCK_PEAK, p.attack, sr);
    if (state.env >= EXPO_PLUCK_PEAK - 1e-4) {
      state.env = EXPO_PLUCK_PEAK;
      state.stage = state.modeGate && gat > 0 ? "hold" : "decay";
    }
  } else if (state.stage === "hold") {
    state.env = expoPluckOnePoleToward(state.env, EXPO_PLUCK_PEAK, p.attack, sr);
    if (gat <= 0) state.stage = "decay";
  } else if (state.stage === "decay") {
    state.env *= expoPluckKsMul(p.frequency, p.damping, p.decay, sr);
    if (!Number.isFinite(state.env) || state.env < EXPO_PLUCK_IDLE_FLOOR) {
      state.env = 0;
      state.stage = "idle";
    }
  } else {
    state.env = 0;
  }

  const out = Math.max(0, state.env * p.level);
  return Number.isFinite(out) ? out : 0;
}
