// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphLowpassState() {
  return {
    outputBuffer: 0,
  };
}


function nodeGraphRationalCurve(value, skew) {
  const t = clampNodeSliderValue(Number(value) || 0, 0, 1);
  const safeSkew = clampNodeSliderValue(Number(skew) || 0, -0.999, 0.999);
  return ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t);
}


function createNodeGraphRandomWalkState() {
  return {
    lowpass: createNodeGraphLowpassState(),
    out: 0,
    seed: 0,
    seedKey: "",
  };
}

function nodeGraphRandomWalkSample(state, params, sampleRate, runtime = null, nodeId = "") {
  nodeGraphResetSeededState(state, nodeId, params.seed, "randomWalk");
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const method = Math.max(0, Math.min(3, Math.round(nodeGraphSafeFilterNumber(params.method, runtime, nodeId, null, "random walk method"))));
  const frequency = Math.max(0, nodeGraphSafeFilterNumber(params.frequency, runtime, nodeId, null, "random walk frequency"));
  const jitter = Math.max(0, nodeGraphSafeFilterNumber(params.jitter, runtime, nodeId, null, "random walk jitter"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "random walk level");
  const noise = nodeGraphNextSeededBipolar(state);
  const increment = clampNodeSliderValue(frequency / rate, 0, 1);
  const jitterInc = clampNodeSliderValue(jitter / rate, 0, 1);
  const stepSize = clampNodeSliderValue(increment + nodeGraphRationalCurve(jitterInc, 0.99), 0, 1);
  const averageIncrement = (jitterInc + increment) * 0.5;
  const whiteNoiseMix = averageIncrement >= 0.9
    ? nodeGraphRationalCurve((averageIncrement - 0.9) / 0.1, -0.7)
    : 0;
  const randomMix = 1 - whiteNoiseMix;

  if (method === 0) {
    return nodeGraphSafeFilterNumber(noise * level, runtime, nodeId, null, "random walk white output");
  }
  if (method === 1) {
    return nodeGraphOnePoleLowpassSample(state.lowpass, noise, frequency, rate, runtime, nodeId) * level;
  }
  const step = method === 3 ? (noise > 0 ? stepSize : -stepSize) : noise * stepSize;
  state.out = clampNodeSliderValue(state.out + step, -1, 1);
  const mixed = state.out * randomMix + noise * whiteNoiseMix;
  return nodeGraphSafeFilterNumber(
    nodeGraphOnePoleLowpassSample(state.lowpass, mixed, frequency, rate, runtime, nodeId) * level,
    runtime,
    nodeId,
    null,
    "random walk output",
  );
}


// Registers the offline/render-time dispatch handler for randomWalk into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.randomWalk = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.randomWalkStates.get(nodeId) || createNodeGraphRandomWalkState();
  runtime.randomWalkStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphRandomWalkSample(
    state,
    {
      frequency: read("frequency", 2),
      jitter: read("jitter", 0.25),
      level: read("level", 1),
      method: read("method", 3),
      seed: read("seed", 1),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
