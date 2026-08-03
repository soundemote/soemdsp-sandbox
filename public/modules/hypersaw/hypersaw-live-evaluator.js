// Registers the offline/render-time dispatch handler for hypersaw into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.hypersaw = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.hypersawStates.get(nodeId) || createNodeGraphHypersawState();
  runtime.hypersawStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  // baseFrequency is the pitch heard at the global pitch reference note
  // (see node-graph-patch-normalizers.js), same convention as
  // robinSupersaw above -- set it equal to the master "Pitch Reference
  // Frequency" setting and a MIDI keyboard is automatically in tune.
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
      "Hypersaw 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseFrequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
      : Math.max(0, baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))));
  const hypersawResult = nodeGraphHypersawSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    phaseOffset: read("phase", 0),
    numVoices: read("voices", 8),
    spread: read("spread", 1),
    randomAmount: read("random", 0.15),
    driftAmount: read("drift", 0.1),
    level: read("level", 0.35),
  });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Phases", hypersawResult.voicePhases);
    writeNodeGraphDataOutput(String(nodeId), "Amplitudes", hypersawResult.voiceAmplitudes);
    writeNodeGraphDataOutput(String(nodeId), "Pans", hypersawResult.voicePans);
  }
  return {
    Left: hypersawResult.Left,
    Right: hypersawResult.Right,
  };
};
