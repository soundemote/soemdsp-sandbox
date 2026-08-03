// Inertial Filter — offline/render. Pure math: inertial-filter-math.js.

nodeGraphLiveModuleEvaluators.inertialFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  if (!runtime.inertialFilterStates) {
    runtime.inertialFilterStates = new Map();
  }
  const state = runtime.inertialFilterStates.get(nodeId) || createNodeGraphStereoInertialFilterState();
  runtime.inertialFilterStates.set(nodeId, state);
  const attack = readNodeGraphLiveEffectiveParam(runtime, node, "attack", 1, frame, frames, frameValues);
  const release = readNodeGraphLiveEffectiveParam(runtime, node, "release", 0.005, frame, frames, frameValues);
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
      nodeGraphInertialFilterSample(state.mono, monoIn, attack, release),
      runtime,
      nodeId,
      state.mono,
      "inertial out",
    ),
    Left: nodeGraphSafeFilterNumber(
      nodeGraphInertialFilterSample(state.left, leftIn, attack, release),
      runtime,
      nodeId,
      state.left,
      "inertial left out",
    ),
    Right: nodeGraphSafeFilterNumber(
      nodeGraphInertialFilterSample(state.right, rightIn, attack, release),
      runtime,
      nodeId,
      state.right,
      "inertial right out",
    ),
  };
};
