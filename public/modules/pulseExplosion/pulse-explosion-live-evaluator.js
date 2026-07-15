// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphPulseExplosionRationalCurve(p, skew) {
  let denom = 1 - skew + 2 * skew * p;
  if (denom > -1e-12 && denom < 1e-12) denom = denom >= 0 ? 1e-12 : -1e-12;
  return ((1 + skew) * p) / denom;
}
function nodeGraphPulseExplosionRaisedCosineEase(x, x1, x2) {
  const span = x2 - x1;
  if (span > -1e-12 && span < 1e-12) return 0.5;
  let p = (x - x1) / span;
  p = Math.max(0, Math.min(1, p));
  return 1 - (0.5 + 0.5 * Math.sin((p - 0.5) * Math.PI));
}
function nodeGraphPulseExplosionMulberry32(seed) {
  let a = seed >>> 0;
  return function pulseExplosionNext() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function nodeGraphPulseExplosionSeedHash(seed) {
  const buffer = new ArrayBuffer(8);
  new Float64Array(buffer)[0] = Number(seed) || 0;
  const words = new Uint32Array(buffer);
  let x = (words[0] ^ words[1]) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) || 0x9e3779b9;
}


function nodeGraphPulseExplosionDensity(t, startTime, centerTime, endTime, skew) {
  if (t <= startTime || t >= endTime) return 0;
  const ease = t < centerTime
    ? nodeGraphPulseExplosionRaisedCosineEase(t, centerTime, startTime)
    : nodeGraphPulseExplosionRaisedCosineEase(t, centerTime, endTime);
  return Math.max(0, Math.min(1, nodeGraphPulseExplosionRationalCurve(ease, skew)));
}

function nodeGraphPulseExplosionRandomFn(seed) {
  const seedNumber = Number(seed) || 0;
  if (seedNumber === 0) {
    return Math.random;
  }
  return nodeGraphPulseExplosionMulberry32(nodeGraphPulseExplosionSeedHash(seedNumber));
}

function nodeGraphPulseExplosionComputeSchedule(params, random = Math.random) {
  const safeStart = Math.max(0, Number(params.startTime) || 0);
  let safeEnd = Number(params.endTime) || 0;
  if (safeEnd <= safeStart) safeEnd = safeStart + 0.001;
  let safeCenter = Math.max(safeStart, Math.min(safeEnd, Number(params.centerTime) || 0));
  if (safeCenter <= safeStart) safeCenter = safeStart + 1e-6;
  if (safeCenter >= safeEnd) safeCenter = safeEnd - 1e-6;
  // 0..1 spread -> -0.99..0.99 skew (0 concentrates tightly at centerTime,
  // 1 spreads widely -- measured empirically, see the .cpp header comment).
  const skew = -0.99 + 1.98 * Math.max(0, Math.min(1, Number(params.timeSpread) || 0));
  const safeCount = Math.max(1, Math.min(kNodeGraphPulseExplosionMaxPulses, Math.round(Number(params.numberOfPulses) || 1)));
  const lo = Math.min(Number(params.lowAmplitude) || 0, Number(params.highAmplitude) || 0);
  const hi = Math.max(Number(params.lowAmplitude) || 0, Number(params.highAmplitude) || 0);

  const pulses = [];
  for (let i = 0; i < safeCount; i++) {
    let chosenTime = safeCenter;
    for (let attempt = 0; attempt < kNodeGraphPulseExplosionMaxRejectionAttempts; attempt++) {
      const candidate = safeStart + (safeEnd - safeStart) * random();
      const roll = random();
      const density = nodeGraphPulseExplosionDensity(candidate, safeStart, safeCenter, safeEnd, skew);
      if (roll < density) {
        chosenTime = candidate;
        break;
      }
    }
    pulses.push({ time: chosenTime, amplitude: lo + (hi - lo) * random() });
  }
  pulses.sort((a, b) => a.time - b.time);
  return { pulses, safeStart, safeCenter, safeEnd, skew };
}


function createNodeGraphPulseExplosionState() {
  return {
    wasHigh: false,
    exploding: false,
    elapsed: 0,
    pulses: [],
    nextPulseIndex: 0,
    safeEnd: 1,
  };
}

function nodeGraphPulseExplosionSample(state, trigger, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);

  const high = (Number(trigger) || 0) > 0.5;
  if (high && !state.wasHigh) {
    state.nextPulseIndex = 0;
    state.elapsed = 0;
    state.exploding = true;
    const schedule = nodeGraphPulseExplosionComputeSchedule(params, nodeGraphPulseExplosionRandomFn(params.seed));
    state.pulses = schedule.pulses;
    state.safeStart = schedule.safeStart;
    state.safeCenter = schedule.safeCenter;
    state.safeEnd = schedule.safeEnd;
    state.skew = schedule.skew;
  }
  state.wasHigh = high;
  const safeStart = Number.isFinite(state.safeStart) ? state.safeStart : 0;
  const safeCenter = Number.isFinite(state.safeCenter) ? state.safeCenter : 0.5;
  const safeEnd = Number.isFinite(state.safeEnd) ? state.safeEnd : Number(params.endTime) || 1;
  const skew = Number.isFinite(state.skew) ? state.skew : 0;

  let output = 0;
  if (state.exploding) {
    if (state.nextPulseIndex < state.pulses.length && state.elapsed >= state.pulses[state.nextPulseIndex].time) {
      output = state.pulses[state.nextPulseIndex].amplitude;
      state.nextPulseIndex++;
    }
    state.elapsed += 1 / rate;
    if (state.nextPulseIndex >= state.pulses.length && state.elapsed > safeEnd) {
      state.exploding = false;
    }
  }

  // Curve output: the density shape shown on the node's display, sampled at
  // the current position in the burst -- lets it be patched elsewhere.
  const curve = nodeGraphPulseExplosionDensity(state.elapsed, safeStart, safeCenter, safeEnd, skew);

  return {
    Out: nodeGraphSafeFilterNumber(output, runtime, nodeId, state, "pulse explosion output"),
    Curve: nodeGraphSafeFilterNumber(curve, runtime, nodeId, state, "pulse explosion curve"),
  };
}


// Registers the offline/render-time dispatch handler for pulseExplosion into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pulseExplosion = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.pulseExplosionStates.get(nodeId) || createNodeGraphPulseExplosionState();
  runtime.pulseExplosionStates.set(nodeId, state);
  return nodeGraphPulseExplosionSample(
    state,
    mixInput(nodeId, "Trigger"),
    {
      startTime: readNodeGraphLiveEffectiveParam(runtime, node, "startTime", 0, frame, frames, frameValues),
      centerTime: readNodeGraphLiveEffectiveParam(runtime, node, "centerTime", 0.5, frame, frames, frameValues),
      endTime: readNodeGraphLiveEffectiveParam(runtime, node, "endTime", 1, frame, frames, frameValues),
      timeSpread: readNodeGraphLiveEffectiveParam(runtime, node, "timeSpread", 0.3, frame, frames, frameValues),
      numberOfPulses: readNodeGraphLiveEffectiveParam(runtime, node, "numberOfPulses", 20, frame, frames, frameValues),
      lowAmplitude: readNodeGraphLiveEffectiveParam(runtime, node, "lowAmplitude", 0.3, frame, frames, frameValues),
      highAmplitude: readNodeGraphLiveEffectiveParam(runtime, node, "highAmplitude", 1, frame, frames, frameValues),
      seed: readNodeGraphLiveEffectiveParam(runtime, node, "seed", 0, frame, frames, frameValues),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
