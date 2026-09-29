// Acoustic Pluck -- face PreviewCurve helpers (native acoustic_pluck.cpp owns audio).
// Bake of patches/modulator breadboards/pluck envelope.json:
//   Curve AR + Env->invert->atten(feedback,bias)->Amp Curve Exp->Release unit MOD.
// Not an audio-path twin: PreviewCurve only for envelopeCurve face.

const ACOUSTIC_PLUCK_FB_DELAY = 128;
const ACOUSTIC_PLUCK_EXP_SPAN = 5;
const ACOUSTIC_PLUCK_LN10 = 2.302585092994046;
const ACOUSTIC_PLUCK_REL_MIN = 0;
const ACOUSTIC_PLUCK_REL_MAX = 10;
const ACOUSTIC_PLUCK_KT_AMPLITUDE = 0.31250587099718496;
const ACOUSTIC_PLUCK_KT_OFFSET = -0.1;
const ACOUSTIC_PLUCK_ATTACK_MIN = 0;
const ACOUSTIC_PLUCK_ATTACK_MAX = 5;

function createNodeGraphAcousticPluckState() {
  const ar =
    typeof createNodeGraphCurveAttackReleaseState === "function"
      ? createNodeGraphCurveAttackReleaseState()
      : null;
  return {
    ar,
    fbDelay: new Float64Array(ACOUSTIC_PLUCK_FB_DELAY),
    fbIdx: 0,
  };
}

function nodeGraphAcousticPluckAmpCurveExp(input) {
  let x = Number(input);
  if (!Number.isFinite(x)) x = 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const y = Math.exp(ACOUSTIC_PLUCK_EXP_SPAN * (x - 1) * ACOUSTIC_PLUCK_LN10);
  if (!Number.isFinite(y) || y < 0) return 0;
  return y > 1 ? 1 : y;
}

function nodeGraphAcousticPluckFoldUnitMod(base, mod, minV, maxV) {
  const range = maxV - minV;
  const m = Number(mod);
  const add = Number.isFinite(m) ? m : 0;
  const b = Number(base);
  const baseN = Number.isFinite(b) ? b : 0;
  if (!(range > 0) || add === 0) {
    return Math.max(minV, Math.min(maxV, baseN));
  }
  const baseUnit = (baseN - minV) / range;
  return Math.max(minV, Math.min(maxV, minV + (baseUnit + add) * range));
}

function nodeGraphAcousticPluckSample(state, gate, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  if (!state.ar || typeof nodeGraphCurveAttackReleaseSample !== "function") return 0;

  let attack = Math.max(0, Number(params?.attack) || 0);
  if (params?.keyTrackConnected === true) {
    const kt = Math.max(0, Math.min(1, Number(params?.keyTrack) || 0));
    const attackMod = (-kt) * ACOUSTIC_PLUCK_KT_AMPLITUDE + ACOUSTIC_PLUCK_KT_OFFSET;
    attack = nodeGraphAcousticPluckFoldUnitMod(
      attack, attackMod, ACOUSTIC_PLUCK_ATTACK_MIN, ACOUSTIC_PLUCK_ATTACK_MAX,
    );
  }
  const attackShapeRaw = Number(params?.attackShape);
  const releaseRaw = Number(params?.release);
  const releaseShapeRaw = Number(params?.releaseShape);
  const feedback = Number(params?.feedback);
  const bias = Number(params?.bias);
  const amplitudeRaw = Number(params?.amplitude);

  const delayed = state.fbDelay[state.fbIdx] || 0;
  const fbAmt = Number.isFinite(feedback) ? feedback : 0.6804373070396221;
  const fbBias = Number.isFinite(bias) ? bias : 0.9435542410230598;
  const atten = (-delayed) * fbAmt + fbBias;
  const releaseMod = nodeGraphAcousticPluckAmpCurveExp(atten);
  const relBase = Number.isFinite(releaseRaw) && releaseRaw >= 0
    ? releaseRaw
    : 0.11715292599242004;
  const effRelease = nodeGraphAcousticPluckFoldUnitMod(
    relBase,
    releaseMod,
    ACOUSTIC_PLUCK_REL_MIN,
    ACOUSTIC_PLUCK_REL_MAX,
  );

  const env = nodeGraphCurveAttackReleaseSample(
    state.ar,
    gate,
    {
      attack,
      attackShape: Number.isFinite(attackShapeRaw) ? attackShapeRaw : -0.07,
      release: effRelease,
      releaseShape: Number.isFinite(releaseShapeRaw) ? releaseShapeRaw : 1,
      amplitude: Number.isFinite(amplitudeRaw) ? amplitudeRaw : 1,
      inputMode: params?.inputMode,
      updateOnTrigger: params?.updateOnTrigger,
    },
    sampleRate,
  );
  const envSafe = Number.isFinite(env) ? env : 0;
  state.fbDelay[state.fbIdx] = Math.max(0, Math.min(1, envSafe));
  state.fbIdx = (state.fbIdx + 1) % ACOUSTIC_PLUCK_FB_DELAY;
  return envSafe;
}

function nodeGraphAcousticPluckPreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, Number(params.attack) || 0);
  const release = Math.max(0, Number(params.release) || 0.11715292599242004);
  const attackShape = Number(params.attackShape);
  const releaseShape = Number(params.releaseShape);
  const feedback = Number(params.feedback);
  const bias = Number(params.bias);
  const amplitude = Math.max(0, Number(params.amplitude) || 1);
  const sr = 2000;
  const state = createNodeGraphAcousticPluckState();
  const n = Math.max(48, Math.round(Number(points) || 160));
  const hold = Math.max(0.04, Math.min(0.25, (attack + release) * 0.2 || 0.06));
  const gateHigh = Math.max(attack + hold, 0.02);
  const total = Math.max(gateHigh + Math.min(release * 4, 2.5) + 0.05, 0.12);
  const out = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    const t = (i / Math.max(1, n - 1)) * total;
    const gate = t < gateHigh ? 1 : 0;
    const y = nodeGraphAcousticPluckSample(state, gate, {
      attack,
      keyTrack: Number(params.keyTrack) || 0,
      keyTrackConnected: params.keyTrackConnected === true,
      attackShape: Number.isFinite(attackShape) ? attackShape : -0.07,
      release,
      releaseShape: Number.isFinite(releaseShape) ? releaseShape : 1,
      feedback: Number.isFinite(feedback) ? feedback : 0.6804373070396221,
      bias: Number.isFinite(bias) ? bias : 0.9435542410230598,
      amplitude,
      inputMode: 1,
      updateOnTrigger: 0,
    }, sr);
    out[i] = y;
    if (y > peak) peak = y;
  }
  return {
    points: out,
    total,
    gateHigh,
    guideT: gateHigh / Math.max(1e-9, total),
    ampView: Math.min(1, peak > 0 ? peak : amplitude),
  };
}
