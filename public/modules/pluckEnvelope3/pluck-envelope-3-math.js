// Ping Envelope — twin of native pluck_envelope_3.cpp (patches/pluck envelope 1.json).
// Asymmetric one-pole toward Trigger; Exp feedback → fall rate. Decay 0=short … 1=long.

const PLUCK3_RELEASE_HZ = 10;
const PLUCK3_EXP_SPAN = 5;

function createNodeGraphPluckEnvelope3State() {
  return {
    env: 0,
    fb: 0,
    lastTrig: 0,
    shotAttack: 0,
    shotDecay: 0.5,
    shotAmp: 1,
    hasShot: false,
    primed: false,
  };
}

/** UI Decay 0…1. Legacy `dampen` was inverted (0=long); convert if present. */
function nodeGraphPluckEnvelope3ReadDecay(params) {
  const decayRaw = Number(params?.decay);
  if (Number.isFinite(decayRaw)) {
    return Math.max(0, Math.min(1, decayRaw));
  }
  const dampenRaw = Number(params?.dampen);
  if (Number.isFinite(dampenRaw)) {
    return Math.max(0, Math.min(1, 1 - dampenRaw));
  }
  return 0.5;
}

function nodeGraphPluckEnvelope3Sample(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  const target = Number(input) || 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const liveAtk = Math.max(0, Number(params?.attack) || 0);
  const liveDecay = nodeGraphPluckEnvelope3ReadDecay(params);
  const liveAmpN = Number(params?.amplitude);
  const liveAmp = Number.isFinite(liveAmpN) ? liveAmpN : 1;
  const recalcRaw = params?.recalculateOnTrigger;
  const latch = !(recalcRaw === "Off" || recalcRaw === false || Number(recalcRaw) === 0);

  const trigHigh = target > 0;
  const trigRise = !(Number(state.lastTrig) > 0) && trigHigh;
  state.lastTrig = trigHigh ? 1 : 0;

  if (!latch || trigRise || !state.hasShot) {
    state.shotAttack = liveAtk;
    state.shotDecay = liveDecay;
    state.shotAmp = liveAmp;
    state.hasShot = true;
  }

  if (!state.primed) {
    state.primed = true;
    state.env = target;
    state.fb = 0;
  } else {
    let ka = 1;
    if (state.shotAttack > 0) {
      ka = 1 - Math.exp(-1 / (state.shotAttack * sr));
      if (!Number.isFinite(ka)) ka = 1;
      if (ka < 0) ka = 0;
      if (ka > 1) ka = 1;
    }

    const relHz = (Number(state.fb) || 0) * PLUCK3_RELEASE_HZ;
    let kr = 0;
    if (relHz > 0) {
      if (relHz >= sr * 0.5) kr = 1;
      else {
        kr = 1 - Math.exp((-2 * Math.PI * relHz) / sr);
        if (!Number.isFinite(kr)) kr = 0;
        if (kr < 0) kr = 0;
        if (kr > 1) kr = 1;
      }
    }

    const cur = Number(state.env) || 0;
    const delta = target - cur;
    state.env = cur + delta * (delta >= 0 ? ka : kr);
    if (!Number.isFinite(state.env)) state.env = 0;
  }

  let x = state.env + (0.5 - state.shotDecay);
  if (x < 0) x = 0;
  if (x > 1) x = 1;
  if (!(x > 0)) state.fb = 0;
  else if (x >= 1) state.fb = 1;
  else {
    const y = Math.pow(10, PLUCK3_EXP_SPAN * (x - 1));
    state.fb = !Number.isFinite(y) || y < 0 ? 0 : y > 1 ? 1 : y;
  }

  const out = state.env * state.shotAmp;
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphPluckEnvelope3PreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = nodeGraphPluckEnvelope3ReadDecay(params);
  const amplitude = Math.max(0, Number(params.amplitude) ?? 1);
  const sr = 2000;
  const state = createNodeGraphPluckEnvelope3State();
  const n = Math.max(48, Math.round(Number(points) || 160));
  // Hold Trigger high through attack settle (~5τ → ~99%), then show fall.
  // Old preview used a 20ms gate + cold-start snap → clipped peak, no rising A.
  const gateHoldSec = attack > 0 ? Math.max(0.05, attack * 5) : 0.02;
  const fallSec = 0.45 + decay * 0.9;
  const totalSec = Math.max(0.35, gateHoldSec + fallSec);
  const totalSamples = Math.max(n, Math.ceil(totalSec * sr));
  const gateHigh = Math.max(1, Math.floor(gateHoldSec * sr));
  const step = Math.max(1, Math.floor(totalSamples / n));
  const out = [];
  // Rest-prime so the rising edge uses one-pole Attack (not inertial first-sample snap).
  state.primed = true;
  state.env = 0;
  state.fb = 0;
  state.lastTrig = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const y = nodeGraphPluckEnvelope3Sample(
      state,
      i < gateHigh ? 1 : 0,
      { attack, decay, amplitude: 1, recalculateOnTrigger: 1 },
      sr,
    );
    if (i % step === 0 || i === totalSamples - 1) {
      out.push({ t: i / Math.max(1, totalSamples - 1), y: Math.max(0, Math.min(1, y)) });
    }
  }
  return {
    points: out,
    total: totalSec,
    guideT: Math.min(0.95, gateHoldSec / Math.max(1e-9, totalSec)),
    ampView: Math.min(1, amplitude),
    labels: { left: "A", right: "D" },
  };
}
