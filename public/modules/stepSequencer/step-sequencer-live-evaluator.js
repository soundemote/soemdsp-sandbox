// Step Sequencer — offline/render. Pure math: step-sequencer-math.js.

nodeGraphLiveModuleEvaluators.stepSequencer = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const state = runtime.stepSequencerStates.get(nodeId) || createNodeGraphStepSequencerState();
  runtime.stepSequencerStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const out = nodeGraphStepSequencerCore(
    state,
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Trigger"), runtime, nodeId, null, "step sequencer trigger"),
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "step sequencer reset"),
    {
      level: nodeGraphSafeFilterNumber(read("level", 1), runtime, nodeId, null, "step sequencer level"),
      steps: nodeGraphSafeFilterNumber(read("steps", 8), runtime, nodeId, null, "step sequencer steps"),
      threshold: nodeGraphSafeFilterNumber(read("threshold", 0), runtime, nodeId, null, "step sequencer threshold"),
      values: [
        read("step1", 0),
        read("step2", 0.25),
        read("step3", 0.5),
        read("step4", 0.75),
        read("step5", 1),
        read("step6", 0.75),
        read("step7", 0.5),
        read("step8", 0.25),
      ].map((v) => nodeGraphSafeFilterNumber(v, runtime, nodeId, null, "step sequencer value")),
    },
  );
  return {
    Gate: out.Gate,
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, null, "step sequencer output"),
  };
};
