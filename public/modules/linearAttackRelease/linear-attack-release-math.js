// Linear Attack–Release — pure gate AR with constant-rate ramps.
//
// inputMode: 0 Gate (follow) | 1 Trigger (rising edge → attack → release)

function createNodeGraphLinearAttackReleaseState() {
  return {
    out: 0,
    lastGate: 0,
    releaseDecrement: 0,
    // idle | attack | hold | release
    phase: "idle",
  };
}

/**
 * @param {ReturnType<typeof createNodeGraphLinearAttackReleaseState>} state
 * @param {number} gate
 * @param {{ attack?: number, release?: number, amplitude?: number, inputMode?: number }} params
 * @param {number} sampleRate
 * @returns {number}
 */
function nodeGraphLinearAttackReleaseSample(state, gate, params, sampleRate) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  if (state.phase == null) state.phase = "idle";
  if (state.lastGate == null) state.lastGate = 0;
  if (state.out == null) state.out = 0;
  if (state.releaseDecrement == null) state.releaseDecrement = 0;

  const rate = Math.max(1, Number(sampleRate) || 44100);
  const period = 1 / rate;
  const attack = Math.max(0, Number(params?.attack) || 0);
  const release = Math.max(0, Number(params?.release) || 0);
  const amplitude = Number(params?.amplitude);
  const level = Number.isFinite(amplitude) ? amplitude : 1;
  const inputMode = Math.max(0, Math.min(1, Math.round(Number(params?.inputMode) || 0)));

  const gateOn = (Number(gate) || 0) > 0.5;
  const rising = gateOn && !(Number(state.lastGate) > 0.5);
  const falling = !gateOn && Number(state.lastGate) > 0.5;
  state.lastGate = gateOn ? 1 : 0;

  const startRelease = () => {
    state.phase = "release";
    state.releaseDecrement = state.out * period / Math.max(release, period);
  };

  if (inputMode === 0) {
    // Gate follower: high → attack/hold, low → release.
    if (rising || (gateOn && state.phase === "idle")) {
      state.phase = "attack";
    }
    if (falling) {
      startRelease();
    }
    if (!gateOn && state.phase !== "release" && state.phase !== "idle") {
      startRelease();
    }
  } else if (rising) {
    // Trigger: rising edge starts attack; peak auto-releases.
    state.phase = "attack";
  }

  const attackIncrement = Math.min(period / Math.max(attack, period), 1);

  if (state.phase === "attack") {
    if (attack <= period) {
      state.out = 1;
    } else {
      state.out += attackIncrement;
      if (state.out >= 1) state.out = 1;
    }
    if (state.out >= 1) {
      if (inputMode === 1) {
        startRelease();
      } else if (gateOn) {
        state.phase = "hold";
        state.out = 1;
      } else {
        startRelease();
      }
    }
  } else if (state.phase === "hold") {
    state.out = 1;
    if (!gateOn) startRelease();
  } else if (state.phase === "release") {
    if (release <= period) {
      state.out = 0;
      state.phase = "idle";
      state.releaseDecrement = 0;
    } else {
      state.out -= state.releaseDecrement;
      if (state.out <= 0) {
        state.out = 0;
        state.phase = "idle";
        state.releaseDecrement = 0;
      }
    }
  } else {
    state.out = 0;
  }

  if (!Number.isFinite(state.out)) state.out = 0;
  const clamped = state.out < 0 ? 0 : (state.out > 1 ? 1 : state.out);
  const y = clamped * level;
  return Number.isFinite(y) ? y : 0;
}

/**
 * Face preview: gate-high attack then release (Gate mode silhouette).
 */
function nodeGraphLinearAttackReleasePreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, Number(params.attack) || 0);
  const release = Math.max(0, Number(params.release) || 0);
  const hold = Math.max(0.04, Math.min(0.35, (attack + release) * 0.2 || 0.08));
  const gateHigh = Math.max(attack + hold, 0.02);
  const total = Math.max(gateHigh + Math.max(release, 0.02), 0.06);
  const corners = [
    { t: 0, y: 0 },
    { t: attack / total, y: 1 },
    { t: gateHigh / total, y: 1 },
    { t: Math.min(1, (gateHigh + release) / total), y: 0 },
    { t: 1, y: 0 },
  ];
  const keyframes = [];
  for (const p of corners) {
    const pt = { t: Math.max(0, Math.min(1, p.t)), y: Math.max(0, Math.min(1, p.y)) };
    const prev = keyframes[keyframes.length - 1];
    if (prev && Math.abs(prev.t - pt.t) < 1e-9) {
      prev.y = pt.y;
      continue;
    }
    keyframes.push(pt);
  }
  const n = Math.max(32, Math.round(Number(points) || 160));
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / Math.max(1, n - 1);
    while (k + 1 < keyframes.length && keyframes[k + 1].t < t) k += 1;
    const a = keyframes[k];
    const b = keyframes[Math.min(keyframes.length - 1, k + 1)];
    const span = Math.max(1e-12, b.t - a.t);
    const u = Math.max(0, Math.min(1, (t - a.t) / span));
    out.push({ t, y: a.y + (b.y - a.y) * u });
  }
  return {
    points: out,
    total,
    gateHigh,
    labels: { left: "A", right: "R" },
  };
}
