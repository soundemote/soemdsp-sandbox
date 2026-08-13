nodeGraphLiveModuleEvaluators.keypad = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
}) => {
  if (!(runtime.keypadStates instanceof Map)) runtime.keypadStates = new Map();
  const state = runtime.keypadStates.get(nodeId) || createNodeGraphKeypadState();
  runtime.keypadStates.set(nodeId, state);
  const offset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  const mode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues);
  return nodeGraphKeypadSample(state, {
    analog: mixInput(nodeId, "Analog"),
    digital: mixInput(nodeId, "Digital"),
    hasAnalog: hasInput(nodeId, "Analog"),
    hasDigital: hasInput(nodeId, "Digital"),
    mode,
    offset,
  });
};
