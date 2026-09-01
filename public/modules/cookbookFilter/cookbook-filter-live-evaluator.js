// Registers the offline/render-time dispatch handler for cookbookFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.cookbookFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.cookbookFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphCookbookFilterState);
  runtime.cookbookFilterStates.set(nodeId, state);
  const cookbookMode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 1, frame, frames, frameValues);
  const cookbookKnobHz = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues);
  const cookbookFrequency = nodeGraphFrequencyHzFromKnobOrF(cookbookKnobHz, hasInput, mixInput, nodeId);
  const cookbookQ = readNodeGraphLiveEffectiveParam(runtime, node, "q", 1, frame, frames, frameValues);
  const cookbookGain = readNodeGraphLiveEffectiveParam(runtime, node, "gain", 0, frame, frames, frameValues);
  const cookbookStages = readNodeGraphLiveEffectiveParam(runtime, node, "stages", 2, frame, frames, frameValues);
  const cookbookMono = mixInput(nodeId);
  return {
    Out: nodeGraphCookbookFilterSample(state.mono, cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphCookbookFilterSample(state.left, mixInput(nodeId, "Left") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphCookbookFilterSample(state.right, mixInput(nodeId, "Right") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, sampleRate, runtime, `${nodeId}:right`),
  };
};
