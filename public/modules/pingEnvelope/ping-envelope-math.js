// Ping Envelope face preview. Audio is native_modules/ping_envelope/ping_envelope.cpp.
// Asymmetric one-pole toward Trigger. Decay 0 is short, 1 is long.

const PING_RELEASE_HZ = 10;
const PING_EXP_SPAN = 5;

function createNodeGraphPingEnvelopeState() {
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

/** UI Decay 0…1. 0 is short, 1 is long. */
function nodeGraphPingEnvelopeReadDecay(params) {
  const decayRaw = Number(params?.decay);
  if (Number.isFinite(decayRaw)) {
    return Math.max(0, Math.min(1, decayRaw));
  }
  return 0.5;
}

function nodeGraphPingEnvelopeSample(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  const target = nodeGraphFiniteNumber(input);
  const sr = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const liveAtk = Math.max(0, nodeGraphFiniteNumber(params?.attack));
  const liveDecay = nodeGraphPingEnvelopeReadDecay(params);
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

    const relHz = (nodeGraphFiniteNumber(state.fb)) * PING_RELEASE_HZ;
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

  let x = state.env + (0.5 - state.shotDecay);
  if (x < 0) x = 0;
  if (x > 1) x = 1;
  if (!(x > 0)) state.fb = 0;
  else if (x >= 1) state.fb = 1;
  else {
    const y = Math.pow(10, PING_EXP_SPAN * (x - 1));
    state.fb = !Number.isFinite(y) || y < 0 ? 0 : y > 1 ? 1 : y;
  }

  const out = state.env * state.shotAmp;
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphPingEnvelopePreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, nodeGraphFiniteNumber(params.attack));
  const decay = nodeGraphPingEnvelopeReadDecay(params);
  const amplitude = Math.max(0, Number(params.amplitude) ?? 1);
  const n = Math.max(48, Math.round(nodeGraphFiniteNumber(points, 160)));
  // 5 attack time-constants (~99% of the rise), then the whole fall.
  // Release rate collapses as the exp feedback drops, so a fixed ~1s window
  // (the old 0.45 + decay*0.9) ends while the curve is still in mid-air.
  const gateHoldSec = attack > 0 ? Math.max(0.05, attack * 5) : 0.02;
  // fb hits 0 at env = decay-0.5 (decay > 0.5). Shorter decays rest at 0.
  const floor = Math.max(0, decay - 0.5);
  const settleEps = 0.008;
  const previewKey = attack + "\0" + decay + "\0" + n;
  const previewCache = nodeGraphPingEnvelopePreviewCurve._cache;
  if (previewCache && previewCache.key === previewKey) {
    return {
      points: previewCache.points,
      total: previewCache.total,
      guideT: previewCache.guideT,
      ampView: Math.min(1, amplitude),
      labels: previewCache.labels,
    };
  }
  const live = { attack, decay, amplitude: 1, recalculateOnTrigger: 1 };
  const state = createNodeGraphPingEnvelopeState();
  // Rest-prime so the rising edge uses one-pole Attack (not inertial first-sample snap).
  state.primed = true;
  state.env = 0;
  state.fb = 0;
  state.lastTrig = 0;

  const trace = [{ t: 0, y: 0 }];
  let t = 0;
  const tCap = gateHoldSec + 12000;
  let peak = { t: 0, y: 0 };
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
      const f = Math.max(0, state.fb) * PING_RELEASE_HZ;
      const tau = f > 1e-8 ? 1 / (2 * Math.PI * f) : 0.25;
      // Stay well under the sample() Nyquist snap (dt < 1/(2f)) and don't
      // step across the resting floor (a coarse step would freeze too low).
      let dtMax = tau / 10;
      const above = env - floor;
      if (env > 1e-6 && above < env) {
        const krMax = Math.min(0.2, Math.max(1e-4, (above * 0.45) / env));
        dtMax = Math.min(dtMax, -tau * Math.log(1 - krMax));
      }
      // sample() clamps its rate to >= 1 Hz. A longer step would move the
      // clock without integrating, and the tail would stop short again.
      dt = Math.max(1 / 8000, Math.min(dtMax, tCap - t, 1));
    }
    nodeGraphPingEnvelopeSample(state, target, live, 1 / dt);
    if (!gateHigh && state.env < floor) {
      state.env = floor;
      state.fb = 0;
    }
    t += dt;
    const y = Math.max(0, Math.min(1, state.env));
    trace.push({ t, y });
    if (y >= peak.y) peak = { t, y };
  }

  const dynamicEnd = Math.max(t, gateHoldSec);
  // Hold the resting level across the right of the face so the settled end
  // is a segment, not a single sample on the canvas edge.
  const hold = Math.max(0.05, dynamicEnd * 0.12);
  const totalSec = Math.max(0.35, dynamicEnd + hold);
  const settleY = trace[trace.length - 1].y;
  trace.push({ t: totalSec, y: settleY });

  const yAt = (tt) => {
    let lo = 0;
    let hi = trace.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (trace[mid].t < tt) lo = mid + 1;
      else hi = mid;
    }
    const b = trace[lo];
    const a = trace[Math.max(0, lo - 1)];
    const span = b.t - a.t;
    const u = span > 1e-12 ? (tt - a.t) / span : 0;
    return a.y + (b.y - a.y) * Math.max(0, Math.min(1, u));
  };

  const out = [];
  for (let i = 0; i < n; i += 1) {
    const tn = i / Math.max(1, n - 1);
    out.push({ t: tn, y: Math.max(0, Math.min(1, yAt(tn * totalSec))) });
  }
  const peakTn = Math.max(0, Math.min(1, peak.t / Math.max(1e-9, totalSec)));
  if (peak.y > 0.05) {
    let inserted = false;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i].t >= peakTn - 1e-6) {
        if (Math.abs(out[i].t - peakTn) > 1e-4 || out[i].y < peak.y - 0.02) {
          out.splice(i, 0, { t: peakTn, y: peak.y });
        } else if (out[i].y < peak.y) {
          out[i].y = peak.y;
        }
        inserted = true;
        break;
      }
    }
    if (!inserted) out.push({ t: peakTn, y: peak.y });
  }
  out[out.length - 1] = { t: 1, y: settleY };

  const guideT = Math.max(0, Math.min(0.98, gateHoldSec / Math.max(1e-9, totalSec)));
  const labels = { left: "A", right: "D" };
  nodeGraphPingEnvelopePreviewCurve._cache = {
    key: previewKey,
    points: out,
    total: totalSec,
    guideT,
    labels,
  };
  return {
    points: out,
    total: totalSec,
    guideT,
    ampView: Math.min(1, amplitude),
    labels,
  };
}