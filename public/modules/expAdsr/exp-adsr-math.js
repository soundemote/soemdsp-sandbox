// Curve Envelope — phase DADSR with bipolar Attack/Fall curves.
// Shape ∈ [-1, 1]: 0 = linear, + = exp (fast→slow), − = log (slow→fast).
// Same skew family as soemdsp::curve::Exponential / pluck envelopeCurve.

/** UI shape ∈ [-1,1]; also accepts legacy target-ratio (>1). Tiny positives stay near 0 (linear). */
function nodeGraphExpAdsrNormalizeShape(shape) {
  const s = Number(shape);
  if (!Number.isFinite(s)) return 0;
  if (s > 1) {
    const r = Math.max(1e-4, Math.min(100, s));
    return Math.max(0, Math.min(1, (Math.log(100) - Math.log(r)) / (Math.log(100) - Math.log(1e-4))));
  }
  return Math.max(-1, Math.min(1, s));
}

function nodeGraphExpAdsrShapeSkew(shape) {
  const s = nodeGraphExpAdsrNormalizeShape(shape);
  if (Math.abs(s) < 1e-6) return -1e-8;
  return Math.max(-0.99, Math.min(0.99, s));
}

/** Map progress 0…1 through bipolar curve. */
function nodeGraphExpAdsrShapedProgress(t, shape) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const skew = nodeGraphExpAdsrShapeSkew(shape);
  if (typeof nodeGraphExponentialCurve === "function") {
    return nodeGraphExponentialCurve(u, skew);
  }
  // Inline soemdsp::curve::Exponential (skew in [-0.99, 0.99]).
  if (Math.abs(skew) < 1e-12) return u;
  const c = 0.5 * (skew + 1);
  const a = 2 * Math.log10((1 - c) / Math.max(1e-12, c));
  const denom = 1 - Math.exp(a);
  return denom === 0 ? u : (1 - Math.exp(u * a)) / denom;
}

function createNodeGraphExpAdsrState() {
  return {
    lastGate: 0,
    out: 0,
    stageElapsed: 0,
    stageStart: 0,
    stageEnd: 0,
    stageDuration: 0,
    state: "off",
    // Gate fell during Delay/Attack/Decay — finish AD, then Release (Trigger→Gate).
    releasePending: false,
    latchedParams: null,
  };
}

/** Snapshot of live envelope knobs (for UpdateOnTrigger). */
function nodeGraphExpAdsrCopyParams(params = {}) {
  return {
    delay: Math.max(0, Number(params.delay) || 0),
    attack: Math.max(0, Number(params.attack) || 0),
    decay: Math.max(0, Number(params.decay) || 0),
    sustain: Math.max(0, Math.min(1, Number(params.sustain) || 0)),
    release: Math.max(0, Number(params.release) || 0),
    attackShape: nodeGraphExpAdsrNormalizeShape(params.attackShape),
    releaseShape: nodeGraphExpAdsrNormalizeShape(params.releaseShape),
    level: Number(params.level) || 0,
    loop: Number(params.loop) || 0,
  };
}

/**
 * UpdateOnTrigger On: freeze Delay/Attack/Decay/Sustain/Release/shapes/Loop/Level
 * until the next Gate rising edge (then re-latch from live). Off: always live.
 * Call BEFORE core/native so state.lastGate still reflects the previous sample.
 */
function nodeGraphExpAdsrParamsForSample(state, gate, liveParams, updateOnTrigger) {
  const latch = Number(updateOnTrigger) >= 0.5;
  if (!latch) {
    if (state) state.latchedParams = null;
    return liveParams;
  }
  const g = Number(gate) || 0;
  const prev = Number(state?.lastGate) || 0;
  const rising = prev <= 0 && g > 0;
  if (!state.latchedParams || rising) {
    state.latchedParams = nodeGraphExpAdsrCopyParams(liveParams);
  }
  return state.latchedParams;
}

function nodeGraphExpAdsrBeginStage(state, start, end, duration) {
  state.stageStart = start;
  state.stageEnd = end;
  state.stageDuration = Math.max(0, duration);
  state.stageElapsed = 0;
  state.out = start;
}

