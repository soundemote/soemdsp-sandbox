// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphOnePoleHighpassSample(state, input, frequency, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "highpass input");
  const frequencyValue = Math.max(0, nodeGraphSafeFilterNumber(frequency, runtime, nodeId, state, "highpass frequency"));
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  const b1 = -b0;
  state.outputBuffer = nodeGraphSafeFilterNumber(
    b0 * safeInput + b1 * state.inputBuffer + a1 * state.outputBuffer,
    runtime,
    nodeId,
    state,
    "highpass output",
  );
  state.inputBuffer = safeInput;
  return state.outputBuffer;
}


function nodeGraphPassiveFilterSample(state, input, mode, lowFrequency, highFrequency, sampleRate, runtime, nodeId) {
  const safeMode = Math.round(Number(mode)) || 0;
  if (safeMode === 1) {
    const lowCut  = Math.max(0, Number(lowFrequency)  || 0);
    const highCut = Math.max(0, Number(highFrequency) || 0);
    const low  = Math.min(lowCut, highCut);
    const high = Math.max(lowCut, highCut);
    const hp = nodeGraphOnePoleHighpassSample(state.highpass, input, low, sampleRate, runtime, nodeId);
    return nodeGraphOnePoleLowpassSample(state.lowpass, hp, high, sampleRate, runtime, nodeId);
  }
  if (safeMode === 2) {
    return nodeGraphOnePoleHighpassSample(state.highpass, input, lowFrequency, sampleRate, runtime, nodeId);
  }
  return nodeGraphOnePoleLowpassSample(state.lowpass, input, highFrequency, sampleRate, runtime, nodeId);
}


// Registers the offline/render-time dispatch handler for passiveFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.passiveFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.passiveFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphPassiveFilterState);
  runtime.passiveFilterStates.set(nodeId, state);
  const passiveMode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues);
  const passiveLowFrequency = readNodeGraphLiveEffectiveParam(runtime, node, "lowFrequency", 200, frame, frames, frameValues);
  const passiveHighFrequency = readNodeGraphLiveEffectiveParam(runtime, node, "highFrequency", 1000, frame, frames, frameValues);
  const passiveMono = mixInput(nodeId);
  return {
    Out: nodeGraphPassiveFilterSample(state.mono, passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphPassiveFilterSample(state.left, mixInput(nodeId, "Left") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphPassiveFilterSample(state.right, mixInput(nodeId, "Right") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:right`),
  };
};
