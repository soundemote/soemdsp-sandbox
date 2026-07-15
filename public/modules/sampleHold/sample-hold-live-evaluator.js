// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphSampleHoldState() {
  return {
    clockPhase: 0,
    held: 0,
    lastTrigger: 0,
    noise: createNodeGraphNoiseGeneratorChannelState(),
  };
}


function createNodeGraphStereoSampleHoldState() {
  return {
    left: createNodeGraphSampleHoldState(),
    mono: createNodeGraphSampleHoldState(),
    right: createNodeGraphSampleHoldState(),
  };
}

function nodeGraphSampleHoldSample(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, runtime = null, nodeId = "") {
  nodeGraphResetSeededState(state.noise, nodeId, 0, "sampleHoldNoise");
  const safeInput = hasInConnected
    ? nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "sample hold input")
    : nodeGraphNextSeededBipolar(state.noise);
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "sample hold trigger");
  const safeThreshold = nodeGraphSafeFilterNumber(threshold, runtime, nodeId, null, "sample hold threshold");
  const safeFreq = Math.max(0, Number(sampleFrequency) || 0);
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  let internalFire = false;
  if (safeFreq > 0) {
    state.clockPhase += safeFreq / safeRate;
    if (state.clockPhase >= 1) {
      state.clockPhase -= Math.floor(state.clockPhase);
      internalFire = true;
    }
  }
  if ((state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) || internalFire) {
    state.held = safeInput;
  }
  state.lastTrigger = safeTrigger;
  return nodeGraphSafeFilterNumber(state.held, runtime, nodeId, null, "sample hold output");
}


// Registers the offline/render-time dispatch handler for sampleHold into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.sampleHold = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.sampleHoldStates.get(nodeId) || createNodeGraphStereoSampleHoldState();
  runtime.sampleHoldStates.set(nodeId, state);
  const sampleHoldTrigger = mixInput(nodeId, "Trigger");
  const sampleHoldThreshold = readNodeGraphLiveEffectiveParam(runtime, node, "threshold", 0, frame, frames, frameValues);
  const sampleHoldFrequency = readNodeGraphLiveEffectiveParam(runtime, node, "sampleFrequency", 0, frame, frames, frameValues);
  const sampleHoldMonoHasIn = hasInput(nodeId, "In");
  const sampleHoldMono = mixInput(nodeId, "In");
  return {
    Out: nodeGraphSampleHoldSample(state.mono, sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, sampleRate, sampleHoldMonoHasIn, runtime, `${nodeId}:mono`),
    Left: nodeGraphSampleHoldSample(state.left, mixInput(nodeId, "Left") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, sampleRate, sampleHoldMonoHasIn || hasInput(nodeId, "Left"), runtime, `${nodeId}:left`),
    Right: nodeGraphSampleHoldSample(state.right, mixInput(nodeId, "Right") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, sampleRate, sampleHoldMonoHasIn || hasInput(nodeId, "Right"), runtime, `${nodeId}:right`),
  };
};
