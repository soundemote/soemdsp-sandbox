// Sample & Hold — offline/render. Pure core: sample-hold-math.js.

nodeGraphLiveModuleEvaluators.sampleHold = ({
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
  const state = runtime.sampleHoldStates.get(nodeId) || createNodeGraphStereoSampleHoldState();
  runtime.sampleHoldStates.set(nodeId, state);
  const trigger = mixInput(nodeId, "Trigger");
  const threshold = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "threshold",
    0,
    frame,
    frames,
    frameValues,
  );
  const sampleFrequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "sampleFrequency",
    0,
    frame,
    frames,
    frameValues,
  );
  const monoHasIn = hasInput(nodeId, "In");
  const mono = mixInput(nodeId, "In");

  const lane = (laneState, input, hasIn, seedTag) => {
    const safeIn = hasIn
      ? nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "sample hold input")
      : 0;
    const held = nodeGraphSampleHoldCore(
      laneState,
      safeIn,
      nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "sample hold trigger"),
      nodeGraphSafeFilterNumber(threshold, runtime, nodeId, null, "sample hold threshold"),
      sampleFrequency,
      sampleRate,
      hasIn,
      seedTag,
    );
    return nodeGraphSafeFilterNumber(held, runtime, nodeId, null, "sample hold output");
  };

  return {
    Out: lane(state.mono, mono, monoHasIn, `${nodeId}:mono`),
    Left: lane(
      state.left,
      mixInput(nodeId, "Left") + mono,
      monoHasIn || hasInput(nodeId, "Left"),
      `${nodeId}:left`,
    ),
    Right: lane(
      state.right,
      mixInput(nodeId, "Right") + mono,
      monoHasIn || hasInput(nodeId, "Right"),
      `${nodeId}:right`,
    ),
  };
};

