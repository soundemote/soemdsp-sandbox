// Registers the offline/render-time dispatch handler for robinSupersaw into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.robinSupersaw = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.robinSupersawStates.get(nodeId) || createNodeGraphRobinSupersawState();
  runtime.robinSupersawStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  // baseFrequency is the pitch heard at the global pitch reference note
  // (see node-graph-patch-normalizers.js) -- set it equal to the
  // master "Pitch Reference Frequency" setting and a MIDI keyboard is
  // automatically in tune; double it to transpose up an octave.
  const baseFrequency = Math.max(0, read("frequency", 100));
  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "RobinSupersaw 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseFrequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
      : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));
  return nodeGraphRobinSupersawSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    detuneCents: read("detuneCents", 30),
    voices: read("voices", 7),
    level: read("amplitude", 1),
  });
};
