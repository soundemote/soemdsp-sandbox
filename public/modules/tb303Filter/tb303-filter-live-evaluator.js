// TB-303 offline/render (main-thread) + filter-curve magnitude helpers.
// Live worklet is native-only (tb303-filter-worklet-evaluator.js) — no JS
// sample path there.

const nodeGraphTb303FilterModesMix = Object.freeze([
  [1, 0, 0, 0, 0],
  [0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 1, 0],
  [0, 0, 0, 0, 1],
  [1, -1, 0, 0, 0],
  [1, -2, 1, 0, 0],
  [1, -3, 3, -1, 0],
  [1, -4, 6, -4, 1],
  [0, 0, 1, -2, 1],
  [0, 0, 0, 1, -1],
  [0, 1, -3, 3, -1],
  [0, 0, 1, -1, 0],
  [0, 1, -2, 1, 0],
  [0, 1, -1, 0, 0],
]);

function createNodeGraphTb303FilterState() {
  return {
    y: [0, 0, 0, 0],
    hpX: 0,
    hpY: 0,
    hpP: 0,
    hpB0: 0.5,
    lastRate: 0,
  };
}

function resetNodeGraphTb303FilterState(state) {
  if (!state) {
    return;
  }
  if (!Array.isArray(state.y) || state.y.length < 4) {
    state.y = [0, 0, 0, 0];
  } else {
    state.y[0] = 0;
    state.y[1] = 0;
    state.y[2] = 0;
    state.y[3] = 0;
  }
  state.hpX = 0;
  state.hpY = 0;
}

/** Soft clip used by ladder family — keeps high res/drive from exploding. */
function nodeGraphTb303SoftClip(x) {
  const v = Number(x) || 0;
  return v / (1 + v * v);
}

function nodeGraphTb303FilterCoefficients(cutoff, resonance, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  // Param may be 0 (frozen). Only crash-safety: non-negative, <= ~Nyquist.
  // Tiny omega floor is applied below for trig/exp, not as a musical min.
  const rawCutoff = Number(cutoff);
  const safeCutoff = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawCutoff) ? rawCutoff : 0));
  const resonanceRaw = Math.max(0, Math.min(1, (Number(resonance) || 0) * 0.01));
  // Resonance skew: musical curve toward self-oscillation.
  const r = (1 - Math.exp(-3 * resonanceRaw)) / (1 - Math.exp(-3));
  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * safeCutoff / rate));
  const sinWc = Math.sin(wc);
  const cosWc = Math.cos(wc);
  const tanWc = Math.tan(0.25 * (wc - Math.PI));
  const denomA = sinWc - cosWc * tanWc;
  const a1FullRes = Math.abs(denomA) < 1e-15 ? -1 : tanWc / denomA;
  const a1NoRes = -Math.exp(-wc);
  const a1 = r * a1FullRes + (1 - r) * a1NoRes;
  const b0 = 1 + a1;
  const gsqD = Math.max(1e-12, 1 + a1 * a1 + 2 * a1 * cosWc);
  const gsq = b0 * b0 / gsqD;
  // Cap feedback gain so self-osc stays musical with soft-clip (was unbounded).
  const k = Math.min(3.5, r / Math.max(1e-24, gsq * gsq));
  return { a1, b0, cosWc, k, r, rate, safeCutoff, wc };
}

function nodeGraphTb303FilterMagnitudeAt(params, frequency, sampleRate) {
  const coeff = nodeGraphTb303FilterCoefficients(params.cutoff, params.resonance, sampleRate);
  const drive = Number(params.drive) || 0;
  const driveFactor = 10 ** (Math.max(0, Math.min(24, drive)) / 20);
  const mode = Math.max(0, Math.min(14, Math.round(nodeGraphFiniteNumber(params.mode, 4))));
  const c = nodeGraphTb303FilterModesMix[mode] || nodeGraphTb303FilterModesMix[4];
  const omega = 2 * Math.PI * Math.max(0, Number(frequency) || 0) / Math.max(1, Number(sampleRate) || 44100);
  const zInv = { im: -Math.sin(omega), re: Math.cos(omega) };
  // Stage H(z) = (1+a1) / (1 + a1 z^-1)
  const a1 = coeff.a1;
  const den = { re: 1 + a1 * zInv.re, im: a1 * zInv.im };
  const denMag2 = den.re * den.re + den.im * den.im;
  if (!(denMag2 > 1e-24) || !Number.isFinite(denMag2)) {
    return 1e-6;
  }
  const stage = {
    re: ((1 + a1) * den.re) / denMag2,
    im: -((1 + a1) * den.im) / denMag2,
  };
  // Open-loop cascade powers; close feedback approximately as
  // G / (1 + k * H_ladder) with G = 0.125 * drive (pre-scale), *8 post.
  const mul = (a, b) => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  });
  let power = { re: 1, im: 0 };
  let ladder = { re: 0, im: 0 };
  // y0 contribution is feed (before first pole) — c[0] * y0
  // stages 1..4: successive powers of stage H(z)
  for (let i = 0; i < 5; i += 1) {
    const w = c[i] || 0;
    if (w !== 0) {
      ladder.re += power.re * w;
      ladder.im += power.im * w;
    }
    if (i < 4) {
      power = mul(power, stage);
    }
  }
  // Feedback around 4th stage: y0 = G*in - k*y4; y4 = stage^4 * y0
  // overall ~ 8 * mix(stages) * G / (1 + k * stage^4)
  let stage4 = { re: 1, im: 0 };
  for (let i = 0; i < 4; i += 1) {
    stage4 = mul(stage4, stage);
  }
  const g = 0.125 * driveFactor;
  const loopDen = {
    re: 1 + coeff.k * stage4.re,
    im: coeff.k * stage4.im,
  };
  const loopMag2 = loopDen.re * loopDen.re + loopDen.im * loopDen.im;
  if (!(loopMag2 > 1e-24) || !Number.isFinite(loopMag2)) {
    return 1e-6;
  }
  const closed = {
    re: (ladder.re * loopDen.re + ladder.im * loopDen.im) / loopMag2,
    im: (ladder.im * loopDen.re - ladder.re * loopDen.im) / loopMag2,
  };
  const mag = 8 * g * Math.hypot(closed.re, closed.im);
  if (!Number.isFinite(mag) || mag < 0) {
    return 1e-6;
  }
  return Math.max(1e-6, mag);
}

