// Attack Decay — offline/render.

nodeGraphLiveModuleEvaluators.attackDecay = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.attackDecayStates) {
    runtime.attackDecayStates = new Map();
  }
  const state = runtime.attackDecayStates.get(nodeId) || createNodeGraphAttackDecayState();
  runtime.attackDecayStates.set(nodeId, state);
  const y = nodeGraphAttackDecaySample(
    state,
    mixInput(nodeId, "Gate"),
    {
      amplitude: readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues),
      attack: readNodeGraphLiveEffectiveParam(runtime, node, "attack", 0.01, frame, frames, frameValues),
      curve: readNodeGraphLiveEffectiveParam(runtime, node, "curve", 1, frame, frames, frameValues),
      cycle: readNodeGraphLiveEffectiveParam(runtime, node, "cycle", 0, frame, frames, frameValues),
      decay: readNodeGraphLiveEffectiveParam(runtime, node, "decay", 0.25, frame, frames, frameValues),
      inputMode: readNodeGraphLiveEffectiveParam(runtime, node, "inputMode", 0, frame, frames, frameValues),
    },
    sampleRate,
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "attack decay")
    : y;
};