function nodeGraphExpAdsrTriggerAttack(state, delay, attack, decay, sampleRate) {
  const period = 1 / Math.max(1, sampleRate);
  const from = state.out;
  const safeDecay = Math.max(0, Number(decay) || 0);
  state.releasePending = false;
  if (delay < period) {
    if (attack <= period) {
      // Zero/near-zero attack: peak then Decay (duration must be Decay —
      // duration 0 skipped the peak and looked dead when Sustain is 0).
      state.state = "decay";
      nodeGraphExpAdsrBeginStage(state, 1, state._pendingSustain ?? 0, safeDecay);
      state.out = 1;
    } else {
      state.state = "attack";
      nodeGraphExpAdsrBeginStage(state, from, 1, attack);
    }
    return;
  }
  if (state.out <= (typeof nodeGraphPlanck === "function" ? nodeGraphPlanck() : 1e-7)) {
    state.out = 0;
  }
  state.state = "delay";
  nodeGraphExpAdsrBeginStage(state, state.out, state.out, delay);
}

function nodeGraphExpAdsrEnterSustainOrRelease(state, sustain, release, gate) {
  state.out = sustain;
  const gateLow = !(Number(gate) > 0);
  if (state.releasePending || gateLow) {
    state.releasePending = false;
    state.state = "release";
    nodeGraphExpAdsrBeginStage(state, state.out, 0, Math.max(0, Number(release) || 0));
  } else {
    state.state = "sustain";
  }
}

/**
 * @param {object} state
 * @param {number} gate
 * @param {object} params delay, attack, attackShape, decay, sustain, release, releaseShape, level, loop
 * @param {number} sampleRate
 * @returns {number}
 */
function nodeGraphExpAdsrCore(state, gate, params, sampleRate) {
  const safeGate = Number(gate) || 0;
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const attackShape = nodeGraphExpAdsrNormalizeShape(params.attackShape);
  const releaseShape = nodeGraphExpAdsrNormalizeShape(params.releaseShape);
  const level = Number(params.level) || 0;
  const looping = (Number(params.loop) || 0) >= 0.5;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const period = 1 / rate;
  state._pendingSustain = sustain;

  if (state.lastGate <= 0 && safeGate > 0) {
    nodeGraphExpAdsrTriggerAttack(state, delay, attack, decay, rate);
  } else if (state.lastGate > 0 && safeGate <= 0) {
    // Short Trigger→Gate: finish Attack/Decay, then Release (do not abort AD).
    if (state.state === "sustain" || state.state === "off") {
      state.state = "release";
      nodeGraphExpAdsrBeginStage(state, state.out, 0, release);
    } else if (state.state === "delay" || state.state === "attack" || state.state === "decay") {
      state.releasePending = true;
    } else if (state.state !== "release") {
      state.state = "release";
      nodeGraphExpAdsrBeginStage(state, state.out, 0, release);
    }
  }
  state.lastGate = safeGate;

  const advanceShaped = (shape) => {
    // Zero-length stage: emit start for one sample so attack=0 still peaks.
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
    const w = nodeGraphExpAdsrShapedProgress(t, shape);
    state.out = state.stageStart + (state.stageEnd - state.stageStart) * w;
    return t >= 1;
  };

  switch (state.state) {
    case "delay":
      state.stageElapsed += period;
      if (state.stageElapsed >= state.stageDuration) {
        if (attack <= period) {
          state.state = "decay";
          nodeGraphExpAdsrBeginStage(state, 1, sustain, decay);
          state.out = 1;
        } else {
          state.state = "attack";
          nodeGraphExpAdsrBeginStage(state, state.out, 1, attack);
        }
      }
      break;
    case "attack":
      if (advanceShaped(attackShape)) {
        state.state = "decay";
        nodeGraphExpAdsrBeginStage(state, 1, sustain, decay);
        state.out = 1;
      }
      break;
    case "decay":
      if (advanceShaped(releaseShape)) {
        nodeGraphExpAdsrEnterSustainOrRelease(state, sustain, release, safeGate);
      }
      break;
    case "sustain":
      state.out = sustain;
      if (looping) {
        nodeGraphExpAdsrTriggerAttack(state, delay, attack, decay, rate);
      }
      break;
    case "release":
      if (advanceShaped(releaseShape)) {
        state.out = 0;
        state.state = "off";
        state.releasePending = false;
      }
      break;
    case "off":
    default:
      state.out = 0;
      state.releasePending = false;
      break;
  }

  const shaped = state.out * level;
  return Number.isFinite(shaped) ? shaped : 0;
}

