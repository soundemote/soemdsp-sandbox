// Sample & Hold — offline/render. Pure core: sample-hold-math.js.
// Ext In → Ext Out (external). Left/Right = internal noise. Same Clock for all.
// Interpolate Off|Linear|Smoothstep. Trigger aliased to Clock.

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
  const clock = mixInput(nodeId, "Clock");
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
  const interpolate = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "interpolate",
    0,
    frame,
    frames,
    frameValues,
  );

  const lane = (laneState, input, hasIn, seedTag) => {
    const safeIn = hasIn
      ? nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "sample hold input")
      : 0;
    const held = nodeGraphSampleHoldCore(
      laneState,
      safeIn,
      nodeGraphSafeFilterNumber(clock, runtime, nodeId, null, "sample hold clock"),
      nodeGraphSafeFilterNumber(threshold, runtime, nodeId, null, "sample hold threshold"),
      sampleFrequency,
      sampleRate,
      hasIn,
      seedTag,
      interpolate,
    );
    return nodeGraphSafeFilterNumber(held, runtime, nodeId, null, "sample hold output");
  };

  const hasExt = hasInput(nodeId, "Ext In");
  // Always advance Ext lane so Sample Freq stays locked with Left/Right.
  // hasIn=true avoids noise on Ext; unwired Ext holds 0.
  const extOut = lane(
    state.ext,
    hasExt ? mixInput(nodeId, "Ext In") : 0,
    true,
    `${nodeId}:ext`,
  );
  const left = lane(state.left, 0, false, `${nodeId}:left`);
  const right = lane(state.right, 0, false, `${nodeId}:right`);
  return { "Ext Out": extOut, Left: left, Right: right };
};
