// Brickwall Limiter + Pump Limiter — offline/render. Math: lookahead-limiter-math.js.

nodeGraphLiveModuleEvaluators.lookaheadLimiter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.lookaheadLimiterStates) {
    runtime.lookaheadLimiterStates = new Map();
  }
  const state = runtime.lookaheadLimiterStates.get(nodeId) || createNodeGraphLookaheadLimiterState();
  runtime.lookaheadLimiterStates.set(nodeId, state);

  const ceilingDb = readNodeGraphLiveEffectiveParam(runtime, node, "ceiling", -1, frame, frames, frameValues);
  const lookaheadEnabled = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadEnabled", 1, frame, frames, frameValues);
  const lookaheadMs = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadMs", 5, frame, frames, frameValues);
  const lookaheadSamples = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadSamples", 0, frame, frames, frameValues);
  const attackMs = readNodeGraphLiveEffectiveParam(runtime, node, "attack", 0.2, frame, frames, frameValues);
  const releaseMs = readNodeGraphLiveEffectiveParam(runtime, node, "release", 100, frame, frames, frameValues);
  const gainCompensation = readNodeGraphLiveEffectiveParam(runtime, node, "gainCompensation", 0, frame, frames, frameValues);
  const dipGain = readNodeGraphLiveEffectiveParam(runtime, node, "dipGain", 1, frame, frames, frameValues);

  // Mono sums into L/R (Gain convention).
  const mono = mixInput(nodeId);
  const left = mixInput(nodeId, "Left") + mono;
  const right = mixInput(nodeId, "Right") + mono;
  const out = nodeGraphLookaheadLimiterFrame(
    state,
    left,
    right,
    ceilingDb,
    lookaheadMs,
    lookaheadSamples,
    attackMs,
    releaseMs,
    sampleRate,
    lookaheadEnabled,
    gainCompensation,
    dipGain,
  );
  return {
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, state, "brickwall out"),
    Left: nodeGraphSafeFilterNumber(out.Left, runtime, nodeId, state, "brickwall left"),
    Right: nodeGraphSafeFilterNumber(out.Right, runtime, nodeId, state, "brickwall right"),
    Gain: nodeGraphSafeFilterNumber(out.Gain, runtime, nodeId, state, "brickwall gain"),
  };
};

nodeGraphLiveModuleEvaluators.limiter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  if (!runtime.pumpingLimiterStates) {
    runtime.pumpingLimiterStates = new Map();
  }
  const state = runtime.pumpingLimiterStates.get(nodeId) || createNodeGraphPumpingLimiterState();
  runtime.pumpingLimiterStates.set(nodeId, state);

  const inputGainDb = readNodeGraphLiveEffectiveParam(runtime, node, "inputGain", 0, frame, frames, frameValues);
  const thresholdDb = readNodeGraphLiveEffectiveParam(runtime, node, "threshold", -18, frame, frames, frameValues);
  const ratio = readNodeGraphLiveEffectiveParam(runtime, node, "ratio", 8, frame, frames, frameValues);
  const lookaheadEnabled = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadEnabled", 1, frame, frames, frameValues);
  const lookaheadMs = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadMs", 5, frame, frames, frameValues);
  const lookaheadSamples = readNodeGraphLiveEffectiveParam(runtime, node, "lookaheadSamples", 0, frame, frames, frameValues);
  const attackMs = readNodeGraphLiveEffectiveParam(runtime, node, "attack", 5, frame, frames, frameValues);
  const releaseMs = readNodeGraphLiveEffectiveParam(runtime, node, "release", 250, frame, frames, frameValues);
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);

  const mono = mixInput(nodeId);
  const left = mixInput(nodeId, "Left") + mono;
  const right = mixInput(nodeId, "Right") + mono;
  const hasSidechain = typeof hasInput === "function"
    ? hasInput(nodeId, "Sidechain")
    : false;
  const sidechain = hasSidechain ? mixInput(nodeId, "Sidechain") : 0;
  const out = nodeGraphPumpingLimiterFrame(
    state,
    left,
    right,
    sidechain,
    hasSidechain,
    inputGainDb,
    thresholdDb,
    ratio,
    lookaheadMs,
    lookaheadSamples,
    attackMs,
    releaseMs,
    sampleRate,
    lookaheadEnabled,
    amplitude,
  );
  return {
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, state, "limiter out"),
    Left: nodeGraphSafeFilterNumber(out.Left, runtime, nodeId, state, "limiter left"),
    Right: nodeGraphSafeFilterNumber(out.Right, runtime, nodeId, state, "limiter right"),
    Gain: nodeGraphSafeFilterNumber(out.Gain, runtime, nodeId, state, "limiter gain"),
    Env: nodeGraphSafeFilterNumber(out.Env, runtime, nodeId, state, "limiter env"),
  };
};
