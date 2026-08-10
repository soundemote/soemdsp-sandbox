// Registers the offline/render-time dispatch handler for sineWavetable into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.sineWavetable = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const phase = runtime.phases.get(nodeId) || 0;
  const phaseOffset = nodeGraphPhaseRadians(
    readNodeGraphLiveEffectiveParam(
      runtime,
      node,
      "phase",
      0,
      frame,
      frames,
      frameValues,
    ),
  );
  const baseFrequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "freq",
    100,
    frame,
    frames,
    frameValues,
  );
  const freqInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Freq"),
    runtime,
    nodeId,
    null,
    "sin/cos freq input",
  );
  // Amp parameter only (Amplitude CV jack removed).
  const amplitude = Math.max(
    0,
    readNodeGraphLiveEffectiveParam(
      runtime,
      node,
      "amp",
      1,
      frame,
      frames,
      frameValues,
    ),
  );
  const referenceVoltage = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "sin/cos 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const baseWithFreqJack = baseFrequency + freqInput;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseWithFreqJack,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseWithFreqJack, pitchCv, referenceVoltage)
      : Math.max(0, baseWithFreqJack * (2 ** ((pitchCv - referenceVoltage) / 0.1))));
  const phaseIncrement = effectiveFrequency / sampleRate;
  const value = nodeGraphSineCosWavetableSample(phase + phaseOffset, effectiveFrequency, amplitude, sampleRate);
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
};
