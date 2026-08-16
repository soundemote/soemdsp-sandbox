// Look-ahead brickwall limiter — offline/render. Math: lookahead-limiter-math.js.

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
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, state, "limiter out"),
    Left: nodeGraphSafeFilterNumber(out.Left, runtime, nodeId, state, "limiter left"),
    Right: nodeGraphSafeFilterNumber(out.Right, runtime, nodeId, state, "limiter right"),
    Gain: nodeGraphSafeFilterNumber(out.Gain, runtime, nodeId, state, "limiter gain"),
  };
};