/** @deprecated use nodeGraphExpAdsrCore — kept name for older callers */
function nodeGraphExpAdsrSample(state, gate, params, sampleRate, runtime = null, nodeId = "") {
  const out = nodeGraphExpAdsrCore(state, gate, params, sampleRate);
  if (runtime && typeof nodeGraphSafeFilterNumber === "function") {
    return nodeGraphSafeFilterNumber(out, runtime, nodeId, null, "exp adsr output");
  }
  return out;
}

/**
 * Face preview: one gated note (gate high through A+D+sustain hold, then release).
 * Points are 0..1 time and 0..1 level (pre-level knob).
 * Zero/near-zero attack: contour starts at the peak (top), then Decay — no missing A stage.
 */
function nodeGraphExpAdsrPreviewCurve(params = {}, sampleRate = 2000, points = 160) {
  const delay = Math.max(0, Number(params.delay) || 0);
  const attack = Math.max(0, Number(params.attack) || 0);
  const decay = Math.max(0, Number(params.decay) || 0);
  const sustain = Math.max(0, Math.min(1, Number(params.sustain) || 0));
  const release = Math.max(0, Number(params.release) || 0);
  const attackShape = nodeGraphExpAdsrNormalizeShape(
    typeof nodeGraphFiniteNumber === "function"
      ? nodeGraphFiniteNumber(params.attackShape, 0)
      : params.attackShape,
  );
  const releaseShape = nodeGraphExpAdsrNormalizeShape(params.releaseShape);
  const sustainHold = Math.max(0.05, Math.min(0.4, (attack + decay + release) * 0.15 || 0.08));
  // Visual attack floor so A=0 still shows a peak vertex, then Decay.
  const attackDraw = attack;
  const gateHigh = delay + Math.max(attackDraw + decay + sustainHold, 0.02);
  const total = Math.max(gateHigh + Math.max(release * 1.2, release + 0.02, 0.05), 0.08);
  const n = Math.max(48, Math.round(Number(points) || 160));

  const pushSeg = (out, t0, t1, y0, y1, shape, segs) => {
    const span = Math.max(0, t1 - t0);
    if (!(span > 1e-12)) {
      out.push({ t: t0 / total, y: Math.max(0, Math.min(1, y1)) });
      return;
    }
    const steps = Math.max(2, Math.round(segs));
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const w = nodeGraphExpAdsrShapedProgress(u, shape);
      const y = y0 + (y1 - y0) * w;
      out.push({ t: (t0 + span * u) / total, y: Math.max(0, Math.min(1, y)) });
    }
  };

  const out = [];
  let tCursor = 0;
  // Delay hold at silence when Delay > 0.
  if (delay > 1e-12) {
    pushSeg(out, 0, delay, 0, 0, 0, 2);
    tCursor = delay;
  }

  if (attackDraw > 1e-9) {
    const y0 = out.length ? (out[out.length - 1].y) : 0;
    if (!out.length) out.push({ t: 0, y: 0 });
    pushSeg(out, tCursor, tCursor + attackDraw, y0, 1, attackShape, Math.max(8, Math.floor(n * 0.25)));
    tCursor += attackDraw;
  } else {
    // Attack ≈ 0: contour starts at the peak (top of attack), then Decay.
    out.push({ t: tCursor / total, y: 1 });
  }

  if (decay > 1e-12) {
    pushSeg(out, tCursor, tCursor + decay, 1, sustain, releaseShape, Math.max(8, Math.floor(n * 0.25)));
    tCursor += decay;
  } else {
    out.push({ t: tCursor / total, y: sustain });
  }

  const sustainEnd = Math.max(tCursor + sustainHold, gateHigh);
  pushSeg(out, tCursor, sustainEnd, sustain, sustain, 0, 2);
  tCursor = sustainEnd;

  if (release > 1e-12) {
    pushSeg(out, tCursor, tCursor + release, sustain, 0, releaseShape, Math.max(8, Math.floor(n * 0.25)));
    tCursor += release;
  } else {
    out.push({ t: tCursor / total, y: 0 });
  }

  if (tCursor / total < 1) {
    out.push({ t: 1, y: out[out.length - 1]?.y ?? 0 });
  }
  // Deduplicate exact successive points that can stack at the same t.
  const deduped = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.t - p.t) < 1e-9 && Math.abs(prev.y - p.y) < 1e-9) continue;
    deduped.push(p);
  }

  return {
    points: deduped,
    total,
    gateHigh,
    labels: { left: "A", mid: "S", right: "R" },
  };
}
