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
  const pitchOffset = readNodeGraphLiveEffectiveParam(runtime, node, "pitchOffset", 0, frame, frames, frameValues);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Number(mixInput(nodeId, "0.1V/Oct")) || 0
    : referenceVoltage;
  const pitchCvRatio = typeof nodeGraphPhoneTonePitchCvRatio === "function"
    ? nodeGraphPhoneTonePitchCvRatio(hasPitch, pitchCv, referenceVoltage)
    : 1;
  return nodeGraphPhoneToneSample(state, {
    amplitude,
    analog: mixInput(nodeId, "Analog"),
    digital: mixInput(nodeId, "Digital"),
    freqOffset,
    gate: mixInput(nodeId, "Gate"),
    hasAnalog: hasInput(nodeId, "Analog"),
    hasDigital: hasInput(nodeId, "Digital"),
    hasGate: hasInput(nodeId, "Gate"),
    pitchCvRatio,
    pitchOffset,
    sampleRate,
  });
};
