// Registers the offline/render-time dispatch handler for phosphillator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.phosphillator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.phosphillatorPlaybackStates.get(nodeId) || createNodeGraphPhosphillatorPlaybackState();
  runtime.phosphillatorPlaybackStates.set(nodeId, state);
  return nodeGraphPhosphillatorPlaybackSample(
    state,
    node,
    nodeId,
    mixInput(nodeId, "0.1V/Oct"),
    readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 2, frame, frames, frameValues),
    readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues),
    mixInput(nodeId, "Reset"),
    sampleRate,
    readNodeGraphLiveEffectiveParam(runtime, node, "sharpness", 0.5, frame, frames, frameValues),
  );
};
