// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphSlewLimiterState() {
  return {
    initialized: false,
    out: 0,
  };
}


function createNodeGraphStereoSlewLimiterState() {
  return {
    left: createNodeGraphSlewLimiterState(),
    mono: createNodeGraphSlewLimiterState(),
    right: createNodeGraphSlewLimiterState(),
  };
}

function nodeGraphSlewLimiterSample(state, input, upTime, downTime, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const target = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "slew input");
  if (!state.initialized) {
    state.initialized = true;
    state.out = target;
    return target;
  }
  const upSeconds = Math.max(0, nodeGraphSafeFilterNumber(upTime, runtime, nodeId, state, "slew up time"));
  const downSeconds = Math.max(0, nodeGraphSafeFilterNumber(downTime, runtime, nodeId, state, "slew down time"));
  const delta = target - state.out;
  const maxRise = upSeconds <= 0 ? Infinity : 1 / Math.max(1, upSeconds * rate);
  const maxFall = downSeconds <= 0 ? Infinity : 1 / Math.max(1, downSeconds * rate);
  state.out = nodeGraphSafeFilterNumber(
    state.out + Math.max(-maxFall, Math.min(maxRise, delta)),
    runtime,
    nodeId,
    state,
    "slew output",
  );
  return state.out;
}


// Registers the offline/render-time dispatch handler for slewLimiter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.slewLimiter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.slewLimiterStates.get(nodeId) || createNodeGraphStereoSlewLimiterState();
  runtime.slewLimiterStates.set(nodeId, state);
  const slewUpTime = readNodeGraphLiveEffectiveParam(runtime, node, "upTime", 0.05, frame, frames, frameValues);
  const slewDownTime = readNodeGraphLiveEffectiveParam(runtime, node, "downTime", 0.20, frame, frames, frameValues);
  const slewMono = mixInput(nodeId);
  return {
    Out: nodeGraphSlewLimiterSample(state.mono, slewMono, slewUpTime, slewDownTime, sampleRate, runtime, nodeId),
    Left: nodeGraphSlewLimiterSample(state.left, mixInput(nodeId, "Left") + slewMono, slewUpTime, slewDownTime, sampleRate, runtime, nodeId),
    Right: nodeGraphSlewLimiterSample(state.right, mixInput(nodeId, "Right") + slewMono, slewUpTime, slewDownTime, sampleRate, runtime, nodeId),
  };
};
