// Curve AR — shaped Attack–Release (same bipolar curves as Curve ADSR).
// inputMode: 0 Gate | 1 Trigger. updateOnTrigger latches knobs on rise.

function createNodeGraphCurveAttackReleaseState() {
  return {
    out: 0,
    lastGate: 0,
    stageElapsed: 0,
    stageStart: 0,
    stageEnd: 0,
    stageDuration: 0,
    phase: "idle", // idle | attack | hold | release
    hasShot: false,
    shot: null,
  };
}

function nodeGraphCurveArNormalizeShape(shape) {
  if (typeof nodeGraphExpAdsrNormalizeShape === "function") {
    return nodeGraphExpAdsrNormalizeShape(shape);
  }
  const s = Number(shape);
  if (!Number.isFinite(s)) return 0;
  return s;
}

function nodeGraphCurveArShapedProgress(t, shape) {
  if (typeof nodeGraphExpAdsrShapedProgress === "function") {
    return nodeGraphExpAdsrShapedProgress(t, shape);
  }
  return Math.max(0, Math.min(1, nodeGraphFiniteNumber(t)));
}

function nodeGraphCurveArCopyShot(params, inputMode) {
  return {
    attack: Math.max(0, nodeGraphFiniteNumber(params?.attack)),
    attackShape: nodeGraphCurveArNormalizeShape(params?.attackShape),
    release: Math.max(0, nodeGraphFiniteNumber(params?.release)),
    releaseShape: nodeGraphCurveArNormalizeShape(params?.releaseShape),
    amplitude: Number.isFinite(Number(params?.amplitude)) ? Number(params.amplitude) : 1,
    inputMode: Math.max(0, Math.min(1, Math.round(nodeGraphFiniteNumber(inputMode)))),
  };
}

function nodeGraphCurveArBeginStage(state, start, end, duration) {
  state.stageStart = start;
  state.stageEnd = end;
  state.stageDuration = Math.max(0, duration);
  state.stageElapsed = 0;
  state.out = start;
}

function nodeGraphCurveArRetargetStage(state, newEnd, newDuration, period) {
  let t = 0;
  if (state.stageDuration > period) {
    t = Math.min(1, state.stageElapsed / state.stageDuration);
  } else if (state.stageElapsed > 0) {
    t = 1;
  }
  state.stageEnd = newEnd;
  state.stageDuration = Math.max(0, nodeGraphFiniteNumber(newDuration));
  if (state.stageDuration <= period) {
    state.stageElapsed = t >= 1 ? period : 0;
  } else {
    state.stageElapsed = t * state.stageDuration;
  }
}

function nodeGraphCurveArAdvance(state, shape, period) {
  if (state.stageDuration <= period) {
    if (state.stageElapsed <= 0) {
      state.stageElapsed = period;
      state.out = state.stageStart;
      return false;
    }
    state.out = state.stageEnd;
    return true;
  }
  state.stageElapsed += period;
  const t = Math.min(1, state.stageElapsed / state.stageDuration);
  const w = nodeGraphCurveArShapedProgress(t, shape);
  state.out = state.stageStart + (state.stageEnd - state.stageStart) * w;
  return t >= 1;
}

function nodeGraphCurveArStartAttack(state, shot, period) {
  state.phase = "attack";
  if (shot.attack <= period) {
    nodeGraphCurveArBeginStage(state, 1, 1, 0);
    state.out = 1;
    state.stageElapsed = period;
  } else {
    nodeGraphCurveArBeginStage(state, state.out, 1, shot.attack);
  }
}

function nodeGraphCurveArStartRelease(state, shot, period) {
  state.phase = "release";
  if (shot.release <= period) {
    nodeGraphCurveArBeginStage(state, 0, 0, 0);
    state.out = 0;
    state.stageElapsed = period;
  } else {
    nodeGraphCurveArBeginStage(state, state.out, 0, shot.release);
  }
}

