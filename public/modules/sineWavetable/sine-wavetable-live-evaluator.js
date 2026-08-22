// Offline/render dispatch for SinCos4 (sineWavetable) and SinCos (sinCos).
function nodeGraphSineWavetableAdvancePair({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) {
  const resetState = runtime.oscResetStates.get(nodeId) || (typeof createNodeGraphOscResetState === "function"
    ? createNodeGraphOscResetState()
    : { lastReset: 0 });
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "sine wavetable reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
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
    mixInput(nodeId, "f"),
    runtime,
    nodeId,
    null,
    "sine wavetable freq input",
  );
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "sine wavetable increment input",
  );
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
      "sine wavetable 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const baseWithFreqJack = baseFrequency + (Number(freqInput) || 0);
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: baseWithFreqJack,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseWithFreqJack, pitchCv, referenceVoltage)
      : Math.max(0, baseWithFreqJack * (2 ** ((pitchCv - referenceVoltage) / 0.1))));
  const phaseIncrement = (effectiveFrequency / sampleRate) + (Number(incrementInput) || 0);
  const pair = nodeGraphSineCosWavetableSample(phase + phaseOffset, effectiveFrequency, amplitude, sampleRate);
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return pair;
}

nodeGraphLiveModuleEvaluators.sineWavetable = (args) => {
  const pair = nodeGraphSineWavetableAdvancePair(args);
  const mode = readNodeGraphLiveEffectiveParam(
    args.runtime,
    args.node,
    "mode",
    2,
    args.frame,
    args.frames,
    args.frameValues,
  );
  return nodeGraphSinCos4FromPair(pair.sin, pair.cos, mode);
};

nodeGraphLiveModuleEvaluators.sinCos = (args) => nodeGraphSineWavetableAdvancePair(args);
