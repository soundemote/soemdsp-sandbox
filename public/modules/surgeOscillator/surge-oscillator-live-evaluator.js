// Registers the offline/render-time dispatch handler for surgeOscillator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.surgeOscillator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.surgeOscillatorStates.get(nodeId) || createNodeGraphSurgeOscillatorState();
  runtime.surgeOscillatorStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const baseFrequency = Math.max(0, read("frequency", 100));
  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const hasPitch = hasInput?.(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "hard sync oscillator 0.1v input",
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
  return nodeGraphSurgeOscillatorSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    syncIn: mixInput(nodeId, "Sync"),
    hasExternalSync: hasInput(nodeId, "Sync"),
    syncFrequencyHz: read("syncFrequency", 50),
    waveform: read("waveform", 0),
    level: read("amplitude", 1),
  });
};