function nodeGraphCurveAttackReleaseSample(state, gate, params, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const period = 1 / rate;
  const latch = Number(params?.updateOnTrigger) >= 0.5;
  const inputMode = Math.max(0, Math.min(1, Math.round(nodeGraphFiniteNumber(params?.inputMode))));

  const gateOn = (nodeGraphFiniteNumber(gate)) > 0.5;
  const rising = gateOn && !(Number(state.lastGate) > 0.5);
  const falling = !gateOn && Number(state.lastGate) > 0.5;
  state.lastGate = gateOn ? 1 : 0;

  if (!latch || rising || !state.hasShot) {
    state.shot = nodeGraphCurveArCopyShot(params, inputMode);
    state.hasShot = true;
  }
  const shot = state.shot;

  if (shot.inputMode === 0) {
    if (rising || (gateOn && state.phase === "idle")) {
      nodeGraphCurveArStartAttack(state, shot, period);
    }
    if (falling || (!gateOn && state.phase !== "release" && state.phase !== "idle")) {
      nodeGraphCurveArStartRelease(state, shot, period);
    }
  } else if (rising) {
    nodeGraphCurveArStartAttack(state, shot, period);
  }

  if (!latch) {
    if (state.phase === "attack") nodeGraphCurveArRetargetStage(state, 1, shot.attack, period);
    else if (state.phase === "release") nodeGraphCurveArRetargetStage(state, 0, shot.release, period);
  }

  if (state.phase === "attack") {
    if (nodeGraphCurveArAdvance(state, shot.attackShape, period) || state.out >= 1) {
      state.out = 1;
      if (shot.inputMode === 1) nodeGraphCurveArStartRelease(state, shot, period);
      else if (gateOn) state.phase = "hold";
      else nodeGraphCurveArStartRelease(state, shot, period);
    }
  } else if (state.phase === "hold") {
    state.out = 1;
    if (!gateOn) nodeGraphCurveArStartRelease(state, shot, period);
  } else if (state.phase === "release") {
    if (nodeGraphCurveArAdvance(state, shot.releaseShape, period) || state.out <= 0) {
      state.out = 0;
      state.phase = "idle";
    }
  } else {
    state.out = 0;
  }

  if (!Number.isFinite(state.out)) state.out = 0;
  const y = Math.max(0, Math.min(1, state.out)) * shot.amplitude;
  return Number.isFinite(y) ? y : 0;
}

function nodeGraphCurveAttackReleasePreviewCurve(params = {}, points = 160) {
  const attack = Math.max(0, nodeGraphFiniteNumber(params.attack));
  const release = Math.max(0, nodeGraphFiniteNumber(params.release));
  const attackShape = nodeGraphCurveArNormalizeShape(params.attackShape);
  const releaseShape = nodeGraphCurveArNormalizeShape(params.releaseShape);
  const amplitude = Math.max(0, Number(params.amplitude) ?? 1);
  const hold = Math.max(0.04, Math.min(0.3, (attack + release) * 0.15 || 0.08));
  const gateHigh = Math.max(attack + hold, 0.02);
  const total = Math.max(gateHigh + Math.max(release, 0.02), 0.06);
  const n = Math.max(48, Math.round(nodeGraphFiniteNumber(points, 160)));
  const out = [];
  const pushSeg = (t0, t1, y0, y1, shape, segs) => {
    const span = Math.max(0, t1 - t0);
    if (!(span > 1e-12)) {
      out.push({ t: t0 / total, y: Math.max(0, Math.min(1, y1)) });
      return;
    }
    const steps = Math.max(2, Math.round(segs));
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const w = nodeGraphCurveArShapedProgress(u, shape);
      out.push({
        t: (t0 + span * u) / total,
        y: Math.max(0, Math.min(1, y0 + (y1 - y0) * w)),
      });
    }
  };
  if (attack > 1e-9) pushSeg(0, attack, 0, 1, attackShape, Math.max(8, Math.floor(n * 0.35)));
  else out.push({ t: 0, y: 1 });
  pushSeg(attack, gateHigh, 1, 1, 0, 2);
  if (release > 1e-9) {
    pushSeg(gateHigh, gateHigh + release, 1, 0, releaseShape, Math.max(8, Math.floor(n * 0.35)));
  } else {
    out.push({ t: gateHigh / total, y: 0 });
  }
  out.push({ t: 1, y: 0 });
  return {
    points: out,
    total,
    gateHigh,
    ampView: Math.min(1, amplitude),
    labels: { left: "A", right: "R" },
  };
}
