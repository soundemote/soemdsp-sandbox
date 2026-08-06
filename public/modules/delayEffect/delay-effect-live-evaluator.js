// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphHashBipolar(index, seed) {
  let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
}


function createNodeGraphDelayEffectState() {
  return {
    buffer: new Float32Array(1),
    bufferSize: 1,
    lfoPhase: 0,
    lfoVariationState: 0,
    position: 0,
    wet: 0,
  };
}

function nodeGraphDelayParabolSample(phase) {
  const wrapped = phase - Math.floor(phase);
  return wrapped < 0.5 ? wrapped * 4 - 1 : 3 - wrapped * 4;
}


function createNodeGraphStereoDelayEffectState() {
  return {
    left: createNodeGraphDelayEffectState(),
    mono: createNodeGraphDelayEffectState(),
    right: createNodeGraphDelayEffectState(),
  };
}

function nodeGraphDelayEffectSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const maxDelaySeconds = 4.25;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.buffer || state.bufferSize !== requiredSize) {
    state.buffer = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.lfoPhase = 0;
    state.lfoVariationState = 0;
    state.wet = 0;
  }
  const dry = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "delay input");
  const time = Math.max(0.001, Math.min(maxDelaySeconds, nodeGraphSafeFilterNumber(params.time, runtime, nodeId, state, "delay time")));
  const feedback = Math.max(0, Math.min(0.95, nodeGraphSafeFilterNumber(params.feedback, runtime, nodeId, state, "delay feedback")));
  const mix = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, state, "delay mix")));
  const level = Math.max(0, Math.min(2, nodeGraphSafeFilterNumber(params.level, runtime, nodeId, state, "delay level")));
  const modAmount = Math.max(0, Math.min(0.5, nodeGraphSafeFilterNumber(params.modAmount, runtime, nodeId, state, "delay modulation")));
  const modRate = Math.max(0, Math.min(90, nodeGraphSafeFilterNumber(params.modRate, runtime, nodeId, state, "delay mod rate")));
  const modVariation = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.modVariation, runtime, nodeId, state, "delay variation")));
  const mode = Math.round(nodeGraphSafeFilterNumber(params.mode, runtime, nodeId, state, "delay mode")) >= 1 ? 1 : 0;

  const variationTarget = nodeGraphHashBipolar(
    Math.floor(state.lfoPhase * 997) + state.position,
    nodeGraphStableSeed(`${nodeId}:delayVariation`),
  );
  state.lfoVariationState += (variationTarget - state.lfoVariationState) * Math.min(1, modRate / safeRate);
  const variedRate = Math.max(0, modRate * (1 + state.lfoVariationState * modVariation));
  state.lfoPhase = (state.lfoPhase + variedRate / safeRate) % 1;
  const lfo = (nodeGraphDelayParabolSample(state.lfoPhase) + 1) * 0.5;

  const delaySamples = Math.max(1, Math.min(state.bufferSize - 2, time * safeRate));
  const bufferOffset = delaySamples - delaySamples * lfo * modAmount + 1;
  state.position = (state.position + 1) % state.bufferSize;
  const readPosition = (state.position + state.bufferSize - bufferOffset) % state.bufferSize;
  const interpMode = Math.round(Number(params.interpolation) || 0) >= 1 ? 1 : 0;
  const wet = typeof nodeGraphDelayInterpolate === "function"
    ? nodeGraphDelayInterpolate(state.buffer, readPosition, interpMode)
    : nodeGraphDelayInterpolateLinear(state.buffer, readPosition);
  const write = mode ? ((0 - dry) - wet * feedback) : (dry + wet * feedback);
  state.buffer[state.position] = Math.max(-8, Math.min(8, write));
  state.wet = mode ? (dry * feedback - wet * (1 - feedback * feedback)) : wet;
  const dryOut = dry * level;
  const mixOut = (dry * (1 - mix) + state.wet * mix) * level;
  // Dry = unprocessed input; Mix = dry/wet blend. No wet-only jack.
  return {
    Dry: dryOut,
    Mix: mixOut,
    Out: mixOut,
  };
}


// Registers the offline/render-time dispatch handler for delayEffect into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.delayEffect = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.delayEffectStates.get(nodeId) || createNodeGraphStereoDelayEffectState();
  runtime.delayEffectStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const delayParams = {
    feedback: read("feedback", 0.25),
    level: read("level", 1),
    mix: read("mix", 0.35),
    mode: read("mode", 0),
    modAmount: read("modAmount", 0.02),
    modRate: read("modRate", 0.1),
    modVariation: read("modVariation", 0),
    time: read("time", 0.18),
    // 0 = linear, 1 = hermite (default hermite).
    interpolation: read("interpolation", 1),
  };
  const delayMono = mixInput(nodeId);
  const monoResult = nodeGraphDelayEffectSample(state.mono, delayMono, delayParams, sampleRate, runtime, `${nodeId}:mono`);
  const leftResult = nodeGraphDelayEffectSample(state.left, mixInput(nodeId, "Left") + delayMono, delayParams, sampleRate, runtime, `${nodeId}:left`);
  const rightResult = nodeGraphDelayEffectSample(state.right, mixInput(nodeId, "Right") + delayMono, delayParams, sampleRate, runtime, `${nodeId}:right`);
  return {
    Dry: monoResult.Dry,
    Mix: monoResult.Mix,
    Out: monoResult.Mix,
    Left: leftResult.Mix,
    Right: rightResult.Mix,
  };
};