function nodeGraphTb303FilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  if (!state || typeof state !== "object") {
    return 0;
  }
  if (!Array.isArray(state.y) || state.y.length < 4) {
    state.y = [0, 0, 0, 0];
  }
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const drive = Number(params.drive) || 0;
  const driveFactor = 10 ** (Math.max(0, Math.min(24, drive)) / 20);
  const safeMode = Math.max(0, Math.min(14, Math.round(nodeGraphFiniteNumber(params.mode, 4))));
  const coeff = nodeGraphTb303FilterCoefficients(params.cutoff, params.resonance, rate);
  const a1 = coeff.a1;
  const k = coeff.k;

  // Feedback highpass (1-pole, 150 Hz)
  if (!state.hpP || state.lastRate !== rate) {
    state.hpP = Math.exp(-2 * Math.PI * 150 / rate);
    state.hpB0 = (1 + state.hpP) * 0.5;
    state.lastRate = rate;
  }

  const y = state.y;
  const fbIn = k * (y[3] || 0);
  const fbHp = state.hpB0 * (fbIn - (state.hpX || 0)) + state.hpP * (state.hpY || 0);
  state.hpX = fbIn;
  state.hpY = Number.isFinite(fbHp) ? fbHp : 0;

  const safeIn = typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "tb303 in")
    : (Number(input) || 0);

  // Input scale + soft clip (prevents resonance/drive blow-up / permanent silence).
  let y0 = nodeGraphTb303SoftClip(0.125 * driveFactor * safeIn - state.hpY);
  y[0] = y0 + a1 * (y0 - y[0]);
  y[1] = y[0] + a1 * (y[0] - y[1]);
  y[2] = y[1] + a1 * (y[1] - y[2]);
  y[3] = y[2] + a1 * (y[2] - y[3]);

  // Sanitize stages; full reset if anything blew up (safeFilterNumber alone
  // only cleared inputBuffer/outputBuffer and left the ladder poisoned).
  let poisoned = false;
  for (let i = 0; i < 4; i += 1) {
    if (!Number.isFinite(y[i]) || Math.abs(y[i]) > 1e8) {
      poisoned = true;
      break;
    }
  }
  if (!Number.isFinite(state.hpY) || Math.abs(state.hpY) > 1e8) {
    poisoned = true;
  }
  if (poisoned) {
    resetNodeGraphTb303FilterState(state);
    if (typeof nodeGraphMarkRuntimeBadNumber === "function") {
      nodeGraphMarkRuntimeBadNumber(runtime, nodeId, "tb303 exploded — state reset");
    }
    return 0;
  }

  const c = nodeGraphTb303FilterModesMix[safeMode] || nodeGraphTb303FilterModesMix[4];
  const out = 8 * (c[0] * y0 + c[1] * y[0] + c[2] * y[1] + c[3] * y[2] + c[4] * y[3]);
  if (!Number.isFinite(out) || Math.abs(out) > 1e8) {
    resetNodeGraphTb303FilterState(state);
    return 0;
  }
  // Soft output bound keeps downstream modules alive after hard self-osc.
  return Math.max(-32, Math.min(32, out));
}


// Registers the offline/render-time dispatch handler for tb303Filter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
nodeGraphLiveModuleEvaluators.tb303Filter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.tb303FilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphTb303FilterState);
  runtime.tb303FilterStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const tb303Params = {
    cutoff: nodeGraphFrequencyHzFromKnobOrF(read("cutoff", 1000), hasInput, mixInput, nodeId),
    drive: read("drive", 0),
    mode: read("mode", 4),
    resonance: read("resonance", 0),
  };
  const tb303Mono = mixInput(nodeId);
  return {
    Out: nodeGraphTb303FilterSample(state.mono, tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphTb303FilterSample(state.left, mixInput(nodeId, "Left") + tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphTb303FilterSample(state.right, mixInput(nodeId, "Right") + tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:right`),
  };
};
