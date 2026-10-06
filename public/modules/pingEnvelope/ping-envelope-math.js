// Ping Envelope face preview. Audio is native_modules/ping_envelope/ping_envelope.cpp.
// Model for Lin / Short (default): x = clamp(env+(0.5-Decay)) → exp → 0…10 Hz; amp on output.
// Model for Exp / Long: x = env×0.7718+(1-Decay) → exp → 0…1000 Hz; amp on target.

const PING_LONG_FEEDBACK_AMP = 0.7718;
const PING_LONG_RELEASE_HZ = 1000;
const PING_SHORT_RELEASE_HZ = 10;
const PING_EXP_SPAN = 5;

function nodeGraphPingEnvelopeModelIsShort(model) {
  if (model === "Short" || model === 0 || model === "0") return true;
  if (model === "Long" || model === 1 || model === "1") return false;
  const n = Number(model);
  if (Number.isFinite(n)) return n < 0.5;
  return true; // default Short
}

function createNodeGraphPingEnvelopeState() {
  return {
    env: 0,
    lastTrig: 0,
    shotAttack: 0,
    shotDecay: 0.5,
    shotAmp: 1,
    hasShot: false,
    primed: false,
  };
}

function nodeGraphPingEnvelopeSample(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  const inn = nodeGraphFiniteNumber(input);
  const sr = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const liveAtk = Math.max(0, nodeGraphFiniteNumber(params?.attack));
  const dRaw = Number(params?.decay);
  const liveDecay = Number.isFinite(dRaw) ? Math.max(0, Math.min(1, dRaw)) : 0.5;
  const liveAmpN = Number(params?.amplitude);
  const liveAmp = Number.isFinite(liveAmpN) ? liveAmpN : 1;
  const recalcRaw = params?.recalculateOnTrigger;
  const latch = !(recalcRaw === "Off" || recalcRaw === false || Number(recalcRaw) === 0);
  const isShort = nodeGraphPingEnvelopeModelIsShort(params?.model);

  const trigHigh = inn > 0;
  const trigRise = !(Number(state.lastTrig) > 0) && trigHigh;
  state.lastTrig = trigHigh ? 1 : 0;

  if (!latch || trigRise || !state.hasShot) {
    state.shotAttack = liveAtk;
    state.shotDecay = liveDecay;
    state.shotAmp = liveAmp;
    state.hasShot = true;
  }

  const target = isShort ? inn : inn * state.shotAmp;

  if (!state.primed) {
    state.primed = true;
    state.env = target;
  } else {
    let ka = 1;
    if (state.shotAttack > 0) {
      ka = 1 - Math.exp(-1 / (state.shotAttack * sr));
      if (!Number.isFinite(ka)) ka = 1;
      if (ka < 0) ka = 0;
      if (ka > 1) ka = 1;
    }

    let x;
    let releaseMax;
    if (isShort) {
      x = Math.max(0, Math.min(1, state.env + (0.5 - state.shotDecay)));
      releaseMax = PING_SHORT_RELEASE_HZ;
    } else {
      x = state.env * PING_LONG_FEEDBACK_AMP + (1 - state.shotDecay);
      releaseMax = PING_LONG_RELEASE_HZ;
    }
    let fb = 0;
    if (x > 0) {
      if (x >= 1) fb = 1;
      else {
        const y = Math.pow(10, PING_EXP_SPAN * (x - 1));
        fb = !Number.isFinite(y) || y < 0 ? 0 : y > 1 ? 1 : y;
      }
    }
    const relHz = Math.max(0, Math.min(releaseMax, fb * releaseMax));
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

    const cur = nodeGraphFiniteNumber(state.env);
    const delta = target - cur;
    state.env = cur + delta * (delta >= 0 ? ka : kr);
    if (!Number.isFinite(state.env)) state.env = 0;
  }

  const envOut = Number.isFinite(state.env) ? state.env : 0;
  return isShort ? envOut * state.shotAmp : envOut;
}

function nodeGraphPingEnvelopePreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, nodeGraphFiniteNumber(params.attack));
  const dRaw = Number(params.decay);
  const decay = Number.isFinite(dRaw) ? Math.max(0, Math.min(1, dRaw)) : 0.5;
  const amplitude = Math.max(0, Number(params.amplitude) ?? 1);
  const isShort = nodeGraphPingEnvelopeModelIsShort(params.model);
  const n = Math.max(48, Math.round(nodeGraphFiniteNumber(points, 160)));
  const gateHoldSec = attack > 0 ? Math.max(0.05, attack * 5) : 0.02;
  const feedbackAmp = isShort ? 1 : PING_LONG_FEEDBACK_AMP;
  const offset = isShort ? (0.5 - decay) : (1 - decay);
  const floor = feedbackAmp > 1e-9 ? Math.max(0, Math.min(1, -offset / feedbackAmp)) : 1;
  const settleEps = 0.008;
  const previewKey = (isShort ? "S" : "L") + "\0" + attack + "\0" + decay + "\0" + n;
  const previewCache = nodeGraphPingEnvelopePreviewCurve._cache;
  if (previewCache && previewCache.key === previewKey) {
    return {
      points: previewCache.points,
      total: previewCache.total,
      guideT: previewCache.guideT,
      ampView: 1,
      labels: previewCache.labels,
    };
  }
  const live = { attack, decay, amplitude, recalculateOnTrigger: 1, model: isShort ? "Short" : "Long" };
  const state = createNodeGraphPingEnvelopeState();
  state.primed = true;
  state.env = 0;
  state.lastTrig = 0;

  const trace = [{ t: 0, y: 0 }];
  let t = 0;
  const tCap = gateHoldSec + 12000;
  let peak = { t: 0, y: 0 };
  const releaseMax = isShort ? PING_SHORT_RELEASE_HZ : PING_LONG_RELEASE_HZ;
  for (let guard = 0; guard < 16000 && t < tCap; guard += 1) {
    const gateHigh = t < gateHoldSec - 1e-9;
    const target = gateHigh ? 1 : 0;
    const env = state.env;
    let dt;
    if (gateHigh) {
      const tau = attack > 1e-4 ? attack : 1 / 4000;
      const remain = Math.max(0, gateHoldSec - t);
      dt = Math.min(remain, Math.max(tau / 24, 1 / 4000));
      if (!(dt > 0)) break;
    } else if (env <= floor + settleEps) {
      break;
    } else {
      let x;
      if (isShort) {
        x = Math.max(0, Math.min(1, env + (0.5 - decay)));
      } else {
        x = env * PING_LONG_FEEDBACK_AMP + offset;
      }
      let fb = 0;
      if (x > 0) {
        if (x >= 1) fb = 1;
        else {
          const y = Math.pow(10, PING_EXP_SPAN * (x - 1));
          fb = !Number.isFinite(y) || y < 0 ? 0 : y > 1 ? 1 : y;
        }
      }
      const f = Math.max(0, Math.min(releaseMax, Math.max(0, fb) * releaseMax));
      const tau = f > 1e-8 ? 1 / (2 * Math.PI * f) : 0.25;
      let dtMax = tau / 10;
      const above = env - floor;
      if (env > 1e-6 && above < env) {
        const krMax = Math.min(0.2, Math.max(1e-4, (above * 0.45) / env));
        dtMax = Math.min(dtMax, -tau * Math.log(1 - krMax));
      }
      dt = Math.max(1 / 8000, Math.min(dtMax, tCap - t, 1));
    }
    nodeGraphPingEnvelopeSample(state, target, live, 1 / dt);
    if (!gateHigh && state.env < floor) {
      state.env = floor;
    }
    t += dt;
    const y = Math.max(0, Math.min(1, isShort ? state.env * amplitude : state.env));
    trace.push({ t, y });
    if (y >= peak.y) peak = { t, y };
  }

  const dynamicEnd = Math.max(t, gateHoldSec);
  const total = dynamicEnd;
  const out = new Float64Array(n);
  let i = 0;
  for (let p = 0; p < n; p += 1) {
    const tt = (p / Math.max(1, n - 1)) * total;
    while (i + 1 < trace.length && trace[i + 1].t < tt) i += 1;
    const a = trace[i];
    const b = trace[Math.min(i + 1, trace.length - 1)];
    const span = b.t - a.t;
    const u = span > 1e-12 ? (tt - a.t) / span : 0;
    out[p] = a.y + (b.y - a.y) * u;
  }
  const labels = [
    { t: 0, text: "trig" },
    { t: gateHoldSec, text: "rel" },
  ];
  nodeGraphPingEnvelopePreviewCurve._cache = {
    key: previewKey,
    points: out,
    total,
    guideT: peak.t,
    labels,
  };
  return {
    points: out,
    total,
    guideT: peak.t,
    ampView: 1,
    labels,
  };
}
