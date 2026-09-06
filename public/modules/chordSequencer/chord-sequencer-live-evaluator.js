// Registers the offline/render-time dispatch handler for chordSequencer into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.chordSequencer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.chordSequencerStates.get(nodeId) || createNodeGraphChordSequencerState();
  runtime.chordSequencerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphChordSequencerSample(state, {
    clock: mixInput(nodeId, "Trigger"),
    level: read("level", 1),
    progression: read("progression", 0),
    reset: mixInput(nodeId, "Reset"),
  });
};
