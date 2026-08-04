// Registers the offline/render-time dispatch handler for turingMachine into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.turingMachine = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.turingMachineStates.get(nodeId) || createNodeGraphTuringMachineState();
  runtime.turingMachineStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphTuringMachineSample(state, {
    clock: mixInput(nodeId, "Clock"),
    length: read("length", 8),
    level: read("amplitude", 1),
    probability: read("probability", 0.25),
    reset: mixInput(nodeId, "Reset"),
  });
};
