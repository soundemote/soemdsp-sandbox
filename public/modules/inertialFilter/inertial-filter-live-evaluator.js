// Inertial Filter — offline/render. Pure math: inertial-filter-math.js.

nodeGraphLiveModuleEvaluators.inertialFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.inertialFilterStates) {
    runtime.inertialFilterStates = new Map();
  }
  const state = runtime.inertialFilterStates.get(nodeId) || createNodeGraphStereoInertialFilterState();
  runtime.inertialFilterStates.set(nodeId, state);
  const attackHz = readNodeGraphLiveEffectiveParam(runtime, node, "attack", 20000, frame, frames, frameValues);
  const releaseHz = readNodeGraphLiveEffectiveParam(runtime, node, "release", 20, frame, frames, frameValues);
  const rate = sampleRate;
  const mono = mixInput(nodeId);
  const monoIn = nodeGraphSafeFilterNumber(mono, runtime, nodeId, state.mono, "inertial mono");
  const leftIn = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Left") + mono,
    runtime,
    nodeId,
    state.left,
    "inertial left",
  );
  const rightIn = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Right") + mono,
    runtime,
    nodeId,
    state.right,
    "inertial right",
  );
  return {
    Out: nodeGraphSafeFilterNumber(
      nodeGraphInertialFilterSampleHz(state.mono, monoIn, attackHz, releaseHz, rate),
      runtime,
      nodeId,
      state.mono,
      "inertial out",
    ),
    Left: nodeGraphSafeFilterNumber(
      nodeGraphInertialFilterSampleHz(state.left, leftIn, attackHz, releaseHz, rate),
      runtime,
      nodeId,
      state.left,
      "inertial left out",
    ),
    Right: nodeGraphSafeFilterNumber(
      nodeGraphInertialFilterSampleHz(state.right, rightIn, attackHz, releaseHz, rate),
      runtime,
      nodeId,
      state.right,
      "inertial right out",
    ),
  };
};
