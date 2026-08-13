nodeGraphLiveModuleEvaluators.phoneTone = ({
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
  if (!runtime.phoneToneStates) runtime.phoneToneStates = new Map();
  const state = runtime.phoneToneStates.get(nodeId)
    || (typeof createNodeGraphPhoneToneState === "function"
      ? createNodeGraphPhoneToneState()
      : { analog: {}, digital: {} });
  runtime.phoneToneStates.set(nodeId, state);
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 0.5, frame, frames, frameValues);
  const freqOffset = readNodeGraphLiveEffectiveParam(runtime, node, "freqOffset", 0, frame, frames, frameValues);
  return nodeGraphPhoneToneSample(state, {
    amplitude,
    analog: mixInput(nodeId, "Analog"),
    digital: mixInput(nodeId, "Digital"),
    freqOffset,
    gate: mixInput(nodeId, "Gate"),
    hasAnalog: hasInput(nodeId, "Analog"),
    hasDigital: hasInput(nodeId, "Digital"),
    hasGate: hasInput(nodeId, "Gate"),
    sampleRate,
  });
};
