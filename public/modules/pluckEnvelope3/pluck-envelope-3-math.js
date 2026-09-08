// Pluck Envelope — pure twin of native pluck_envelope_3.cpp.
// Attack time, Dampen, Recalc On Trig (latch params on rising Trigger).

const PLUCK3_RELEASE_HZ = 10;
const PLUCK3_EXP_SPAN = 5;

function createNodeGraphPluckEnvelope3State() {
  return {
    env: 0,
    fb: 0,
    lastTrig: 0,
    shotAttack: 0,
    shotDampen: 0.5,
    shotAmp: 1,
    hasShot: false,
    primed: false,
  };
}

function nodeGraphPluckEnvelope3Sample(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  const target = Number(input) || 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const liveAtk = Math.max(0, Number(params?.attack) || 0);
  let liveDamp = Number(params?.dampen);
  if (!Number.isFinite(liveDamp)) liveDamp = 0.5;
  liveDamp = liveDamp < 0 ? 0 : liveDamp > 1 ? 1 : liveDamp;
  const liveAmpN = Number(params?.amplitude);
  const liveAmp = Number.isFinite(liveAmpN) ? liveAmpN : 1;
  const recalcRaw = params?.recalculateOnTrigger;
  const latch = !(recalcRaw === "Off" || recalcRaw === false || Number(recalcRaw) === 0);

  const trigHigh = target > 0.5;
  const trigRise = !(Number(state.lastTrig) > 0.5) && trigHigh;
  state.lastTrig = trigHigh ? 1 : 0;

  if (!latch || trigRise || !state.hasShot) {
    state.shotAttack = liveAtk;
    state.shotDampen = liveDamp;
    state.shotAmp = liveAmp;
    state.hasShot = true;
  }

  if (!state.primed) {
    state.primed = true;
    state.env = target;
    state.fb = 0;
  }

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

  let x = state.env + (state.shotDampen - 0.5);
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
  const dampen = Math.max(0, Math.min(1, Number(params.dampen) ?? 0.5));
  const amplitude = Math.max(0, Number(params.amplitude) ?? 1);
  const sr = 2000;
  const state = createNodeGraphPluckEnvelope3State();
  const n = Math.max(48, Math.round(Number(points) || 160));
  const totalSec = Math.max(0.2, attack * 4 + 0.4);
  const totalSamples = Math.max(n, Math.ceil(totalSec * sr));
  const step = Math.max(1, Math.floor(totalSamples / n));
  const out = [];
  for (let i = 0; i < totalSamples; i += 1) {
    const y = nodeGraphPluckEnvelope3Sample(
      state,
      i === 0 ? 1 : 0,
      { attack, dampen, amplitude: 1, recalculateOnTrigger: 1 },
      sr,
    );
    if (i % step === 0 || i === totalSamples - 1) {
      out.push({ t: i / Math.max(1, totalSamples - 1), y: Math.max(0, Math.min(1, y)) });
    }
  }
  return {
    points: out,
    total: totalSec,
    guideT: Math.min(0.2, attack / Math.max(1e-9, totalSec)),
    ampView: Math.min(1, amplitude),
    labels: { left: "A", right: "D" },
  };
}
